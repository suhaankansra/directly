/**
 * Copies the built in-page script into the app as a TypeScript string constant.
 *
 * Why a generated file instead of a Metro asset: WKWebView needs the script as a
 * string for `injectedJavaScriptBeforeContentLoaded`, and keeping it as source
 * makes it obvious that the iOS app and the extension run *the same* script —
 * there is no second, drifting copy of the blocking logic.
 *
 *   pnpm --filter @directly/core build
 *   node apps/ios/scripts/gen-injection.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const source = path.resolve(appRoot, '../../packages/core/dist/inpage.js');
const target = path.resolve(appRoot, 'src/lib/injectedScript.ts');

const script = await readFile(source, 'utf8');

const banner = `// GENERATED FILE — do not edit.
// Source: packages/core/src/inpage/** (built to packages/core/dist/inpage.js)
// Regenerate: pnpm --filter @directly/core build && node apps/ios/scripts/gen-injection.mjs
`;

await writeFile(target, `${banner}\nexport const inpageScript: string = ${JSON.stringify(script)};\n`, 'utf8');

console.log(`injection: wrote ${path.relative(process.cwd(), target)} (${(script.length / 1024).toFixed(1)} kB)`);
