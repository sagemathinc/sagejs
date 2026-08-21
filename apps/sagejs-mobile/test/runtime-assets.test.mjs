import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  HOST_FILES,
  PRODUCTION_SCHEMA,
  RECEIPT_SCHEMA,
  verifySource,
} from '../scripts/runtime-assets-lib.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const execute = promisify(execFile);

test('accepts only a production artifact attested by its exact receipt', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sagejs-mobile-assets-'));
  try {
    await mkdir(path.join(root, 'dist'), { recursive: true });
    const bytes = Buffer.from('wasm-fixture');
    await writeFile(path.join(root, 'dist', 'engine.wasm'), bytes);
    const artifact = {
      schema: PRODUCTION_SCHEMA,
      identity: `sha256:${digest(bytes)}`,
      layout: { modules: [] },
      assets: [
        { path: 'engine.wasm', bytes: bytes.length, sha256: digest(bytes) },
      ],
    };
    await writeFile(
      path.join(root, 'dist', 'production-manifest.json'),
      JSON.stringify(artifact),
    );
    await writeFile(
      path.join(root, 'dist', 'build-receipt.json'),
      JSON.stringify({ schema: RECEIPT_SCHEMA, artifact }),
    );
    for (const filename of HOST_FILES)
      await writeFile(path.join(root, filename), 'export {};\n');
    assert.equal(
      (await verifySource(root)).production.identity,
      artifact.identity,
    );
    await writeFile(path.join(root, 'dist', 'engine.wasm'), 'corrupted');
    await assert.rejects(verifySource(root), /does not match/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('copies and verifies the complete attested offline closure end to end', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sagejs-mobile-source-'));
  const destination = await mkdtemp(
    path.join(os.tmpdir(), 'sagejs-mobile-destination-'),
  );
  try {
    await mkdir(path.join(root, 'dist'), { recursive: true });
    const bytes = Buffer.from('wasm-fixture');
    await writeFile(path.join(root, 'dist', 'engine.wasm'), bytes);
    const artifact = {
      schema: PRODUCTION_SCHEMA,
      identity: `sha256:${digest(bytes)}`,
      layout: { modules: [] },
      assets: [
        { path: 'engine.wasm', bytes: bytes.length, sha256: digest(bytes) },
      ],
    };
    await writeFile(
      path.join(root, 'dist', 'production-manifest.json'),
      JSON.stringify(artifact),
    );
    await writeFile(
      path.join(root, 'dist', 'build-receipt.json'),
      JSON.stringify({ schema: RECEIPT_SCHEMA, artifact }),
    );
    for (const filename of HOST_FILES) {
      await writeFile(path.join(root, filename), 'export {};\n');
    }
    await execute(process.execPath, ['scripts/prepare-runtime-assets.mjs'], {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        SAGEJS_WASM_ARTIFACT: root,
        SAGEJS_MOBILE_ASSET_DESTINATION: destination,
      },
    });
    await execute(
      process.execPath,
      ['scripts/verify-runtime-assets.mjs', destination],
      { cwd: new URL('..', import.meta.url) },
    );
    const manifest = JSON.parse(
      await readFile(path.join(destination, 'asset-manifest.json'), 'utf8'),
    );
    assert.equal(manifest.productionIdentity, artifact.identity);
    assert(
      manifest.assets.some(asset => asset.path === 'sagejs/dist/engine.wasm'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(destination, { recursive: true, force: true });
  }
});

test('runtime shell has a restrictive offline CSP and no remote code path', async () => {
  const html = await readFile(
    new URL('../runtime-shell/index.html', import.meta.url),
    'utf8',
  );
  const main = await readFile(
    new URL('../runtime-shell/main.mjs', import.meta.url),
    'utf8',
  );
  assert.match(html, /default-src 'none'/);
  assert.match(html, /connect-src 'self'/);
  assert.match(html, /'wasm-unsafe-eval'/);
  assert.doesNotMatch(`${html}\n${main}`, /\bhttps?:\/\//i);
  assert.doesNotMatch(main, /fetch\s*\(/);
});

test('native hosts permit only the verified application-owned loopback origin', async () => {
  const android = await readFile(
    new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url),
    'utf8',
  );
  const gradle = await readFile(
    new URL('../android/app/build.gradle', import.meta.url),
    'utf8',
  );
  const project = await readFile(
    new URL('../ios/SageJSMobile.xcodeproj/project.pbxproj', import.meta.url),
    'utf8',
  );
  assert.match(android, /android.permission.INTERNET/);
  assert.match(android, /usesCleartextTraffic="false"/);
  assert.match(android, /networkSecurityConfig/);
  assert.match(gradle, /verify-runtime-assets\.mjs/);
  assert.match(project, /Verify offline runtime/);
  assert.match(project, /verify-runtime-assets\.mjs/);
});
