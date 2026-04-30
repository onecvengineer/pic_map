import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

const cookieName = "pic_map_session";
const sessionSecret = process.env.SESSION_SECRET || "pic-map-dev-session-secret";
const appPassword = process.env.APP_PASSWORD || "picmap";

export function isAuthenticated(request: FastifyRequest): boolean {
  const token = parseCookies(request.headers.cookie || "")[cookieName];
  if (!token) return false;
  const [nonce, signature] = token.split(".");
  if (!nonce || !signature) return false;
  return timingEqual(signature, sign(nonce));
}

export function validatePassword(password: string): boolean {
  return timingEqual(password, appPassword);
}

export function setSessionCookie(reply: FastifyReply): void {
  const nonce = randomBytes(24).toString("base64url");
  const token = `${nonce}.${sign(nonce)}`;
  reply.header("set-cookie", `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.header("set-cookie", `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function sign(value: string): string {
  return createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function parseCookies(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const [key, ...value] = pair.trim().split("=");
    if (!key) continue;
    result[key] = value.join("=");
  }
  return result;
}

function timingEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
