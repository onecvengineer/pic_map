import { extname } from "node:path";
import type { PhotoRecord } from "@pic-map/shared";

export interface SerializedPhoto extends Omit<PhotoRecord, "metadata"> {
  previewUrl?: string;
  originalUrl: string;
  metadata: Omit<PhotoRecord["metadata"], "raw"> & { raw?: undefined };
}

export function serializePhotos(photos: PhotoRecord[]): SerializedPhoto[] {
  return photos.map(serializePhoto);
}

export function serializePhoto(photo: PhotoRecord): SerializedPhoto {
  return {
    ...photo,
    previewUrl: photo.previewPath ? `/media/${encodeURIComponentPath(photo.previewPath)}` : undefined,
    originalUrl: `/media/${encodeURIComponentPath(photo.originalPath)}`,
    metadata: {
      ...photo.metadata,
      raw: undefined,
    },
  };
}

export function contentType(filePath: string): string {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
  }[extname(filePath).toLowerCase()] || "application/octet-stream";
}

export function detectImageMime(content: Buffer): string | undefined {
  if (content.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (content.subarray(0, 4).toString("ascii") === "RIFF" && content.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return undefined;
}

export function mimeToExtension(mime: string): string {
  return mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : mime === "image/gif" ? ".gif" : ".jpg";
}

export function sanitizeForJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, nestedValue) => {
    if (typeof nestedValue === "bigint") return nestedValue.toString();
    return nestedValue;
  }));
}

export function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function encodeURIComponentPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
