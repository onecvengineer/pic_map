import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import {
  clearLocation,
  confirmLocation,
  createPhotoRecord,
  listPhotos,
  listTimeline,
  setManualLocation,
} from "../storage.js";
import { parseImageMetadata } from "../metadata.js";
import { extractPreviewFile, extractBrowserPreview } from "../preview.js";
import { sanitizeForJson, serializePhoto, serializePhotos, stringOrUndefined } from "../http.js";

export const photoRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/parse", async (request, reply) => {
    const uploaded = await readMultipartUpload(request);
    if (!uploaded) return reply.code(400).send({ error: "No file field found" });

    const tempDir = await mkdtemp(join(tmpdir(), "photo-atlas-"));
    const tempPath = join(tempDir, safeUploadName(uploaded.filename));
    try {
      await writeFile(tempPath, uploaded.content);
      const metadata = await parseImageMetadata(tempPath);
      const preview = await extractBrowserPreview(tempPath, tempDir);
      return {
        ...metadata,
        sourcePath: uploaded.filename,
        fileName: uploaded.filename,
        ...preview,
        raw: sanitizeForJson(metadata.raw),
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  app.post("/api/photos/upload", async (request, reply) => {
    const uploaded = await readMultipartUpload(request);
    if (!uploaded) return reply.code(400).send({ error: "No file field found" });

    const tempDir = await mkdtemp(join(tmpdir(), "pic-map-"));
    const tempPath = join(tempDir, safeUploadName(uploaded.filename));
    try {
      await writeFile(tempPath, uploaded.content);
      const metadata = await parseImageMetadata(tempPath);
      const preview = await extractPreviewFile(tempPath, tempDir);
      const result = await createPhotoRecord({
        sourcePath: tempPath,
        originalName: uploaded.filename,
        content: uploaded.content,
        metadata: {
          ...metadata,
          sourcePath: uploaded.filename,
          fileName: uploaded.filename,
          raw: sanitizeForJson(metadata.raw) as Record<string, unknown> | undefined,
        },
        preview,
      });
      return reply.code(result.duplicate ? 200 : 201).send({
        photo: serializePhoto(result.photo),
        import: result.importRecord,
        duplicate: result.duplicate,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  app.get<{ Querystring: { q?: string; gps?: "all" | "with" | "without" | "inferred" | "pending" } }>("/api/photos", async (request) => (
    serializePhotos(await listPhotos({
      query: request.query.q,
      gps: request.query.gps || "all",
    }))
  ));

  app.get("/api/timeline", async () => ({
    days: (await listTimeline()).map((day) => ({
      ...day,
      photos: serializePhotos(day.photos),
    })),
  }));

  app.post<{ Params: { id: string } }>("/api/photos/:id/confirm-location", async (request, reply) => {
    const photo = await confirmLocation(request.params.id);
    if (!photo) return reply.code(404).send({ error: "Photo not found" });
    return serializePhoto(photo);
  });

  app.post<{ Params: { id: string } }>("/api/photos/:id/clear-location", async (request, reply) => {
    const photo = await clearLocation(request.params.id);
    if (!photo) return reply.code(404).send({ error: "Photo not found" });
    return serializePhoto(photo);
  });

  app.patch<{
    Params: { id: string };
    Body: { latitude?: number; longitude?: number; placeName?: string; status?: "confirmed" | "pending" };
  }>("/api/photos/:id/location", async (request, reply) => {
    const [updated] = await setManualLocation({
      photoIds: [request.params.id],
      latitude: Number(request.body.latitude),
      longitude: Number(request.body.longitude),
      placeName: stringOrUndefined(request.body.placeName),
      status: request.body.status === "pending" ? "pending" : "confirmed",
    });
    if (!updated) return reply.code(404).send({ error: "Photo not found" });
    return serializePhoto(updated);
  });

  app.post<{
    Body: { photoIds?: string[]; latitude?: number; longitude?: number; placeName?: string; status?: "confirmed" | "pending" };
  }>("/api/photos/bulk/location", async (request) => {
    const photoIds = Array.isArray(request.body.photoIds) ? request.body.photoIds.map(String) : [];
    const updated = await setManualLocation({
      photoIds,
      latitude: Number(request.body.latitude),
      longitude: Number(request.body.longitude),
      placeName: stringOrUndefined(request.body.placeName),
      status: request.body.status === "pending" ? "pending" : "confirmed",
    });
    return serializePhotos(updated);
  });
};

async function readMultipartUpload(request: FastifyRequest): Promise<{ filename: string; content: Buffer } | undefined> {
  const file = await request.file();
  if (!file) return undefined;
  return {
    filename: file.filename,
    content: await file.toBuffer(),
  };
}

function safeUploadName(fileName: string): string {
  return fileName.replace(/[^\w.\-]+/g, "_") || "upload";
}
