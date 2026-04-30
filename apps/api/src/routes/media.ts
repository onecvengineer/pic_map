import { readFile } from "node:fs/promises";
import type { FastifyPluginAsync } from "fastify";
import { contentType } from "../http.js";
import { mediaPath } from "../storage.js";

export const mediaRoutes: FastifyPluginAsync = async (app) => {
  app.route<{ Params: { "*": string } }>({
    method: ["GET", "HEAD"],
    url: "/media/*",
    handler: async (request, reply) => {
      const relativePath = decodeURIComponent(request.params["*"]);
      const filePath = await mediaPath(relativePath);
      if (!filePath) return reply.code(404).type("text/plain; charset=utf-8").send("Not found");

      reply.type(contentType(filePath)).header("cache-control", "private, max-age=3600");
      if (request.method === "HEAD") return reply.send();
      return reply.send(await readFile(filePath));
    },
  });
};
