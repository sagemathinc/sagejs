#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = path.resolve(__dirname, "../..");
const resident = path.resolve(
  process.argv[2] || "/tmp/sagejs-resident-generated-class-3qtnS5/output.json",
);

function inputs(integer, mutated = false) {
  const int64 = (values) => values.map(BigInt);
  const presentation = integer([mutated ? 2 : 1, 0, 1, 1]);
  const identity = integer([1, 0, 0, 1]);
  const right = integer([1, 0, -1, 1]);
  return {
    args: [
      presentation,
      2n,
      identity,
      identity,
      identity,
      right,
      presentation,
      int64([0, 0, 0, 0, 0, 0, 12]),
      int64(Array(9).fill(77)),
    ],
  };
}

const python = String.raw`
import copy
import importlib
import sys

sys.path.extend([sys.argv[1] + "/src/lib"])
m = importlib.import_module("bench.pari-class-group-port.h1_live_class_binding")
h1 = importlib.import_module("bench.pari-class-group-port.class_group_h1_correspondence")
final = importlib.import_module("bench.pari-class-group-port.class_group_final_state")

source = h1.build_h1_class_correspondence(sys.argv[2])
witness = source["smith_witness"]
n = 8

def integers(name):
    return [int(value) for value in witness[name]]

def row_major(name):
    values = integers(name)
    return [
        str(values[column * n + row])
        for row in range(n)
        for column in range(n)
    ]

identity = [str(int(row == column)) for row in range(n) for column in range(n)]
evidence = {
    "shape": ["8", "8"],
    "presentation": row_major("presentation"),
    "left": row_major("left"),
    "left_inverse": row_major("left_inverse"),
    "right": row_major("right"),
    "right_inverse": row_major("right_inverse"),
    "diagonal": row_major("diagonal"),
    "relation_to_presentation_shape": ["8", "8"],
    "relation_to_presentation": identity,
    "presentation_to_relation_shape": ["8", "8"],
    "presentation_to_relation": identity,
}
transforms = final.TransformComponentOutput(
    "live-owner-run", 11, "smith-and-hnf-complete", "a" * 64, evidence
)
owners = {
    "presentation": integers("presentation"),
    "smith": integers("diagonal"),
    "left": integers("left"),
    "left_inverse": integers("left_inverse"),
    "right": integers("right"),
    "right_inverse": integers("right_inverse"),
    "smith_state": integers("state"),
}
binding = m.build_live_h1_class_binding(transforms, **owners)
assert binding.schema == m.SCHEMA
assert binding.proof_tier == "upstream-assumed-pari-correspondence"
assert binding.class_correspondence_complete is True
assert binding.public_class_complete is False
assert binding.public_class_unit_complete is False
assert len(binding.upstream_assumptions) == 4
assert binding.native_state == ("0", "8", "64", "64", "320", "0", "1", "0", "0")
assert binding.class_generators.terminal_status == "class-group-gen-complete"
assert binding.class_generators.candidate_sha256 == "a" * 64
assert binding.class_generators.evidence == {"entries": []}
payload = m.detached_live_h1_class_binding(binding)
assert m.replay_live_h1_class_binding(payload, transforms, **owners) == binding

def rejected(changed_payload=payload, changed_transforms=transforms, changed_owners=owners):
    try:
        m.replay_live_h1_class_binding(
            changed_payload, changed_transforms, **changed_owners
        )
    except m.LiveH1ClassBindingFailure:
        return
    raise AssertionError("mutated live h1 binding was accepted")

payload_mutations = [
    lambda value: value.__setitem__("proof_tier", "certified"),
    lambda value: value.__setitem__("class_correspondence_complete", False),
    lambda value: value.__setitem__("public_class_complete", True),
    lambda value: value["class_generators"]["evidence"]["entries"].append({"fake": "1"}),
    lambda value: value["upstream_assumptions"].pop(),
    lambda value: value["native_state"].__setitem__(6, "2"),
]
for mutation in payload_mutations:
    changed = copy.deepcopy(payload)
    mutation(changed)
    rejected(changed_payload=changed)

for name, index in (
    ("presentation", 0),
    ("smith", 0),
    ("left", 0),
    ("left_inverse", 0),
    ("right", 0),
    ("right_inverse", 0),
    ("smith_state", 1),
):
    changed = copy.deepcopy(owners)
    changed[name][index] += 1
    rejected(changed_owners=changed)

changed_evidence = copy.deepcopy(evidence)
changed_evidence["left"][0] = "2"
changed_transforms = final.TransformComponentOutput(
    "live-owner-run", 11, "smith-and-hnf-complete", "a" * 64, changed_evidence
)
rejected(changed_transforms=changed_transforms)

print({
    "class_number": 1,
    "class_generators": 0,
    "generator_order_witnesses": 0,
    "owner_sha256": binding.owner_sha256,
    "payload_mutations_rejected": len(payload_mutations),
    "owner_mutations_rejected": 8,
})
`;

(async () => {
  const built = await compileKernel({
    sourcePath: path.join(__dirname, "h1_live_class_binding.py"),
  });
  const kernel = require(built.modulePath).pari_bind_live_h1_class_state;
  assert(kernel.nativeAvailable);
  const summary = { backends: [], nativeMutationsRejected: 0 };
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const make = (values) =>
      backend === "javascript"
        ? values.map(BigInt)
        : kernel.createIntegerBuffer(values.length, 512, values.map(BigInt));
    const { args } = inputs(make);
    assert.equal(kernel[backend](...args), 0n);
    assert.deepEqual(args[8], [0n, 2n, 4n, 4n, 20n, 0n, 1n, 0n, 0n]);

    const rejected = inputs(make, true);
    const before = rejected.args[8].slice();
    assert.equal(kernel[backend](...rejected.args), -1n);
    assert.deepEqual(rejected.args[8], before);
    summary.nativeMutationsRejected += 1;
    summary.backends.push(backend);
  }
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert.doesNotMatch(core, /napi_call_function|PyObject_Call|v8::/);

  const result = spawnSync("/usr/bin/python3", ["-c", python, root, resident], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 180000,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  console.log(JSON.stringify({ ...summary, replay: result.stdout.trim() }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
