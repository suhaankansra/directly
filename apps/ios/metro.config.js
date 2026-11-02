/**
 * Metro config for a monorepo app.
 *
 * `watchFolders` lets Metro read `packages/core`, and `nodeModulesPaths` lets it
 * resolve dependencies that the workspace hoists to the repo root.
 *
 * `@directly/core` itself is consumed through its built CommonJS output
 * (`dist/native.cjs`), so Metro never has to transpile TypeScript that lives in
 * another package — the only code Metro compiles is this app's own.
 */

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

// pnpm keeps a nested store: real packages live under `.pnpm/<pkg>@<ver>/node_modules`
// and merged copies sit in `.pnpm/node_modules`. Metro only looks where it is told,
// so both have to be listed or transitive deps (expo-modules-core and friends) vanish.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(projectRoot, 'node_modules/.pnpm/node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Keep walking up from each package's own directory, which is how a dependency
// imported by `expo/build/Expo.js` finds its sibling inside the store.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
