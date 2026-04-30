import type { FastifyPluginAsync } from "fastify";
import { clearSessionCookie, isAuthenticated, setSessionCookie, validatePassword } from "../auth.js";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { password?: string } }>("/api/auth/login", async (request, reply) => {
    if (!validatePassword(String(request.body?.password || ""))) {
      return reply.code(401).send({ error: "Invalid password" });
    }
    setSessionCookie(reply);
    return { ok: true };
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/api/session", async (request) => ({
    authenticated: isAuthenticated(request),
  }));
};
