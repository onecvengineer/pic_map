import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { promisify } from "node:util";
import { exiftool } from "exiftool-vendored";
import { parseJpegExif } from "./jpeg-exif.js";
import type { PhotoMetadata } from "@pic-map/shared";

const execFileAsync = promisify(execFile);
let exiftoolAvailable: boolean | undefined;

export async function parseImageMetadata(inputPath: string): Promise<PhotoMetadata> {
  const sourcePath = resolve(inputPath);
  const fileStat = await stat(sourcePath);
  const base: PhotoMetadata = {
    sourcePath,
    fileName: basename(sourcePath),
    fileSize: fileStat.size,
    fileModifiedAt: fileStat.mtime.toISOString(),
    mimeGuess: guessMime(sourcePath),
    parser: "unsupported",
    warnings: [],
  };

  try {
    return { ...base, ...(await parseWithVendoredExiftool(sourcePath)) };
  } catch (error) {
    base.warnings.push(`exiftool-vendored failed: ${errorMessage(error)}`);
  }

  if (await hasExiftool()) {
    try {
      return { ...base, ...(await parseWithSystemExiftool(sourcePath)) };
    } catch (error) {
      base.warnings.push(`system exiftool failed: ${errorMessage(error)}`);
    }
  } else {
    base.warnings.push("system exiftool not found; using JPEG fallback when possible");
  }

  if (isJpeg(sourcePath)) {
    const buffer = await readFile(sourcePath);
    try {
      const parsed = parseJpegExif(buffer);
      return {
        ...base,
        ...parsed,
        warnings: [...base.warnings, ...(parsed.warnings || [])],
      };
    } catch (error) {
      return {
        ...base,
        parser: "jpeg-fallback",
        warnings: [...base.warnings, `JPEG EXIF parse failed: ${errorMessage(error)}`],
      };
    }
  }

  return {
    ...base,
    warnings: [...base.warnings, "Only JPEG fallback is available without exiftool"],
  };
}

async function hasExiftool(): Promise<boolean> {
  if (exiftoolAvailable !== undefined) return exiftoolAvailable;

  try {
    await execFileAsync("exiftool", ["-ver"], { timeout: 1500 });
    exiftoolAvailable = true;
  } catch {
    exiftoolAvailable = false;
  }

  return exiftoolAvailable;
}

async function parseWithVendoredExiftool(sourcePath: string): Promise<Partial<PhotoMetadata>> {
  const raw = await exiftool.read(sourcePath, [
    "-n",
    "-Make",
    "-Model",
    "-Software",
    "-SerialNumber",
    "-BodySerialNumber",
    "-LensModel",
    "-LensID",
    "-LensSerialNumber",
    "-DateTimeOriginal",
    "-CreateDate",
    "-ModifyDate",
    "-OffsetTimeOriginal",
    "-SubSecTimeOriginal",
    "-FocalLength",
    "-FNumber",
    "-ExposureTime",
    "-ISO",
    "-GPSLatitude",
    "-GPSLongitude",
    "-GPSAltitude",
    "-GPSDateTime",
    "-ImageWidth",
    "-ImageHeight",
    "-Orientation",
  ]);

  return normalizeExiftoolTags(raw as Record<string, unknown>);
}

async function parseWithSystemExiftool(sourcePath: string): Promise<Partial<PhotoMetadata>> {
  const { stdout } = await execFileAsync("exiftool", [
    "-json",
    "-n",
    "-Make",
    "-Model",
    "-Software",
    "-SerialNumber",
    "-BodySerialNumber",
    "-LensModel",
    "-LensID",
    "-LensSerialNumber",
    "-DateTimeOriginal",
    "-CreateDate",
    "-ModifyDate",
    "-OffsetTimeOriginal",
    "-SubSecTimeOriginal",
    "-FocalLength",
    "-FNumber",
    "-ExposureTime",
    "-ISO",
    "-GPSLatitude",
    "-GPSLongitude",
    "-GPSAltitude",
    "-GPSDateTime",
    "-ImageWidth",
    "-ImageHeight",
    "-Orientation",
    sourcePath,
  ], { timeout: 10000, maxBuffer: 1024 * 1024 * 4 });

  const [raw] = JSON.parse(stdout);
  return normalizeExiftoolTags(raw);
}

function normalizeExiftoolTags(raw: Record<string, unknown>): Partial<PhotoMetadata> {
  const latitude = numberOrUndefined(raw.GPSLatitude);
  const longitude = numberOrUndefined(raw.GPSLongitude);

  return {
    parser: "exiftool",
    imageWidth: numberOrUndefined(raw.ImageWidth),
    imageHeight: numberOrUndefined(raw.ImageHeight),
    orientation: numberOrUndefined(raw.Orientation) ?? stringOrUndefined(raw.Orientation),
    make: stringOrUndefined(raw.Make),
    model: stringOrUndefined(raw.Model),
    software: stringOrUndefined(raw.Software),
    cameraSerialNumber: stringOrUndefined(raw.BodySerialNumber || raw.SerialNumber),
    lens: stringOrUndefined(raw.LensModel || raw.LensID),
    lensSerialNumber: stringOrUndefined(raw.LensSerialNumber),
    dateTimeOriginal: stringOrUndefined(raw.DateTimeOriginal || raw.CreateDate),
    createDate: stringOrUndefined(raw.CreateDate),
    modifyDate: stringOrUndefined(raw.ModifyDate),
    offsetTimeOriginal: stringOrUndefined(raw.OffsetTimeOriginal),
    subSecTimeOriginal: stringOrUndefined(raw.SubSecTimeOriginal),
    focalLengthMm: numberOrUndefined(raw.FocalLength),
    aperture: numberOrUndefined(raw.FNumber),
    exposureTime: numberOrUndefined(raw.ExposureTime),
    iso: numberOrUndefined(raw.ISO),
    gps: latitude !== undefined && longitude !== undefined
      ? {
          latitude,
          longitude,
          ...(numberOrUndefined(raw.GPSAltitude) !== undefined ? { altitude: numberOrUndefined(raw.GPSAltitude) } : {}),
          ...(stringOrUndefined(raw.GPSDateTime) ? { timestamp: stringOrUndefined(raw.GPSDateTime) } : {}),
        }
      : undefined,
    warnings: latitude === undefined || longitude === undefined ? ["No GPS coordinates found"] : [],
    raw,
  };
}

function isJpeg(filePath: string): boolean {
  return [".jpg", ".jpeg"].includes(extname(filePath).toLowerCase());
}

function guessMime(filePath: string): string {
  const extension = String(extname(filePath)).toLowerCase();
  const mimeByExtension: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".png": "image/png",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".gif": "image/gif",
    ".cr2": "image/x-canon-cr2",
    ".cr3": "image/x-canon-cr3",
  };

  return mimeByExtension[extension] || "application/octet-stream";
}

function stringOrUndefined(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const candidate = value as {
      rawValue?: unknown;
      toISOString?: () => string;
      toString?: () => string;
    };
    if (typeof candidate.rawValue === "string" && candidate.rawValue.trim()) {
      return candidate.rawValue.trim();
    }
    if (typeof candidate.toISOString === "function") return candidate.toISOString();
    if (typeof candidate.toString === "function") {
      const text = candidate.toString();
      return text && text !== "[object Object]" ? text : undefined;
    }
  }
  return undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
