// Runs the Maestro flows in .maestro/ on the running emulator or USB device.
//   npm run e2e      -> preview build (JS bundle embedded)
//   npm run e2e:dev  -> development build, JS from the dev server on port 8081
// Maestro needs JDK 17+: JAVA_HOME is set for the child process only (TARA_JAVA_HOME
// or the JDK bundled with Android Studio), so a global JAVA_HOME is left untouched.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const devMode = process.argv.includes('--dev');
const port = process.env.TARA_DEV_PORT ?? '8081';
const apiUrl = process.env.TARA_API_URL ?? 'http://localhost:8000';

async function apiReachable() {
  try {
    const response = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
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
  if (!(await apiReachable())) {
    console.warn(`Backend non raggiungibile su ${apiUrl}: salto i flussi con il tag api.`);
    excludedTags.push('api');
  }
} else {
  // The component catalog exists only in development builds, and preview builds block
  // cleartext HTTP, so they cannot reach the local backend.
  excludedTags.push('design', 'api');
}
if (excludedTags.length > 0) args.push('--exclude-tags', excludedTags.join(','));

process.exit(run('maestro', args, env));
