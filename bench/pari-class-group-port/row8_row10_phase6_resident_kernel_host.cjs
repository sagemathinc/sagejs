"use strict";

const assert = require("node:assert/strict");
const authentication = require("./prepared_nf_authentication.cjs");
const suffix = require("./row8_row10_row11_phase6_resident_suffix.cjs");

const ROWS = Object.freeze({
  8: Object.freeze({ authority: "f36824d6417ced98e5d18529489801f687d61c78f9f9fdabb96d6d19099b0e01",
    fieldId: "generated-sha256-0857fab7114ab0045f1b91601101549c7b8d854c5c999b91afcb190cd2863363",
    polynomial: Object.freeze(["-20034", "-20018", "0", "0", "1"]),
    initialCount: 9, relationCount: 152, factorBaseSize: 143,
    rootHost: "./check_row14_prepared_initial_root.cjs",
    gateHost: "./row8_prepared_gate_c_host.cjs", flagZeroReason: "PRECI" }),
  10: Object.freeze({ authority: "935f8bccaa83cb2a8d127519c5308718199902c41e27aec875ef1fbb959cc403",
    fieldId: "pari-2.17.4:x^4-2000022*x-2000042",
    polynomial: Object.freeze(["-2000042", "-2000022", "0", "0", "1"]),
    initialCount: 26, relationCount: 303, factorBaseSize: 288,
    rootHost: "./row10_prepared_initial_root_host.cjs",
    gateHost: "./row10_prepared_gate_c_host.cjs", flagZeroReason: "PRECI" }),
});

async function prepareResident(row, prepared) {
  const config = ROWS[row]; assert(config, `unsupported resident row ${row}`);
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, config.authority, `row ${row} authority changed`);
  const envelope = { authoritySha256: authority.sha256, data: structuredClone(prepared) };
  const rootHost = require(config.rootHost), gate = require(config.gateHost);
  const warm = await rootHost.computePreparedInitialRoot({ outputDirectory: "unused",
    prepared: envelope.data, preparedAuthoritySha256: envelope.authoritySha256 },
  { captureResident: true });
  assert(warm.residentInitial, "initial root did not expose resident owners");
  const gateKernels = await gate.warmPreparedGateC({ prepared: envelope, root: warm.owner });
  const suffixResident = await suffix.prepare(row, warm.owner);
  return Object.freeze({ row, config, authority, envelope, rootHost, gate,
    warmRoot: warm.owner, initial: warm.residentInitial, gateKernels, suffixResident });
}

function projection(resident, terminal) {
  const c = resident.config;
  return Object.freeze({
    schema: `sagejs.pari-class-group/row${resident.row}-phase6-common-projection-v1`,
    field: Object.freeze({ id: c.fieldId, polynomialAscending: c.polynomial }),
    classGroup: Object.freeze({ classNumber: terminal.classNumber,
      invariantFactors: terminal.invariantFactors,
      generatorCount: String(terminal.invariantFactors.length) }),
    unitGroup: Object.freeze({ rank: "2", regulatorPresent: true,
      torsionOrder: "2", flagZeroStatus: `not_given(${c.flagZeroReason})` }),
    completionMode: "flag-zero-class-and-unit-result",
  });
}

async function runResident(resident) {
  const cpuBefore = process.threadCpuUsage();
  const initial = suffix.runInitial(resident.initial, resident.warmRoot,
    resident.envelope.data, resident.config.initialCount);
  const live = await resident.gate.runPreparedGateC(resident.envelope, initial.root,
    { kernels: resident.gateKernels });
  const terminal = suffix.run(resident.suffixResident, initial.root,
    resident.row === 10 ? live.checkpoints.slice(1) : live.checkpoints);
  const cpu = process.threadCpuUsage(cpuBefore);
  const relationRetry = BigInt(initial.kernelNanoseconds) + BigInt(live.kernelNanoseconds);
  const unitRegulator = BigInt(terminal.kernelNanoseconds);
  const kernel = relationRetry + unitRegulator;
  const output = projection(resident, terminal);
  return Object.freeze({
    kernelNanoseconds: String(kernel),
    threadCpuNanoseconds: String(BigInt(cpu.user + cpu.system) * 1000n),
    peakRssKiB: String(process.resourceUsage().maxRSS), output,
    replay: Object.freeze({ statuses: terminal.statuses,
      inverseHR: terminal.inverseHR, regulator: terminal.regulator,
      classNumber: terminal.classNumber, invariantFactors: terminal.invariantFactors }),
    rng: Object.freeze({ algorithm: "pari-xorshift1024star-2.17.4", seed: "1",
      terminalState: Object.freeze([...initial.root.rng]) }),
    counters: Object.freeze({ factorBaseSize: String(resident.config.factorBaseSize),
      relationCount: String(resident.config.relationCount),
      initialRelations: String(resident.config.initialCount),
      nativeCalls: String(1 + live.kernelNativeCalls + terminal.kernelNativeCalls) }),
    resourceCounters: Object.freeze({ nativeCalls:
      String(1 + live.kernelNativeCalls + terminal.kernelNativeCalls) }),
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

module.exports = { ROWS, prepareResident, projection, runResident };
