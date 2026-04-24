import { parseImageMetadata } from "./metadata.js";

async function main(): Promise<void> {
  const paths = process.argv.slice(2);

  if (!paths.length) {
    console.error("Usage: npm run parse -- <image-path> [image-path...]");
    process.exitCode = 1;
    return;
  }

  const results = [];
  for (const path of paths) {
    try {
      results.push(await parseImageMetadata(path));
    } catch (error) {
      results.push({
        sourcePath: path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
}

main();
