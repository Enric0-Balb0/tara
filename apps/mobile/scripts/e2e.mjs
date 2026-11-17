// Runs the Maestro flows in .maestro/ on the running emulator or USB device.
//   npm run e2e      -> preview build (JS bundle embedded, backend online on Render)
//   npm run e2e:dev  -> development build, JS from the dev server on port 8081
// Flow tags: `api` needs a backend that answers, `dev` and `design` need the development
// build (the Sviluppo menu of the profile exists only with __DEV__).
// Maestro needs JDK 17+: JAVA_HOME is set for the child process only (TARA_JAVA_HOME
// or the JDK bundled with Android Studio), so a global JAVA_HOME is left untouched.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const devMode = process.argv.includes('--dev');
const port = process.env.TARA_DEV_PORT ?? '8081';

// Polls /health until it answers or waitMs runs out (0 = a single quick attempt).
async function apiReachable(apiUrl, waitMs = 0) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      const response = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(waitMs > 0 ? 15000 : 2000) });
      if (response.ok) return true;
    } catch {
      // Not up yet: retry until the deadline.
    }
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

// The preview build talks to the backend set in its eas.json profile: read it from
// there, so the URL keeps living only where docs/processo.md lists it.
function previewApiUrl() {
  const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
  return eas.build?.preview?.env?.EXPO_PUBLIC_API_URL;
}

function androidStudioJdk() {
  const candidates = [
    process.env.TARA_JAVA_HOME,
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/opt/android-studio/jbr',
  ];
  return candidates.find((dir) => dir && existsSync(join(dir, 'bin')));
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const env = { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1', MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true' };
const jdk = androidStudioJdk();
if (jdk) env.JAVA_HOME = jdk;

const args = ['test', '.maestro', '--test-output-dir', 'e2e-results'];
const excludedTags = [];
if (devMode) {
  if (run('adb', ['reverse', `tcp:${port}`, `tcp:${port}`]) !== 0) {
    console.error('adb reverse non riuscito: emulatore o telefono collegato?');
    process.exit(1);
  }
  args.push('-e', `DEV_SERVER_URL=http://localhost:${port}`);
  // Flows tagged api need the backend on this PC (the emulator reaches it at 10.0.2.2).
  const apiUrl = process.env.TARA_API_URL ?? 'http://localhost:8000';
  if (!(await apiReachable(apiUrl))) {
    console.warn(`Backend non raggiungibile su ${apiUrl}: salto i flussi con il tag api.`);
    excludedTags.push('api');
  }
} else {
  excludedTags.push('design', 'dev');
  // Render Free sleeps when idle and takes up to a minute to wake up: wait for it.
  const apiUrl = previewApiUrl();
  if (!apiUrl) {
    console.warn('Manca EXPO_PUBLIC_API_URL nel profilo preview di eas.json: salto i flussi con il tag api.');
    excludedTags.push('api');
  } else {
    console.log(`Controllo il backend della build preview su ${apiUrl} (fino a 90 s, Render si sveglia)...`);
    if (!(await apiReachable(apiUrl, 90000))) {
      console.warn(`Backend non raggiungibile su ${apiUrl} dopo 90 s: salto i flussi con il tag api.`);
      excludedTags.push('api');
    }
  }
}
if (excludedTags.length > 0) args.push('--exclude-tags', excludedTags.join(','));

process.exit(run('maestro', args, env));
