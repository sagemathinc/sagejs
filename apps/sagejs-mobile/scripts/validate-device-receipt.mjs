import { readFile } from 'node:fs/promises';

const filename = process.argv.slice(2).find(argument => argument !== '--');
if (!filename) throw new Error('usage: pnpm device:validate -- RECEIPT.json');
const receipt = JSON.parse(await readFile(filename, 'utf8'));
if (receipt.schema !== 'sagejs.mobile-device-feasibility/v1') {
  throw new Error(`unsupported device receipt schema ${receipt.schema}`);
}
for (const key of [
  'recordedAt',
  'gitCommit',
  'artifactIdentity',
  'device',
  'runtimeEnvironment',
  'checks',
  'measurements',
]) {
  if (!(key in receipt)) throw new Error(`device receipt is missing ${key}`);
}
if (!['iphone', 'ipad'].includes(receipt.device.family)) {
  throw new Error('device family must be iphone or ipad');
}
const runtime = receipt.runtimeEnvironment;
if (!['pass', 'fail', 'blocked'].includes(runtime?.status)) {
  throw new Error('runtime environment has no valid status');
}
if (!String(runtime?.evidence ?? '').trim()) {
  throw new Error('runtime environment has no evidence');
}
for (const [key, allowed] of Object.entries({
  assetOrigin: ['loopback-http', 'unobserved'],
  scheme: ['http', 'unobserved'],
  host: ['127.0.0.1', 'unobserved'],
})) {
  if (!allowed.includes(runtime?.[key])) {
    throw new Error(`runtime environment has invalid ${key}`);
  }
}
if (
  ![true, false, null].includes(runtime?.crossOriginIsolated) ||
  ![true, false, null].includes(runtime?.sharedArrayBuffer) ||
  !['dedicated-module-worker', 'unobserved'].includes(
    runtime?.workerTopology?.outer,
  ) ||
  !['nested-module-worker', 'unobserved'].includes(
    runtime?.workerTopology?.compiler,
  )
) {
  throw new Error('runtime environment contains invalid observations');
}
const runtimeKeys = [
  'status',
  'assetOrigin',
  'scheme',
  'host',
  'crossOriginIsolated',
  'sharedArrayBuffer',
  'workerTopology',
  'evidence',
];
if (
  !runtime ||
  Object.keys(runtime).some(key => !runtimeKeys.includes(key)) ||
  Object.keys(runtime.workerTopology ?? {}).some(
    key => !['outer', 'compiler'].includes(key),
  )
) {
  throw new Error('runtime environment contains unsupported fields');
}
if (runtime.status === 'pass') {
  const expected = {
    assetOrigin: 'loopback-http',
    scheme: 'http',
    host: '127.0.0.1',
    crossOriginIsolated: true,
    sharedArrayBuffer: true,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (runtime[key] !== value) {
      throw new Error(`passing runtime environment has invalid ${key}`);
    }
  }
  if (
    runtime.workerTopology?.outer !== 'dedicated-module-worker' ||
    runtime.workerTopology?.compiler !== 'nested-module-worker'
  ) {
    throw new Error('passing runtime environment has invalid worker topology');
  }
}
if (
  runtime.status === 'blocked' &&
  (runtime.assetOrigin !== 'unobserved' ||
    runtime.scheme !== 'unobserved' ||
    runtime.host !== 'unobserved' ||
    runtime.crossOriginIsolated !== null ||
    runtime.sharedArrayBuffer !== null ||
    runtime.workerTopology?.outer !== 'unobserved' ||
    runtime.workerTopology?.compiler !== 'unobserved')
) {
  throw new Error('blocked runtime environment must remain unobserved');
}
const requiredChecks = [
  'wasmInstantiation',
  'relativeWorkerLoading',
  'workerTopology',
  'temporaryFiles',
  'interrupt',
  'allocationCeiling',
  'lifecycleRecovery',
  'plotRenderExport',
  'hardwareKeyboard',
  'voiceOver',
  'offlineNetworkDenied',
];
for (const check of requiredChecks) {
  if (!['pass', 'fail', 'blocked'].includes(receipt.checks[check]?.status)) {
    throw new Error(`device receipt check ${check} has no valid status`);
  }
  if (!String(receipt.checks[check]?.evidence ?? '').trim()) {
    throw new Error(`device receipt check ${check} has no evidence`);
  }
}
const requiredMeasurements = [
  'appBytes',
  'compressedRuntimeBytes',
  'coldStartupMs',
  'warmStartupMs',
  'peakResidentMiB',
  'numberFieldCoefficientMs',
  'ellipticLSeriesBatchMs',
  'complexPlotMs',
  'interruptLatencyMs',
  'worksheetRoundTripMs',
  'thermalObservation',
];
for (const measurement of requiredMeasurements) {
  const value = receipt.measurements[measurement];
  if (!['measured', 'blocked'].includes(value?.status)) {
    throw new Error(
      `device receipt measurement ${measurement} has no valid status`,
    );
  }
  if (value.status === 'measured' && value.value === undefined) {
    throw new Error(`device receipt measurement ${measurement} has no value`);
  }
  if (value.status === 'blocked' && !String(value.evidence ?? '').trim()) {
    throw new Error(`blocked measurement ${measurement} has no evidence`);
  }
}
console.log(`Valid ${receipt.device.family} feasibility receipt: ${filename}`);
