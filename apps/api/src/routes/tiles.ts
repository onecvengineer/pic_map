import type { FastifyPluginAsync } from "fastify";
import { fetch, ProxyAgent } from "undici";

const hosts = ["a", "b", "c"];
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

export const tileRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { z: string; x: string; y: string } }>("/tiles/osm/:z/:x/:y", async (request, reply) => {
    const z = Number(request.params.z);
    const x = Number(request.params.x);
    const y = Number(request.params.y);

    if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 19 || x < 0 || y < 0) {
      return reply.code(400).send({ error: "Invalid tile coordinate" });
    }

    const host = hosts[(x + y) % hosts.length];
    const upstream = await fetch(`https://${host}.tile.openstreetmap.org/${z}/${x}/${y}.png`, {
      dispatcher: proxyAgent,
      headers: {
        "user-agent": "PicMap/0.1 local photo map",
      },
    });

    if (!upstream.ok) {
      return reply.code(upstream.status).send({ error: "Tile unavailable" });
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    return reply
      .type("image/png")
      .header("cache-control", "public, max-age=86400")
      .send(body);
  });
};
