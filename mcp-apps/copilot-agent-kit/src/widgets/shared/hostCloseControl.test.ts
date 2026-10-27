import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// The views mount UI from these folders.
const roots = [
  join(srcDir, "widgets"),
  join(srcDir, "agent-debugger"),
  join(srcDir, "agent-review", "ui"),
];

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx?|css|html)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

test("no view has an exit full screen control, because the host gives its own close control", () => {
  // Split so that this guard does not match itself.
  const removed = [new RegExp("exit" + " ?full ?screen", "i"), new RegExp("Arrow" + "Minimize")];
  const files = roots.flatMap(sourceFiles);
  assert.ok(files.some((path) => path.endsWith("AgentDebuggerApp.tsx")));
  assert.ok(files.some((path) => path.endsWith("ReviewBrowserApp.tsx")));
  const offenders = files
    .filter((path) => removed.some((pattern) => pattern.test(readFileSync(path, "utf8"))))
    .map((path) => relative(srcDir, path));
  assert.deepEqual(offenders, []);
});
