/**
 * Build outputs
 *   dist/native.cjs   — DOM-free API for the iOS app (Metro resolves `main`)
 *   dist/inpage.js    — IIFE the extension injects at document_start
 *   dist/inpage.txt   — the same script as text, for WKWebView injection
 *   dist/styles.css    — combined stylesheet (reference / docs)
 *   dist/*.d.ts        — declarations for the host API
 *
 * The `?raw` CSS imports are inlined by the plugin below, which is what lets the
 * WebView get the exact same styles as the extension without a second asset
 * pipeline.
 */

import { execSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');

const rawPlugin = {
  name: 'raw-text',
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: path.join(args.resolveDir, args.path.replace(/\?raw$/, '')),
      namespace: 'raw-text',
    }));
    build.onLoad({ filter: /.*/, namespace: 'raw-text' }, async (args) => ({
      contents: await readFile(args.path, 'utf8'),
      loader: 'text',
    }));
  },
};

await mkdir(dist, { recursive: true });

// 1. In-page script (IIFE so it can be injected as-is).
await esbuild.build({
  entryPoints: [path.join(root, 'src/inpage/standalone.ts')],
  outfile: path.join(dist, 'inpage.js'),
  bundle: true,
  format: 'iife',
  target: ['es2020', 'safari15'],
  platform: 'browser',
  legalComments: 'none',
  plugins: [rawPlugin],
  banner: { js: '/* Directly — in-page core. Built locally; no remote code. */' },
});

const inpage = await readFile(path.join(dist, 'inpage.js'), 'utf8');
await writeFile(path.join(dist, 'inpage.txt'), inpage, 'utf8');

// 2. Host API for React Native (CommonJS so Metro needs no extra config).
await esbuild.build({
  entryPoints: [path.join(root, 'src/index.ts')],
  outfile: path.join(dist, 'native.cjs'),
  bundle: true,
  format: 'cjs',
  target: ['node18'],
  platform: 'neutral',
  legalComments: 'none',
});

// 3. Combined stylesheet, for inspection and for hosts that prefer a <link>.
const styleFiles = ['theme', 'hide-chrome', 'blocked', 'skeleton'];
const css = (
  await Promise.all(styleFiles.map((name) => readFile(path.join(root, `src/styles/${name}.css`), 'utf8')))
).join('\n\n');
await writeFile(path.join(dist, 'styles.css'), css, 'utf8');

// 4. Declarations.
execSync('pnpm exec tsc -p tsconfig.build.json', { cwd: root, stdio: 'inherit' });

const bytes = Buffer.byteLength(inpage, 'utf8');
console.log(`core: inpage.js ${(bytes / 1024).toFixed(1)} kB, native.cjs built`);
