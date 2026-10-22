import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function exists(relativePath: string): Promise<boolean> {
  try {
    await stat(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(path.join(root, directory), {
    withFileTypes: true,
  });

  return (
    await Promise.all(
      entries.map(async (entry) => {
        const relative = path.join(directory, entry.name);
        if ((await stat(path.join(root, relative))).isDirectory()) {
          return sourceFiles(relative);
        }
        return /\.(?:ts|tsx|js|mjs|json)$/.test(entry.name) ? [relative] : [];
      }),
    )
  ).flat();
}

test("uses one root package for all application features", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );

  assert.equal(manifest.workspaces, undefined);
  assert.equal(manifest.dependencies?.["@cattools/agent-review-core"], undefined);
  assert.equal(manifest.dependencies?.["@cattools/agent-review-ui"], undefined);
  assert.equal(await exists("packages"), false);
  assert.equal(await exists("src/agent-review/core"), true);
  assert.equal(await exists("src/agent-review/server"), true);
  assert.equal(await exists("src/agent-review/ui"), true);

  const offenders: string[] = [];
  for (const file of await sourceFiles("src")) {
    const content = await readFile(path.join(root, file), "utf8");
    if (content.includes("@cattools/")) offenders.push(file);
  }

  assert.deepEqual(offenders, []);
});
