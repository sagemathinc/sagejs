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
  'checks',
  'measurements',
]) {
  if (!(key in receipt)) throw new Error(`device receipt is missing ${key}`);
}
if (!['iphone', 'ipad'].includes(receipt.device.family)) {
  throw new Error('device family must be iphone or ipad');
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
