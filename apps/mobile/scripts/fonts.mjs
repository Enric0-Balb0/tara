// Generates the Archivo static instances used by the app (docs/design.md, "Carattere").
// React Native cannot pick a width from a variable font, so every width/weight pair the
// design uses becomes its own file in assets/fonts/. Reproducible: the source is pinned to
// a google/fonts commit and checked by SHA-256; fontTools runs through uvx.
//   npm run fonts
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMIT = '95f4904fc8bcf26d3420fe315560c96417c6dec7';
const BASE = `https://raw.githubusercontent.com/google/fonts/${COMMIT}/ofl/archivo`;
const SOURCES = {
  font: {
    url: `${BASE}/Archivo%5Bwdth,wght%5D.ttf`,
    sha256: '0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053',
  },
  license: {
    url: `${BASE}/OFL.txt`,
    sha256: '108b4e57c9c796d3d38d0428ca7ee39de47ad93187302718d9b2d8864b9b716b',
  },
};

// Font family name used by the app -> [width, weight] on the variable font axes.
const INSTANCES = {
  'Archivo-Regular': [100, 400],
  'Archivo-SemiBold': [100, 600],
  'Archivo-Bold': [100, 700],
  'ArchivoSemiExpanded-SemiBold': [112.5, 600],
  'ArchivoSemiExpanded-ExtraBold': [112.5, 800],
  'ArchivoExpanded-Bold': [125, 700],
  'ArchivoExpanded-ExtraBold': [125, 800],
};

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts');

async function download(source, path) {
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`${source.url}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  const digest = createHash('sha256').update(data).digest('hex');
  if (digest !== source.sha256) throw new Error(`${source.url}: SHA-256 ${digest} non atteso`);
  writeFileSync(path, data);
}

function run(args) {
  const result = spawnSync('uvx', args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`uvx ${args.join(' ')} non riuscito`);
  return result.stdout;
}

// Downloaded files go to a fresh temporary folder, never next to the scripts.
const work = mkdtempSync(join(tmpdir(), 'tara-fonts-'));
try {
  const source = join(work, 'Archivo.ttf');
  await download(SOURCES.font, source);
  await download(SOURCES.license, join(work, 'OFL.txt'));
  mkdirSync(outDir, { recursive: true });
  for (const [name, [width, weight]] of Object.entries(INSTANCES)) {
    const target = join(outDir, `${name}.ttf`);
    run([
      '--from',
      'fonttools',
      'fonttools',
      'varLib.instancer',
      source,
      `wdth=${width}`,
      `wght=${weight}`,
      '--update-name-table',
      '-o',
      target,
    ]);
    console.log(`${name}.ttf`);
  }
  // Same text, without the trailing spaces the repository hooks would strip anyway.
  const license = readFileSync(join(work, 'OFL.txt'), 'utf8').replace(/[ \t]+$/gm, '');
  writeFileSync(join(outDir, 'OFL.txt'), license);
  const check = run([
    '--from',
    'fonttools',
    'python',
    '-I',
    '-c',
    "import sys; from fontTools.ttLib import TTFont; f = TTFont(sys.argv[1]); print('presente' if 'tnum' in {r.FeatureTag for r in f['GSUB'].table.FeatureList.FeatureRecord} else 'assente')",
    join(outDir, 'Archivo-Regular.ttf'),
  ]);
  console.log(`tnum: ${check.trim()}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
