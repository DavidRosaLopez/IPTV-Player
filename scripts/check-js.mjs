import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { spawnSync } from 'child_process';

const root = process.cwd();
const ignored = new Set([join(root, 'js', 'lib')]);

function walk(dir, out = []) {
  if (ignored.has(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = [
  ...walk(join(root, 'js')),
  ...walk(join(root, 'web-remote', 'js'))
];

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    console.error(`\n${relative(root, file)}`);
    if (result.stdout) console.error(result.stdout.trim());
    if (result.stderr) console.error(result.stderr.trim());
  }
}

if (failed) process.exit(1);
console.log(`Checked ${files.length} JS files.`);
