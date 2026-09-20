"use strict";

// Export authenticated phase authorities for the Rust prepared-prefix port.
//
// The only object marked as Rust timed input is the sanitized, nonzero
// prepared-field input that exists before factor-base construction.  Factor
// base, initial-cache, and collected-relation values are oracle outputs.  A
// benchmark must compare against them after its timer has stopped; feeding
// any oracle value back into the timed Rust path invalidates the experiment.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const adapter = require("./h1_unified_complete_adapter.cjs");
const { sanitizePreparedInput } = require("./h1_outcome_c_adapter.cjs");

const SENTINEL_PREPARED_OWNERS = new Set([
  "accept_inverse_hr",
  "analytic_log_discriminant",
]);

const SNAPSHOT_NAMES = [
  "prep_state",
  "prep_degree_state",
  "prep_base_state",
  "prep_base_norms",
  "prep_selected_indices",
  "prep_sub_configuration",
  "prep_sub_state",
  "initial_primes",
  "initial_offsets",
  "initial_counts",
  "initial_complete",
  "packet_ideals",
  "packet_norms",
  "relation_primes",
  "ramification",
  "admission_group_e",
  "admission_group_f",
  "admission_group_inert",
  "admission_group_tau",
  "search_ideals",
  "chain_state",
  "relation_state",
  "relation_basis",
  "relation_records",
  "relation_hashes",
  "relation_metadata",
  "generators",
  "log_completed",
  "log_embeddings",
  "schedule",
];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]),
  );
  return value;
}

function digest(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function isZero(value) {
  if (Array.isArray(value)) return value.every(isZero);
  return value === false || value === 0 || value === "0";
}

function owner(values) {
  const canonicalValues = values.map(String);
  return {
    cells: canonicalValues.length,
    sha256: digest(canonicalValues),
    values: canonicalValues,
  };
}

function slice(snapshot, name, length) {
  assert(Object.hasOwn(snapshot, name), `missing snapshot owner: ${name}`);
  assert(Number.isSafeInteger(length) && length >= 0);
  assert(snapshot[name].length >= length, `short snapshot owner: ${name}`);
  return owner(snapshot[name].slice(0, length));
}

function preparedTimedInput(preparedInput) {
  const kinds = new Map(preparedInput.names);
  const owners = {};
  for (const [name, value] of Object.entries(preparedInput.input)) {
    if (isZero(value) || SENTINEL_PREPARED_OWNERS.has(name)) continue;
    owners[name] = {
      kind: kinds.get(name),
      value: canonical(value),
    };
  }
  assert(!Object.hasOwn(owners, "relation_records"));
  assert(!Object.hasOwn(owners, "class_number"));
  assert(!Object.hasOwn(owners, "hnf_result_h"));
  return {
    boundary: "sanitized-prepared-maximal-order-before-factor-base",
    rule: "The timed Rust run may consume only these owners and allocate zeroed workspace internally.",
    forbiddenOracleInputs: [
      "factorBase",
      "initialRelationCache",
      "collectedRelations",
    ],
    owners,
    sha256: digest(owners),
  };
}

async function exactInitialCache({ snapshots, rows, groups, additional }) {
  const capacity = 10 * (rows + additional) + 50;
  const state = Array(6).fill(0n);
  const basis = Array(rows * rows).fill(0n);
  const records = Array(capacity * rows).fill(0n);
  const hashes = Array(capacity).fill(0n);
  const metadata = Array(capacity * 3).fill(0n);
  const relation = Array(rows).fill(0n);
  const scratch = Array(rows).fill(0n);
  const toBigInt = values => values.map(BigInt);
  const built = await compileKernel({
    sourcePath: path.join(__dirname, "relation_cache.py"),
    functions: ["pari_prepared_initialize_relations"],
    integerBackends: ["gmp"],
  });
  const initialize = require(built.modulePath).pari_prepared_initialize_relations;
  assert(initialize.nativeAvailable && typeof initialize.gmp === "function");
  const count = initialize.gmp(
    BigInt(additional),
    toBigInt(snapshots.initial_primes.slice(0, groups)),
    toBigInt(snapshots.initial_offsets.slice(0, groups)),
    toBigInt(snapshots.initial_counts.slice(0, groups)),
    toBigInt(snapshots.initial_complete.slice(0, groups)),
    toBigInt(snapshots.ramification.slice(0, rows)),
    state,
    basis,
    records,
    hashes,
    metadata,
    relation,
    scratch,
  );
  const initialCount = Number(count);
  assert.equal(initialCount, 12, "H1 initial relation count changed");

  // This is the ownership transfer immediately following the translated
  // initializer in connected_relation_hnf.py.  It is intentionally outside
  // the relation initializer rather than inferred from the terminal answer.
  const generators = Array(initialCount * 3).fill(0n);
  for (let row = 0; row < initialCount; row += 1) {
    generators[row * 3] = metadata[row * 3];
    metadata[row * 3] = BigInt(row + 1);
  }

  // Authenticate every append-only prefix against the independent complete
  // root.  The rank basis itself evolves during collection, so its authentic
  // initial value comes only from the fresh native initializer above.
  assert.deepEqual(records.slice(0, initialCount * rows).map(String),
    snapshots.relation_records.slice(0, initialCount * rows));
  assert.deepEqual(hashes.slice(0, initialCount).map(String),
    snapshots.relation_hashes.slice(0, initialCount));
  assert.deepEqual(metadata.slice(0, initialCount * 3).map(String),
    snapshots.relation_metadata.slice(0, initialCount * 3));
  assert.deepEqual(generators.map(String),
    snapshots.generators.slice(0, initialCount * 3));

  return {
    boundary: "after-initial-relation-cache-before-small-norm-collection",
    excludedFromTimedInput: true,
    initialCount,
    state: owner(state),
    basis: owner(basis),
    records: owner(records.slice(0, initialCount * rows)),
    hashes: owner(hashes.slice(0, initialCount)),
    metadata: owner(metadata.slice(0, initialCount * 3)),
    generators: owner(generators),
    nativeInitializer: {
      function: "pari_prepared_initialize_relations",
      backend: "gmp",
      sourceSha256: sha256(fs.readFileSync(path.join(__dirname, "relation_cache.py"))),
    },
  };
}

async function main() {
  const inputPath = path.resolve(process.argv[2] ?? "");
  const outputPath = path.resolve(process.argv[3] ?? "");
  assert(inputPath && outputPath,
    "usage: node export_h1_rust_phase_checkpoints.cjs INPUT.json OUTPUT.json");
  const inputBytes = fs.readFileSync(inputPath);
  const rawInput = JSON.parse(inputBytes);
  const residentPath = path.join(__dirname, "resident_generated_class_attempt.py");
  const residentSource = fs.readFileSync(residentPath, "utf8");
  const sanitized = sanitizePreparedInput(rawInput, residentSource);
  const preparedInput = sanitized.record;
  const result = await adapter.probeSagePreparedH1({
    preparedInput,
    stopAfterClass: true,
    snapshotNames: SNAPSHOT_NAMES,
  });
  assert.equal(result.status, "101", "class-stop sentinel changed");

  const s = result.snapshots;
  const rows = Number(s.prep_base_state[2]);
  const groups = Number(s.prep_base_state[3]);
  const columns = Number(s.relation_state[0]);
  const initialCount = Number(s.chain_state[2]);
  const additional = columns - rows;
  const degree = Number(preparedInput.input.n);
  const realPlaces = Number(preparedInput.input.admission_real_count);
  const logRows = (degree + realPlaces) / 2;
  assert.deepEqual({ rows, groups, columns, initialCount, additional, degree, logRows }, {
    rows: 66, groups: 48, columns: 73, initialCount: 12,
    additional: 7, degree: 3, logRows: 3,
  });

  const factorBase = {
    boundary: "after-factor-base-and-packet-construction-before-relation-cache",
    excludedFromTimedInput: true,
    state: {
      // The terminal root changes only phase/action after returning from the
      // class attempt.  Phase 6/action 0 is the exact pre-attempt boundary.
      prepState: ["6", "0", ...s.prep_state.slice(2)],
      degreeState: s.prep_degree_state,
      baseState: s.prep_base_state,
      subfactorState: s.prep_sub_state,
    },
    activePrimeGroups: {
      primes: slice(s, "initial_primes", groups),
      offsets: slice(s, "initial_offsets", groups),
      counts: slice(s, "initial_counts", groups),
      complete: slice(s, "initial_complete", groups),
    },
    activeIdeals: {
      selectedIndices: slice(s, "prep_selected_indices", rows),
      primes: slice(s, "relation_primes", rows),
      ramification: slice(s, "admission_group_e", rows),
      residueDegrees: slice(s, "admission_group_f", rows),
      inert: slice(s, "admission_group_inert", rows),
      tau: slice(s, "admission_group_tau", rows * degree * degree),
      packetIdeals: slice(s, "packet_ideals", rows * degree * degree),
      packetNorms: slice(s, "packet_norms", rows),
      searchPermutation: slice(s, "search_ideals", rows),
      // The root copies search_ideals into hnf_perm at this boundary.  HNF
      // later mutates hnf_perm, so the terminal hnf_perm owner is not a valid
      // factor-base checkpoint and must never be exported here.
      hnfPermutation: slice(s, "search_ideals", rows),
    },
    baseNorms: owner(s.prep_base_norms),
    subfactorConfiguration: owner(s.prep_sub_configuration),
  };

  const initialRelationCache = await exactInitialCache({
    snapshots: s, rows, groups, additional,
  });
  assert.equal(initialRelationCache.initialCount, initialCount);

  const relationCells = rows * columns;
  const collectedRelations = {
    boundary: "after-relation-collection-and-logs-before-hnf",
    excludedFromTimedInput: true,
    initialCount,
    relationCount: columns,
    chainState: ["2", "0", String(initialCount), String(columns)],
    relationState: owner(s.relation_state),
    basis: slice(s, "relation_basis", rows * rows),
    records: slice(s, "relation_records", relationCells),
    hashes: slice(s, "relation_hashes", columns),
    metadata: slice(s, "relation_metadata", columns * 3),
    generators: slice(s, "generators", columns * degree),
    logCompleted: owner(s.log_completed),
    logEmbeddings: slice(s, "log_embeddings", 7 * logRows * columns),
    collectorSchedule: owner(s.schedule),
    presentationSha256: digest(s.relation_records.slice(0, relationCells)),
  };

  const timedInput = preparedTimedInput(preparedInput);
  const checkpoint = {
    schema: "sagejs.pari-class-group/h1-rust-phase-checkpoints-v1",
    fieldId: adapter.FIELD_ID,
    polynomialAscending: ["20034", "-20018", "0", "1"],
    provenance: {
      sourcePreparedEnvelopeSha256: sha256(inputBytes),
      sanitizedPreparedInputSha256: sanitized.metadata.sha256,
      sourcePreparedValueSha256: adapter.digest(preparedInput),
      residentRootSourceSha256: sha256(residentSource),
      terminalStatus: result.status,
      terminalHnfState: result.hnfState,
      terminalBridgeState: result.bridgeState,
      captureMethod: [
        "factor-base owners are immutable after resident preparation and were read from the authenticated class-stop run",
        "initial-cache owners were recreated on fresh storage by the exact translated native initializer and append-only prefixes were checked against the complete run",
        "collected relation/log owners are append-only inputs retained by the authenticated class-stop run; mutable HNF workspace is deliberately excluded",
      ],
    },
    shape: { degree, realPlaces, logRows, rows, groups, initialCount, columns },
    rustTimedInput: timedInput,
    oracleOnly: { factorBase, initialRelationCache, collectedRelations },
  };
  checkpoint.authoritySha256 = digest(checkpoint);
  const encoded = `${JSON.stringify(checkpoint)}\n`;
  fs.writeFileSync(outputPath, encoded);
  process.stdout.write(`${JSON.stringify({
    outputPath,
    bytes: Buffer.byteLength(encoded),
    sha256: sha256(encoded),
    authoritySha256: checkpoint.authoritySha256,
    timedInputSha256: timedInput.sha256,
    presentationSha256: collectedRelations.presentationSha256,
  })}\n`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
