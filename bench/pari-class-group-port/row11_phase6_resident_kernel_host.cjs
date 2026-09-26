"use strict";

const assert = require("node:assert/strict");
const authentication = require("./prepared_nf_authentication.cjs");
const rootHost = require("./row11_prepared_initial_host.cjs");
const gate = require("./row11_prepared_gate_c_host.cjs");
const terminalSuffix = require("./row8_row10_row11_phase6_resident_suffix.cjs");
const unitSuffix = require("./row11_phase6_resident_unit_suffix.cjs");

const CONFIG = Object.freeze({
  authority: "8402de0c28b648eb190a26fd87283b43239c2eef6d684699dfcc2d50ace3798b",
  fieldId: "generated-sha256-147ddd296edb3764954d6142a499d17edcfecc635aec0181d4beda65d97ad4ab",
  polynomial: Object.freeze(["-2000018", "-2000010", "0", "0", "1"]),
  initialCount: 24, relationCount: 430, factorBaseSize: 421,
});

async function prepareResident(prepared) {
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, CONFIG.authority, "row 11 authority changed");
  const envelope = { authoritySha256: authority.sha256, data: structuredClone(prepared) };
  const warm = await rootHost.computePreparedInitialRoot({ outputDirectory: "unused",
    prepared: envelope.data, preparedAuthoritySha256: envelope.authoritySha256 },
  { captureResident: true });
  assert(warm.residentInitial, "row-11 initial root did not expose resident owners");
  const gateKernels = await gate.warmPreparedGateC({ prepared: envelope, root: warm.owner });
  const terminalResident = await terminalSuffix.prepare(11, warm.owner);
  const unitResident = await unitSuffix.prepare(envelope.data);
  return Object.freeze({ authority, envelope, warmRoot: warm.owner,
    initial: warm.residentInitial, gateKernels, terminalResident, unitResident });
}

function projection(terminal, units) {
  assert.equal(units.status, 2); assert.equal(units.reason, "LARGE");
  return Object.freeze({
    schema: "sagejs.pari-class-group/row11-phase6-common-projection-v1",
    field: Object.freeze({ id: CONFIG.fieldId, polynomialAscending: CONFIG.polynomial }),
    classGroup: Object.freeze({ classNumber: terminal.classNumber,
      invariantFactors: terminal.invariantFactors,
      generatorCount: String(terminal.invariantFactors.length) }),
    unitGroup: Object.freeze({ rank: "2", regulatorPresent: true,
      torsionOrder: "2", flagZeroStatus: "not_given(LARGE)" }),
    completionMode: "flag-zero-class-and-unit-result",
  });
}

async function runResident(resident) {
  const cpuBefore = process.threadCpuUsage();
  const initial = terminalSuffix.runInitial(resident.initial, resident.warmRoot,
    resident.envelope.data, CONFIG.initialCount);
  const live = await gate.runPreparedGateC(resident.envelope, initial.root,
    { kernels: resident.gateKernels });
  const checkpoints = live.checkpoints.slice(1);
  const terminal = terminalSuffix.run(resident.terminalResident, initial.root, checkpoints);
  const last = checkpoints.at(-1);
  const units = unitSuffix.run(resident.unitResident,
    last.c.slice(0, 7 * 3 * 9), terminal.unitRelations, terminal.regulator);
  const cpu = process.threadCpuUsage(cpuBefore);
  const relationRetry = BigInt(initial.kernelNanoseconds) + BigInt(live.kernelNanoseconds);
  const unitRegulator = BigInt(terminal.kernelNanoseconds) + BigInt(units.kernelNanoseconds);
  const kernel = relationRetry + unitRegulator;
  return Object.freeze({
    kernelNanoseconds: String(kernel),
    threadCpuNanoseconds: String(BigInt(cpu.user + cpu.system) * 1000n),
    peakRssKiB: String(process.resourceUsage().maxRSS), output: projection(terminal, units),
    replay: Object.freeze({ statuses: terminal.statuses, inverseHR: terminal.inverseHR,
      regulator: terminal.regulator, classNumber: terminal.classNumber,
      invariantFactors: terminal.invariantFactors, c6State: units.state,
      unitTransform: units.transform, unitFactor: units.factor }),
    rng: Object.freeze({ algorithm: "pari-xorshift1024star-2.17.4", seed: "1",
      terminalState: Object.freeze([...initial.root.rng]) }),
    counters: Object.freeze({ factorBaseSize: String(CONFIG.factorBaseSize),
      relationCount: String(CONFIG.relationCount),
      initialRelations: String(CONFIG.initialCount),
      nativeCalls: String(1 + live.kernelNativeCalls + terminal.kernelNativeCalls +
        units.kernelNativeCalls) }),
    resourceCounters: Object.freeze({ nativeCalls:
      String(1 + live.kernelNativeCalls + terminal.kernelNativeCalls +
        units.kernelNativeCalls) }),
    stageTiming: Object.freeze({ inclusiveNanoseconds: String(kernel),
      leaves: Object.freeze({ relationRetry: String(relationRetry),
        sparseHnfSnfTransform: "0", unitRegulator: String(unitRegulator),
        honestyGeneratorsFinal: "0" }), unattributedNanoseconds: "0" }),
    executionBoundary: Object.freeze({ residentProcess: true,
      compilationInsideClock: false, allocationInsideClock: false,
      inspectionInsideClock: false, filesystemInsideClock: false,
      subprocessInsideClock: false, replayInsideClock: false,
      publicationInsideClock: false }),
  });
}

module.exports = { CONFIG, prepareResident, projection, runResident };
