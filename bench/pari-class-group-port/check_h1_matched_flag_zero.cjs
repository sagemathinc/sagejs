#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux
//
// The default mode is intentionally source-only.  `--pari` compiles the
// source-instrumented pinned PARI control and is reserved for an admitted
// heavyweight validation slot.  The native differential mode will be added
// after that slot validates the isolated post-bridge root.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  ARCHIVE_SHA256,
  BUCH2_SHA256,
  buildAndRun,
  instrument,
} = require("./h1_matched_flag_zero_control.cjs");

const directory = __dirname;
const sourcePath = path.join(directory, "h1_matched_flag_zero.py");
const suffixPath = path.join(directory, "unified_full_h1_root.py");
const completePath = path.join(directory, "pari_unified_complete_h1_root.py");
const archive = process.env.SAGEJS_PARI_ARCHIVE || "/home/user/upstream/pari-2.17.4.tar.gz";

function run(command, args, options = {}) {
  const answer = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 240_000,
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  assert.equal(answer.status, 0, answer.stderr || String(answer.error));
  return answer.stdout;
}

function staticSourceAudit() {
  const source = fs.readFileSync(sourcePath, "utf8");
  const nativeBody = source.slice(source.indexOf("@native"));
  assert.match(source, /def pari_h1_compact_flag_zero_root\(/);
  assert.equal(
    [...nativeBody.matchAll(/pari_getfu_signed_real_cubic\(/g)].length,
    1,
    "the matched root must contain exactly one getfu call",
  );
  assert.doesNotMatch(source, /from .* import pari_live_retrying_h1_suffix/);
  assert.doesNotMatch(nativeBody, /pari_live_retrying_h1_suffix\(/);
  assert.doesNotMatch(nativeBody, /2304|2_304|precision_resource_cap/);
  assert.match(source, /if status != 0 and status != 3:/);
  assert.match(nativeBody, /for i in range\(12\):\n        root_state\[i\] = 0/);
  assert.doesNotMatch(nativeBody, /root_state\[5\] =/);
  assert.doesNotMatch(nativeBody, /root_state\[6\] =/);
  assert.match(source, /"public_complete": False/);

  // The stronger exact replay remains a distinct public native post-pass. Its
  // first stage reconstructs relation units from the compact provenance owner;
  // it is not mislabeled as matched flag-zero work.
  const suffix = fs.readFileSync(suffixPath, "utf8");
  assert.match(suffix, /def pari_live_retrying_h1_suffix\(/);
  assert.match(
    suffix,
    /compact_provenance\[compact_factor_count \* unit \+ factor\]/,
  );
  assert.match(suffix, /while current_precision <= precision_resource_cap:/);
  const complete = fs.readFileSync(completePath, "utf8");
  assert.match(complete, /precision_status = pari_live_retrying_h1_suffix\(/);

  const pristine = run("tar", [
    "-xOf",
    archive,
    "pari-2.17.4/src/basemath/buch2.c",
  ]);
  const derived = instrument(pristine);
  const relationHook = derived.indexOf("matched_relation_prefix(nf,&F,&cache,mat");
  const hnf = derived.indexOf("W = hnfspec_i(mat", relationHook);
  assert(relationHook >= 0 && hnf > relationHook);
  assert(!derived.slice(relationHook, hnf).includes("hnfspec_i("));
  const getfu = derived.indexOf("fu = getfu(nf, &A, CU? &U: NULL, PREC);");
  const compactHook = derived.indexOf("matched_compact(A,U,R,fu,PREC);", getfu);
  assert(getfu >= 0 && compactHook > getfu);
  assert.equal(
    [...derived.slice(getfu, compactHook).matchAll(/getfu\(nf/g)].length,
    1,
  );
  return { instrumentedBytes: Buffer.byteLength(derived) };
}

function serializerMutationAudit() {
  const script = String.raw`
import importlib.util, json, pathlib, sys, types

path = pathlib.Path(sys.argv[1])
pkg = types.ModuleType("matched_fixture")
pkg.__path__ = [str(path.parent)]
sys.modules[pkg.__name__] = pkg
native = types.ModuleType("sagejs.native")
native.IntegerBuffer = list
native.Int64Buffer = list
native.native = lambda function: function
sagejs = types.ModuleType("sagejs")
sagejs.__path__ = []
sys.modules["sagejs"] = sagejs
sys.modules["sagejs.native"] = native
unit = types.ModuleType("matched_fixture.unit_reconstruction_signed")
unit.calls = []
def fake_getfu(*args):
  unit.calls.append(list(args[3]))
  args[24][0] = 3
  return 3
unit.pari_getfu_signed_real_cubic = fake_getfu
sys.modules[unit.__name__] = unit
spec = importlib.util.spec_from_file_location("matched_fixture.h1_matched_flag_zero", path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

counters = {
  "catalog_entries": 1230, "degree_groups": 1833, "factor_slots": 2270,
  "C1": 333, "C2": 333, "KC": 66, "KCZ": 48, "KCZ2": 48,
  "decomposition_calls": 48, "descriptors": 66, "subfactor_trials": 4,
  "initial_relations": 12, "accepted_relations": 73, "visited_ideals": 16,
  "small_elements": 1046, "factor_attempts": 96, "random_relations": 0,
}
relation = dict(
  field_id="3.3.h1", run_id="seed-1", relation_count=73,
  relation_width=66, relations=list(range(73 * 66)), generator_count=73,
  generator_degree=3, generators=list(range(73 * 3)), counters=counters,
  terminal_rng_state=list(range(66)),
)
first = module.serialize_pre_hnf_relation_prefix(**relation)
second = module.serialize_pre_hnf_relation_prefix(**relation)
assert first == second
assert first["payload"]["relation_layout"] == "column-major"
assert len(first["payload"]["relations"]) == 73
assert len(first["payload"]["relations"][0]) == 66
mutated = dict(relation)
mutated["relations"] = list(relation["relations"])
mutated["relations"][333] += 1
assert module.serialize_pre_hnf_relation_prefix(**mutated)["sha256"] != first["sha256"]
mutated = dict(relation)
mutated["terminal_rng_state"] = list(relation["terminal_rng_state"])
mutated["terminal_rng_state"][-1] += 1
assert module.serialize_pre_hnf_relation_prefix(**mutated)["sha256"] != first["sha256"]
for key in ("terminal_rng_state", "counters"):
  bad = dict(relation); bad[key] = [] if key == "terminal_rng_state" else {}
  try: module.serialize_pre_hnf_relation_prefix(**bad)
  except ValueError: pass
  else: raise AssertionError("missing relation authority accepted: " + key)

root = [0, 1, 3, 192, 1, 0, 0, 7, 73, 8, 0, 1]
compact = dict(
  field_id="3.3.h1", run_id="seed-1", relation_prefix_sha256=first["sha256"],
  compact_factor_count=7, compact_provenance=list(range(14)),
  clean_logs=list(range(18)), clean_phases=[0, 0, 1, 1, 1, 1],
  getfu_factor=[1, 0, 0, 1], getfu_state=[3, 0, 0, 0, 0, 0, 0, 0],
  root_state=root, terminal_rng_state=list(range(66)),
)
out = module.serialize_compact_flag_zero_output(**compact)
assert out["payload"]["getfu"]["status"] == "not_given(PRECI)"
assert out["payload"]["assumptions"]["public_complete"] is False
for index in (4, 5, 6, 10, 11):
  bad = dict(compact); bad["root_state"] = list(root); bad["root_state"][index] += 1
  try: module.serialize_compact_flag_zero_output(**bad)
  except ValueError: pass
  else: raise AssertionError("mutated root state accepted: " + str(index))
bad = dict(compact); bad["getfu_state"] = [2, 0, 0, 0, 0, 0, 0, 0]
try: module.serialize_compact_flag_zero_output(**bad)
except ValueError: pass
else: raise AssertionError("unexpected getfu status accepted")

# Execute the same ordinary-Python native body with a fake signed-getfu leaf.
# This proves authority rejection, one-call behavior, PRECI acceptance, and the
# embedding-row-major to basis-column-major transpose before native lowering.
unified = [0, 0, 0, 1, 0, 7, 73, 8, 48, 48, 2, 7]
bridge = [0, 0, 0, 0, 0, 7, 1, 0, 73, 8, 48, 48, 2, 7, 7, 0]
hnf = [0, 7, 66, 0, 7, 8, 0, 73, 0]
assembly = [8, 0, 15, 8, 58, 0]
embedding = list(range(27))
buffers = [
  [0] * 27, [0] * 18, [0] * 18, [0] * 18, [0] * 6, [0] * 18,
  [0] * 27, [0] * 18, [0] * 18, [0] * 6, [0] * 9, [0] * 3,
  [0] * 6, [0] * 4, [991] * 6, [991] * 18, [1] * 6, [991] * 4,
  [0] * 8, [0] * 3, [0] * 64, [0] * 64, [0] * 64, [0] * 64,
  [0] * 64, [0] * 128, [0] * 12,
]
status = module.pari_h1_compact_flag_zero_root(
  unified, bridge, hnf, assembly, embedding, [0] * 27, [0] * 18,
  [0] * 6, [1, 0, 0, 1], list(range(14)), *buffers,
)
assert status == 0 and len(unit.calls) == 1
assert buffers[-1] == [0, 1, 3, 192, 1, 0, 0, 7, 73, 8, 0, 1]
expected_embedding = []
for column in range(3):
  for row in range(3):
    expected_embedding.extend(embedding[3 * (3 * row + column):3 * (3 * row + column) + 3])
assert unit.calls[0] == expected_embedding
unit.calls.clear()
bad_unified = list(unified); bad_unified[4] = 1
bad_root = [0] * 12
bad_buffers = [list(value) for value in buffers[:-1]] + [bad_root]
status = module.pari_h1_compact_flag_zero_root(
  bad_unified, bridge, hnf, assembly, embedding, [0] * 27, [0] * 18,
  [0] * 6, [1, 0, 0, 1], list(range(14)), *bad_buffers,
)
assert status == 1 and unit.calls == [] and bad_root[11] == 0
print(json.dumps({"relationSha256": first["sha256"], "compactSha256": out["sha256"]}))
`;
  return JSON.parse(run("python3", ["-c", script, sourcePath]).trim());
}

function main() {
  const source = staticSourceAudit();
  const serializers = serializerMutationAudit();
  const receipt = {
    schema: "sagejs.pari-class-group/h1-matched-flag-zero-static-v1",
    boundary: "prepared H1 through one compact p192 getfu attempt",
    strongerExactReplay: "separate callable post-pass",
    publicComplete: false,
    pari: {
      version: "2.17.4",
      archiveSha256: ARCHIVE_SHA256,
      pristineBuch2Sha256: BUCH2_SHA256,
      instrumentedBytes: source.instrumentedBytes,
    },
    serializers,
  };
  if (process.argv.includes("--pari")) receipt.control = buildAndRun();
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
