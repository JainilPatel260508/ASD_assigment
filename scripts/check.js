import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

function checkDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) checkDirectory(file);
    else if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  }
}
for (const directory of ['src', 'prisma', 'scripts', 'tests']) checkDirectory(directory);
execFileSync(process.execPath, ['--check', 'prisma.config.js'], { stdio: 'inherit' });
console.log('JavaScript syntax checks passed');
