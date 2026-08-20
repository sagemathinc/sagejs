import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HOST_FILES,
  MOBILE_ASSET_SCHEMA,
  SHELL_FILES,
  hashFile,
  verifySource,
} from './runtime-assets-lib.mjs';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const source = path.resolve(
  process.env.SAGEJS_WASM_ARTIFACT ??
    path.join(appRoot, '..', '..', 'packages', 'flint-wasm'),
);
const destination = path.join(appRoot, 'assets', 'runtime');
const shell = path.join(appRoot, 'runtime-shell');

const { production, receiptPath } = await verifySource(source);
await rm(destination, { recursive: true, force: true });
await mkdir(path.join(destination, 'sagejs', 'dist'), { recursive: true });

const assets = [];
for (const asset of production.assets) {
  const output = path.join(destination, 'sagejs', 'dist', asset.path);
  await mkdir(path.dirname(output), { recursive: true });
  await copyFile(path.join(source, 'dist', asset.path), output);
  assets.push({
    path: `sagejs/dist/${asset.path}`,
    bytes: asset.bytes,
    sha256: asset.sha256,
  });
}

for (const filename of HOST_FILES) {
  const output = path.join(destination, 'sagejs', filename);
  await copyFile(path.join(source, filename), output);
  assets.push({ path: `sagejs/${filename}`, ...(await hashFile(output)) });
}

await copyFile(
  receiptPath,
  path.join(destination, 'sagejs', 'build-receipt.json'),
);
assets.push({
  path: 'sagejs/build-receipt.json',
  ...(await hashFile(path.join(destination, 'sagejs', 'build-receipt.json'))),
});
await copyFile(
  path.join(source, 'dist', 'production-manifest.json'),
  path.join(destination, 'sagejs', 'production-manifest.json'),
);
assets.push({
  path: 'sagejs/production-manifest.json',
  ...(await hashFile(
    path.join(destination, 'sagejs', 'production-manifest.json'),
  )),
});

for (const filename of SHELL_FILES) {
  const output = path.join(destination, filename);
  if (filename === 'index.html') {
    const template = await readFile(path.join(shell, filename), 'utf8');
    if (!template.includes('__SAGEJS_ARTIFACT_ID__')) {
      throw new Error(
        'runtime shell is missing its artifact identity placeholder',
      );
    }
    await writeFile(
      output,
      template.replaceAll('__SAGEJS_ARTIFACT_ID__', production.identity),
    );
  } else {
    await copyFile(path.join(shell, filename), output);
  }
  assets.push({ path: filename, ...(await hashFile(output)) });
}

assets.sort((left, right) => left.path.localeCompare(right.path));
const manifest = {
  schema: MOBILE_ASSET_SCHEMA,
  productionIdentity: production.identity,
  productionLayout: production.layout,
  assets,
};
await writeFile(
  path.join(destination, 'asset-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `Prepared ${assets.length} offline assets for ${production.identity}`,
);
