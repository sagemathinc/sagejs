#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const host = require("./row3_phase6_resident_kernel_host.cjs");
const pari = require("./row3_phase6_pari_prepared_adapter.cjs");

const view = owner => (owner.toArray ? owner.toArray() : Array.from(owner)).map(String);

function validateExactUnits(resident) {
  const owner = name => view(resident.owners[name]);
  const rows = 668, relations = 675;
  const selectedIndices = owner("prep_selected_indices").slice(0, rows).map(Number);
  const descriptorPrimes = owner("prep_kummer_catalog_primes");
  const descriptorE = owner("prep_kummer_catalog_e");
  const descriptorF = owner("prep_kummer_catalog_f");
  const descriptorInert = owner("prep_kummer_catalog_inert");
  const descriptorGenerators = owner("prep_kummer_catalog_generators");
  const descriptorTau = owner("prep_kummer_catalog_tau");
  const descriptors = [];
  for (let position = 0; position < rows; position += 1) {
    const index = selectedIndices[position];
    descriptors.push(descriptorPrimes[index], descriptorE[index],
      descriptorF[index], descriptorInert[index],
      ...descriptorGenerators.slice(3 * index, 3 * index + 3),
      ...descriptorTau.slice(9 * index, 9 * index + 9));
  }
  assert.equal(descriptors.length, 16 * rows);
  const payload = {
    records: owner("relation_records").slice(0, rows * relations),
    generators: owner("generators").slice(0, 3 * relations),
    logs: owner("log_embeddings").slice(0, 21 * relations),
    initialPermutation: owner("search_ideals").slice(0, rows),
    terminalPermutation: owner("hnf_perm").slice(0, rows),
    w: owner("hnf_result_h").slice(0, 4),
    b: owner("hnf_result_b").slice(0, 2 * 666),
    c: owner("hnf_result_c").slice(0, 21 * relations),
    relationLattice: owner("accept_relations").slice(0, 14),
    regulator: owner("accept_regulator").slice(0, 3),
    factorNorms: owner("packet_norms").slice(0, rows),
    factorDescriptors: descriptors,
    factorIdeals: owner("packet_ideals").slice(0, 9 * rows),
    preparedSha256: host.AUTHORITY,
    prepared: { basisTable: owner("basis_table").slice(0, 27),
      embeddingM: owner("preparation_embedding").slice(0, 27),
      embeddingG: owner("preparation_embedding").slice(0, 27),
      basis: owner("prep_zk").slice(0, 9),
      basisDenominator: String(resident.owners.prep_zkden) },
  };
  const program = String.raw`import importlib,json,sys
sys.path.extend([sys.argv[1],sys.argv[1]+"/src/lib"])
m=importlib.import_module("bench.pari-class-group-port.row3_fresh_unit_suffix")
d=json.load(sys.stdin)
assert len(d["factorDescriptors"])==10688,len(d["factorDescriptors"])
o=m.compose_row3_fresh_unit_suffix(d)
json.dump({"transform":o["units"]["unitKernelTransform"],"provenance":o["units"]["rawUnitProvenance"],"norms":o["units"]["unitNorms"],"signs":o["units"]["unitRealSigns"],"replay":o["replay"]},sys.stdout,separators=(",",":"))`;
  const root = path.resolve(__dirname, "../..");
  const run = spawnSync("python3", ["-c", program, root], {
    cwd: root, input: JSON.stringify(payload), encoding: "utf8",
    timeout: 600_000, maxBuffer: 256 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.signal));
  const exact = JSON.parse(run.stdout);
  assert.deepEqual(view(resident.factoredTransform), exact.transform);
  assert.deepEqual(view(resident.rawUnitProvenance), exact.provenance);
  assert.equal(exact.provenance.length, 2 * relations);
  assert.deepEqual(exact.norms, ["1", "-1"]);
  assert.equal(exact.signs.length, 6);
  assert.equal(exact.replay.rawRelationsTimesUnitsZero, true);
  assert.equal(exact.replay.allPrincipalRelationNormsReplayed, true);
  assert.equal(exact.replay.allPrincipalGeneratorSignsProved, true);
  return { transform: exact.transform, unitNorms: exact.norms,
    unitRealSigns: exact.signs,
    rawUnitProvenanceLength: exact.provenance.length };
}

module.exports = { validateExactUnits };

async function child() {
  const client = new pari.HelperClient(pari.buildHelper());
  await client.ready();
  let pariSample;
  try { pariSample = await client.run("1"); } finally { await client.close(); }
  const resident = await host.prepareResident();
  const first = host.runInvocation(resident);
  const second = host.runInvocation(resident);
  const exactUnits = validateExactUnits(resident);
  assert.deepEqual(second.projection, first.projection);
  assert.deepEqual(first.projection.field, pariSample.projection.field);
  assert.deepEqual(first.projection.classGroup, pariSample.projection.classGroup);
  assert.equal(pariSample.projection.unitGroup.rank, "2");
  assert.equal(pariSample.projection.unitGroup.regulatorPresent, true);
  assert.equal(first.executionBoundary.nativeCallsInsideClock, 2);
  assert.equal(first.executionBoundary.subprocessesInsideClock, false);
  assert.equal(first.executionBoundary.filesystemInsideClock, false);
  assert(BigInt(first.kernelNanoseconds) > 0n);
  assert(BigInt(second.kernelNanoseconds) > 0n);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row3-phase6-resident-kernel-check-v1",
    preparedAuthoritySha256: host.AUTHORITY,
    sageKernelNanoseconds: [first.kernelNanoseconds, second.kernelNanoseconds],
    pariKernelNanoseconds: pariSample.kernelNanoseconds,
    sageProjection: first.projection,
    pariProjection: pariSample.projection,
    commonClassProjectionMatched: true,
    residentReuseChecked: true,
    exactUnits,
    addressSpaceLimitBytes: "4294967296", cpuLimitSeconds: "600",
    wholeClassUnitBoundaryAvailable: true,
    qualifiedTiming: false, ratioPublished: false,
  })}\n`);
}

if (require.main === module && process.argv.includes("--bounded-child")) {
  child().catch(error => { console.error(error.stack || error); process.exit(1); });
} else if (require.main === module) {
  const run = spawnSync("/usr/bin/prlimit", ["--as=4294967296", "--cpu=600", "--",
    process.execPath, __filename, "--bounded-child"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error || run.signal));
  const receipt = JSON.parse(run.stdout);
  assert.equal(receipt.addressSpaceLimitBytes, "4294967296");
  assert.equal(receipt.cpuLimitSeconds, "600");
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
