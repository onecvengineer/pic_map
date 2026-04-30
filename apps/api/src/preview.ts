import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { exiftool } from "exiftool-vendored";
import convertHeic from "heic-convert";
import { contentType, detectImageMime, mimeToExtension } from "./http.js";

export interface PreviewFile {
  content: Buffer;
  mime: string;
  extension: string;
}

export async function extractBrowserPreview(sourcePath: string, tempDir: string): Promise<{ previewDataUrl?: string; previewMime?: string }> {
  const preview = await extractPreviewFile(sourcePath, tempDir);
  if (!preview) return {};
  return {
    previewMime: preview.mime,
    previewDataUrl: `data:${preview.mime};base64,${preview.content.toString("base64")}`,
  };
}

export async function extractPreviewFile(sourcePath: string, tempDir: string): Promise<PreviewFile | undefined> {
  const extension = extname(sourcePath).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension)) {
    return {
      content: await readFile(sourcePath),
      mime: contentType(sourcePath),
      extension,
    };
  }

  if (extension === ".heic" || extension === ".heif") {
    try {
      const input = await readFile(sourcePath);
      const output = await convertHeic({
        buffer: input,
        format: "JPEG",
        quality: 0.82,
      });
      const content = Buffer.isBuffer(output)
        ? output
        : output instanceof ArrayBuffer
          ? Buffer.from(new Uint8Array(output))
          : Buffer.from(output);
      if (content.length) return { content, mime: "image/jpeg", extension: ".jpg" };
    } catch {
      // Fall through to embedded preview extraction below.
    }
  }

  const jobs: Array<{ fileName: string; run: (dest: string) => Promise<void> }> = [
    { fileName: "preview.jpg", run: (dest) => exiftool.extractPreview(sourcePath, dest) },
    { fileName: "thumbnail.jpg", run: (dest) => exiftool.extractThumbnail(sourcePath, dest) },
    { fileName: "raw-preview.jpg", run: (dest) => exiftool.extractJpgFromRaw(sourcePath, dest) },
    { fileName: "other-preview.jpg", run: (dest) => exiftool.extractBinaryTag("OtherImage", sourcePath, dest) },
  ];

  for (const job of jobs) {
    const dest = join(tempDir, job.fileName);
    try {
      await job.run(dest);
      const content = await readFile(dest);
      if (!content.length) continue;
      const mime = detectImageMime(content) || "image/jpeg";
      return { content, mime, extension: mimeToExtension(mime) };
    } catch {
      // Try the next embedded preview tag.
    }
  }

  return undefined;
}
