const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const args = process.argv.slice(2);
const candidates = ['k6'];
if (process.platform === 'win32') {
  candidates.push(
    join(process.env.ProgramFiles || 'C:\\Program Files', 'k6', 'k6.exe'),
  );
}

for (const executable of candidates) {
  const result = spawnSync(executable, args, { stdio: 'inherit' });
  if (result.error?.code === 'ENOENT') continue;
  if (result.error) {
    console.error(`Unable to launch k6: ${result.error.message}`);
  }
  process.exit(result.status ?? 1);
}

console.error('k6 was not found. Install the k6 CLI and add it to PATH.');
process.exit(1);
