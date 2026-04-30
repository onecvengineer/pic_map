import { buildApp } from "./app.js";

const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";

const app = await buildApp();

try {
  await app.listen({ port, host });
  console.log(`Pic Map running at http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
