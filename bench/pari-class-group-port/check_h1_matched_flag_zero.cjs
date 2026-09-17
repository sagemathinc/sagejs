#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux
//
// The default mode is intentionally source-only.  `--pari` compiles the
// source-instrumented pinned PARI control and is reserved for an admitted
// heavyweight validation slot. `--native INPUT` runs the isolated post-bridge
// differential; `--owners OUTPUT --pari` proves canonical relation-owner
// agreement at the pre-HNF cut.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const {
  ARCHIVE_SHA256,
  BUCH2_SHA256,
  buildAndRun,
  instrument,
  instrumentAdaptedRelation,
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
  const adapted = instrumentAdaptedRelation(pristine);
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
  assert.match(adapted, /matched_ideals_visited\+\+/);
  assert.match(adapted, /small_norm\(&cache,&F,nf,BNF_RELPID,fact,0\)/);
  assert.match(adapted, /long initial=cache\.last-cache\.base/);
  assert.match(adapted, /mr_logs\(C\)/);
  assert.doesNotMatch(adapted.slice(adapted.lastIndexOf("int main(void)")), /hnfspec_i\(/);
  return {
    instrumentedBytes: Buffer.byteLength(derived),
    adaptedRelationBytes: Buffer.byteLength(adapted),
  };
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
  relation_width=66, relations=list(range(73 * 66)),
  factor_descriptor_count=66, factor_descriptor_degree=3,
  factor_descriptors=list(range(66 * 10)), generator_count=73,
  generator_degree=3, generators=list(range(73 * 3)), counters=counters,
  metadata_count=73, metadata_width=3,
  relation_metadata=list(range(73 * 3)), log_count=73,
  log_place_count=3, log_embeddings=list(range(73 * 3 * 7)),
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
for owner, index in (("factor_descriptors", 33), ("relation_metadata", 44), ("log_embeddings", 55)):
  mutated = dict(relation)
  mutated[owner] = list(relation[owner])
  mutated[owner][index] += 1
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

function authenticatedRelationAgreement(ownerPath, relationRecord) {
  const script = String.raw`
import importlib.util, json, pathlib, sys, types

source = pathlib.Path(sys.argv[1])
owner_path = pathlib.Path(sys.argv[2])
pkg = types.ModuleType("matched_owner_fixture")
pkg.__path__ = [str(source.parent)]
sys.modules[pkg.__name__] = pkg
native = types.ModuleType("sagejs.native")
native.IntegerBuffer = list
native.Int64Buffer = list
native.native = lambda function: function
sagejs = types.ModuleType("sagejs")
sagejs.__path__ = []
sys.modules["sagejs"] = sagejs
sys.modules["sagejs.native"] = native
unit = types.ModuleType("matched_owner_fixture.unit_reconstruction_signed")
unit.pari_getfu_signed_real_cubic = lambda *args: 3
sys.modules[unit.__name__] = unit
spec = importlib.util.spec_from_file_location(
    "matched_owner_fixture.h1_matched_flag_zero", source
)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

sage = json.loads(owner_path.read_text())
pari = json.load(sys.stdin)
assert pari["kind"] == "relation-prefix"

sage_descriptors = []
for factor in range(66):
    sage_descriptors.extend([sage["packet_norms"][factor]])
    sage_descriptors.extend(sage["packet_ideals"][9 * factor : 9 * (factor + 1)])
pari_descriptors = [value for descriptor in pari["factorDescriptors"] for value in descriptor]
pari_logs = [value for packed in pari["logs"] for value in packed]

pairs = {
    "factor_descriptors": (sage_descriptors, pari_descriptors),
    "relations": (sage["relation_records"][: 73 * 66], pari["relations"]),
    "generators": (sage["generators"][: 73 * 3], pari["generators"]),
    "relation_metadata": (sage["relation_metadata"][: 73 * 3], pari["metadata"]),
    "log_embeddings": (sage["log_embeddings"][: 73 * 3 * 7], pari_logs),
    "terminal_rng_state": (sage["prep_kummer_random_state"], pari["terminalRngState"]),
}
for name, (left, right) in pairs.items():
    left = [str(value) for value in left]
    right = [str(value) for value in right]
    if left != right:
        mismatch = next((index for index, values in enumerate(zip(left, right)) if values[0] != values[1]), min(len(left), len(right)))
        raise AssertionError(f"{name} mismatch at {mismatch}: {left[mismatch:mismatch+1]} != {right[mismatch:mismatch+1]}")

sage_counters = {
    "catalog_entries": sage["prep_degree_state"][1],
    "degree_groups": sage["prep_degree_state"][2],
    "factor_slots": sage["prep_degree_state"][3],
    "C1": sage["prep_base_state"][0], "C2": sage["prep_base_state"][1],
    "KC": sage["prep_base_state"][2], "KCZ": sage["prep_base_state"][3],
    "KCZ2": sage["prep_base_state"][4],
    "decomposition_calls": sage["prep_kummer_state"][2],
    "descriptors": sage["prep_kummer_state"][3],
    "subfactor_trials": sage["prep_sub_state"][0],
    "initial_relations": 12,
    "accepted_relations": sage["relation_state"][0],
    "visited_ideals": 16,
    "small_elements": sage["counters"][1],
    "factor_attempts": sage["progress"][1],
    "random_relations": sage["counters"][3],
}
name_map = {
    "catalogEntries": "catalog_entries", "degreeGroups": "degree_groups",
    "factorSlots": "factor_slots", "decompositionCalls": "decomposition_calls",
    "subfactorTrials": "subfactor_trials", "initialRelations": "initial_relations",
    "acceptedRelations": "accepted_relations", "visitedIdeals": "visited_ideals",
    "smallElements": "small_elements", "factorAttempts": "factor_attempts",
    "randomRelations": "random_relations",
}
pari_counters = {name_map.get(key, key): value for key, value in pari["counters"].items()}
assert {key: str(value) for key, value in sage_counters.items()} == {
    key: str(value) for key, value in pari_counters.items()
}

common = dict(
    field_id="x^3-20018*x+20034", run_id="seed-1",
    relation_count=73, relation_width=66,
    factor_descriptor_count=66, factor_descriptor_degree=3,
    generator_count=73, generator_degree=3,
    metadata_count=73, metadata_width=3,
    log_count=73, log_place_count=3,
)
sage_record = module.serialize_pre_hnf_relation_prefix(
    **common,
    relations=sage["relation_records"][: 73 * 66],
    factor_descriptors=sage_descriptors,
    generators=sage["generators"][: 73 * 3],
    relation_metadata=sage["relation_metadata"][: 73 * 3],
    log_embeddings=sage["log_embeddings"][: 73 * 3 * 7],
    counters=sage_counters,
    terminal_rng_state=sage["prep_kummer_random_state"],
)
pari_record = module.serialize_pre_hnf_relation_prefix(
    **common,
    relations=pari["relations"],
    factor_descriptors=pari_descriptors,
    generators=pari["generators"],
    relation_metadata=pari["metadata"],
    log_embeddings=pari_logs,
    counters=pari_counters,
    terminal_rng_state=pari["terminalRngState"],
)
assert sage_record == pari_record
print(json.dumps({
    "ownerPath": str(owner_path.resolve()),
    "sha256": sage_record["sha256"],
    "counts": {name: len(left) for name, (left, right) in pairs.items()},
    "counters": sage_record["payload"]["counters"],
}))
`;
  return JSON.parse(run("python3", ["-c", script, sourcePath, ownerPath], {
    input: JSON.stringify(relationRecord),
  }).trim());
}

function signature(source, entry) {
  const match = source.match(new RegExp(`def ${entry}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing ${entry} signature`);
  return match[1].trim().split("\n")
    .map((line) => line.trim().replace(/,$/, "").split(": "));
}

function values(value) {
  return Array.isArray(value) ? value : value.toArray ? value.toArray() : Array.from(value);
}

function allocatePostInputs(live, names, fill = 0n) {
  const sizes = {
    embedding_packed: 27, matep: 18, transformed_arch: 18,
    transformed_clean: 18, transformed_phases: 6, exponential_values: 18,
    solve_work: 27, solve_rhs: 18, solved: 18, rounded: 6,
    multiplication: 9, inverse: 3, candidate_units: 6,
    normalized_factor: 4, output_units: 6, output_logs: 18,
    output_phases: 6, output_factor: 4, getfu_state: 8, pivots: 3,
    exp_cache: 64, exp_a: 64, exp_b: 64, exp_p: 64, exp_q: 64,
    exp_stack: 128, root_state: 12,
  };
  const aliases = {
    multiplication_tensor: "basis_table",
    clean_phases: "signs",
  };
  const answer = {};
  for (const [name, kind] of names) {
    const liveName = aliases[name] || name;
    if (Object.hasOwn(live, liveName)) {
      answer[name] = structuredClone(live[liveName]);
      continue;
    }
    assert(Number.isInteger(sizes[name]), `missing post-bridge size for ${name}`);
    const sentinel = name.startsWith("output_") ? 991n : fill;
    answer[name] = Array(sizes[name]).fill(kind === "Float64Buffer" ? Number(sentinel) : sentinel);
  }
  return answer;
}

function nativeizePost(post, names, fn) {
  const answer = {};
  for (const [name, kind] of names) {
    const data = post[name];
    if (!kind.endsWith("Buffer")) answer[name] = data;
    else if (kind === "Int64Buffer") answer[name] = fn.createInt64Buffer(data.map(BigInt));
    else if (kind === "Float64Buffer") answer[name] = fn.createFloat64Buffer(data.map(Number));
    else answer[name] = fn.createIntegerBuffer(data.length, 4096, data.map(BigInt));
  }
  return answer;
}

async function nativeDifferential(inputPath) {
  const compilerPath = process.env.SAGEJS_REPLAY_RUNTIME_ROOT
    ? path.join(process.env.SAGEJS_REPLAY_RUNTIME_ROOT, "tools/native-kernel/compiler.cjs")
    : "../../tools/native-kernel/compiler.cjs";
  const { compileKernel } = require(compilerPath);
  const livePath = path.join(directory, "unified_live_h1_root.py");
  const liveSource = fs.readFileSync(livePath, "utf8");
  const liveNames = signature(liveSource, "pari_unified_live_h1_root");
  const bridgeChecker = fs.readFileSync(path.join(directory, "check_live_h1_owner_bridge.cjs"), "utf8");
  const sizesLiteral = bridgeChecker.match(/const sizes = (\{[\s\S]*?\n\});/);
  assert(sizesLiteral, "missing bridge workspace size contract");
  const bridgeSizes = vm.runInNewContext(`(${sizesLiteral[1]})`, { columnCapacity: 16 });
  const candidate = JSON.parse(fs.readFileSync(inputPath, "utf8")).input;
  const live = {};
  for (const [name, kind] of liveNames) {
    if (Object.hasOwn(candidate, name)) live[name] = structuredClone(candidate[name]);
    else {
      const size = name === "unified_state" ? 12 : bridgeSizes[name];
      assert(Number.isInteger(size), `missing live workspace size for ${name}`);
      live[name] = Array(size).fill(0);
    }
    if (Array.isArray(live[name])) {
      live[name] = kind === "Float64Buffer"
        ? live[name].map(Number)
        : live[name].map(BigInt);
    } else if (kind === "float") live[name] = Number(live[name]);
    else if (kind === "bool") live[name] = Boolean(live[name]);
    else live[name] = BigInt(live[name]);
  }

  const liveBuilt = await compileKernel({ sourcePath: livePath });
  const liveFunction = require(liveBuilt.modulePath).pari_unified_live_h1_root;
  assert(liveFunction.nativeAvailable);
  assert.equal(liveFunction.gmp(...liveNames.map(([name]) => live[name])), 0n);
  assert.deepEqual(values(live.unified_state).map(BigInt), [
    0n, 0n, 0n, 1n, 0n, 7n, 73n, 8n, 48n, 48n, 2n, 7n,
  ]);

  const postSource = fs.readFileSync(sourcePath, "utf8");
  const postNames = signature(postSource, "pari_h1_compact_flag_zero_root");
  const postBuilt = await compileKernel({ sourcePath });
  const postFunction = require(postBuilt.modulePath).pari_h1_compact_flag_zero_root;
  assert(postFunction.nativeAvailable);
  const core = fs.readFileSync(postBuilt.coreSourcePath, "utf8");
  assert.match(core, /pari_getfu_signed_real_cubic/);
  assert.doesNotMatch(core, /pari_live_retrying_h1_suffix|precision_resource_cap/);

  const snapshots = {};
  for (const backend of ["javascript", "gmp"]) {
    const plainPost = allocatePostInputs(live, postNames);
    const post = backend === "gmp"
      ? nativeizePost(plainPost, postNames, postFunction)
      : plainPost;
    const compactBefore = JSON.stringify({
      clean: values(post.clean_logs).map(String), phases: values(post.clean_phases).map(String),
      factor: values(post.getfu_factor).map(String),
      provenance: values(post.compact_provenance).map(String),
    });
    assert.equal(postFunction[backend](...postNames.map(([name]) => post[name])), 0n);
    const root = values(post.root_state).map(BigInt);
    const state = values(post.getfu_state).map(BigInt);
    assert.deepEqual(root, [0n, 1n, 3n, 192n, 1n, 0n, 0n, 7n, 73n, 8n, 0n, 1n]);
    assert.equal(state[0], 3n);
    assert.equal(JSON.stringify({
      clean: values(post.clean_logs).map(String), phases: values(post.clean_phases).map(String),
      factor: values(post.getfu_factor).map(String),
      provenance: values(post.compact_provenance).map(String),
    }), compactBefore, `${backend} mutated authenticated compact owners`);
    for (const name of ["output_units", "output_logs", "output_factor"])
      assert(values(post[name]).every((value) => BigInt(value) === 991n));
    assert(values(post.output_phases).every((value) => BigInt(value) === 991n));
    snapshots[backend] = { root: root.map(String), getfu: state.map(String) };
  }
  assert.deepEqual(snapshots.gmp, snapshots.javascript);

  for (const [owner, index] of [
    ["unified_state", 4], ["bridge_state", 15], ["hnf_state", 0],
    ["hnf_assembly_state", 5],
  ]) {
    const plainPost = allocatePostInputs(live, postNames);
    plainPost[owner][index] = 1n;
    const post = nativeizePost(plainPost, postNames, postFunction);
    assert.equal(postFunction.gmp(...postNames.map(([name]) => post[name])), 1n, owner);
    assert.equal(BigInt(values(post.root_state)[11]), 0n, owner);
  }
  return {
    inputPath: path.resolve(inputPath),
    liveCacheKey: liveBuilt.cacheKey,
    postCacheKey: postBuilt.cacheKey,
    postCoreSha256: require("node:crypto").createHash("sha256").update(core).digest("hex"),
    backends: snapshots,
    publicComplete: false,
  };
}

async function main() {
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
      adaptedRelationBytes: source.adaptedRelationBytes,
    },
    serializers,
  };
  if (process.argv.includes("--pari")) receipt.control = buildAndRun();
  const ownersIndex = process.argv.indexOf("--owners");
  if (ownersIndex >= 0) {
    assert(receipt.control, "--owners requires --pari");
    assert(process.argv[ownersIndex + 1], "--owners needs authenticated output.json");
    receipt.relationAgreement = authenticatedRelationAgreement(
      process.argv[ownersIndex + 1],
      receipt.control.records[0],
    );
  }
  const nativeIndex = process.argv.indexOf("--native");
  if (nativeIndex >= 0) {
    assert(process.argv[nativeIndex + 1], "--native needs sanitized inputs.json");
    receipt.native = await nativeDifferential(process.argv[nativeIndex + 1]);
  }
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
