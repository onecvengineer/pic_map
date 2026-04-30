import type { FastifyPluginAsync } from "fastify";
import { createExportManifest, listExports } from "../storage.js";

export const exportRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/exports", async () => ({ exports: await listExports() }));

  app.post("/api/exports", async (_request, reply) => (
    reply.code(201).send(await createExportManifest())
  ));
};
