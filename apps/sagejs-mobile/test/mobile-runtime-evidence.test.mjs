import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const app = new URL('..', import.meta.url);

async function validate(receipt) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'sagejs-device-receipt-'),
  );
  const filename = path.join(directory, 'receipt.json');
  await writeFile(filename, JSON.stringify(receipt));
  try {
    return await execute(
      process.execPath,
      ['scripts/validate-device-receipt.mjs', filename],
      { cwd: app },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('blocked physical-device fixtures explicitly preserve unobserved evidence', async () => {
  for (const family of ['iphone', 'ipad']) {
    const receipt = JSON.parse(
      await readFile(
        new URL(
          `../fixtures/device-receipts/unverified-${family}.json`,
          import.meta.url,
        ),
      ),
    );
    await validate(receipt);
    assert.deepEqual(receipt.runtimeEnvironment, {
      status: 'blocked',
      assetOrigin: 'unobserved',
      scheme: 'unobserved',
      host: 'unobserved',
      crossOriginIsolated: null,
      sharedArrayBuffer: null,
      workerTopology: { outer: 'unobserved', compiler: 'unobserved' },
      evidence: `No signed physical ${
        family === 'iphone' ? 'iPhone' : 'iPad'
      } runtime has been observed.`,
    });
  }
});

test('passing receipts require exact loopback, isolation, SAB, and nested workers', async () => {
  const receipt = JSON.parse(
    await readFile(
      new URL(
        '../fixtures/device-receipts/unverified-iphone.json',
        import.meta.url,
      ),
    ),
  );
  receipt.runtimeEnvironment = {
    status: 'pass',
    assetOrigin: 'loopback-http',
    scheme: 'http',
    host: '127.0.0.1',
    crossOriginIsolated: true,
    sharedArrayBuffer: true,
    workerTopology: {
      outer: 'dedicated-module-worker',
      compiler: 'nested-module-worker',
    },
    evidence: 'Captured from the validated runtime.ready envelope.',
  };
  await validate(receipt);
  for (const mutation of [
    { host: 'localhost' },
    { host: '127.0.0.1:49152' },
    { crossOriginIsolated: false },
    { sharedArrayBuffer: false },
    { capabilityPath: '/secret/' },
  ]) {
    const invalid = structuredClone(receipt);
    Object.assign(invalid.runtimeEnvironment, mutation);
    await assert.rejects(validate(invalid));
  }
});

test('runtime-ready source reports origin without port or capability path', async () => {
  const source = await readFile(
    new URL('../runtime-shell/main.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /assetOrigin: 'loopback-http'/);
  assert.match(source, /assetScheme: location\.protocol\.slice/);
  assert.match(source, /assetHost: location\.hostname/);
  assert.match(source, /crossOriginIsolated/);
  assert.match(source, /SharedArrayBuffer/);
  assert.doesNotMatch(source, /assetPath|location\.pathname|location\.port/);
});

test('simulator CI builds both form factors from the exact attested closure', async () => {
  const workflow = await readFile(
    new URL(
      '../../../.github/workflows/mobile-simulators.yml',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(workflow, /runs-on: macos-15/);
  assert.match(workflow, /production-receipt\.cjs validate/);
  assert.match(workflow, /assets:prepare/);
  assert.match(workflow, /assets:verify/);
  assert.match(
    workflow,
    /match] of \[\["iphone", \/\^iPhone \/\], \["ipad", \/\^iPad \/\]\]/,
  );
  assert.match(workflow, /destinations\.outputs\.iphone_id/);
  assert.match(workflow, /destinations\.outputs\.ipad_id/);
  assert.equal((workflow.match(/bundle exec xcodebuild/g) ?? []).length, 2);
  assert.match(workflow, /schema: 'sagejs\.mobile-simulator-build\/v1'/);
  assert.match(workflow, /artifactIdentity: manifest\.productionIdentity/);
  assert.match(workflow, /assetManifestSha256/);
});
