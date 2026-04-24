import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseImageMetadata } from "./metadata.js";

const rootDir = resolve(".");
const port = Number(process.env.PORT || 5173);

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/parse") {
      await handleParse(request, response);
      return;
    }

    if (request.method === "GET" && request.url === "/api/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.on("error", (error) => {
  console.error(`Failed to start server on http://127.0.0.1:${port}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Photo Atlas parser running at http://127.0.0.1:${port}`);
});

async function handleParse(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const contentType = request.headers["content-type"] || "";
  const boundary = getBoundary(contentType);
  if (!boundary) {
    sendJson(response, 400, { error: "Expected multipart/form-data upload" });
    return;
  }

  const body = await readRequestBody(request, 120 * 1024 * 1024);
  const file = parseMultipartFile(body, boundary);
  if (!file) {
    sendJson(response, 400, { error: "No file field found" });
    return;
  }

  const tempDir = await mkdtemp(join(tmpdir(), "photo-atlas-"));
  const safeName = file.filename.replace(/[^\w.\-]+/g, "_") || "upload";
  const tempPath = join(tempDir, safeName);

  try {
    await writeFile(tempPath, file.content);
    const metadata = await parseImageMetadata(tempPath);
    sendJson(response, 200, {
      ...metadata,
      sourcePath: file.filename,
      fileName: file.filename,
      raw: sanitizeForJson(metadata.raw),
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function serveStatic(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = resolve(rootDir, relativePath);

  if (!filePath.startsWith(rootDir)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentType(filePath),
      "cache-control": "no-store",
    });
    if (request.method !== "HEAD") response.end(content);
    else response.end();
  } catch {
    sendText(response, 404, "Not found");
  }
}

function getBoundary(contentType: string | string[]): string | undefined {
  const value = Array.isArray(contentType) ? contentType[0] : contentType;
  return value
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("boundary="))
    ?.slice("boundary=".length)
    .replace(/^"|"$/g, "");
}

function parseMultipartFile(body: Buffer, boundary: string): { filename: string; content: Buffer } | undefined {
  const delimiter = Buffer.from(`--${boundary}`);
  let cursor = body.indexOf(delimiter);

  while (cursor !== -1) {
    const next = body.indexOf(delimiter, cursor + delimiter.length);
    if (next === -1) break;

    const part = body.subarray(cursor + delimiter.length, next);
    cursor = next;

    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;

    const headers = part.subarray(0, headerEnd).toString("utf8");
    const filename = /filename="([^"]+)"/.exec(headers)?.[1];
    if (!filename) continue;

    let content = part.subarray(headerEnd + 4);
    if (content.subarray(0, 2).equals(Buffer.from("\r\n"))) content = content.subarray(2);
    if (content.subarray(-2).equals(Buffer.from("\r\n"))) content = content.subarray(0, -2);
    return { filename, content };
  }

  return undefined;
}

async function readRequestBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error("Upload is too large");
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendText(response: ServerResponse, status: number, text: string): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(text);
}

function contentType(filePath: string): string {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  }[extname(filePath).toLowerCase()] || "application/octet-stream";
}

function sanitizeForJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, nestedValue) => {
    if (typeof nestedValue === "bigint") return nestedValue.toString();
    return nestedValue;
  }));
}
