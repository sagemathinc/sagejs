#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = path.resolve(__dirname, "../..");

function inputs(integer, mode = "success") {
  const i64 = values => values.map(BigInt);
  const relation = [0, 0, 1, 0, 0, 1];
  const fullHnf = [...relation];
  const transform = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (mode === "relation") relation[0] = 1;
  if (mode === "hnf") fullHnf[0] = 1;
  if (mode === "transform") transform[0] = 2;
  if (mode === "nontrivial") {
    relation.splice(0, 6, 0, 0, 2, 0, 0, 1);
    fullHnf.splice(0, 6, ...relation);
  }
  const z = length => integer(Array(length).fill(0));
  const zs = length => i64(Array(length).fill(0));
  const published = Array.from({ length: 6 }, () => integer(Array(4).fill(77)));
  const relationPublished = [integer(Array(6).fill(77)), integer(Array(6).fill(77))];
  const state = i64(Array(16).fill(77));
  const args = [
    integer(relation), 2n, 3n, integer(fullHnf), integer(transform),
    z(9), z(18), zs(5), z(6), z(6), zs(8),
    z(4), z(4), z(4), z(4), z(4), z(4), z(4), z(4), z(4), z(4), z(4),
    z(2), z(1), z(2), z(4), z(8), zs(5), zs(5), zs(6), zs(6), zs(7), zs(9),
    ...published, ...relationPublished, state,
  ];
  return { args, published, relationPublished, state };
}

function values(owner) {
  return Array.isArray(owner) ? owner : owner.toArray();
}

const python = String.raw`
import importlib
import sys
sys.path.extend([sys.argv[1] + "/src/lib"])
m = importlib.import_module("bench.pari-class-group-port.live_h1_class_witness_suffix")

relation = [0, 0, 1, 0, 0, 1]
result = m.build_live_h1_class_witness_suffix(
    run_id="live-prefix", owner_generation=4, candidate_sha256="a" * 64,
    relation=relation, rows=2, columns=3, full_hnf=relation,
    hnf_transform=[1,0,0,0,1,0,0,0,1],
)
assert result.class_number == "1"
assert result.invariant_factors == ()
assert result.generator_order_witnesses == ()
assert result.generators.evidence == {"entries": []}
assert result.transforms.terminal_status == "smith-and-hnf-complete"
assert result.generators.terminal_status == "class-group-gen-complete"
assert result.generators.transforms_sha256 == m.canonical_component_sha256(
    result.transforms.evidence
)
assert result.native_state == (
    "0","2","3","1","6","18","4","20","1","0","0","0","6","6","12","36"
)
for name, changed in (
    ("relation", [1,0,1,0,0,1]),
    ("full_hnf", [1,0,1,0,0,1]),
    ("hnf_transform", [2,0,0,0,1,0,0,0,1]),
):
    arguments = dict(
        run_id="live-prefix", owner_generation=4, candidate_sha256="a" * 64,
        relation=relation, rows=2, columns=3, full_hnf=relation,
        hnf_transform=[1,0,0,0,1,0,0,0,1],
    )
    arguments[name] = changed
    try:
        m.build_live_h1_class_witness_suffix(**arguments)
    except m.LiveH1ClassWitnessFailure:
        pass
    else:
        raise AssertionError(name + " mutation was accepted")
print({"class_number": 1, "generators": 0, "order_witnesses": 0})
`;

(async () => {
  const built = await compileKernel({
    sourcePath: path.join(__dirname, "live_h1_class_witness_suffix.py"),
  });
  const kernel = require(built.modulePath).pari_live_h1_class_witness_suffix;
  assert(kernel.nativeAvailable);
  const summary = { backends: [], mutationsRejected: 0, transactionalRejections: 0 };
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const integer = entries => backend === "javascript"
      ? entries.map(BigInt)
      : kernel.createIntegerBuffer(entries.length, 512, entries.map(BigInt));
    const success = inputs(integer);
    assert.equal(kernel[backend](...success.args), 0n);
    assert.deepEqual(success.state, [
      0n, 2n, 3n, 1n, 6n, 18n, 4n, 20n,
      1n, 0n, 0n, 0n, 6n, 6n, 12n, 36n,
    ]);
    assert.deepEqual(values(success.published[0]), [1n, 0n, 0n, 1n]);
    assert.deepEqual(values(success.published[1]), [1n, 0n, 0n, 1n]);
    assert.deepEqual(values(success.relationPublished[0]), [0n, 1n, 0n, 0n, 0n, 1n]);

    for (const mode of ["relation", "hnf", "transform", "nontrivial"]) {
      const rejected = inputs(integer, mode);
      const before = [
        ...rejected.published.map(owner => values(owner).slice()),
        ...rejected.relationPublished.map(owner => values(owner).slice()),
        rejected.state.slice(),
      ];
      assert.notEqual(kernel[backend](...rejected.args), 0n, mode);
      const after = [
        ...rejected.published.map(owner => values(owner)),
        ...rejected.relationPublished.map(owner => values(owner)),
        rejected.state,
      ];
      assert.deepEqual(after, before, `${backend} ${mode} published partial output`);
      summary.mutationsRejected += 1;
      summary.transactionalRejections += 1;
    }
    summary.backends.push(backend);
  }
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert.doesNotMatch(core, /napi_call_function|PyObject_Call|v8::/);
  const dynamic = spawnSync("/usr/bin/python3", ["-c", python, root], {
    cwd: root, encoding: "utf8", timeout: 120000,
  });
  assert.equal(dynamic.status, 0, dynamic.stderr || String(dynamic.error));
  console.log(JSON.stringify({ ...summary, dynamic: dynamic.stdout.trim() }));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
