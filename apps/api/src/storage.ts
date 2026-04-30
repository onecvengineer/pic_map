import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import type {
  ExportRecord,
  ImportRecord,
  PhotoDatabase,
  PhotoLocation,
  PhotoMetadata,
  PhotoRecord,
  PlaceCacheRecord,
} from "@pic-map/shared";

export const dataRoot = resolve(process.env.DATA_DIR || "data");
export const originalsRoot = join(dataRoot, "originals");
export const previewsRoot = join(dataRoot, "previews");
export const exportsRoot = join(dataRoot, "exports");
const dbDir = join(dataRoot, "db");
const dbPath = join(dbDir, "photos.json");
const inferenceWindowMs = Number(process.env.INFERENCE_WINDOW_MINUTES || 30) * 60 * 1000;

let database: PhotoDatabase | undefined;

export async function loadDatabase(): Promise<PhotoDatabase> {
  if (database) return database;

  await ensureDataDirectories();
  try {
    const parsed = JSON.parse(await readFile(dbPath, "utf8")) as PhotoDatabase;
    database = {
      version: 1,
      photos: parsed.photos || [],
      imports: parsed.imports || [],
      placeCache: parsed.placeCache || [],
      exports: parsed.exports || [],
    };
  } catch {
    database = emptyDatabase();
    await saveDatabase(database);
  }

  return database;
}

export async function saveDatabase(db: PhotoDatabase): Promise<void> {
  await ensureDataDirectories();
  const tempPath = `${dbPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(db, null, 2)}\n`);
  await rename(tempPath, dbPath);
  database = db;
}

export async function ensureDataDirectories(): Promise<void> {
  await Promise.all([
    mkdir(originalsRoot, { recursive: true }),
    mkdir(previewsRoot, { recursive: true }),
    mkdir(exportsRoot, { recursive: true }),
    mkdir(dbDir, { recursive: true }),
  ]);
}

export async function createPhotoRecord(input: {
  sourcePath: string;
  originalName: string;
  content: Buffer;
  metadata: PhotoMetadata;
  preview?: { content: Buffer; mime: string; extension: string };
}): Promise<{ photo: PhotoRecord; importRecord: ImportRecord; duplicate: boolean }> {
  const db = await loadDatabase();
  const importedAt = new Date().toISOString();
  const sha256 = sha256Hex(input.content);
  const existing = db.photos.find((photo) => photo.sha256 === sha256);
  const originalPath = existing?.originalPath || await persistOriginal(input.sourcePath, input.originalName, sha256);
  const previewPath = input.preview
    ? await persistPreview(input.preview.content, sha256, input.preview.extension)
    : existing?.previewPath;

  let photo: PhotoRecord;
  if (existing) {
    photo = existing;
    if (previewPath && !photo.previewPath) {
      photo.previewPath = previewPath;
      photo.previewMime = input.preview?.mime;
    }
    if (input.metadata.mimeGuess && photo.mimeGuess === "application/octet-stream") {
      photo.mimeGuess = input.metadata.mimeGuess;
      photo.metadata.mimeGuess = input.metadata.mimeGuess;
    }
  } else {
    const location = locationFromMetadata(input.metadata, importedAt);
    photo = {
      id: randomUUID(),
      sha256,
      fileName: input.originalName,
      fileSize: input.content.length,
      mimeGuess: input.metadata.mimeGuess,
      originalPath,
      ...(previewPath ? { previewPath } : {}),
      ...(input.preview?.mime ? { previewMime: input.preview.mime } : {}),
      importedAt,
      metadata: input.metadata,
      locationStatus: location ? location.status : "missing",
      ...(location ? { location } : {}),
    };
    db.photos.unshift(photo);
  }

  const importRecord: ImportRecord = {
    id: randomUUID(),
    photoId: photo.id,
    sha256,
    fileName: input.originalName,
    fileSize: input.content.length,
    duplicate: Boolean(existing),
    importedAt,
  };
  db.imports.unshift(importRecord);
  inferMissingLocations(db);
  await saveDatabase(db);

  return { photo, importRecord, duplicate: Boolean(existing) };
}

export async function listPhotos(filters: {
  query?: string;
  gps?: "all" | "with" | "without" | "inferred" | "pending";
}): Promise<PhotoRecord[]> {
  const db = await loadDatabase();
  const query = filters.query?.trim().toLowerCase();
  const gps = filters.gps || "all";

  return db.photos.filter((photo) => {
    const hasLocation = Boolean(photo.location);
    const matchesGps =
      gps === "all" ||
      (gps === "with" && hasLocation) ||
      (gps === "without" && !hasLocation) ||
      (gps === "inferred" && photo.location?.source === "inferred") ||
      (gps === "pending" && photo.locationStatus === "pending");
    if (!matchesGps) return false;
    if (!query) return true;
    const haystack = [
      photo.fileName,
      photo.metadata.make,
      photo.metadata.model,
      photo.metadata.lens,
      photo.metadata.dateTimeOriginal,
      photo.location?.placeName,
      photo.location?.source,
      photo.locationStatus,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

export async function getPhoto(id: string): Promise<PhotoRecord | undefined> {
  const db = await loadDatabase();
  return db.photos.find((photo) => photo.id === id);
}

export async function setManualLocation(input: {
  photoIds: string[];
  latitude: number;
  longitude: number;
  placeName?: string;
  status?: "confirmed" | "pending";
}): Promise<PhotoRecord[]> {
  const db = await loadDatabase();
  const updatedAt = new Date().toISOString();
  const updated: PhotoRecord[] = [];

  for (const photo of db.photos) {
    if (!input.photoIds.includes(photo.id)) continue;
    photo.location = {
      latitude: input.latitude,
      longitude: input.longitude,
      source: "manual",
      status: input.status || "confirmed",
      placeName: input.placeName,
      updatedAt,
    };
    photo.locationStatus = photo.location.status;
    updated.push(photo);
  }

  await saveDatabase(db);
  return updated;
}

export async function confirmLocation(photoId: string): Promise<PhotoRecord | undefined> {
  const db = await loadDatabase();
  const photo = db.photos.find((item) => item.id === photoId);
  if (!photo?.location) return photo;
  photo.location.status = "confirmed";
  photo.location.updatedAt = new Date().toISOString();
  photo.locationStatus = "confirmed";
  await saveDatabase(db);
  return photo;
}

export async function clearLocation(photoId: string): Promise<PhotoRecord | undefined> {
  const db = await loadDatabase();
  const photo = db.photos.find((item) => item.id === photoId);
  if (!photo) return undefined;
  delete photo.location;
  photo.locationStatus = "missing";
  await saveDatabase(db);
  return photo;
}

export async function listTimeline(): Promise<Array<{
  date: string;
  photos: PhotoRecord[];
  deviceCount: number;
  placeCount: number;
  gpsCount: number;
  pendingCount: number;
}>> {
  const photos = await listPhotos({ gps: "all" });
  const groups = new Map<string, PhotoRecord[]>();
  for (const photo of photos) {
    const date = normalizedPhotoDate(photo) || "unknown";
    groups.set(date, [...(groups.get(date) || []), photo]);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      date,
      photos: items.sort((a, b) => (photoDate(a) || "").localeCompare(photoDate(b) || "")),
      deviceCount: new Set(items.map((photo) => `${photo.metadata.make || ""} ${photo.metadata.model || ""}`.trim()).filter(Boolean)).size,
      placeCount: new Set(items.map((photo) => photo.location?.placeName || locationKey(photo.location)).filter(Boolean)).size,
      gpsCount: items.filter((photo) => photo.location).length,
      pendingCount: items.filter((photo) => photo.locationStatus === "pending").length,
    }));
}

export async function cachePlaces(records: PlaceCacheRecord[]): Promise<void> {
  const db = await loadDatabase();
  for (const record of records) {
    db.placeCache.unshift(record);
  }
  db.placeCache = db.placeCache.slice(0, 500);
  await saveDatabase(db);
}

export async function findCachedPlaces(query: string): Promise<PlaceCacheRecord[]> {
  const db = await loadDatabase();
  const normalized = query.trim().toLowerCase();
  return db.placeCache.filter((record) => record.query.toLowerCase() === normalized).slice(0, 10);
}

export async function createExportManifest(): Promise<ExportRecord> {
  const db = await loadDatabase();
  const createdAt = new Date().toISOString();
  const id = `pic-map-${createdAt.replace(/[:.]/g, "-")}`;
  const dir = join(exportsRoot, id);
  await mkdir(dir, { recursive: true });

  const manifest = {
    version: 1,
    id,
    createdAt,
    photoCount: db.photos.length,
    originalCount: new Set(db.photos.map((photo) => photo.sha256)).size,
    files: db.photos.map((photo) => ({
      id: photo.id,
      sha256: photo.sha256,
      originalPath: photo.originalPath,
      previewPath: photo.previewPath,
      fileName: photo.fileName,
    })),
  };

  await writeFile(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(dir, "photos-db.json"), `${JSON.stringify(db, null, 2)}\n`);

  const record: ExportRecord = {
    id,
    path: relative(dataRoot, dir),
    photoCount: db.photos.length,
    createdAt,
  };
  db.exports.unshift(record);
  await saveDatabase(db);
  return record;
}

export async function listExports(): Promise<ExportRecord[]> {
  const db = await loadDatabase();
  return db.exports;
}

export async function mediaPath(relativePath: string): Promise<string | undefined> {
  const resolved = resolve(dataRoot, relativePath);
  if (!resolved.startsWith(dataRoot)) return undefined;
  try {
    const fileStat = await stat(resolved);
    return fileStat.isFile() ? resolved : undefined;
  } catch {
    return undefined;
  }
}

function emptyDatabase(): PhotoDatabase {
  return {
    version: 1,
    photos: [],
    imports: [],
    placeCache: [],
    exports: [],
  };
}

async function persistOriginal(sourcePath: string, originalName: string, sha256: string): Promise<string> {
  const extension = safeExtension(originalName) || ".bin";
  const dir = join(originalsRoot, sha256.slice(0, 2));
  const target = join(dir, `${sha256}${extension}`);
  await mkdir(dir, { recursive: true });
  try {
    await stat(target);
  } catch {
    await copyFile(sourcePath, target);
  }
  return relative(dataRoot, target);
}

async function persistPreview(content: Buffer, sha256: string, extension: string): Promise<string> {
  const safeExt = extension.startsWith(".") ? extension : `.${extension}`;
  const dir = join(previewsRoot, sha256.slice(0, 2));
  const target = join(dir, `${sha256}${safeExt}`);
  await mkdir(dir, { recursive: true });
  try {
    await stat(target);
  } catch {
    await writeFile(target, content);
  }
  return relative(dataRoot, target);
}

function locationFromMetadata(metadata: PhotoMetadata, updatedAt: string): PhotoLocation | undefined {
  if (!metadata.gps) return undefined;
  return {
    latitude: metadata.gps.latitude,
    longitude: metadata.gps.longitude,
    altitude: metadata.gps.altitude,
    timestamp: metadata.gps.timestamp,
    source: "exif",
    status: "confirmed",
    confidence: 1,
    updatedAt,
  };
}

function inferMissingLocations(db: PhotoDatabase): void {
  const anchors = db.photos
    .filter((photo) => photo.location && photo.location.status === "confirmed")
    .map((photo) => ({ photo, time: parsedPhotoTime(photo) }))
    .filter((item): item is { photo: PhotoRecord; time: number } => Number.isFinite(item.time));

  for (const photo of db.photos) {
    if (photo.location?.source === "manual" || photo.location?.source === "exif") continue;
    if (photo.locationStatus === "confirmed") continue;
    const time = parsedPhotoTime(photo);
    if (!Number.isFinite(time)) continue;

    const nearest = anchors
      .map((anchor) => ({ ...anchor, delta: Math.abs(anchor.time - time) }))
      .filter((anchor) => anchor.delta <= inferenceWindowMs && anchor.photo.id !== photo.id)
      .sort((a, b) => a.delta - b.delta)[0];

    if (!nearest?.photo.location) continue;
    const confidence = Math.max(0.35, 1 - nearest.delta / inferenceWindowMs);
    photo.location = {
      latitude: nearest.photo.location.latitude,
      longitude: nearest.photo.location.longitude,
      source: "inferred",
      status: "pending",
      confidence: Number(confidence.toFixed(2)),
      referencePhotoId: nearest.photo.id,
      placeName: nearest.photo.location.placeName,
      updatedAt: new Date().toISOString(),
    };
    photo.locationStatus = "pending";
  }
}

function parsedPhotoTime(photo: PhotoRecord): number {
  const date = photoDate(photo);
  if (!date) return Number.NaN;
  const normalized = date.includes("T") ? date : date.replace(/^(\d{4}):(\d{2}):(\d{2}) /, "$1-$2-$3T");
  const value = Date.parse(normalized);
  return Number.isFinite(value) ? value : Number.NaN;
}

function photoDate(photo: PhotoRecord): string | undefined {
  return photo.metadata.dateTimeOriginal || photo.metadata.createDate || photo.metadata.modifyDate || photo.metadata.fileModifiedAt;
}

function normalizedPhotoDate(photo: PhotoRecord): string | undefined {
  const value = photoDate(photo);
  if (!value) return undefined;
  const match = /^(\d{4})[:/-](\d{2})[:/-](\d{2})/.exec(value);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : value.slice(0, 10);
}

function locationKey(location?: PhotoLocation): string | undefined {
  if (!location) return undefined;
  return `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`;
}

function sha256Hex(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function safeExtension(fileName: string): string {
  const extension = extname(basename(fileName)).toLowerCase();
  return /^[.\w-]+$/.test(extension) ? extension : "";
}
