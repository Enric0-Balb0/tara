// Runs the Maestro flows in .maestro/ on the running emulator or USB device.
//   npm run e2e      -> preview build (JS bundle embedded, backend online on Render)
//   npm run e2e:dev  -> development build, JS from the dev server on port 8081
//   npm run e2e:dev -- ricerca primo-download  -> only the named flows
// Flow tags: `api` needs a backend that answers, `dev` and `design` need the development
// build (the Sviluppo menu of the profile exists only with __DEV__).
// Maestro needs JDK 17+: JAVA_HOME is set for the child process only (TARA_JAVA_HOME
// or the JDK bundled with Android Studio), so a global JAVA_HOME is left untouched.
// Sign-in: the app has no test bypass. Before each flow the script asks Supabase Auth
// (admin API, secret key in TARA_E2E_SUPABASE_SECRET_KEY, never in the repo) for a fresh
// one-time code of the e2e user and passes EMAIL and OTP to Maestro: no email is sent.
// The user is TARA_E2E_EMAIL, or else the only Supabase user whose address has "+e2e@".
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const devMode = process.argv.includes('--dev');
const onlyFlows = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
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
function previewEnv() {
  const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
  return eas.build?.preview?.env ?? {};
}

// A user environment variable set after this terminal was opened is not inherited yet:
// on Windows read it from the registry, so a new terminal is not needed.
function secretKey() {
  const fromEnv = process.env.TARA_E2E_SUPABASE_SECRET_KEY;
  if (fromEnv || process.platform !== 'win32') return fromEnv;
  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('TARA_E2E_SUPABASE_SECRET_KEY','User')"],
    { encoding: 'utf8' },
  );
  return result.stdout?.trim() || undefined;
}

async function authAdmin(supabaseUrl, key, path, init = {}) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/${path}`, {
    ...init,
    headers: { apikey: key, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Supabase Auth ${path}: HTTP ${response.status}`);
  return response.json();
}

async function e2eEmail(supabaseUrl, key) {
  if (process.env.TARA_E2E_EMAIL) return process.env.TARA_E2E_EMAIL;
  const { users } = await authAdmin(supabaseUrl, key, 'users?per_page=1000');
  const matches = users.filter((user) => user.email?.includes('+e2e@'));
  if (matches.length !== 1) {
    throw new Error(`Utenti con "+e2e@" in Supabase: ${matches.length}. Imposta TARA_E2E_EMAIL.`);
  }
  return matches[0].email;
}

// One-time code of an existing user, created by the admin API without sending email.
async function freshOtp(supabaseUrl, key, email) {
  const link = await authAdmin(supabaseUrl, key, 'generate_link', {
    method: 'POST',
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  const otp = link.email_otp ?? link.properties?.email_otp;
  if (!otp) throw new Error('Supabase Auth non ha restituito il codice monouso');
  return otp;
}

// Tags listed in the flow header (the part before `---`).
function flowTags(text) {
  const header = text.split(/^---$/m)[0];
  const block = header.match(/^tags:[ \t]*\r?\n((?:[ \t]+-[ \t]*\S+[ \t]*\r?\n?)+)/m);
  return block ? [...block[1].matchAll(/-\s*(\S+)/g)].map((match) => match[1]) : [];
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

const baseArgs = [];
const excludedTags = [];
const preview = previewEnv();
if (devMode) {
  if (run('adb', ['reverse', `tcp:${port}`, `tcp:${port}`]) !== 0) {
    console.error('adb reverse non riuscito: emulatore o telefono collegato?');
    process.exit(1);
  }
  baseArgs.push('-e', `DEV_SERVER_URL=http://localhost:${port}`);
  // Flows tagged api need the backend on this PC (the emulator reaches it at 10.0.2.2).
  const apiUrl = process.env.TARA_API_URL ?? 'http://localhost:8000';
  if (!(await apiReachable(apiUrl))) {
    console.warn(`Backend non raggiungibile su ${apiUrl}: salto i flussi con il tag api.`);
    excludedTags.push('api');
  }
} else {
  excludedTags.push('design', 'dev');
  // Render Free sleeps when idle and takes up to a minute to wake up: wait for it.
  const apiUrl = preview.EXPO_PUBLIC_API_URL;
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
const supabaseUrl = preview.EXPO_PUBLIC_SUPABASE_URL;
const key = secretKey();
if (!supabaseUrl || !key) {
  console.error(
    'Per accedere servono EXPO_PUBLIC_SUPABASE_URL nel profilo preview di eas.json e la ' +
      'variabile TARA_E2E_SUPABASE_SECRET_KEY (docs/processo.md, "Segreti").',
  );
  process.exit(1);
}
const email = await e2eEmail(supabaseUrl, key);

const flowsDir = new URL('../.maestro/', import.meta.url);
const flows = readdirSync(flowsDir)
  .filter((name) => name.endsWith('.yaml'))
  .sort()
  .filter((name) => onlyFlows.length === 0 || onlyFlows.includes(name.replace(/[.]yaml$/, '')))
  .filter((name) => {
    const tags = flowTags(readFileSync(new URL(name, flowsDir), 'utf8'));
    return !tags.some((tag) => excludedTags.includes(tag));
  });
if (excludedTags.length > 0) console.log(`Salto i flussi con i tag: ${excludedTags.join(', ')}.`);

// One Maestro run per flow: each flow starts from a clean app and signs in again, and a
// code works once, so every flow gets its own.
const failed = [];
for (const flow of flows) {
  const name = flow.replace(/\.yaml$/, '');
  const otp = await freshOtp(supabaseUrl, key, email);
  const args = ['test', join('.maestro', flow), '--test-output-dir', join('e2e-results', name)];
  args.push(...baseArgs, '-e', `EMAIL=${email}`, '-e', `OTP=${otp}`);
  if (run('maestro', args, env) !== 0) failed.push(name);
}
const failedList = failed.length > 0 ? ` (${failed.join(', ')})` : '';
console.log(`\nFlussi: ${flows.length}, falliti: ${failed.length}${failedList}.`);
process.exit(failed.length === 0 ? 0 : 1);
