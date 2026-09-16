"use strict";

// Qualification infrastructure only. This file validates frozen inputs,
// schedules, append-only receipts, and timing-host declarations. It does not
// yet contain a Sage.js or PARI execution adapter and therefore cannot open the
// reserve population or produce real timing evidence.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const Ajv2020 = require("ajv/dist/2020");

const HERE = __dirname;
const PANEL_PATH = path.join(HERE, "panel.json");
const MANIFEST_PATH = path.join(HERE, "class-unit-qualification-manifest.json");
const SCHEMA_PATH = path.join(HERE, "class-unit-qualification-receipt.schema.json");
const TIMING_LOCK_PATH = "/tmp/sagejs-opt-timing.lock";
const TIMING_LOCK_OWNER_PATH = "/tmp/sagejs-opt-timing.lock.owner.json";
const ONE_SECOND_NS = 1_000_000_000n;
const TERMINAL_STATUSES = new Set([
  "complete_matched",
  "wrong_result",
  "replay_failure",
  "work_divergence",
  "unsupported_branch",
  "timeout",
  "resource_limit",
  "crash",
  "measurement_invalid",
  "infrastructure_failure",
]);

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function fileSha256(filename) {
  return sha256(fs.readFileSync(filename));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalDigest(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function validateManifest({ panelPath = PANEL_PATH, manifestPath = MANIFEST_PATH } = {}) {
  const panelBytes = fs.readFileSync(panelPath);
  const panel = JSON.parse(panelBytes);
  const manifest = readJson(manifestPath);
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.panelSha256, sha256(panelBytes), "frozen panel hash changed");
  assert.equal(manifest.targetPariVersion, "2.17.4");
  assert.equal(manifest.executionEnabled, false, "infrastructure lane must not enable execution");
  assert.equal(manifest.reserveOpeningEnabled, false, "infrastructure lane must not open reserves");
  assert.equal(panel.rows.length, 24);
  assert.equal(manifest.fields.length, 24);

  const ids = manifest.fields.map(field => field.id);
  assert.equal(new Set(ids).size, 24, "qualification field IDs must be unique");
  for (const field of manifest.fields) {
    const source = panel.rows[field.panelIndex];
    assert(source, `missing panel row ${field.panelIndex}`);
    assert.equal(field.id, source.id, `field ID mismatch at panel row ${field.panelIndex}`);
    assert.equal(field.stratum, source.stratum);
    assert.equal(field.degree, source.degree);
    assert.deepEqual(field.signature, source.signature);
    assert.equal(field.role === "final-reserve", source.phase === "final-reserve");
  }

  const sentinels = manifest.fields.filter(field => field.role === "sentinel");
  const additional = manifest.fields.filter(field => field.role === "additional-development");
  const reserves = manifest.fields.filter(field => field.role === "final-reserve");
  assert.equal(sentinels.length, 4);
  assert.equal(additional.length, 12);
  assert.equal(reserves.length, 8);

  const [currentCubic, currentQuartic] = sentinels;
  assert.equal(currentCubic.stratum, "real-cubic");
  assert.equal(currentQuartic.stratum, "mixed-quartic");
  const tuning = panel.rows.map((row, panelIndex) => ({ ...row, panelIndex }))
    .filter(row => row.phase === "tuning");
  const remaining = tuning.filter(row => ![currentCubic.id, currentQuartic.id].includes(row.id));
  const firstNontrivial = remaining.find(row =>
    row.reference_class_number !== null && BigInt(row.reference_class_number) > 1n);
  assert.equal(sentinels[2].id, firstNontrivial.id, "third sentinel rule changed");
  const maximumKnown = remaining.filter(row => row.reference_class_number !== null)
    .sort((left, right) => {
      const a = BigInt(left.reference_class_number), b = BigInt(right.reference_class_number);
      if (a !== b) return a > b ? -1 : 1;
      return left.id.localeCompare(right.id);
    })[0];
  assert.equal(sentinels[3].id, maximumKnown.id, "fourth sentinel rule changed");
  const sentinelIds = new Set(sentinels.map(field => field.id));
  assert.deepEqual(additional.map(field => field.id),
    tuning.filter(row => !sentinelIds.has(row.id)).map(row => row.id),
    "additional development order changed");
  assert.deepEqual(reserves.map(field => field.id),
    panel.rows.filter(row => row.phase === "final-reserve").map(row => row.id),
    "reserve order changed");
  assert.deepEqual(manifest.schedule.finalPattern, ["ABBA", "BAAB"]);
  assert.deepEqual(manifest.schedule.stageDiagnosticPattern, ["AB", "BA"]);
  return { panel, manifest, panelSha256: sha256(panelBytes), manifestSha256: fileSha256(manifestPath) };
}

function stageDiagnosticSchedule(count = 7) {
  assert(Number.isInteger(count) && count >= 7);
  return Array.from({ length: count }, (_, index) => index % 2 === 0 ? "AB" : "BA");
}

function finalQualificationSchedule(count = 11) {
  assert(Number.isInteger(count) && count >= 11);
  return Array.from({ length: count }, (_, index) => index % 2 === 0 ? "ABBA" : "BAAB");
}

function scheduleForCase(caseRecord) {
  return caseRecord.tier === "diagnostic"
    ? stageDiagnosticSchedule()
    : finalQualificationSchedule();
}

function implementationForLabel(label) {
  assert(["A", "B"].includes(label));
  return label === "A" ? "sagejs" : "pari";
}

function assertDevelopmentFields(fields) {
  for (const field of fields) {
    assert.notEqual(field.role, "final-reserve",
      `reserve field ${field.id} remains sealed; this runner cannot open reserves`);
  }
}

function developmentPlan(manifest) {
  const fields = manifest.fields.filter(field => field.role !== "final-reserve");
  assertDevelopmentFields(fields);
  return {
    executable: false,
    reason: "execution adapters are deliberately absent from the infrastructure lane",
    fields,
    stageDiagnosticSchedule: stageDiagnosticSchedule(manifest.schedule.stageDiagnosticPairs),
    finalQualificationSchedule: finalQualificationSchedule(manifest.schedule.finalBlocks),
  };
}

function assertHostPreflight(host) {
  assert.equal(host.platform, "linux", "qualification requires Linux");
  assert.equal(host.arch, "x64", "qualification currently requires x64");
  assert.equal(host.affinity, String(host.cpu), "process must be pinned to exactly one requested CPU");
  assert(host.siblings.includes(host.cpu), "CPU topology must include selected CPU");
  assert(typeof host.governor === "string" && host.governor.length > 0,
    "readable fixed governor required");
  assert(typeof host.frequencyPolicy === "string" && host.frequencyPolicy.length > 0,
    "readable frequency policy required");
  assert.deepEqual(host.threadEnvironment, {
    OMP_NUM_THREADS: "1",
    OPENBLAS_NUM_THREADS: "1",
    MKL_NUM_THREADS: "1",
  });
  assert.deepEqual(host.limits, { addressSpaceBytes: "4294967296", armTimeoutSeconds: 600 });
  assert.equal(host.quietHostApproved, true, "coordinator must explicitly approve quiet host");
  assert.equal(host.preflightPassed, true);
  return host;
}

function timingLockCommand(argv, {
  lockPath = TIMING_LOCK_PATH,
  nodePath = process.execPath,
  scriptPath = __filename,
} = {}) {
  assert(Array.isArray(argv));
  return {
    command: "/usr/bin/flock",
    args: ["--nonblock", "--exclusive", lockPath, nodePath, scriptPath, "--lock-held", ...argv],
    ownerPath: TIMING_LOCK_OWNER_PATH,
  };
}

function validateReceiptSchema(receipt, schemaPath = SCHEMA_PATH) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
    validateFormats: false,
  });
  const validate = ajv.compile(readJson(schemaPath));
  if (!validate(receipt)) {
    throw new assert.AssertionError({
      message: `receipt schema violation: ${ajv.errorsText(validate.errors, { separator: "; " })}`,
    });
  }
  return receipt;
}

function averagePerCallNanoseconds(arms) {
  let total = 0;
  for (const arm of arms) total += Number(BigInt(arm.wallNanoseconds)) / arm.repetitions;
  return total / arms.length;
}

function median(values) {
  assert(values.length > 0);
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function deriveReceiptSummary(receipt) {
  const complete = receipt.summary.completionStatus === "complete_matched";
  if (!complete) return { fieldSlowdown: null, referenceSecondsPerCall: null };
  const ratios = [], referencePerCall = [];
  for (const block of receipt.blocks) {
    const sagejs = block.arms.filter(arm => arm.implementation === "sagejs");
    const pari = block.arms.filter(arm => arm.implementation === "pari");
    ratios.push(averagePerCallNanoseconds(sagejs) / averagePerCallNanoseconds(pari));
    referencePerCall.push(averagePerCallNanoseconds(pari) / 1e9);
  }
  return { fieldSlowdown: median(ratios), referenceSecondsPerCall: median(referencePerCall) };
}

function closeEnough(left, right) {
  return Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 32;
}

function validateReceipt(receipt, {
  manifestData = validateManifest(),
  requireQualified = false,
} = {}) {
  validateReceiptSchema(receipt);
  assert.equal(receipt.provenance.panelSha256, manifestData.panelSha256);
  assert.equal(receipt.provenance.qualificationManifestSha256, manifestData.manifestSha256);
  if (requireQualified) assert.equal(receipt.qualifiedTiming, true);
  assertHostPreflight(receipt.host);
  const field = manifestData.manifest.fields.find(item => item.id === receipt.case.fieldId);
  assert(field, `field is outside frozen population: ${receipt.case.fieldId}`);
  assert.equal(receipt.case.role, field.role);
  assert(TERMINAL_STATUSES.has(receipt.summary.completionStatus));

  const expectedSchedule = scheduleForCase(receipt.case);
  if (receipt.summary.completionStatus === "complete_matched") {
    assert.equal(receipt.blocks.length, expectedSchedule.length);
  } else {
    assert(receipt.blocks.length <= expectedSchedule.length);
  }
  for (const [index, block] of receipt.blocks.entries()) {
    assert.equal(block.blockIndex, index);
    assert.equal(block.order, expectedSchedule[index]);
    if (receipt.summary.completionStatus === "complete_matched" || index < receipt.blocks.length - 1) {
      assert.equal(block.arms.length, block.order.length, "completed blocks must contain every scheduled arm");
    } else {
      assert(block.arms.length <= block.order.length, "failed final block must be a scheduled prefix");
    }
    for (const [position, arm] of block.arms.entries()) {
      const label = block.order[position];
      assert.equal(arm.position, position);
      assert.equal(arm.label, label);
      assert.equal(arm.implementation, implementationForLabel(label));
      if (!arm.timeout && arm.exitStatus === 0) {
        assert(BigInt(arm.wallNanoseconds) >= ONE_SECOND_NS,
          "every successful retained arm must exceed one second");
        assert.equal(arm.workDigest, canonicalDigest(arm.counters),
          "work digest does not authenticate source-work counters");
      }
      if (receipt.summary.completionStatus === "complete_matched") {
        assert.equal(arm.timeout, false, "a completed block cannot retain a timeout arm");
        assert.equal(arm.exitStatus, 0, "a completed block cannot retain a failed arm");
      }
    }
  }

  if (receipt.summary.completionStatus === "complete_matched") {
    const arms = receipt.blocks.flatMap(block => block.arms);
    for (const key of ["outputDigest", "replayDigest", "rngDigest", "workDigest"]) {
      assert(arms.every(arm => arm[key] !== null), `${key} is missing from a matched arm`);
      assert.equal(new Set(arms.map(arm => arm[key])).size, 1, `${key} differs across matched arms`);
    }
    assert.equal(receipt.summary.firstDivergence, null);
    assert.equal(receipt.summary.failureClass, null);
    assert.equal(receipt.summary.failureDetail, null);
    const derived = deriveReceiptSummary(receipt);
    assert(closeEnough(receipt.summary.fieldSlowdown, derived.fieldSlowdown),
      "field slowdown is not reproducible from raw arms");
    assert(closeEnough(receipt.summary.referenceSecondsPerCall, derived.referenceSecondsPerCall),
      "reference time is not reproducible from raw arms");
  } else {
    assert.equal(receipt.summary.fieldSlowdown, null);
    assert.equal(receipt.summary.referenceSecondsPerCall, null);
    assert(receipt.summary.failureClass >= 1 && receipt.summary.failureClass <= 10);
    assert(typeof receipt.summary.failureDetail === "string" && receipt.summary.failureDetail.length > 0);
  }
  return receipt;
}

function appendJournalLine(fd, value) {
  fs.writeSync(fd, `${JSON.stringify(value)}\n`, null, "utf8");
  fs.fsyncSync(fd);
}

function createReceiptJournal(filename, declaration) {
  const fd = fs.openSync(filename, "wx", 0o600);
  try {
    appendJournalLine(fd, { kind: "declaration", receipt: declaration });
  } finally {
    fs.closeSync(fd);
  }
}

function appendReceiptBlock(filename, block) {
  const fd = fs.openSync(filename, "a", 0o600);
  try {
    appendJournalLine(fd, { kind: "block", block });
  } finally {
    fs.closeSync(fd);
  }
}

function finalizeReceiptJournal(filename, summary, releasedAt) {
  const fd = fs.openSync(filename, "a", 0o600);
  try {
    appendJournalLine(fd, { kind: "final", summary, releasedAt });
  } finally {
    fs.closeSync(fd);
  }
}

function readReceiptJournal(filename, options = {}) {
  const lines = fs.readFileSync(filename, "utf8").trim().split("\n").map(JSON.parse);
  assert(lines.length >= 2, "journal must contain declaration and final records");
  assert.equal(lines[0].kind, "declaration");
  assert.equal(lines.at(-1).kind, "final");
  assert.equal(lines.filter(line => line.kind === "declaration").length, 1);
  assert.equal(lines.filter(line => line.kind === "final").length, 1);
  const receipt = {
    ...lines[0].receipt,
    lock: { ...lines[0].receipt.lock, releasedAt: lines.at(-1).releasedAt },
    blocks: lines.slice(1, -1).map((line, index) => {
      assert.equal(line.kind, "block", `unexpected journal event ${index + 1}`);
      return line.block;
    }),
    summary: lines.at(-1).summary,
  };
  return validateReceipt(receipt, options);
}

function syntheticReceipt(field, {
  slowdown = 1.5,
  status = "complete_matched",
  boundary = "prepared-kernel",
  tier = "flag-zero",
  referenceSecondsPerCall = 1.1,
  attributedGapFraction = 1,
  manifestData = validateManifest(),
} = {}) {
  assert(slowdown >= 1);
  const digest = character => character.repeat(64);
  const caseRecord = {
    fieldId: field.id,
    role: field.role,
    boundary,
    tier,
    seed: String(field.panelIndex + 1),
    repetitionsByImplementation: { sagejs: 1, pari: 1 },
    calibration: { excludedFromTiming: true, targetNanoseconds: "1250000000", doublingGeneration: 0 },
  };
  const schedule = scheduleForCase(caseRecord);
  const blocks = status === "complete_matched" ? schedule.map((order, blockIndex) => ({
    blockIndex,
    order,
    startedAt: "2026-09-16T00:00:00.000Z",
    finishedAt: "2026-09-16T00:00:05.000Z",
    arms: [...order].map((label, position) => ({
      position,
      label,
      implementation: implementationForLabel(label),
      repetitions: 1,
      wallNanoseconds: String(Math.round(referenceSecondsPerCall * (label === "A" ? slowdown : 1) * 1e9)),
      threadCpuNanoseconds: "1000000000",
      peakRssKiB: label === "A" ? "524288" : "131072",
      exitStatus: 0,
      timeout: false,
      outputDigest: digest("a"),
      replayDigest: digest("b"),
      rngDigest: digest("c"),
      workDigest: canonicalDigest({ relations: "73", retries: "0" }),
      counters: { relations: "73", retries: "0" },
      resourceCounters: { allocations: label === "A" ? "4" : "1" },
    })),
  })) : [];
  const receipt = {
    schema: 1,
    runId: "00000000-0000-4000-8000-000000000001",
    qualifiedTiming: false,
    provenance: {
      commit: "1".repeat(40),
      dirty: false,
      panelSha256: manifestData.panelSha256,
      qualificationManifestSha256: manifestData.manifestSha256,
      sagejsArtifacts: { addon: digest("e") },
      pariArtifacts: { library: digest("f") },
    },
    host: {
      hostname: "synthetic.invalid",
      platform: "linux",
      arch: "x64",
      kernel: "synthetic",
      cpu: 2,
      affinity: "2",
      physicalCore: 1,
      socket: 0,
      siblings: [2, 3],
      governor: "performance",
      frequencyPolicy: "fixed-synthetic",
      threadEnvironment: { OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", MKL_NUM_THREADS: "1" },
      limits: { addressSpaceBytes: "4294967296", armTimeoutSeconds: 600 },
      quietHostApproved: true,
      preflightPassed: true,
    },
    lock: {
      path: TIMING_LOCK_PATH,
      acquiredAt: "2026-09-16T00:00:00.000Z",
      owner: "synthetic-test",
      releasedAt: "2026-09-16T00:01:00.000Z",
    },
    case: caseRecord,
    blocks,
    summary: status === "complete_matched" ? {
      completionStatus: status,
      fieldSlowdown: slowdown,
      referenceSecondsPerCall,
      attributedGapFraction,
      firstDivergence: null,
      failureClass: null,
      failureDetail: null,
    } : {
      completionStatus: status,
      fieldSlowdown: null,
      referenceSecondsPerCall: null,
      attributedGapFraction,
      firstDivergence: "synthetic divergence",
      failureClass: 2,
      failureDetail: "synthetic unsupported branch",
    },
  };
  return receipt;
}

function usage() {
  return [
    "usage:",
    "  node run_class_unit_qualification.cjs --check-manifest",
    "  node run_class_unit_qualification.cjs --plan-development",
    "  node run_class_unit_qualification.cjs --validate-receipt RECEIPT.json",
    "  node run_class_unit_qualification.cjs --validate-journal RECEIPT.jsonl",
    "",
    "Real execution and reserve opening are deliberately disabled in this infrastructure lane.",
  ].join("\n");
}

function main(argv = process.argv.slice(2)) {
  const manifestData = validateManifest();
  if (argv.length === 1 && argv[0] === "--check-manifest") {
    console.log(JSON.stringify({
      status: "pass",
      panelSha256: manifestData.panelSha256,
      manifestSha256: manifestData.manifestSha256,
      fields: manifestData.manifest.fields.length,
      executionEnabled: false,
      reserveOpeningEnabled: false,
    }));
    return;
  }
  if (argv.length === 1 && argv[0] === "--plan-development") {
    console.log(JSON.stringify(developmentPlan(manifestData.manifest), null, 2));
    return;
  }
  if (argv.length === 2 && argv[0] === "--validate-receipt") {
    validateReceipt(readJson(path.resolve(argv[1])), { manifestData });
    console.log(JSON.stringify({ status: "pass", receipt: path.resolve(argv[1]) }));
    return;
  }
  if (argv.length === 2 && argv[0] === "--validate-journal") {
    readReceiptJournal(path.resolve(argv[1]), { manifestData });
    console.log(JSON.stringify({ status: "pass", journal: path.resolve(argv[1]) }));
    return;
  }
  if (argv.includes("--run") || argv.includes("--open-reserves") || argv.includes("--lock-held")) {
    throw new Error("real execution and reserve opening remain disabled until the complete Phase-5 root is integrated");
  }
  throw new Error(usage());
}

module.exports = {
  MANIFEST_PATH,
  ONE_SECOND_NS,
  PANEL_PATH,
  SCHEMA_PATH,
  TIMING_LOCK_PATH,
  appendReceiptBlock,
  assertDevelopmentFields,
  assertHostPreflight,
  canonicalDigest,
  createReceiptJournal,
  deriveReceiptSummary,
  developmentPlan,
  finalQualificationSchedule,
  finalizeReceiptJournal,
  implementationForLabel,
  main,
  readReceiptJournal,
  scheduleForCase,
  stageDiagnosticSchedule,
  syntheticReceipt,
  timingLockCommand,
  validateManifest,
  validateReceipt,
  validateReceiptSchema,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
