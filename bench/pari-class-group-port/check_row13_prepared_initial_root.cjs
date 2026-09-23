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
const SOURCE = path.join(__dirname, "row13_prepared_initial_root.py");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-13-a0f7253a51b3045a.json";
const W0_SHA256 = "50df5fa8a7b676b5216fecf2f57f3c9c60564c420a31bd0f5524447999694589";
const ROWS = 999;
const DEGREE = 4;
const MAX_IDEALS = 1024;
const MAX_ADDITIONAL = 16;
const MAX_RECORDS = 10 * (MAX_IDEALS + MAX_ADDITIONAL) + 50;
const MAX_RUNTIME_PRODUCT_WORDS = 2048;
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function canonical(value) {
  return JSON.stringify(value);
}

function parseSignature(source) {
  const match = source.match(/def pari_row13_prepared_initial_root\(([\s\S]*?)\n\) -> int:/);
  assert(match, "root signature disappeared");
  return match[1].trim().split("\n").map(line => {
    const fields = line.trim().replace(/,$/, "").split(": ");
    assert.equal(fields.length, 2, line);
    return fields;
  });
}

function exactInteger(value, label) {
  if (typeof value === "string") {
    assert.match(value, /^-?(0|[1-9][0-9]*)$/, `${label} is not canonical`);
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

function descriptorOracle(descriptors) {
  return descriptors.map((descriptor, index) => {
    const fields = typedValues(descriptor, "vector", 5, `descriptor ${index}`);
    const generator = typedValues(fields[1], "column", DEGREE,
      `descriptor ${index} generator`).map((x, i) => String(exactInteger(x,
      `descriptor ${index} generator ${i}`)));
    const columns = typedValues(fields[4], "matrix", DEGREE, `descriptor ${index} tau`);
    const columnMajor = columns.flatMap((column, j) =>
      typedValues(column, "column", DEGREE, `descriptor ${index} tau column ${j}`)
        .map((x, i) => String(exactInteger(x, `descriptor ${index} tau ${j},${i}`))));
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

function relationOwner(owners, count, rows) {
  const records = [];
  for (let relation = 0; relation < count; relation += 1) {
    const entries = [];
    for (let row = 0; row < rows; row += 1) {
      const value = packedAt(owners.relation_records, relation * rows + row);
      if (value !== 0n) entries.push([row, String(value)]);
    }
    records.push({
      entries,
      sourceNz: Number(packedAt(owners.relation_hashes, relation)),
      multiplier: String(packedAt(owners.relation_generators, relation * DEGREE)),
      origin: Number(packedAt(owners.relation_metadata, relation * 3 + 1)),
      automorphism: Number(packedAt(owners.relation_metadata, relation * 3 + 2)),
    });
  }
  return records;
}

function publishOwner(directory, owner) {
  fs.mkdirSync(directory, { recursive: true });
  const plain = Buffer.from(`${canonical(owner)}\n`);
  const ownerSha256 = sha(plain);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const compressedSha256 = sha(compressed);
  const destination = path.join(directory,
    `row13-prepared-initial-${ownerSha256}.json.gz`);
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
  const fn = module.pari_row13_prepared_initial_root;
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
    complex_pairs: BigInt((Number(prepared.n) - Number(prepared.admission_real_count)) / 2),
    precision: BigInt(prepared.precision),
    equation_index: BigInt(prepared.prep_index),
    roots_of_unity: BigInt(prepared.analytic_roots_of_unity),
    zkden: BigInt(prepared.prep_zkden),
    invzk: buffer(DEGREE * DEGREE, 8, prepared.prep_invzk.map(BigInt)),
    zk: buffer(DEGREE * DEGREE, 8, prepared.prep_zk.map(BigInt)),
    zk_degrees: buffer(DEGREE, 2, prepared.prep_zk_degrees.map(BigInt)),
    basis_table: buffer(DEGREE ** 3, 8, prepared.basis_table.map(BigInt)),
    runtime_primes: buffer(p, 1, prepared.admission_primes.map(BigInt)),
    runtime_products: buffer(runtimeProductValues.length, runtimeProductWords,
      runtimeProductValues),
    factor_limit: BigInt(prepared.admission_factorlimit),
    prime_limit: BigInt(prepared.admission_prime_limit),
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
    selected_indices: buffer(descriptors, 2), base_state: buffer(7, 128),
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
    packet_generator: buffer(DEGREE, 8), packet_multiplication: buffer(DEGREE ** 2, 8),
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
    relation: buffer(MAX_IDEALS, 1), relation_scratch: buffer(MAX_IDEALS, 1),
    relation_basis: buffer(MAX_IDEALS * MAX_IDEALS, 1),
    relation_records: buffer(MAX_RECORDS * MAX_IDEALS, 1),
    relation_hashes: buffer(MAX_RECORDS, 1),
    relation_metadata: buffer(MAX_RECORDS * 3, 1), relation_state: buffer(6, 2),
    relation_generators: buffer(MAX_RECORDS * DEGREE, 1), root_state: buffer(18, 2),
  };
  assert.deepEqual(signature.map(([name]) => name), Object.keys(owners),
    "root owner manifest differs from source signature");
  const args = signature.map(([name, kind]) => {
    assert.equal(kind === "Float64Buffer", Array.isArray(owners[name]),
      `${name} has the wrong ABI representation`);
    return owners[name];
  });
  const started = process.hrtime.bigint();
  const count = fn.gmp(...args); // The only root invocation in this checker.
  const elapsedNs = process.hrtime.bigint() - started;
  assert.equal(count, 54n);
  const state = packedSlice(owners.root_state, 0, 18);
  assert.equal(state[0], "1", "root did not publish");
  const kc = Number(state[3]), kcz = Number(state[4]), initialCount = Number(state[9]);
  const capacity = Number(packedAt(owners.relation_state, 1));
  const indices = packedSlice(owners.selected_indices, 0, kc).map(Number);
  const selectedDescriptors = indices.map(index => ({
    p: String(packedAt(owners.catalog_primes, index)),
    generator: packedSlice(owners.catalog_generators, index * DEGREE, (index + 1) * DEGREE),
    e: String(packedAt(owners.catalog_e, index)),
    f: String(packedAt(owners.catalog_f, index)),
    inert: String(packedAt(owners.catalog_inert, index)),
    tau: packedSlice(owners.catalog_tau, index * DEGREE * DEGREE,
      (index + 1) * DEGREE * DEGREE),
  }));
  const owner = {
    schema: "sagejs.pari-class-group/row13-prepared-initial-owner-v1",
    authority: { preparedAuthoritySha256: payload.preparedAuthoritySha256,
      sourceSha256: sha(fs.readFileSync(SOURCE)),
      compilerCoreSha256: sha(fs.readFileSync(built.coreSourcePath)) },
    inputAudit: {
      accepted: ["authenticated prepared maximal-order nfinit data",
        "neutral exhaustive runtime prime/product tables", "public default bound mode",
        "fresh zeroed owners under the public 1024-ideal admission ceiling"],
      forbidden: ["factorBaseDescriptors", "sourceSchedule", "initialRelations",
        "C1/C2/KC/KCZ counters", "target/need", "RNG snapshots",
        "answer-derived capacities"],
    },
    execution: { backend: "gmp", calls: 1, elapsedNs: String(elapsedNs),
      maxRssKiB: process.resourceUsage().maxRSS, addressSpaceCeilingBytes: "4294967296",
      cpuLimitSeconds: 600, wallTimeoutSeconds: 600 },
    field: { polynomial: prepared.prep_polynomial, discriminant: prepared.analytic_discriminant,
      degree: DEGREE, signature: [2, 1], precision: Number(prepared.precision) },
    rootState: state,
    baseState: packedSlice(owners.base_state, 0, 7),
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
    relations: {
      state: packedSlice(owners.relation_state, 0, 6),
      records: relationOwner(owners, initialCount, kc),
      denseRecords: packedSlice(owners.relation_records, 0, initialCount * kc),
      hashes: packedSlice(owners.relation_hashes, 0, initialCount),
      metadata: packedSlice(owners.relation_metadata, 0, initialCount * 3),
      generators: packedSlice(owners.relation_generators, 0, initialCount * DEGREE),
      basis: packedSlice(owners.relation_basis, 0, kc * kc),
    },
    handoff: { outerIndex: 0, searchCount: kc,
      searchIdeals: packedSlice(owners.permutation, 0, kc), Nrelid: Number(state[12]),
      target: Number(state[10]), need: Number(state[11]), missing: Number(state[13]) },
    capacity: { policyMaxIdeals: MAX_IDEALS, policyMaxAdditional: MAX_ADDITIONAL,
      backingRecordCapacity: MAX_RECORDS, logicalRecordCapacity: capacity,
      logicalRows: kc, runtimeProductWords,
      runtimeProductWordCeiling: MAX_RUNTIME_PRODUCT_WORDS },
    publication: { gateA: true, gateB: true, gateCReady: true,
      collectionExecuted: false, terminalClassComputed: false },
  };
  const receipt = publishOwner(payload.outputDirectory, owner);
  process.stdout.write(`${canonical({ ...receipt, state, elapsedNs: String(elapsedNs),
    maxRssKiB: owner.execution.maxRssKiB, coreSourcePath: built.coreSourcePath })}\n`);
}

function flattenExactMatrix(value, rows, columns, label) {
  const cols = typedValues(value, "matrix", columns, label);
  return cols.flatMap((column, j) => {
    assert(column && Array.isArray(column.values), `${label} column ${j} changed`);
    assert.equal(column.values.length, rows, `${label} column ${j} length changed`);
    return column.values.map((entry, i) => String(exactInteger(entry, `${label}[${i},${j}]`)));
  });
}

function main() {
  if (process.argv[2] === "--root") return runRoot();
  assert.equal(sha(fs.readFileSync(W0)), W0_SHA256, "pristine W0 digest changed");
  const auth = require("./prepared_nf_authentication.cjs");
  // Before execution, inspect only the authenticated positive projection of
  // prepared data. Answer-bearing W0 events are loaded below, after the child exits.
  const preparedAuthority = JSON.parse(fs.readFileSync(W0));
  const prepared = auth.normalizePreparedBundle(preparedAuthority);
  const authority = auth.authenticatePreparedBundle(preparedAuthority);
  let receipt;
  if (process.env.SAGEJS_ROW13_PREPARED_OWNER) {
    const retainedPath = path.resolve(process.env.SAGEJS_ROW13_PREPARED_OWNER);
    const retainedCompressed = fs.readFileSync(retainedPath);
    const retainedPlain = zlib.gunzipSync(retainedCompressed);
    const retainedOwner = JSON.parse(retainedPlain);
    receipt = { path: retainedPath, ownerSha256: sha(retainedPlain),
      compressedSha256: sha(retainedCompressed), bytes: retainedPlain.length,
      compressedBytes: retainedCompressed.length,
      elapsedNs: retainedOwner.execution.elapsedNs,
      maxRssKiB: retainedOwner.execution.maxRssKiB };
  } else {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row13-prepared-root-"));
    const outputDirectory = path.join(temporary, "owner");
    const child = spawnSync("prlimit", ["--as=4294967296", "--cpu=600",
      process.execPath, __filename, "--root"], {
      cwd: ROOT, encoding: "utf8", input: canonical({ prepared,
        preparedAuthoritySha256: authority.sha256, outputDirectory }),
      timeout: 600_000, maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(child.status, 0, child.stderr || String(child.error));
    receipt = JSON.parse(child.stdout);
  }
  const compressed = fs.readFileSync(receipt.path);
  assert.equal(sha(compressed), receipt.compressedSha256);
  assert.equal(fs.statSync(receipt.path).mode & 0o777, 0o444);
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha(plain), receipt.ownerSha256);
  const owner = JSON.parse(plain);

  // The oracle is consulted only after the one-shot root child has exited.
  const cold = JSON.parse(fs.readFileSync(W0));
  const factor = cold.events.find(event => event.event === "factor_base");
  const initialized = cold.events.find(event => event.event === "initialized");
  assert(factor && initialized, "cold W0 events disappeared");
  const expectedDescriptors = descriptorOracle(factor.LP.values);
  assert.deepEqual(owner.rootState,
    ["1", "8305", "8305", "999", "624", "624", "999", "6", "999",
      "54", "1006", "952", "4", "945", "999", "0", "1048576", "65537"]);
  assert.deepEqual(owner.selectedDescriptors, expectedDescriptors);
  // The translated Kummer decomposition consumes a different random stream
  // for this field while producing the identical 999 descriptors.  Preserve
  // and publish the live state; never replace it with W0's answer snapshot.
  assert.notDeepEqual(owner.rng, factor.rng);
  assert.deepEqual(owner.factor.rationalPrimes, factor.FB.values);
  assert.deepEqual(owner.factor.permutation, factor.perm.values);
  assert.deepEqual(owner.factor.subfactor, factor.subfactor.values);
  assert.deepEqual(owner.factor.automorphismPermutation, []);
  assert.deepEqual(owner.factor.minidx,
    Array.from({ length: ROWS }, (_, i) => String(i + 1)));
  assert.deepEqual(owner.factor.relationPrimes, expectedDescriptors.map(row => row.p));
  assert.deepEqual(owner.factor.ramification, expectedDescriptors.map(row => row.e));
  assert.deepEqual(owner.factor.residueDegrees, expectedDescriptors.map(row => row.f));
  assert.deepEqual(owner.factor.inertFlags, Array(ROWS).fill("0"));
  assert.deepEqual(owner.factor.tau, expectedDescriptors.flatMap(row => row.tau));
  const groupOffsets = [], groupCounts = [], groupComplete = [];
  let offset = 0;
  for (const prime of factor.FB.values) {
    groupOffsets.push(String(offset));
    let count = 0, localDegree = 0;
    while (offset + count < expectedDescriptors.length &&
        expectedDescriptors[offset + count].p === prime) {
      localDegree += Number(expectedDescriptors[offset + count].e) *
        Number(expectedDescriptors[offset + count].f);
      count += 1;
    }
    groupCounts.push(String(count));
    groupComplete.push(localDegree === DEGREE ? "1" : "0");
    offset += count;
  }
  assert.equal(offset, ROWS);
  assert.deepEqual(owner.factor.groupOffsets, groupOffsets);
  assert.deepEqual(owner.factor.groupCounts, groupCounts);
  assert.deepEqual(owner.factor.groupComplete, groupComplete);
  const expectedBad = Array(ROWS).fill("0");
  for (let group = 0; group < factor.FB.values.length; group += 1)
    if (groupComplete[group] === "1") {
      const final = Number(groupOffsets[group]) + Number(groupCounts[group]) - 1;
      expectedBad[final] = "1";
    }
  assert.deepEqual(owner.factor.badFlags, expectedBad);

  const initialRelations = initialized.relationRecords.map(row => ({
    entries: row.R.values.flatMap((value, index) => value === "0" ? [] : [[index, value]]),
    sourceNz: row.nz, multiplier: String(exactInteger(row.m, "relation multiplier")),
    origin: row.origin, automorphism: row.automorphism,
  }));
  assert.deepEqual(owner.relations.records, initialRelations);
  assert.deepEqual(owner.relations.state, ["54", "10110", "945", "7", "0", "1006"]);
  assert.deepEqual(owner.relations.hashes, initialRelations.map(row => String(row.sourceNz)));
  assert.deepEqual(owner.relations.metadata,
    initialRelations.flatMap((_, i) => [String(i + 1), "0", "0"]));
  assert.deepEqual(owner.relations.generators,
    initialRelations.flatMap(row => [row.multiplier, "0", "0", "0"]));

  const expectedBasis = flattenExactMatrix(initialized.basis, ROWS, ROWS,
    "W0 initial relation basis");
  assert.deepEqual(owner.relations.basis, expectedBasis);

  // Forbidden answer-bearing mutations cannot alter the child payload because
  // it is a positive projection of authenticated prepared data only.
  const payloadHash = sha(Buffer.from(canonical(prepared)));
  const forbidden = structuredClone(cold);
  const forbiddenFactor = forbidden.events.find(event => event.event === "factor_base");
  const forbiddenInitialized = forbidden.events.find(event => event.event === "initialized");
  forbiddenFactor.LP.values[0].values[0].value = "3";
  forbiddenInitialized.relationRecords[0].m.value = "3";
  forbiddenFactor.C1 = 1;
  forbiddenFactor.rng[0] = "0";
  assert.equal(sha(Buffer.from(canonical(auth.normalizePreparedBundle(forbidden)))), payloadHash);
  let preparedMutationsRejected = 0;
  for (const mutate of [
    value => { value.prepared.polynomial[0] = "-200000003"; },
    value => { value.prepared.signature = [4, 0]; },
    value => { [value.prepared.runtimePrimes[0], value.prepared.runtimePrimes[1]] =
      [value.prepared.runtimePrimes[1], value.prepared.runtimePrimes[0]]; },
  ]) {
    const changed = structuredClone(cold); mutate(changed);
    assert.throws(() => auth.authenticatePreparedBundle(changed));
    preparedMutationsRejected += 1;
  }
  assert.equal(owner.execution.calls, 1);
  assert.equal(owner.publication.gateA, true);
  assert.equal(owner.publication.gateB, true);
  assert.equal(owner.publication.collectionExecuted, false);
  process.stdout.write(`${canonical({
    schema: "sagejs.pari-class-group/row13-prepared-initial-check-v1",
    owner: receipt.path, ownerSha256: receipt.ownerSha256,
    compressedSha256: receipt.compressedSha256, bytes: receipt.bytes,
    compressedBytes: receipt.compressedBytes, elapsedNs: receipt.elapsedNs,
    maxRssKiB: receipt.maxRssKiB, C1: 8305, C2: 8305, KC: 999,
    KCZ: 624, KCZ2: 624, subfactor: [2, 4, 5, 7, 8, 10], initialRelations: 54,
    relationState: owner.relations.state, rngSha256: sha(Buffer.from(canonical(owner.rng))),
    descriptorsSha256: sha(Buffer.from(canonical(owner.selectedDescriptors))),
    packetsSha256: sha(Buffer.from(canonical({ ideals: owner.factor.packetIdeals,
      norms: owner.factor.packetNorms }))),
    relationOwnerSha256: sha(Buffer.from(canonical(owner.relations))),
    rngMatchesColdOracle: false,
    preparedMutationsRejected, forbiddenMutationPayloadUnchanged: true,
    coldOracleAfterRootExit: true, calls: 1, gateA: true, gateB: true,
    gateCReady: true, collectionExecuted: false,
  })}\n`);
}

Promise.resolve(main()).catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
