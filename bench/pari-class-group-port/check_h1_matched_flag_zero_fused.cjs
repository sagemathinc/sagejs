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
const { spawnSync } = require("node:child_process");

const directory = __dirname;
const fusedPath = path.join(directory, "h1_matched_flag_zero_fused.py");
const livePath = path.join(directory, "unified_live_h1_root.py");
const compactPath = path.join(directory, "h1_matched_flag_zero.py");
const exactSuffixPath = path.join(directory, "unified_full_h1_root.py");
const entry = "pari_fused_h1_matched_flag_zero_root";
const liveEntry = "pari_unified_live_h1_root";
const compactEntry = "pari_h1_compact_flag_zero_root";
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

async function main() {
  assert(!process.argv.includes("--native"),
    "native build not admitted; rerun only after the coordinator grants a heavy slot");
  const receipt = {
    schema: "sagejs.pari-class-group/h1-matched-flag-zero-fused-source-v1",
    boundary: "prepared H1 through one compact p192 PRECI publication",
    publicComplete: false,
    static: staticAudit(),
    fallback: fallbackAudit(),
    estimate: sizeEstimate(),
    nativeValidation: "pending-heavy-slot",
  };
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
