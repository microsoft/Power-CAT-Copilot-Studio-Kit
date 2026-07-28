import { build } from 'vite';
import fs from 'fs';
import path from 'path';

const entry = 'src/index.html';
console.log(`Building SN widget from ${entry}...`);

process.env.INPUT = entry;
await build({ configFile: 'vite.config.ts' });

const built = path.resolve('dist', 'src', 'index.html');
const target = path.resolve('..', 'servicenow_mcp', 'web', 'widget.html');

if (!fs.existsSync(built)) {
  console.error(`Expected build output at ${built} but it does not exist.`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(built, target);
console.log(`  → ${target}`);

const nestedSrc = path.resolve('dist', 'src');
if (fs.existsSync(nestedSrc)) {
  fs.rmSync(nestedSrc, { recursive: true });
}
