#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row6_prepared_factor_base_root.py");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-06-26fed17015f6479f.json";
const W0_SHA256 = "2736e19b166c11a5997a6825cd99b612ae23cf6740d2248ac3dd91bc883286a5";
const MANIFEST = "/scratch/sagejs-pari-development-panel-a998/manifest.json";
const PREPARED_SHA256 = "851979721cd098271103588af037b2744b99d84ca4752161efc6ab3dd1974a08";
const DEGREE = 3;
const MAX_IDEALS = 2048;
const MAX_RUNTIME_PRODUCT_WORDS = 2048;
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const canonical = value => JSON.stringify(value);

function jq(filter, file, maxBuffer = 4 * 1024 * 1024) {
  const run = spawnSync("jq", ["-c", filter, file], {
    cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

function fileSha(file) {
  const run = spawnSync("sha256sum", [file], {
    cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 4096,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return run.stdout.trim().split(/\s+/)[0];
}

function parseSignature(source) {
  const match = source.match(/def pari_row6_prepared_factor_base_root\(([\s\S]*?)\n\) -> int:/);
  assert(match, "row6 root signature disappeared");
  return match[1].trim().split("\n").map(line => {
    const fields = line.trim().replace(/,$/, "").split(": ");
    assert.equal(fields.length, 2, line);
    return fields;
  });
}

function exactInteger(value, label) {
  if (typeof value === "string" || typeof value === "number") {
    assert.match(String(value), /^-?(0|[1-9][0-9]*)$/, `${label} is not canonical`);
    return BigInt(value);
  }
  assert(value && value.kind === "integer", `${label} is not an integer`);
  return exactInteger(value.value, label);
}

function typedValues(value, kind, length, label) {
  assert(value && value.kind === kind && Array.isArray(value.values), `${label} kind changed`);
  if (length !== undefined) assert.equal(value.values.length, length, `${label} length changed`);
  return value.values;
}

function descriptorOracle(event) {
  return typedValues(event.LP, "vector", 1130, "factor-base descriptors")
    .map((descriptor, index) => {
      const fields = typedValues(descriptor, "vector", 5, `descriptor ${index}`);
      const generator = typedValues(fields[1], "column", DEGREE,
        `descriptor ${index} generator`).map((entry, i) =>
        String(exactInteger(entry, `descriptor ${index} generator ${i}`)));
      const columns = typedValues(fields[4], "matrix", DEGREE, `descriptor ${index} tau`);
      const columnMajor = columns.flatMap((column, j) =>
        typedValues(column, "column", DEGREE, `descriptor ${index} tau column ${j}`)
          .map((entry, i) => String(exactInteger(entry,
            `descriptor ${index} tau ${j},${i}`))));
      const tau = Array(DEGREE * DEGREE);
      for (let row = 0; row < DEGREE; row += 1)
        for (let column = 0; column < DEGREE; column += 1)
          tau[row * DEGREE + column] = columnMajor[column * DEGREE + row];
      return {
        p: String(exactInteger(fields[0], `descriptor ${index} p`)),
        generator,
        e: String(exactInteger(fields[2], `descriptor ${index} e`)),
        f: String(exactInteger(fields[3], `descriptor ${index} f`)),
        inert: "0",
        tau,
      };
    });
}

function packedAt(buffer, index) {
  const signedWords = buffer.sizes[index];
  const words = Math.abs(signedWords);
  let value = 0n;
  for (let word = words - 1; word >= 0; word -= 1)
    value = (value << 64n) + buffer.limbs[index * buffer.wordCapacity + word];
  return signedWords < 0 ? -value : value;
}

function packedSlice(buffer, start, end) {
  return Array.from({ length: end - start }, (_, i) => String(packedAt(buffer, start + i)));
}

function publishOwner(directory, owner) {
  fs.mkdirSync(directory, { recursive: true });
  const plain = Buffer.from(`${canonical(owner)}\n`);
  const ownerSha256 = sha(plain);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const compressedSha256 = sha(compressed);
  const destination = path.join(directory, `row6-prepared-factor-base-${ownerSha256}.json.gz`);
  fs.writeFileSync(destination, compressed, { flag: "wx", mode: 0o400 });
  fs.chmodSync(destination, 0o444);
  return { path: destination, ownerSha256, compressedSha256,
    bytes: plain.length, compressedBytes: compressed.length };
}

async function runRoot() {
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  assert.deepEqual(Object.keys(payload).sort(),
    ["outputDirectory", "prepared", "preparedAuthoritySha256"]);
  const allowedPrepared = ["admission_factorlimit", "admission_matrix_e",
    "admission_matrix_m", "admission_matrix_p", "admission_prime_limit",
    "admission_primes", "admission_products", "admission_real_count",
    "analytic_discriminant", "analytic_primes", "analytic_roots_of_unity",
    "basis_table", "n", "precision", "prep_index", "prep_invzk",
    "prep_polynomial", "prep_zk", "prep_zk_degrees", "prep_zkden",
    "preparation_embedding", "preparation_rounded_embedding"];
  assert.deepEqual(Object.keys(payload.prepared).sort(), allowedPrepared,
    "root child received an unreviewed prepared field");

  const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
  const built = await compileKernel({ sourcePath: SOURCE });
  const module = require(built.modulePath);
  const fn = module.pari_row6_prepared_factor_base_root;
  assert.equal(fn.nativeAvailable, true);
  const signature = parseSignature(fs.readFileSync(SOURCE, "utf8"));
  const buffer = (length, words = 8, initial = undefined) =>
    fn.createIntegerBuffer(length, words, initial);
  const prepared = payload.prepared;
  const p = prepared.admission_primes.length;
  const descriptors = p * DEGREE;
  const runtimeProductValues = prepared.admission_products.map(BigInt);
  const runtimeProductWords = Math.max(1, ...runtimeProductValues.map(value =>
    Math.ceil((value < 0n ? -value : value).toString(2).length / 64)));
  assert(runtimeProductWords <= MAX_RUNTIME_PRODUCT_WORDS,
    "neutral runtime product table exceeds the public 2048-word ceiling");
  const owners = {
    polynomial: buffer(DEGREE + 1, 4, prepared.prep_polynomial.map(BigInt)),
    discriminant: BigInt(prepared.analytic_discriminant),
    real_places: BigInt(prepared.admission_real_count),
    complex_pairs: 0n, precision: BigInt(prepared.precision),
    equation_index: BigInt(prepared.prep_index),
    roots_of_unity: BigInt(prepared.analytic_roots_of_unity),
    zkden: BigInt(prepared.prep_zkden),
    invzk: buffer(DEGREE * DEGREE, 8, prepared.prep_invzk.map(BigInt)),
    zk: buffer(DEGREE * DEGREE, 8, prepared.prep_zk.map(BigInt)),
    zk_degrees: buffer(DEGREE, 2, prepared.prep_zk_degrees.map(BigInt)),
    basis_table: buffer(DEGREE ** 3, 8, prepared.basis_table.map(BigInt)),
    embedding_m: buffer(DEGREE ** 2, 8, prepared.admission_matrix_m.map(BigInt)),
    embedding_p: buffer(DEGREE ** 2, 2, prepared.admission_matrix_p.map(BigInt)),
    embedding_e: buffer(DEGREE ** 2, 8, prepared.admission_matrix_e.map(BigInt)),
    runtime_primes: buffer(p, 1, prepared.admission_primes.map(BigInt)),
    runtime_products: buffer(runtimeProductValues.length, runtimeProductWords,
      runtimeProductValues),
    factor_limit: BigInt(prepared.admission_factorlimit),
    prime_limit: BigInt(prepared.admission_prime_limit),
    index_work: buffer(2048, 40),
    degree_workspace: buffer(393, 4),
    factor_degrees: buffer(DEGREE, 2), factor_exponents: buffer(DEGREE, 2),
    group_degrees: buffer(DEGREE, 2), group_counts: buffer(DEGREE, 2),
    local_state: buffer(3, 2), pattern_offsets: buffer(p, 2),
    pattern_counts: buffer(p, 2), pattern_degrees: buffer(descriptors, 2),
    pattern_multiplicities: buffer(descriptors, 2), full_offsets: buffer(p, 2),
    full_counts: buffer(p, 2), full_degrees: buffer(descriptors, 2),
    degree_state: buffer(4, 2), base_norms: buffer(DEGREE + 1, 2),
    base_configuration: [0, 0, 0], base_constants_logs: Array(p + 2).fill(0),
    base_sums: [0, 0], base_factor_logs: Array(p + 1).fill(0),
    selected_primes: buffer(p, 2), prime_offsets: buffer(65538, 2),
    prime_counts: buffer(65538, 2), complete_groups: buffer(65538, 2),
    selected_indices: buffer(descriptors, 2), base_state: buffer(7, 256),
    random_state: buffer(66, 1), kummer_factorwork: buffer(16994, 8),
    kummer_factor: buffer(DEGREE + 1, 8), kummer_diagnostic: buffer(3, 8),
    kummer_minpoly_diagnostic: buffer(1, 8), kummer_polywork: buffer(64, 8),
    kummer_u: buffer(DEGREE, 8), kummer_t: buffer(DEGREE, 8),
    kummer_rational: buffer(2 * DEGREE, 8), kummer_primitive: buffer(DEGREE, 8),
    kummer_column: buffer(DEGREE, 8),
    kummer_resultant_work: buffer(DEGREE * DEGREE + DEGREE, 16),
    kummer_resultant_trace: buffer(25, 16), kummer_u_output: buffer(DEGREE, 8),
    kummer_tau_output: buffer(DEGREE * DEGREE, 16),
    kummer_descriptor_state: buffer(12, 8),
    kummer_unsorted: buffer(DEGREE * (4 + DEGREE + DEGREE * DEGREE), 16),
    kummer_generators: buffer(DEGREE * DEGREE, 8),
    kummer_residue_degrees: buffer(DEGREE, 2), kummer_order: buffer(DEGREE, 2),
    kummer_sort_diagnostic: buffer(2, 2),
    kummer_decomposition_output: buffer(DEGREE * (4 + DEGREE + DEGREE * DEGREE), 16),
    kummer_decomposition_state: buffer(3, 2),
    catalog_primes: buffer(descriptors, 2), catalog_e: buffer(descriptors, 2),
    catalog_f: buffer(descriptors, 2), catalog_inert: buffer(descriptors, 2),
    catalog_generators: buffer(descriptors * DEGREE, 8),
    catalog_tau: buffer(descriptors * DEGREE * DEGREE, 16),
    requested_counts: buffer(p, 2), kummer_state: buffer(4, 2),
    packet_generator: buffer(DEGREE, 8),
    packet_multiplication: buffer(DEGREE ** 2, 8),
    packet_work: buffer(DEGREE ** 2, 8), packet_pivots: buffer(DEGREE, 2),
    packet_ideal: buffer(DEGREE ** 2, 8),
    packet_ideals: buffer(MAX_IDEALS * DEGREE ** 2, 8),
    packet_norms: buffer(MAX_IDEALS, 2), relation_primes: buffer(MAX_IDEALS, 2),
    ramification: buffer(MAX_IDEALS, 2), residue_degrees: buffer(MAX_IDEALS, 2),
    inert_flags: buffer(MAX_IDEALS, 2),
    selected_tau: buffer(MAX_IDEALS * DEGREE ** 2, 16),
    initial_primes: buffer(MAX_IDEALS, 2), initial_offsets: buffer(MAX_IDEALS, 2),
    initial_counts: buffer(MAX_IDEALS, 2), initial_complete: buffer(MAX_IDEALS, 2),
    bad_flags: buffer(MAX_IDEALS, 2), sub_configuration: [0],
    sub_order: buffer(MAX_IDEALS, 2), sub_scratch: buffer(MAX_IDEALS, 2),
    sub_stack: buffer(3 * MAX_IDEALS + 3, 2), sub_chosen: buffer(MAX_IDEALS, 2),
    sub_rejected: buffer(MAX_IDEALS, 2), permutation: buffer(MAX_IDEALS, 2),
    subfactor: buffer(MAX_IDEALS, 2), minidx: buffer(MAX_IDEALS, 2),
    root_state: buffer(14, 2),
  };
  assert.deepEqual(signature.map(([name]) => name), Object.keys(owners),
    "root owner manifest differs from source signature");
  const args = signature.map(([name, kind]) => {
    assert.equal(kind === "Float64Buffer", Array.isArray(owners[name]),
      `${name} has the wrong ABI representation`);
    return owners[name];
  });
  const started = process.hrtime.bigint();
  const count = fn.gmp(...args);
  const elapsedNs = process.hrtime.bigint() - started;
  assert.equal(count, 1130n);
  const state = packedSlice(owners.root_state, 0, 14);
  assert.equal(state[0], "1", "row6 root did not publish");
  const kc = Number(state[3]), kcz = Number(state[4]);
  const indices = packedSlice(owners.selected_indices, 0, kc).map(Number);
  const selectedDescriptors = indices.map(index => ({
    p: String(packedAt(owners.catalog_primes, index)),
    generator: packedSlice(owners.catalog_generators, index * DEGREE,
      (index + 1) * DEGREE),
    e: String(packedAt(owners.catalog_e, index)),
    f: String(packedAt(owners.catalog_f, index)),
    inert: String(packedAt(owners.catalog_inert, index)),
    tau: packedSlice(owners.catalog_tau, index * DEGREE * DEGREE,
      (index + 1) * DEGREE * DEGREE),
  }));
  const owner = {
    schema: "sagejs.pari-class-group/row6-prepared-factor-base-owner-v1",
    authority: { pristineW0Sha256: W0_SHA256, preparedSha256: PREPARED_SHA256,
      preparedAuthoritySha256: payload.preparedAuthoritySha256,
      sourceSha256: sha(fs.readFileSync(SOURCE)),
      compilerCoreSha256: sha(fs.readFileSync(built.coreSourcePath)) },
    inputAudit: {
      accepted: ["authenticated prepared maximal-order nfinit data",
        "neutral exhaustive runtime prime/product tables",
        "fresh zeroed owners under the public 2048-ideal admission ceiling"],
      forbidden: ["successful C1/C2", "factor-base descriptors", "permutation",
        "subfactor selection", "relations", "HNF", "answer-derived capacities"],
    },
    execution: { backend: "gmp", calls: 1, elapsedNs: String(elapsedNs),
      maxRssKiB: process.resourceUsage().maxRSS,
      addressSpaceCeilingBytes: "4294967296", cpuLimitSeconds: 600,
      wallTimeoutSeconds: 600 },
    field: { polynomial: prepared.prep_polynomial,
      discriminant: prepared.analytic_discriminant, degree: DEGREE,
      signature: [3, 0], precision: Number(prepared.precision) },
    rootState: state, baseState: packedSlice(owners.base_state, 0, 7),
    degreeState: packedSlice(owners.degree_state, 0, 4),
    kummerState: packedSlice(owners.kummer_state, 0, 4),
    rng: packedSlice(owners.random_state, 0, 66),
    selectedIndices: indices.map(String), selectedDescriptors,
    factor: {
      rationalPrimes: packedSlice(owners.initial_primes, 0, kcz),
      groupOffsets: packedSlice(owners.initial_offsets, 0, kcz),
      groupCounts: packedSlice(owners.initial_counts, 0, kcz),
      groupComplete: packedSlice(owners.initial_complete, 0, kcz),
      relationPrimes: packedSlice(owners.relation_primes, 0, kc),
      ramification: packedSlice(owners.ramification, 0, kc),
      residueDegrees: packedSlice(owners.residue_degrees, 0, kc),
      inertFlags: packedSlice(owners.inert_flags, 0, kc),
      tau: packedSlice(owners.selected_tau, 0, kc * DEGREE * DEGREE),
      packetIdeals: packedSlice(owners.packet_ideals, 0, kc * DEGREE * DEGREE),
      packetNorms: packedSlice(owners.packet_norms, 0, kc),
      badFlags: packedSlice(owners.bad_flags, 0, kc),
      permutation: packedSlice(owners.permutation, 0, kc),
      subfactor: packedSlice(owners.subfactor, 0, Number(state[7])),
      minidx: packedSlice(owners.minidx, 0, kc), automorphismPermutation: [],
    },
    capacity: { policyMaxIdeals: MAX_IDEALS, observedIdeals: kc,
      crossedFormer1024Ceiling: kc > 1024, relationMatrixCellsAllocated: 0,
      hnfMatrixCellsAllocated: 0, runtimeProductWords,
      runtimeProductWordCeiling: MAX_RUNTIME_PRODUCT_WORDS },
    publication: { gateA: true, factorBaseComplete: true,
      relationsAllocated: false, relationCollectionExecuted: false,
      hnfExecuted: false },
  };
  const receipt = publishOwner(payload.outputDirectory, owner);
  process.stdout.write(`${canonical({ ...receipt, state, elapsedNs: String(elapsedNs),
    maxRssKiB: owner.execution.maxRssKiB, coreSourcePath: built.coreSourcePath })}\n`);
}

function readOwner(receipt) {
  const compressed = fs.readFileSync(receipt.path);
  assert.equal(sha(compressed), receipt.compressedSha256);
  assert.equal(fs.statSync(receipt.path).mode & 0o777, 0o444);
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha(plain), receipt.ownerSha256);
  return JSON.parse(plain);
}

function validateOwner(owner) {
  assert.equal(owner.schema,
    "sagejs.pari-class-group/row6-prepared-factor-base-owner-v1");
  assert.equal(owner.authority.pristineW0Sha256, W0_SHA256);
  assert.equal(owner.authority.preparedSha256, PREPARED_SHA256);
  assert.deepEqual(owner.field.polynomial,
    ["2000000000018", "-2000000000010", "0", "1"]);
  assert.deepEqual(owner.field.signature, [3, 0]);
  assert.deepEqual(owner.rootState.slice(0, 13),
    ["1", "9196", "9196", "1130", "740", "740", "1130", "4",
      "1130", "0", "1048576", "65537", "2048"]);
  assert.deepEqual(owner.baseState.slice(0, 6),
    ["9196", "9196", "1130", "740", "740", "1130"]);
  assert.equal(owner.selectedDescriptors.length, 1130);
  assert.deepEqual(owner.selectedDescriptors[1], {
    p: "3", generator: ["-1", "0", "1"], e: "3", f: "1", inert: "0",
    tau: ["2", "1333333333340", "-222222222226", "1", "1",
      "222222222223", "0", "3", "3"],
  });
  assert.equal(owner.factor.rationalPrimes.length, 740);
  assert.equal(owner.factor.permutation.length, 1130);
  assert.deepEqual(owner.factor.subfactor, ["3", "5", "7", "9"]);
  assert.equal(owner.factor.packetNorms.length, 1130);
  assert.equal(owner.capacity.policyMaxIdeals, 2048);
  assert.equal(owner.capacity.observedIdeals, 1130);
  assert.equal(owner.capacity.crossedFormer1024Ceiling, true);
  assert.equal(owner.capacity.relationMatrixCellsAllocated, 0);
  assert.equal(owner.capacity.hnfMatrixCellsAllocated, 0);
  assert.equal(owner.publication.factorBaseComplete, true);
  assert.equal(owner.publication.relationsAllocated, false);
  assert.equal(owner.publication.relationCollectionExecuted, false);
  assert.equal(owner.publication.hnfExecuted, false);
  assert(!Object.hasOwn(owner, "relations"));
  return true;
}

function main() {
  if (process.argv[2] === "--root") return runRoot();
  assert.equal(fileSha(W0), W0_SHA256, "pristine row6 W0 digest changed");
  const record = jq(`.records[] | select(.filename=="${path.basename(W0)}")`, MANIFEST);
  assert.equal(record.sha256, W0_SHA256);
  assert.equal(record.preparedSha256, PREPARED_SHA256);

  // Extract only the 98 KiB prepared event.  The 203 MiB W0 object is never
  // resident beside compilation or native execution.
  const preparedEvent = jq(".prepared", W0, 2 * 1024 * 1024);
  assert.equal(sha(Buffer.from(JSON.stringify(preparedEvent))), PREPARED_SHA256);
  const auth = require("./prepared_nf_authentication.cjs");
  const prepared = auth.normalizePreparedBundle(preparedEvent);
  const authority = auth.authenticatePreparedNf(prepared);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row6-factor-base-"));
  const outputDirectory = path.join(temporary, "owner");
  const child = spawnSync("prlimit", ["--as=4294967296", "--cpu=600", "--",
    process.execPath, __filename, "--root"], {
    cwd: ROOT, encoding: "utf8", input: canonical({ prepared,
      preparedAuthoritySha256: authority.sha256, outputDirectory }),
    timeout: 600_000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(child.status, 0, child.stderr || String(child.error));
  const receipt = JSON.parse(child.stdout);
  const owner = readOwner(receipt);
  validateOwner(owner);

  // Only after the native child exits, stream-extract the 0.8 MiB factor-base
  // event as the cold PARI 2.17.4 oracle.
  const oracle = jq('.events[] | select(.event=="factor_base")', W0,
    4 * 1024 * 1024);
  assert.deepEqual(owner.rootState,
    ["1", "9196", "9196", "1130", "740", "740", "1130", "4",
      "1130", "0", "1048576", "65537", "2048", "11905"]);
  assert.deepEqual(owner.selectedDescriptors, descriptorOracle(oracle));
  assert.deepEqual(owner.factor.rationalPrimes,
    typedValues(oracle.FB, "small-vector", 740, "factor-base primes").map(String));
  assert.deepEqual(owner.factor.permutation,
    typedValues(oracle.perm, "small-vector", 1130, "factor-base permutation").map(String));
  assert.deepEqual(owner.factor.subfactor,
    typedValues(oracle.subfactor, "small-vector", 4, "subfactor").map(String));
  assert.deepEqual(owner.rng, oracle.rng.map(String));
  assert.deepEqual(owner.factor.automorphismPermutation,
    typedValues(oracle.embeddingPermutation, "vector", 0, "automorphism permutation"));
  assert.deepEqual(owner.factor.minidx,
    Array.from({ length: 1130 }, (_, i) => String(i + 1)));
  assert.equal(owner.capacity.policyMaxIdeals, 2048);
  assert.equal(owner.capacity.observedIdeals, 1130);
  assert.equal(owner.capacity.crossedFormer1024Ceiling, true);
  assert.equal(owner.capacity.relationMatrixCellsAllocated, 0);
  assert.equal(owner.capacity.hnfMatrixCellsAllocated, 0);
  assert.equal(owner.capacity.runtimeProductWords, 1470);
  assert.equal(owner.publication.relationsAllocated, false);
  assert.equal(owner.publication.hnfExecuted, false);

  const forbiddenProjection = canonical(prepared);
  const changedOracle = structuredClone(oracle);
  changedOracle.C1 = 1; changedOracle.KC = 1;
  changedOracle.LP.values[0].values[0].value = "3";
  changedOracle.perm.values[0] = "1"; changedOracle.subfactor.values[0] = "1";
  assert.equal(canonical(prepared), forbiddenProjection,
    "cold answer-bearing oracle changed the live child projection");
  let preparedMutationsRejected = 0;
  for (const mutate of [
    value => { value.prep_polynomial[0] = "2000000000019"; },
    value => { value.admission_real_count = "1"; },
    value => { [value.admission_primes[0], value.admission_primes[1]] =
      [value.admission_primes[1], value.admission_primes[0]]; },
  ]) {
    const changed = structuredClone(prepared); mutate(changed);
    assert.throws(() => auth.authenticatePreparedNf(changed));
    preparedMutationsRejected += 1;
  }
  let ownerMutationsRejected = 0;
  for (const mutate of [
    value => { value.authority.pristineW0Sha256 = "0".repeat(64); },
    value => { value.rootState[3] = "1024"; },
    value => { value.selectedDescriptors[1].e = "1"; },
    value => { value.factor.subfactor[0] = "1"; },
    value => { value.capacity.policyMaxIdeals = 1130; },
    value => { value.publication.relationsAllocated = true; },
  ]) {
    const changed = structuredClone(owner); mutate(changed);
    assert.throws(() => validateOwner(changed));
    ownerMutationsRejected += 1;
  }
  assert.equal(owner.execution.calls, 1);
  process.stdout.write(`${canonical({
    schema: "sagejs.pari-class-group/row6-prepared-factor-base-check-v1",
    owner: receipt.path, ownerSha256: receipt.ownerSha256,
    compressedSha256: receipt.compressedSha256, bytes: receipt.bytes,
    compressedBytes: receipt.compressedBytes, elapsedNs: receipt.elapsedNs,
    maxRssKiB: receipt.maxRssKiB, C1: 9196, C2: 9196, KC: 1130,
    KCZ: 740, KCZ2: 740, subfactor: [3, 5, 7, 9],
    descriptorsSha256: sha(Buffer.from(canonical(owner.selectedDescriptors))),
    packetsSha256: sha(Buffer.from(canonical({ ideals: owner.factor.packetIdeals,
      norms: owner.factor.packetNorms }))),
    factorSha256: sha(Buffer.from(canonical(owner.factor))),
    preparedMutationsRejected, ownerMutationsRejected,
    forbiddenOracleMutationProjectionUnchanged: true,
    former1024CeilingCrossed: true,
    admissionCeiling: 2048, relationMatrixCellsAllocated: 0,
    hnfMatrixCellsAllocated: 0, coldOracleAfterRootExit: true,
    w0ResidentBesideNativeExecution: false, calls: 1, gateA: true,
  })}\n`);
}

Promise.resolve(main()).catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
