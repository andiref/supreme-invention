import { readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { spawn } from 'node:child_process';

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') files.push(...await walk(path));
    else if (entry.isFile() && ['.js', '.mjs'].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

const files = await walk('.');
for (const file of files) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--check', file], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Syntax check failed: ${file}`)));
  });
}
console.log(`syntax checks: PASS (${files.length} files)`);
