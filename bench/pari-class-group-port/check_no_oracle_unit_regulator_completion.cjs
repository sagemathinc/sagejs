#!/usr/bin/env node
// sagejs-test-tier: specialized
// sagejs-test-platform: linux
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const runtimeRoot = path.resolve(
  process.env.SAGEJS_REPLAY_RUNTIME_ROOT ||
    "/home/user/sagejs-worktrees/pari-class-group-e2e-integration",
);
const resident = path.resolve(
  process.env.SAGEJS_RESIDENT_CUBIC ||
    "/tmp/sagejs-resident-generated-class-3qtnS5/output.json",
);
const compactOracleFixture = path.join(
  __dirname,
  "compact_unit_result_fixture.json",
);
const sha = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    timeout: 300000,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function relationLeaf() {
  const program = String.raw`
import collections
import copy
import dataclasses
import decimal
import fractions
import hashlib
import json
import pathlib
import sys
import threading
import typing

sys.set_int_max_str_digits(100000)
sys.path[:0] = [sys.argv[1], sys.argv[1] + "/src/lib"]
from importlib import import_module
m = import_module("bench.pari-class-group-port.no_oracle_unit_regulator_completion")
b = import_module("bench.pari-class-group-port.unit_bridge_cubic")
q = json.load(open(sys.argv[2], encoding="utf-8"))
I = lambda n: [0] * n
F = lambda n: [0.0] * n
c = 7
sq = 49
prepare = [
    [int(x) for x in q["hnf_result_c"][:147]],
    [int(x) for x in q["accept_relations"][:14]],
    c,
    [int(x) for x in q["accept_regulator"][:3]],
    I(14), I(4), I(14), I(42), I(18), I(42), I(18), I(6), I(5), F(5),
    I(5), I(14), I(sq), I(sq), F(sq), I(sq), F(sq), I(sq), F(c), I(c),
    F(14), F(sq), I(c), I(c), I(c), F(c), F(c), F(c), I(c), I(6), I(3),
    I(6), I(4), I(4), F(4), I(4), F(4), I(4), F(2), I(2), F(6), F(4),
    I(2), I(3), I(3), F(3), F(3), F(3), I(3), I(2),
]
assert b.pari_cubic_unit_bridge_prepare(*prepare) == 0
factor = [
    prepare[10], I(4), I(18), I(6), I(4), I(2), F(4), I(4), F(4), I(4),
    F(2), I(2), F(6), F(4), I(2), I(3), I(2), F(3), F(3), I(4),
]
assert b.pari_cubic_getfu_factor_rank_two(*factor) == 0
unit_kernel = I(14)
assert b.pari_cubic_unit_compose_provenance(
    prepare[6], c, factor[1], unit_kernel
) == 0
print(json.dumps(m.derive_relation_unit_leaf(sys.argv[2], unit_kernel), sort_keys=True))
`;
  return JSON.parse(
    run("python3", ["-c", program, root, resident]),
  );
}

function values(buffer) {
  return buffer.toArray ? buffer.toArray() : Array.from(buffer);
}

async function rebuildArchimedean(relation) {
  const { compileKernel } = require(path.join(
    runtimeRoot,
    "tools/native-kernel/compiler.cjs",
  ));
  const embeddingBuild = await compileKernel({
    sourcePath: path.join(__dirname, "cubic_embedding_rebuild.py"),
  });
  const embeddingFunction = require(embeddingBuild.modulePath)
    .pari_cubic_embedding_rebuild;
  const logBuild = await compileKernel({
    sourcePath: path.join(__dirname, "cubic_precision_rebuild.py"),
  });
  const logModule = require(logBuild.modulePath);
  const rebuildLogs = logModule.pari_cubic_sunit_precision_rebuild;
  assert.equal(embeddingFunction.nativeAvailable, true);
  assert.equal(rebuildLogs.nativeAvailable, true);

  const E = (length, data = Array(length).fill(0n)) =>
    embeddingFunction.createIntegerBuffer(length, 16384, data.map(BigInt));
  const ES = (length) =>
    embeddingFunction.createInt64Buffer(Array(length).fill(0n));
  const columnMajor = [E(9), E(9), E(9)];
  const embeddingState = ES(4);
  assert.equal(
    embeddingFunction.gmp(
      E(4, relation.polynomial_ascending),
      E(9, relation.integral_basis_column_major),
      2176n,
      E(3), E(3), E(3),
      ...columnMajor,
      embeddingState,
    ),
    0n,
  );
  assert.deepEqual(values(embeddingState), [3n, 2176n, 2496n, 1n]);

  const I = (length, data = Array(length).fill(0n)) =>
    rebuildLogs.createIntegerBuffer(length, 16384, data.map(BigInt));
  const S = (length) =>
    rebuildLogs.createInt64Buffer(Array(length).fill(0n));
  const rowMajor = columnMajor.map((entry) => {
    const source = values(entry);
    return Array.from({ length: 9 }, (_, index) => {
      const row = Math.floor(index / 3);
      const column = index % 3;
      return source[3 * column + row];
    });
  });
  const matrixBuffers = rowMajor.map((entry) => I(9, entry));
  const generators = relation.principal_generators_integral_basis
    .flat()
    .map(BigInt);
  const transform = relation.retained_relation_provenance.map(BigInt);
  const atomLogs = I(21 * 73);
  const transformed = I(42);
  const cleanScratch = I(42);
  const cleanResult = I(42);
  const output = I(42);
  const phaseScratch = I(6);
  const phaseOutput = I(6);
  const state = S(5);
  assert.equal(
    rebuildLogs.gmp(
      ...matrixBuffers,
      I(3 * 73, generators),
      I(2 * 73, transform),
      73n,
      2176n,
      atomLogs,
      transformed,
      cleanScratch,
      cleanResult,
      output,
      phaseScratch,
      phaseOutput,
      I(3),
      I(3),
      I(512),
      I(512),
      I(512),
      I(512),
      I(128),
      S(4),
      state,
    ),
    0n,
  );
  assert.deepEqual(values(state), [0n, 73n, 2n, 2n, 2176n]);
  const records = values(output);
  const packedLogs = [];
  for (let index = 0; index < 6; index += 1) {
    packedLogs.push(...records.slice(7 * index + 1, 7 * index + 4).map(String));
  }
  const phases = values(phaseOutput).map(String);
  const embedding = rowMajor.flatMap((entry) => entry.map(String));
  return {
    schema: "sagejs.pari-class-group/rebuilt-archimedean-leaf-v1",
    field: relation.field,
    resident_sha256: relation.resident_sha256,
    polynomial_sha256: relation.polynomial_sha256,
    integral_basis_sha256: relation.integral_basis_sha256,
    exact_units_sha256: relation.exact_units_sha256,
    relation_transform_sha256: sha(
      JSON.stringify(relation.retained_relation_provenance),
    ),
    principal_generators_sha256: sha(
      JSON.stringify(relation.principal_generators_integral_basis),
    ),
    embedding_precision_bits: "2176",
    log_precision_bits: "2176",
    embedding,
    packed_logs: packedLogs,
    phases,
    embedding_sha256: sha(JSON.stringify(embedding)),
    packed_logs_sha256: sha(JSON.stringify(packedLogs)),
    producer: {
      pari_invoked: false,
      answer_derived_logs_read: false,
      answer_derived_embedding_read: false,
      source: "ordinary-python-exact-polynomial-cubic-rebuild",
    },
  };
}

async function rigorousRegulator(relation, archimedean) {
  const { createSage } = require(path.join(runtimeRoot, "dist/tools/kernel.js"));
  const replaySource = fs.readFileSync(
    path.join(__dirname, "regulator_acceptance_replay.py"),
    "utf8",
  );
  const selected = relation.relation_provenance;
  const fixture = {
    schema: "sagejs.pari-class-group.regulator-acceptance-replay-fixture.v1",
    source: {
      field_id: relation.field,
      pari_version: "2.17.4",
      pari_archive_sha256:
        "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
      buch2_sha256:
        "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
      unit_bridge_fixture_sha256: relation.live_transform_sha256,
    },
    field: {
      defining_polynomial_coefficients: ["20034", "-20018", "0", "1"],
      integral_basis_power_coordinates: [
        ["1", "0", "0"],
        ["0", "1", "0"],
        ["-13345", "2", "1"],
      ],
    },
    selected_lattice: {
      unit_transform: selected,
      relation_provenance: selected,
      columns: "7",
      accepted_arch_sha256: archimedean.packed_logs_sha256,
      relation_lattice_sha256: relation.presentation_sha256,
    },
    exact_units_power_coordinates: relation.exact_units_power_basis,
    resident: {
      precision_bits: "2176",
      packed_logs: archimedean.packed_logs,
      packed_regulator: relation.resident_packed_regulator,
    },
    retry: {
      log_precision_bits: "2176",
      embedding_precision_bits: "2176",
      working_capacity_bits: "2368",
      packed_logs_sha256: archimedean.packed_logs_sha256,
      packed_regulator_sha256: sha(
        JSON.stringify(relation.resident_packed_regulator),
      ),
    },
    rigorous_replay: {
      initial_precision_bits: "128",
      absolute_tolerance_bits: "96",
      maximum_precision_bits: "512",
    },
  };
  const session = await createSage({ mode: "python" });
  try {
    const program = replaySource + String.raw`
import json
fixture = json.loads(${JSON.stringify(JSON.stringify(fixture))})
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 - 20018*x + 20034, "a")
payload = build_regulator_acceptance_replay(K, fixture)
raw, authority = seal_regulator_acceptance_replay(payload)
assert cold_replay_regulator_acceptance(K, raw, authority) == payload
print(json.dumps(payload, sort_keys=True))
`;
    const replay = await session.evaluate(program, {
      filename: "no-oracle-regulator-replay.py",
    });
    assert.equal(replay.stderr || "", "");
    return JSON.parse(replay.stdout);
  } finally {
    session.close();
  }
}

function composeAndMutate(relation, archimedean, regulator) {
  const program = String.raw`
import collections
import copy
import dataclasses
import decimal
import fractions
import hashlib
import json
import pathlib
import sys
import threading
import typing

sys.path[:0] = [sys.argv[1], sys.argv[1] + "/src/lib"]
from importlib import import_module
m = import_module("bench.pari-class-group-port.no_oracle_unit_regulator_completion")
d = json.load(sys.stdin)
r, a, g = d["relation"], d["archimedean"], d["regulator"]
payload = m.build_no_oracle_unit_regulator_completion(r, a, g)
raw, authority = m.seal_no_oracle_unit_regulator_completion(payload)
assert m.cold_replay_no_oracle_unit_regulator_completion(
    raw, authority, r, a, g
) == payload

def rejected(rr, aa, gg):
    try:
        m.build_no_oracle_unit_regulator_completion(rr, aa, gg)
    except (m.NoOracleCompletionFailure, ArithmeticError, KeyError, TypeError, ValueError):
        return
    raise AssertionError("coordinated no-oracle completion mutation was accepted")

mutations = []
changed = copy.deepcopy(r); changed["exact_units_power_basis"][0][0] = "1"; mutations.append((changed, a, g))
changed = copy.deepcopy(r); changed["authority"]["unit_saturation_proved"] = True; mutations.append((changed, a, g))
changed = copy.deepcopy(a); changed["packed_logs"][0] = str(int(changed["packed_logs"][0]) + 1); mutations.append((r, changed, g))
changed = copy.deepcopy(a); changed["producer"]["pari_invoked"] = True; mutations.append((r, changed, g))
changed = copy.deepcopy(a); changed["exact_units_sha256"] = "0" * 64; mutations.append((r, changed, g))
changed = copy.deepcopy(r); changed["retained_relation_provenance"][0] = str(int(changed["retained_relation_provenance"][0]) + 1); mutations.append((changed, a, g))
changed = copy.deepcopy(g); changed["inputs"]["exact_units_power_coordinates"][0][0] = "1"; mutations.append((r, a, changed))
changed = copy.deepcopy(g); changed["evidence"]["packed_log_matches"][0] = False; mutations.append((r, a, changed))
changed = copy.deepcopy(g); changed["assumptions"]["public_certification"]["unit_saturation_index_one"] = True; mutations.append((r, a, changed))
for mutation in mutations:
    rejected(*mutation)

print(json.dumps({
    "payload": payload,
    "envelopeSha256": authority.envelope_sha256,
    "mutationsRejected": len(mutations),
}, sort_keys=True))
`;
  return JSON.parse(
    run("python3", ["-c", program, root], {
      input: JSON.stringify({ relation, archimedean, regulator }),
    }),
  );
}

(async () => {
  const relation = relationLeaf();
  // This fixture is a differential oracle only. It is never passed to the
  // relation leaf, the archimedean rebuild, or the final composer.
  const externalOracle = JSON.parse(fs.readFileSync(compactOracleFixture, "utf8"));
  assert.deepEqual(
    relation.relation_provenance,
    externalOracle.compact_units.exponents,
  );
  const archimedean = await rebuildArchimedean(relation);
  const regulator = await rigorousRegulator(relation, archimedean);
  const completed = composeAndMutate(relation, archimedean, regulator);
  const payload = completed.payload;
  assert.equal(payload.terminal.correspondence_complete, true);
  assert.equal(payload.terminal.no_pari_or_answer_oracle, true);
  assert.equal(payload.terminal.public_complete, false);
  assert.equal(payload.terminal.unit_saturation_certified, false);
  console.log(
    JSON.stringify({
      schema: payload.schema,
      field: payload.field.id,
      exactRelationDerivedUnits: payload.unit_group_correspondence.rank,
      rebuiltEmbeddingBits: Number(archimedean.embedding_precision_bits),
      rebuiltLogBits: Number(archimedean.log_precision_bits),
      rigorousRegulator:
        payload.unit_group_correspondence.regulator_enclosure.rigorous,
      fullRank:
        payload.unit_group_correspondence.regulator_enclosure
          .full_rank_certified,
      pariInvoked: false,
      answerDerivedUnitCoordinatesRead: false,
      answerDerivedLogsRead: false,
      liveUnitTransform: relation.authority.live_unit_transform,
      exactPolynomialEmbedding: true,
      compactFixtureIsExternalOracleOnly: true,
      correspondenceComplete: true,
      publicComplete: false,
      unitSaturationCertified: false,
      mutationsRejected: completed.mutationsRejected,
      envelopeSha256: completed.envelopeSha256,
    }),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
