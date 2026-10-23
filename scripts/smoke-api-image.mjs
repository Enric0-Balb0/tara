// Smoke test of the production API image: the container must start and answer /health.
// Shared by CI (job "Immagine Docker API") and the local VS Code task.
//   node scripts/smoke-api-image.mjs                       build tara-api:local, then test it
//   node scripts/smoke-api-image.mjs --no-build tara-api:ci test an image built elsewhere
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const build = !args.includes('--no-build');
const image = args.find((arg) => !arg.startsWith('--')) ?? 'tara-api:local';
const port = process.env.TARA_SMOKE_PORT ?? '18000';
const container = `tara-api-smoke-${process.pid}`;

function docker(...dockerArgs) {
  const result = spawnSync('docker', dockerArgs, { stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

async function fetchHealth() {
  // A plain (ref'd) timer: it keeps the process alive while the request is pending, and
  // aborts requests that a port proxy accepts but never answers.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    return await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function healthy() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetchHealth();
      if (response.ok) {
        console.log(await response.text());
        return true;
      }
    } catch {
      // Container still starting.
    }
    await sleep(1000);
  }
  return false;
}

if (build && docker('build', '-t', image, 'services/api') !== 0) process.exit(1);
if (docker('run', '-d', '--name', container, '-p', `${port}:8000`, image) !== 0) process.exit(1);

let ok = false;
try {
  ok = await healthy();
  if (!ok) {
    console.error(`/health non risponde entro 20 s. Log del container ${container}:`);
    docker('logs', container);
  }
} finally {
  spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
}
process.exit(ok ? 0 : 1);
