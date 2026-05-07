import { spawn } from "node:child_process";
import { once } from "node:events";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const env = {
  ...process.env,
  APP_PASSWORD: process.env.APP_PASSWORD || "picmap",
  SESSION_SECRET: process.env.SESSION_SECRET || "dev-pic-map-session-secret",
};

const children = [
  start("api", ["run", "dev:api"], env),
  start("web", ["run", "dev:web"], env),
];

let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stopAll(signal));
}

for (const child of children) {
  child.once("exit", (code, signal) => {
    if (stopping) return;
    stopping = true;
    stopAll("SIGTERM");
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

await Promise.race(children.map((child) => once(child, "exit")));

function start(name, args, childEnv) {
  const child = spawn(npmCommand, args, {
    env: childEnv,
    stdio: ["inherit", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => writePrefixed(name, chunk));
  child.stderr.on("data", (chunk) => writePrefixed(name, chunk));
  return child;
}

function writePrefixed(name, chunk) {
  for (const line of String(chunk).split(/\r?\n/)) {
    if (line.length) process.stdout.write(`[${name}] ${line}\n`);
  }
}

function stopAll(signal) {
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}
