import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MOBILE_ASSET_SCHEMA,
  hashFile,
  listFiles,
  readJson,
} from './runtime-assets-lib.mjs';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const root = path.resolve(
  process.argv[2] ?? path.join(appRoot, 'assets', 'runtime'),
);
const manifest = await readJson(path.join(root, 'asset-manifest.json'));
if (manifest.schema !== MOBILE_ASSET_SCHEMA) {
  throw new Error(`unsupported mobile asset schema ${manifest.schema}`);
}
if (!String(manifest.productionIdentity).startsWith('sha256:')) {
  throw new Error('runtime assets lack a production artifact identity');
}
if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
  throw new Error('runtime asset manifest is empty');
}
const expected = [
  'asset-manifest.json',
  ...manifest.assets.map(asset => asset.path),
].sort();
const actualFiles = await listFiles(root);
if (JSON.stringify(expected) !== JSON.stringify(actualFiles)) {
  throw new Error(
    `runtime asset closure differs:\nexpected ${expected.join(
      '\n',
    )}\nactual ${actualFiles.join('\n')}`,
  );
}
for (const asset of manifest.assets) {
  const actual = await hashFile(path.join(root, asset.path));
  if (actual.bytes !== asset.bytes || actual.sha256 !== asset.sha256) {
    throw new Error(
      `bundled runtime asset ${asset.path} is stale or corrupted`,
    );
  }
}
const receipt = await readJson(path.join(root, 'sagejs', 'build-receipt.json'));
if (receipt.artifact?.identity !== manifest.productionIdentity) {
  throw new Error('bundled build receipt does not attest the bundled artifact');
}
const production = await readJson(
  path.join(root, 'sagejs', 'production-manifest.json'),
);
if (production.identity !== manifest.productionIdentity) {
  throw new Error('bundled production manifest has a different identity');
}
const productionPaths = production.assets
  .map(asset => `sagejs/dist/${asset.path}`)
  .sort();
const bundledProductionPaths = manifest.assets
  .map(asset => asset.path)
  .filter(assetPath => assetPath.startsWith('sagejs/dist/'))
  .sort();
if (
  JSON.stringify(productionPaths) !== JSON.stringify(bundledProductionPaths)
) {
  throw new Error(
    'mobile bundle does not contain the complete production closure',
  );
}
for (const filename of ['index.html', 'main.mjs']) {
  const text = await readFile(path.join(root, filename), 'utf8');
  if (/\bhttps?:\/\//i.test(text) || /fetch\s*\(/.test(text)) {
    throw new Error(`${filename} contains a remote-network code path`);
  }
}
console.log(`Verified offline runtime ${manifest.productionIdentity}`);
