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
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
