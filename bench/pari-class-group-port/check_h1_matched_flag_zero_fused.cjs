#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux
//
// The default mode is deliberately source-only. The admitted `--native`
// differential is enabled only after the integration coordinator grants a
// heavyweight build slot.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const {
  loadThinCachedKernel,
  sha256File,
  signatureSha256,
} = require("../../tools/native-kernel/thin-cache-loader.cjs");

const directory = __dirname;
const fusedPath = path.join(directory, "h1_matched_flag_zero_fused.py");
const livePath = path.join(directory, "unified_live_h1_root.py");
const compactPath = path.join(directory, "h1_matched_flag_zero.py");
const exactSuffixPath = path.join(directory, "unified_full_h1_root.py");
const entry = "pari_fused_h1_matched_flag_zero_root";
const liveEntry = "pari_unified_live_h1_root";
const compactEntry = "pari_h1_compact_flag_zero_root";
const FUSED_SOURCE_SHA256 = "bec6c2fb1c17ba44b3d25ca43e06130ae667548d75e899ee5b87096ebd906a9a";
const FUSED_CACHE_KEY = "2a65d69bf9c475e1378673d9829ffed16ba84dea4e503a7668b4ba59b970e6f1";
const FUSED_CORE_SHA256 = "7cd618f435f215f520a92798fc44594dda83c3143b5af34045296ca7d29d33ae";
const FUSED_ADDON_SHA256 = "6f6198906aba59940a994ee8aeff6e79e43e956690c9235060c59cb7e52d7251";
const FUSED_MANIFEST_SHA256 = "2e17ea617106bcfe30d64e35bde06b1649d49d034bc2540c9aa28104ba592235";
const FUSED_SIGNATURE_SHA256 = "127398018f82c3171e40b25a9d5dbbcb5f4661437395dda53203952c8d3eaf81";
const aliases = Object.freeze({
  multiplication_tensor: "basis_table",
  clean_phases: "signs",
});

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

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function signature(source, functionName) {
  const match = source.match(new RegExp(`def ${functionName}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing ${functionName} signature`);
  return match[1].trim().split("\n").map((line) => {
    const [name, kind] = line.trim().replace(/,$/, "").split(": ");
    assert(name && kind, `malformed parameter: ${line}`);
    return [name, kind];
  });
}

function callArguments(source, functionName) {
  const marker = `${functionName}(`;
  const start = source.indexOf(marker, source.indexOf(`def ${entry}(`));
  assert(start >= 0, `missing ${functionName} call`);
  let depth = 0;
  let end = -1;
  for (let index = start + functionName.length; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") {
      depth -= 1;
      if (depth === 0) { end = index; break; }
    }
  }
  assert(end > start, `unterminated ${functionName} call`);
  return source.slice(start + marker.length, end).trim().split("\n")
    .map((line) => line.trim().replace(/,$/, ""));
}

function expectedFusedParameters(live, compact) {
  const answer = [...live];
  const present = new Set(live.map(([name]) => name));
  for (const [name, kind] of compact) {
    const mapped = aliases[name] || name;
    if (!present.has(mapped)) {
      answer.push([mapped, kind]);
      present.add(mapped);
    }
  }
  return answer;
}

function staticAudit() {
  const fused = fs.readFileSync(fusedPath, "utf8");
  const live = fs.readFileSync(livePath, "utf8");
  const compact = fs.readFileSync(compactPath, "utf8");
  const exactSuffix = fs.readFileSync(exactSuffixPath, "utf8");
  const fusedNames = signature(fused, entry);
  const liveNames = signature(live, liveEntry);
  const compactNames = signature(compact, compactEntry);
  const expected = expectedFusedParameters(liveNames, compactNames);
  assert.deepEqual(fusedNames, expected);
  assert.equal(liveNames.length, 433);
  assert.equal(compactNames.length, 37);
  assert.equal(fusedNames.length, 460);

  assert.deepEqual(callArguments(fused, liveEntry), liveNames.map(([name]) => name));
  assert.deepEqual(
    callArguments(fused, compactEntry),
    compactNames.map(([name]) => aliases[name] || name),
  );
  assert.equal([...fused.matchAll(new RegExp(`${liveEntry}\\(`, "g"))].length, 1);
  assert.equal([...fused.matchAll(new RegExp(`${compactEntry}\\(`, "g"))].length, 1);
  assert.match(fused, /for index in range\(12\):\n        root_state\[index\] = 0/);
  assert.match(fused, /if live_status != 0:\n        root_state\[0\] = live_status/);

  // The timed graph contains the two authenticated roots only. Evidence
  // hashing/serialization and the stronger retry graph stay outside it.
  const nativeBody = fused.slice(fused.indexOf("@native"));
  for (const forbidden of [
    "serialize_", "json", "hashlib", "sha256", "2304", "2_304",
    "pari_live_retrying_h1_suffix", "precision_resource_cap",
  ]) assert(!nativeBody.includes(forbidden), `timed root contains ${forbidden}`);
  assert.doesNotMatch(fused, /from \.unified_full_h1_root import/);
  assert.match(exactSuffix, /def pari_live_retrying_h1_suffix\(/);
  assert.equal(
    [...compact.slice(compact.indexOf("@native")).matchAll(/pari_getfu_signed_real_cubic\(/g)].length,
    1,
  );
  assert.match(compact, /if status != 0 and status != 3:/);
  assert.doesNotMatch(compact.slice(compact.indexOf("@native")), /pari_live_retrying_h1_suffix/);
  assert.match(live, /pari_resident_generated_class_attempt\(/);
  assert.match(live, /pari_live_h1_owner_bridge\(/);

  return {
    sourceSha256: sha256(fused),
    sourceBytes: Buffer.byteLength(fused),
    sourceLines: fused.split("\n").length,
    parameters: fusedNames.length,
    liveParameters: liveNames.length,
    compactParameters: compactNames.length,
    appendedWorkspaces: fusedNames.length - liveNames.length,
    getfuCallsInCompactLeaf: 1,
    strongerRetryGraphReachable: false,
    evidenceSerializationInTimedRoot: false,
  };
}

function fallbackAudit() {
  const script = String.raw`
import importlib.util, inspect, json, pathlib, sys, types

path = pathlib.Path(sys.argv[1])
pkg = types.ModuleType("fused_fixture")
pkg.__path__ = [str(path.parent)]
sys.modules[pkg.__name__] = pkg
native = types.ModuleType("sagejs.native")
native.IntegerBuffer = list
native.Int64Buffer = list
native.Float64Buffer = list
native.native = lambda function: function
sagejs = types.ModuleType("sagejs")
sagejs.__path__ = []
sys.modules["sagejs"] = sagejs
sys.modules["sagejs.native"] = native

calls = []
status = {"live": 0, "post": 0}
live = types.ModuleType("fused_fixture.unified_live_h1_root")
def fake_live(*args):
    calls.append(("live", args))
    assert args[-1] is markers["driver_state"]
    assert markers["root_state"] == [0] * 12
    return status["live"]
live.pari_unified_live_h1_root = fake_live
sys.modules[live.__name__] = live
post = types.ModuleType("fused_fixture.h1_matched_flag_zero")
def fake_post(*args):
    calls.append(("post", args))
    assert args[5] is markers["basis_table"]
    assert args[7] is markers["signs"]
    markers["root_state"][:] = [0, 1, 3, 192, 1, 0, 0, 7, 73, 8, 0, 1]
    return status["post"]
post.pari_h1_compact_flag_zero_root = fake_post
sys.modules[post.__name__] = post

spec = importlib.util.spec_from_file_location("fused_fixture.h1_matched_flag_zero_fused", path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
fn = module.pari_fused_h1_matched_flag_zero_root
names = list(inspect.signature(fn).parameters)
markers = {name: object() for name in names}
markers["root_state"] = [991] * 12
args = [markers[name] for name in names]
assert fn(*args) == 0
assert [call[0] for call in calls] == ["live", "post"]
assert markers["root_state"] == [0, 1, 3, 192, 1, 0, 0, 7, 73, 8, 0, 1]

# A failed prefix never reaches compact/getfu and cannot leave a published root.
calls.clear()
markers["root_state"][:] = [991] * 12
status["live"] = 17
assert fn(*args) == 17
assert [call[0] for call in calls] == ["live"]
assert markers["root_state"] == [17] + [0] * 11

# A compact authority failure is returned without being relabeled complete.
calls.clear()
markers["root_state"][:] = [991] * 12
status["live"] = 0
status["post"] = 6
assert fn(*args) == 6
assert [call[0] for call in calls] == ["live", "post"]
print(json.dumps({"parameters": len(names), "successCalls": 2,
                  "prefixFailureCalls": 1, "compactFailureStatus": 6}))
`;
  return JSON.parse(run("python3", ["-c", script, fusedPath]).trim());
}

function sizeEstimate() {
  const oldRoot = process.env.SAGEJS_MATCHED_ISOLATED_CACHE ||
    "/home/user/sagejs-worktrees/pari-class-group-e2e-integration-worktrees/" +
    "h1-matched-flag-zero/bench/pari-class-group-port/.sagejs-native-kernels";
  const keys = {
    live: "bd6a13af4c74b4ff00427840c9fd42443db4f2ba9582c07c258c514f9364c63d",
    compact: "4f4e3313324980e46154f9472489b34ee4b706011af08b24d6cdd2413fd24871",
  };
  const result = {};
  for (const [name, key] of Object.entries(keys)) {
    const artifact = path.join(oldRoot, key);
    const core = path.join(artifact, "kernel_core.c");
    const manifest = path.join(artifact, "manifest.json");
    if (fs.existsSync(core) && fs.existsSync(manifest)) {
      result[name] = {
        cacheKey: key,
        coreBytes: fs.statSync(core).size,
        manifestBytes: fs.statSync(manifest).size,
      };
    }
  }
  if (result.live && result.compact) {
    result.estimate = {
      fusedCoreBytesLow: result.live.coreBytes,
      fusedCoreBytesHigh: result.live.coreBytes + result.compact.coreBytes,
      rationale: "private-graph dedup should place fused output between max and sum",
      buildPeakRssKiBPlanning: 4 * 1024 * 1024,
      observedPriorColdPeakRssKiB: 3496424,
    };
  }
  return result;
}

function values(value) {
  return Array.isArray(value) ? value : value.toArray ? value.toArray() : Array.from(value);
}

function workspaceSizes() {
  const checker = fs.readFileSync(path.join(directory, "check_live_h1_owner_bridge.cjs"), "utf8");
  const literal = checker.match(/const sizes = (\{[\s\S]*?\n\});/);
  assert(literal, "missing authenticated bridge workspace sizes");
  return {
    ...vm.runInNewContext(`(${literal[1]})`, { columnCapacity: 16 }),
    unified_state: 12,
    embedding_packed: 27, matep: 18, transformed_arch: 18,
    transformed_clean: 18, transformed_phases: 6, exponential_values: 18,
    solve_work: 27, solve_rhs: 18, solved: 18, rounded: 6,
    multiplication: 9, inverse: 3, candidate_units: 6,
    normalized_factor: 4, output_units: 6, output_logs: 18,
    output_phases: 6, output_factor: 4, getfu_state: 8, pivots: 3,
    exp_cache: 64, exp_a: 64, exp_b: 64, exp_p: 64, exp_q: 64,
    exp_stack: 128, root_state: 12,
  };
}

function plainInputs(inputPath, names, mutation = null) {
  const record = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const candidate = record.input;
  assert(candidate && typeof candidate === "object", "sanitized input record required");
  const sizes = workspaceSizes();
  const answer = {};
  for (const [name, kind] of names) {
    if (Object.hasOwn(candidate, name)) answer[name] = structuredClone(candidate[name]);
    else {
      assert(Number.isInteger(sizes[name]), `missing workspace size for ${name}`);
      const sentinel = name.startsWith("output_") ? 991 : 0;
      answer[name] = Array(sizes[name]).fill(sentinel);
    }
    if (Array.isArray(answer[name])) {
      answer[name] = kind === "Float64Buffer"
        ? answer[name].map(Number) : answer[name].map(BigInt);
    } else if (kind === "float") answer[name] = Number(answer[name]);
    else if (kind === "bool") answer[name] = Boolean(answer[name]);
    else answer[name] = BigInt(answer[name]);
  }
  if (mutation !== null) mutation(answer);
  return answer;
}

function nativeInputs(fn, names, plain) {
  const answer = {};
  for (const [name, kind] of names) {
    const data = plain[name];
    if (!kind.endsWith("Buffer")) answer[name] = data;
    else if (kind === "Float64Buffer") answer[name] = fn.createFloat64Buffer(data.map(Number));
    else if (kind === "Int64Buffer") answer[name] = fn.createInt64Buffer(data.map(BigInt));
    else answer[name] = fn.createIntegerBuffer(data.length, 4096, data.map(BigInt));
  }
  return answer;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
}

function digestCanonical(value) {
  return sha256(JSON.stringify(canonicalJson(value)));
}

function strings(owner, count) {
  return values(owner).slice(0, count).map(String);
}

function relationEvidence(v) {
  const descriptors = [];
  const norms = strings(v.packet_norms, 66);
  const ideals = strings(v.packet_ideals, 66 * 9);
  for (let factor = 0; factor < 66; factor += 1) {
    descriptors.push([norms[factor], ...ideals.slice(9 * factor, 9 * (factor + 1))]);
  }
  const relationValues = strings(v.relation_records, 73 * 66);
  const generatorValues = strings(v.generators, 73 * 3);
  const metadataValues = strings(v.relation_metadata, 73 * 3);
  const logValues = strings(v.log_embeddings, 73 * 3 * 7);
  const prepDegree = strings(v.prep_degree_state, 4);
  const prepBase = strings(v.prep_base_state, 7);
  const prepSub = strings(v.prep_sub_state, 3);
  const prepKummer = strings(v.prep_kummer_state, 4);
  const relationState = strings(v.relation_state, 6);
  const progress = strings(v.progress, 4);
  const counters = strings(v.counters, 4);
  const payload = {
    schema: "sagejs.pari-class-group/h1-pre-hnf-relation-prefix-v1",
    field_id: "x^3-20018*x+20034",
    run_id: "seed-1",
    relation_shape: ["73", "66"],
    relation_layout: "column-major",
    relations: Array.from({ length: 73 }, (_, index) =>
      relationValues.slice(66 * index, 66 * (index + 1))),
    factor_descriptor_shape: ["66", "10"],
    factor_descriptor_layout: "factor-major; norm then row-major ideal",
    factor_descriptors: descriptors,
    generator_shape: ["73", "3"],
    generator_layout: "relation-major",
    generators: Array.from({ length: 73 }, (_, index) =>
      generatorValues.slice(3 * index, 3 * (index + 1))),
    metadata_shape: ["73", "3"],
    metadata_layout: "relation-major; token, relorig, relaut",
    relation_metadata: Array.from({ length: 73 }, (_, index) =>
      metadataValues.slice(3 * index, 3 * (index + 1))),
    log_shape: ["73", "3", "7"],
    log_layout: "relation-major; place-major packed real/complex",
    log_embeddings: Array.from({ length: 73 }, (_, index) =>
      logValues.slice(21 * index, 21 * (index + 1))),
    counters: {
      C1: prepBase[0], C2: prepBase[1], KC: prepBase[2],
      KCZ: prepBase[3], KCZ2: prepBase[4],
      accepted_relations: relationState[0], catalog_entries: prepDegree[1],
      decomposition_calls: prepKummer[2], degree_groups: prepDegree[2],
      descriptors: prepKummer[3], factor_attempts: progress[1],
      factor_slots: prepDegree[3], initial_relations: "12",
      random_relations: counters[3], small_elements: counters[1],
      subfactor_trials: prepSub[0], visited_ideals: "16",
    },
    terminal_rng_state: strings(v.prep_kummer_random_state, 66),
  };
  return { sha256: digestCanonical(payload), payload };
}

function compactEvidence(v, relationSha256) {
  const root = strings(v.root_state, 12);
  const state = strings(v.getfu_state, 8);
  const payload = {
    schema: "sagejs.pari-class-group/h1-compact-flag-zero-v1",
    field_id: "x^3-20018*x+20034",
    run_id: "seed-1",
    relation_prefix_sha256: relationSha256,
    precision_bits: "192",
    unit_rank: "2",
    compact_factor_count: "7",
    compact_provenance: [
      strings(v.compact_provenance, 14).slice(0, 7),
      strings(v.compact_provenance, 14).slice(7, 14),
    ],
    clean_logs: strings(v.clean_logs, 18),
    clean_phases: strings(v.signs, 6),
    getfu_factor: strings(v.getfu_factor, 4),
    getfu: {
      status: state[0] === "0" ? "success" : "not_given(PRECI)",
      state,
    },
    counters: {
      getfu_attempts: "1", precision_retries: "0",
      stronger_exact_suffix_calls: "0",
    },
    terminal_rng_state: strings(v.prep_kummer_random_state, 66),
    assumptions: { pari_correspondence_assumed: true, public_complete: false },
  };
  return { sha256: digestCanonical(payload), payload, root, state };
}

function walkFiles(directoryPath) {
  const answer = [];
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const filename = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) answer.push(...walkFiles(filename));
    else answer.push(filename);
  }
  return answer;
}

function artifact(filename) {
  return { path: filename, bytes: fs.statSync(filename).size,
    sha256: sha256(fs.readFileSync(filename)) };
}

function authenticateArtifactIdentity(identity) {
  assert.equal(identity.sourceHash, FUSED_SOURCE_SHA256, "fused source identity changed");
  assert.equal(identity.cacheKey, FUSED_CACHE_KEY, "fused cache identity changed");
  assert.equal(identity.coreSha256, FUSED_CORE_SHA256, "fused generated core changed");
  assert.equal(identity.addonSha256, FUSED_ADDON_SHA256, "fused addon changed");
  assert.equal(identity.manifestSha256, FUSED_MANIFEST_SHA256,
    "fused manifest changed");
  assert.equal(identity.signatureSha256, FUSED_SIGNATURE_SHA256,
    "fused signature changed");
  return true;
}

function negativeIdentityAudit() {
  const cacheRoot = path.join(directory, ".sagejs-native-kernels");
  const index = JSON.parse(fs.readFileSync(path.join(cacheRoot, "index.json"), "utf8"));
  const discovery = index.sources[path.resolve(fusedPath)];
  assert(discovery);
  const outputPath = path.join(cacheRoot, discovery.cacheKey);
  const identity = {
    sourceHash: sha256(fs.readFileSync(fusedPath)),
    cacheKey: discovery.cacheKey,
    coreSha256: sha256File(path.join(outputPath, "kernel_core.c")),
    addonSha256: sha256File(
      path.join(outputPath, "build/Release/sagejs_native_kernel.node")),
    manifestSha256: sha256File(path.join(outputPath, "manifest.json")),
    signatureSha256: signatureSha256(signature(fs.readFileSync(fusedPath, "utf8"), entry)),
  };
  assert(authenticateArtifactIdentity(identity));
  for (const key of Object.keys(identity)) {
    const mutated = { ...identity };
    mutated[key] = (mutated[key][0] === "0" ? "1" : "0") + mutated[key].slice(1);
    assert.throws(() => authenticateArtifactIdentity(mutated), /identity|changed/,
      `mutated ${key} accepted`);
  }
  assert(!fs.existsSync(path.join(cacheRoot,
    "0" + discovery.cacheKey.slice(1))), "mutated cache key unexpectedly exists");
  return { ...identity, rejectedMutations: Object.keys(identity) };
}

async function compileOnly() {
  const compilerPath = process.env.SAGEJS_REPLAY_RUNTIME_ROOT
    ? path.join(process.env.SAGEJS_REPLAY_RUNTIME_ROOT, "tools/native-kernel/compiler.cjs")
    : "../../tools/native-kernel/compiler.cjs";
  const { compileKernel } = require(compilerPath);
  const compileStarted = process.hrtime.bigint();
  const built = await compileKernel({ sourcePath: fusedPath });
  const compileWallNs = process.hrtime.bigint() - compileStarted;
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  for (const forbidden of [
    "pari_live_retrying_h1_suffix", "precision_resource_cap",
    "napi_call_function", "PyObject_Call", "v8::",
  ]) assert(!core.includes(forbidden), `generated core contains ${forbidden}`);
  assert.match(core, /pari_getfu_signed_real_cubic/);
  const files = walkFiles(built.outputPath);
  const objects = files.filter((filename) => filename.endsWith(".o"));
  assert(objects.length >= 1, "compiled object missing");
  return {
    cacheKey: built.cacheKey,
    cached: built.cached, compileWallNs: compileWallNs.toString(),
    modulePath: built.modulePath,
    outputPath: built.outputPath,
    artifacts: {
      core: artifact(built.coreSourcePath),
      addon: artifact(built.addonPath),
      objects: objects.map(artifact).sort((left, right) => right.bytes - left.bytes),
    },
    generatedExclusions: {
      strongerRetrySuffix: true, precisionResourceLoop: true,
      dynamicPythonCalls: true, oneCompactGetfuSourceLeaf: true,
    },
    publicComplete: false,
  };
}

function cachedArtifactOnly() {
  const cacheRoot = path.join(directory, ".sagejs-native-kernels");
  const indexPath = path.join(cacheRoot, "index.json");
  const indexRecord = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  assert.equal(indexRecord.schema, "sagejs.native-cache/v3");
  const sourcePath = path.resolve(fusedPath);
  const discovery = indexRecord.sources[sourcePath];
  assert(discovery, "fused source is absent from authenticated native cache index");
  const sourceHash = sha256(fs.readFileSync(fusedPath));
  assert.equal(discovery.sourceHash, sourceHash, "cached fused source is stale");
  assert.equal(discovery.nativeAbi, 24);
  const outputPath = path.join(cacheRoot, discovery.cacheKey);
  const modulePath = path.join(outputPath, "index.cjs");
  const corePath = path.join(outputPath, "kernel_core.c");
  const addonPath = path.join(outputPath, "build/Release/sagejs_native_kernel.node");
  const manifestPath = path.join(outputPath, "manifest.json");
  for (const filename of [modulePath, corePath, addonPath, manifestPath]) {
    assert(fs.statSync(filename).isFile(), `cached artifact missing: ${filename}`);
  }
  const core = fs.readFileSync(corePath, "utf8");
  for (const forbidden of [
    "pari_live_retrying_h1_suffix", "precision_resource_cap",
    "napi_call_function", "PyObject_Call", "v8::",
  ]) assert(!core.includes(forbidden), `generated core contains ${forbidden}`);
  assert.match(core, /pari_getfu_signed_real_cubic/);
  const files = walkFiles(outputPath);
  const objects = files.filter((filename) => filename.endsWith(".o"));
  assert(objects.length >= 1, "compiled object missing");
  const coreRecord = artifact(corePath);
  const addonRecord = artifact(addonPath);
  authenticateArtifactIdentity({
    sourceHash, cacheKey: discovery.cacheKey,
    coreSha256: coreRecord.sha256, addonSha256: addonRecord.sha256,
    manifestSha256: sha256File(manifestPath),
    signatureSha256: signatureSha256(signature(fs.readFileSync(fusedPath, "utf8"), entry)),
  });
  return {
    cacheKey: discovery.cacheKey,
    sourceHash,
    nativeAbi: discovery.nativeAbi,
    modulePath,
    outputPath,
    cacheDiscoveryIndex: artifact(indexPath),
    artifacts: {
      core: coreRecord, addon: addonRecord,
      objects: objects.map(artifact).sort((left, right) => right.bytes - left.bytes),
    },
    generatedExclusions: {
      strongerRetrySuffix: true, precisionResourceLoop: true,
      dynamicPythonCalls: true, oneCompactGetfuSourceLeaf: true,
    },
    cachePolicy: "authenticated discovery index and thin addon loader; no compiler lowering or generated-JavaScript parse",
    publicComplete: false,
  };
}

function thinOptions(names, mutation = null) {
  const mutate = (value) => mutation === null ? value
    : (value[0] === "0" ? "1" : "0") + value.slice(1);
  const expected = {
    sourceHash: FUSED_SOURCE_SHA256,
    cacheKey: FUSED_CACHE_KEY,
    nativeAbi: 24,
    manifestHash: FUSED_MANIFEST_SHA256,
    addonHash: FUSED_ADDON_SHA256,
    signatureHash: FUSED_SIGNATURE_SHA256,
  };
  if (mutation !== null) expected[mutation] = mutate(expected[mutation]);
  return {
    sourcePath: path.resolve(fusedPath),
    cacheRoot: path.join(directory, ".sagejs-native-kernels"),
    entry, signature: names, expected,
  };
}

function thinLoaderMutationAudit() {
  const names = signature(fs.readFileSync(fusedPath, "utf8"), entry);
  const rejected = [];
  for (const key of ["sourceHash", "cacheKey", "manifestHash", "addonHash"]) {
    assert.throws(() => loadThinCachedKernel(thinOptions(names, key)),
      /identity changed|cache source is stale/, `thin loader accepted mutated ${key}`);
    rejected.push(key);
  }
  const changedSignature = names.map((parameter) => [...parameter]);
  changedSignature[0][1] = "Int64Buffer";
  assert.throws(() => loadThinCachedKernel(thinOptions(changedSignature)),
    /signature identity changed/, "thin loader accepted mutated signature");
  rejected.push("signature");
  return { rejected, generatedFallbackLoaded: false };
}

function validateArtifact(inputPath, mutation) {
  assert(["none", "degree", "precision"].includes(mutation));
  const source = fs.readFileSync(fusedPath, "utf8");
  const names = signature(source, entry);
  const fn = loadThinCachedKernel(thinOptions(names));
  assert(fn.nativeAvailable);
  assert.equal(fn.executionMode, "native-thin-cache");
  const mutate = mutation === "degree"
    ? (input) => { input.n = 4n; }
    : mutation === "precision"
      ? (input) => { input.precision = 191n; }
      : null;
  const plain = plainInputs(inputPath, names, mutate);
  const input = nativeInputs(fn, names, plain);
  const beforeGetfu = strings(input.getfu_state, 8);
  const started = process.hrtime.bigint();
  let status;
  try { status = fn.gmp(...names.map(([name]) => input[name])); }
  catch (error) { status = "exception:" + error.message; }
  const wallNs = process.hrtime.bigint() - started;
  if (mutation !== "none") {
    assert.notEqual(status, 0n, `${mutation} mutation accepted`);
    assert.equal(strings(input.root_state, 12)[11], "0", `${mutation} published root`);
    assert.deepEqual(strings(input.getfu_state, 8), beforeGetfu, `${mutation} reached getfu`);
    return { backend: "gmp-thin", mutation, status: String(status), wallNs: wallNs.toString(),
      publicationCommitted: false, getfuReached: false };
  }
  assert.equal(status, 0n);
  assert.deepEqual(strings(input.root_state, 12),
    ["0", "1", "3", "192", "1", "0", "0", "7", "73", "8", "0", "1"]);
  assert.deepEqual(strings(input.getfu_state, 8),
    ["3", "10", "-186", "0", "1923", "0", "0", "1"]);
  assert.deepEqual(strings(input.unified_state, 12),
    ["0", "0", "0", "1", "0", "7", "73", "8", "48", "48", "2", "7"]);
  const relation = relationEvidence(input);
  assert.equal(relation.sha256,
    "b0c647186a5fed5317c7135ccf16623a930631382ad7963e12af4ded2db7259a");
  const compact = compactEvidence(input, relation.sha256);
  return {
    backend: "gmp-thin", mutation, wallNs: wallNs.toString(),
    relationSha256: relation.sha256,
    compactSha256: compact.sha256,
    root: compact.root,
    getfu: compact.state,
    counters: relation.payload.counters,
    ownerEvidenceSha256: digestCanonical({ relation: relation.payload, compact: compact.payload }),
  };
}

function worker(command) {
  const answer = spawnSync(process.execPath, [__filename, ...command], {
    encoding: "utf8", timeout: 600_000, maxBuffer: 256 * 1024 * 1024,
    env: process.env,
  });
  assert.equal(answer.status, 0, answer.stderr || String(answer.error));
  return JSON.parse(answer.stdout.trim().split("\n").at(-1));
}

async function nativeDifferential(inputPath) {
  // Cache authentication and each large native owner set live in separate
  // processes. This is a runtime-artifact policy, not an algorithm split: the
  // measured native entry remains one fused call. Sequential workers prevent
  // retained artifact records or a previous run's exact buffers from stacking.
  const build = worker(["--cached-artifact"]);
  const started = process.hrtime.bigint();
  const gmp = worker(["--validate-artifact", inputPath, "none"]);
  const mutations = [
    worker(["--validate-artifact", inputPath, "degree"]),
    worker(["--validate-artifact", inputPath, "precision"]),
  ];
  return {
    inputPath: path.resolve(inputPath), ...build,
    validationWallNs: (process.hrtime.bigint() - started).toString(),
    snapshots: { gmp }, mutations,
    mutationFailures: mutations.length,
    validationProcessPolicy: "cache authentication, thin GMP, and mutations sequentially isolated; dynamic fallback audited separately",
  };
}

async function main() {
  if (process.argv[2] === "--compile-only") {
    process.stdout.write(`${JSON.stringify(await compileOnly())}\n`);
    return;
  }
  if (process.argv[2] === "--cached-artifact") {
    process.stdout.write(`${JSON.stringify(cachedArtifactOnly())}\n`);
    return;
  }
  if (process.argv[2] === "--validate-artifact") {
    assert.equal(process.argv.length, 5);
    process.stdout.write(`${JSON.stringify(validateArtifact(process.argv[3], process.argv[4]))}\n`);
    return;
  }
  const receipt = {
    schema: "sagejs.pari-class-group/h1-matched-flag-zero-fused-source-v1",
    boundary: "prepared H1 through one compact p192 PRECI publication",
    publicComplete: false,
    static: staticAudit(),
    fallback: fallbackAudit(),
    estimate: sizeEstimate(),
    cacheIdentity: negativeIdentityAudit(),
    thinLoaderIdentity: thinLoaderMutationAudit(),
    nativeValidation: "pending-heavy-slot",
  };
  const nativeIndex = process.argv.indexOf("--native");
  if (nativeIndex >= 0) {
    assert(process.argv[nativeIndex + 1], "--native needs sanitized inputs.json");
    receipt.native = await nativeDifferential(process.argv[nativeIndex + 1]);
    receipt.nativeValidation = "complete";
  }
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
