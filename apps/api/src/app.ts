import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { isAuthenticated } from "./auth.js";
import { loadDatabase } from "./storage.js";
import { authRoutes } from "./routes/auth.js";
import { exportRoutes } from "./routes/exports.js";
import { mediaRoutes } from "./routes/media.js";
import { photoRoutes } from "./routes/photos.js";
import { placeRoutes } from "./routes/places.js";
import { tileRoutes } from "./routes/tiles.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function buildApp() {
  const app = Fastify({
    logger: true,
    bodyLimit: 260 * 1024 * 1024,
  });

  await loadDatabase();

  await app.register(multipart, {
    limits: {
      fileSize: 250 * 1024 * 1024,
      files: 1,
    },
  });

  app.addHook("preHandler", async (request, reply) => {
    const path = new URL(request.url, "http://localhost").pathname;
    if (!path.startsWith("/api/") && !path.startsWith("/media/")) return;
    if (isPublicPath(path, request.method)) return;
    if (!isAuthenticated(request)) {
      return reply.code(401).send({ error: "Authentication required" });
    }
  });

  app.get("/api/health", async () => ({ ok: true }));
  await app.register(authRoutes);
  await app.register(photoRoutes);
  await app.register(placeRoutes);
  await app.register(exportRoutes);
  await app.register(mediaRoutes);
  await app.register(tileRoutes);

  const webDist = resolve(__dirname, "../../web/dist");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
      decorateReply: true,
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api/") && !request.url.startsWith("/media/")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "Not found" });
    });
  } else {
    app.get("/", async (_request, reply) => {
      return reply.type("text/plain; charset=utf-8").send("Pic Map API is running. Build apps/web to serve the UI.");
    });
  }

  return app;
}

function isPublicPath(path: string, method: string): boolean {
  return (
    (method === "GET" && path === "/api/health") ||
    (method === "GET" && path === "/api/session") ||
    (method === "POST" && path === "/api/auth/login") ||
    (method === "POST" && path === "/api/auth/logout") ||
    (method === "POST" && path === "/api/parse")
  );
}
