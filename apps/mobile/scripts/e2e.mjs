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
if (devMode) {
  if (run('adb', ['reverse', `tcp:${port}`, `tcp:${port}`]) !== 0) {
    console.error('adb reverse non riuscito: emulatore o telefono collegato?');
    process.exit(1);
  }
  args.push('-e', `DEV_SERVER_URL=http://localhost:${port}`);
} else {
  // The component catalog exists only in development builds.
  args.push('--exclude-tags', 'design');
}

process.exit(run('maestro', args, env));
