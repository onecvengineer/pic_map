import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { PlaceCacheRecord } from "@pic-map/shared";
import { cachePlaces, findCachedPlaces } from "../storage.js";
import { gcj02ToWgs84 } from "../geo.js";

export const placeRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { q?: string } }>("/api/places/search", async (request, reply) => {
    const query = request.query.q?.trim() || "";
    if (!query) return reply.code(400).send({ error: "Missing q" });

    const cached = await findCachedPlaces(query);
    if (cached.length) return { provider: "amap", cached: true, results: cached };

    const key = process.env.AMAP_KEY;
    if (!key) return reply.code(503).send({ error: "AMAP_KEY is not configured", results: [] });

    const apiUrl = new URL("https://restapi.amap.com/v3/place/text");
    apiUrl.searchParams.set("key", key);
    apiUrl.searchParams.set("keywords", query);
    apiUrl.searchParams.set("offset", "10");
    apiUrl.searchParams.set("extensions", "base");

    const upstream = await fetch(apiUrl);
    const payload = await upstream.json() as { pois?: Array<Record<string, unknown>> };
    const results = (payload.pois || [])
      .map((poi): PlaceCacheRecord | undefined => {
        const location = String(poi.location || "");
        const [providerLongitude, providerLatitude] = location.split(",").map(Number);
        if (!Number.isFinite(providerLatitude) || !Number.isFinite(providerLongitude)) return undefined;
        const [longitude, latitude] = gcj02ToWgs84(providerLongitude, providerLatitude);
        return {
          id: randomUUID(),
          query,
          provider: "amap",
          name: String(poi.name || ""),
          address: String(poi.address || ""),
          latitude,
          longitude,
          providerLatitude,
          providerLongitude,
          createdAt: new Date().toISOString(),
        };
      })
      .filter((item): item is PlaceCacheRecord => Boolean(item));

    await cachePlaces(results);
    return { provider: "amap", cached: false, results };
  });
};
