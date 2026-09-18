"use strict";

// Read-only Phase-6 admission audit.  This module authenticates correctness
// evidence and inventories the timing boundary, but it cannot open reserves,
// approve a host, acquire a timing lock, or execute a timed arm.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const aggregate = require("./run_fresh_prepared_aggregate.cjs");
const qualification = require("./run_class_unit_qualification.cjs");
const roots = require("./phase5_development_roots.cjs");

const SCHEMA = "sagejs.pari-class-group/phase6-qualification-readiness-v1";
const EXPECTED_PARI = Object.freeze({
  version: "2.17.4",
  archiveSha256: "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
  buch2Sha256: "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
  librarySha256: "fdc8f2d7ff050c8e8c6cb8994b0f9dc971267ac763eaf5cd927454937d37357f",
});
const DEVELOPMENT_INDICES = Object.freeze(roots.DEVELOPMENT_ROOTS.map(root => root.panelIndex));
const MATCHED_TIMING_INDICES = Object.freeze([14]);

function sha256File(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function parseCpuList(source) {
  assert.equal(typeof source, "string");
  const cpus = new Set();
  for (const item of source.trim().split(",")) {
    assert.match(item, /^\d+(?:-\d+)?$/);
    const [firstText, lastText = firstText] = item.split("-");
    const first = Number(firstText), last = Number(lastText);
    assert(Number.isSafeInteger(first) && Number.isSafeInteger(last) && first <= last);
    for (let cpu = first; cpu <= last; cpu += 1) cpus.add(cpu);
  }
  return [...cpus].sort((left, right) => left - right);
}

function currentAffinity() {
  if (process.platform !== "linux") return [];
  const status = fs.readFileSync("/proc/self/status", "utf8");
  const match = status.match(/^Cpus_allowed_list:\s*(.+)$/m);
  return match ? parseCpuList(match[1]) : [];
}

function readableGovernor(cpu) {
  if (cpu === undefined) return null;
  const filename = `/sys/devices/system/cpu/cpu${cpu}/cpufreq/scaling_governor`;
  try {
    return fs.readFileSync(filename, "utf8").trim() || null;
  } catch {
    return null;
  }
}

function authenticatePari(pariRoot = "/home/user/upstream/pari-2.17.4",
  pariArchive = "/home/user/upstream/pari-2.17.4.tar.gz") {
  const files = {
    archive: path.resolve(pariArchive),
    buch2: path.join(path.resolve(pariRoot), "src/basemath/buch2.c"),
    library: path.join(path.resolve(pariRoot), "Olinux-x86_64/libpari-gmp-tls.so.2.17.4"),
    executable: path.join(path.resolve(pariRoot), "gp"),
  };
  const missing = Object.entries(files).filter(([, filename]) => !fs.existsSync(filename))
    .map(([name]) => name);
  if (missing.length) return { authenticated: false, files, missing, hashes: null };
  const hashes = {
    archiveSha256: sha256File(files.archive),
    buch2Sha256: sha256File(files.buch2),
    librarySha256: sha256File(files.library),
  };
  return {
    authenticated: hashes.archiveSha256 === EXPECTED_PARI.archiveSha256 &&
      hashes.buch2Sha256 === EXPECTED_PARI.buch2Sha256 &&
      hashes.librarySha256 === EXPECTED_PARI.librarySha256,
    files, missing, hashes,
  };
}

function authenticateAggregate({ corpusDirectory, aggregateReceipt }) {
  assert.equal(typeof corpusDirectory, "string", "corpusDirectory is required");
  assert.equal(typeof aggregateReceipt, "string", "aggregateReceipt is required");
  const corpus = aggregate.inspectCorpus(path.resolve(corpusDirectory));
  const receipt = JSON.parse(fs.readFileSync(path.resolve(aggregateReceipt), "utf8"));
  aggregate.verifyAggregateReceipt(receipt, corpus);
  return {
    authenticated: true,
    count: receipt.count,
    aggregateSha256: receipt.aggregateSha256,
    population: receipt.population,
    receiptFileSha256: sha256File(path.resolve(aggregateReceipt)),
  };
}

function timingInventory() {
  const here = __dirname;
  const row14Files = [
    "row14_matched_alternating_campaign.cjs",
    "row14_sage_prepared_timing_adapter.cjs",
    "row14_pari_prepared_timing_adapter.cjs",
    "run_row14_matched_alternating_campaign.cjs",
  ];
  assert(row14Files.every(filename => fs.existsSync(path.join(here, filename))),
    "registered row-14 timing implementation is incomplete");
  const rows = DEVELOPMENT_INDICES.map(panelIndex => ({
    panelIndex,
    freshCorrectness: true,
    sagePreparedKernelTiming: MATCHED_TIMING_INDICES.includes(panelIndex),
    pariPreparedKernelTiming: MATCHED_TIMING_INDICES.includes(panelIndex),
    commonSemanticProjection: MATCHED_TIMING_INDICES.includes(panelIndex),
    mutuallyExclusiveStageTiming: MATCHED_TIMING_INDICES.includes(panelIndex),
  }));
  return {
    rows,
    matchedReady: rows.filter(row => row.sagePreparedKernelTiming &&
      row.pariPreparedKernelTiming && row.commonSemanticProjection).map(row => row.panelIndex),
    missingMatchedTiming: rows.filter(row => !row.sagePreparedKernelTiming ||
      !row.pariPreparedKernelTiming || !row.commonSemanticProjection)
      .map(row => row.panelIndex),
  };
}

function hostObservation() {
  const affinity = currentAffinity();
  const governor = affinity.length === 1 ? readableGovernor(affinity[0]) : null;
  return {
    hostname: os.hostname(),
    platform: process.platform,
    architecture: process.arch,
    affinity,
    governor,
    onePinnedCpu: affinity.length === 1,
    readableGovernor: governor !== null,
    quietHostApproved: false,
    qualificationAuthority: false,
  };
}

function auditReadiness({ corpusDirectory, aggregateReceipt, pariRoot, pariArchive }) {
  const manifestData = qualification.validateManifest();
  const correctness = authenticateAggregate({ corpusDirectory, aggregateReceipt });
  const pari = authenticatePari(pariRoot, pariArchive);
  const inventory = timingInventory();
  const host = hostObservation();
  const developmentFields = manifestData.manifest.fields
    .filter(field => field.role !== "final-reserve");
  const reserveFields = manifestData.manifest.fields
    .filter(field => field.role === "final-reserve");
  assert.deepEqual(correctness.population.map(row => row.panelIndex), DEVELOPMENT_INDICES);
  assert.equal(correctness.count, developmentFields.length);

  const blockers = [];
  if (!pari.authenticated) blockers.push("pinned PARI 2.17.4 artifacts are not authentic");
  if (inventory.missingMatchedTiming.length) blockers.push(
    `prepared-kernel timing adapter pairs and common projections are missing for development rows ${inventory.missingMatchedTiming.join(",")}`);
  if (!manifestData.manifest.executionEnabled) blockers.push(
    "the qualification manifest deliberately has executionEnabled=false");
  if (!manifestData.manifest.reserveOpeningEnabled) blockers.push(
    `all ${reserveFields.length} final-reserve fields remain sealed`);
  blockers.push("the general coordinator has no per-arm 600-second timeout/failure journal around adapter processes");
  if (!host.onePinnedCpu || !host.readableGovernor || !host.quietHostApproved) blockers.push(
    "this process is not an approved quiet, one-core, fixed-governor timing authority");

  return {
    schema: SCHEMA,
    correctness: {
      developmentAggregateAuthenticated: correctness.authenticated,
      completedDevelopmentFields: correctness.count,
      expectedDevelopmentFields: developmentFields.length,
      aggregateSha256: correctness.aggregateSha256,
      aggregateReceiptFileSha256: correctness.receiptFileSha256,
    },
    pari,
    timing: {
      schedule: { diagnostic: "7 alternating AB/BA blocks", final: "11 alternating ABBA/BAAB blocks" },
      minimumArmNanoseconds: "1000000000",
      matchedDevelopmentRows: inventory.matchedReady,
      missingDevelopmentRows: inventory.missingMatchedTiming,
      row14CampaignAvailable: inventory.matchedReady.includes(14),
      row14CampaignPhase6Qualified: false,
      longCampaignExecuted: false,
    },
    reserves: {
      total: reserveFields.length,
      opened: 0,
      openingEnabled: manifestData.manifest.reserveOpeningEnabled,
    },
    host,
    blockers,
    fullQualificationReady: blockers.length === 0,
    readyCommands: {
      reaudit: `node bench/pari-class-group-port/phase6_qualification_readiness.cjs ${path.resolve(corpusDirectory)} ${path.resolve(aggregateReceipt)}`,
      row14AfterTimingAuthorityApproval:
        "SAGEJS_TIMING_CPU=$CPU OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 /usr/bin/flock --nonblock --exclusive /tmp/sagejs-opt-timing.lock /usr/bin/taskset -c $CPU node --expose-gc bench/pari-class-group-port/run_row14_matched_alternating_campaign.cjs /scratch/row14-qualified-candidate.json",
    },
    note: "The row-14 command is a single-row candidate campaign only; it does not enable the sealed 24-field qualification runner or repair its missing per-arm timeout journal.",
  };
}

function main(argv = process.argv.slice(2)) {
  assert.equal(argv.length, 2,
    "usage: node phase6_qualification_readiness.cjs CORPUS AGGREGATE_RECEIPT.json");
  process.stdout.write(`${JSON.stringify(auditReadiness({
    corpusDirectory: argv[0], aggregateReceipt: argv[1],
  }), null, 2)}\n`);
}

module.exports = {
  DEVELOPMENT_INDICES,
  EXPECTED_PARI,
  MATCHED_TIMING_INDICES,
  SCHEMA,
  auditReadiness,
  authenticateAggregate,
  authenticatePari,
  currentAffinity,
  parseCpuList,
  timingInventory,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  }
}
