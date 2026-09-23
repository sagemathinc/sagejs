"use strict";

// Genuine prepared-object-only row-0 execution of the unified H1 graph.
// The live owners never cross the public boundary: two independent executions
// are compared, copied once, cold-replayed, and then sealed by the existing
// neutral class/unit result adapter.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const adapter = require("./h1_class_unit_result_adapter.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const tools = require("./check_unified_h1_terminal_snapshot.cjs");
const unified = require("./h1_unified_complete_adapter.cjs");
const { makeFreshInput } = require("./row0_fresh_prepared_input.cjs");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "pari_unified_complete_h1_root.py");
const OWNER_CHILD = path.join(__dirname, "row0_fresh_h1_owner_child.cjs");
const REPLAY_SCHEMA = "sagejs.pari-class-group/h1-final-correspondence-replay-v1";

function values(owner) {
  return Array.isArray(owner) ? owner
    : owner.toArray ? owner.toArray() : Array.from(owner);
}

function strings(owner, length = owner.length) {
  return values(owner).slice(0, length).map(String);
}

function residentInput(prepared, specification, fn) {
  const fresh = makeFreshInput(prepared);
  assert.deepEqual(fresh.names, specification.residentNames);
  const input = {};
  const finalNames = new Set(Object.keys(specification.sizes)
    .filter(name => name.startsWith("final_")));
  for (const [name, kind] of specification.names) {
    if (Object.hasOwn(fresh.input, name)) {
      input[name] = structuredClone(fresh.input[name]);
    } else if (name === "precision_resource_cap") {
      input[name] = 4096n;
    } else {
      const size = specification.sizes[name];
      assert(Number.isInteger(size) && size >= 0, `missing row-0 capacity ${name}`);
      input[name] = Array(size).fill(finalNames.has(name) ? 777 : 0);
    }
    if (Array.isArray(input[name])) {
      input[name] = kind === "Float64Buffer"
        ? input[name].map(Number) : input[name].map(BigInt);
    } else if (kind === "float") input[name] = Number(input[name]);
    else if (kind === "bool") input[name] = Boolean(input[name]);
    else input[name] = BigInt(input[name]);
  }
  input.final_state.fill(0n);
  input.precision_authority_state.fill(0n);
  for (const [name, kind] of specification.names) {
    if (kind === "IntegerBuffer" &&
        (name.startsWith("precision_") || name.startsWith("final_"))) {
      input[name] = fn.createIntegerBuffer(input[name].length, 128, input[name]);
    }
  }
  return input;
}

function validateTerminal(input) {
  assert.deepEqual(strings(input.final_state, 16), [
    "0", "0", "0", "0", "0", "0", "73", "8",
    "1", "0", "2", "2", "0", "811", "1", "0",
  ]);
  assert.deepEqual(strings(input.precision_authority_state, 5),
    ["0", "5", "2304", "0", "3"]);
  assert.equal(strings(input.precision_authority_state, 16)[14], "1");
  assert.deepEqual(strings(input.final_exact_norms, 2), ["-1", "-1"]);
  assert.deepEqual(strings(input.final_torsion_order), ["2"]);
  assert.deepEqual(strings(input.final_torsion_generator), ["-1", "0", "0"]);
}

async function liveCapture(prepared, built, specification) {
  const input = residentInput(prepared, specification, built.fn);
  const status = built.fn.gmp(...specification.names.map(([name]) => input[name]));
  assert.equal(status, 0n, "fresh row-0 unified H1 root did not succeed");
  validateTerminal(input);
  const copiedOwners = tools.copyReplayOwners(input);
  return {
    cacheKey: built.cacheKey,
    copiedOwners,
    honestyInput: {
      prep_base_state: strings(input.prep_base_state, 7),
      prep_state: strings(input.prep_state, 8),
      attempt_state: strings(input.attempt_state, 4),
      class_number: strings(input.class_number, 1),
      class_invariants: strings(input.class_invariants, 12),
      relation_state: strings(input.relation_state, 6),
    },
  };
}

async function captureFreshOwners(prepared) {
  const specification = unified.rootSpecification();
  const compiled = await compileKernel({ sourcePath: SOURCE });
  const fn = require(compiled.modulePath).pari_unified_complete_h1_root;
  assert(fn.nativeAvailable, "fresh row-0 unified native root unavailable");
  return liveCapture(prepared, { ...compiled, fn }, specification);
}

function honestyEvidence(input) {
  const program = String.raw`
import dataclasses,importlib,json,sys
sys.path[:0]=[sys.argv[1],sys.argv[1]+"/src/lib"]
m=importlib.import_module("bench.pari-class-group-port.h1_honesty_terminal")
live=json.load(sys.stdin)
print(json.dumps(dataclasses.asdict(m.compose_h1_honesty_terminal(live)),sort_keys=True))
`;
  const child = spawnSync("python3", ["-c", program, ROOT], {
    cwd: ROOT, encoding: "utf8", input: JSON.stringify(input),
    timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(child.status, 0, child.stderr || String(child.error));
  return JSON.parse(child.stdout.trim().split("\n").at(-1));
}

function powerCoordinates(owners) {
  const basis = owners.prep_zk.map(BigInt);
  const integral = owners.final_exact_units.map(BigInt);
  const units = [];
  for (let unit = 0; unit < 2; unit += 1) {
    const row = [];
    for (let power = 0; power < 3; power += 1) {
      let value = 0n;
      for (let column = 0; column < 3; column += 1) {
        value += basis[3 * column + power] * integral[3 * unit + column];
      }
      row.push(String(value));
    }
    units.push(row);
  }
  return units;
}

async function fullRegulatorAuthority(owners) {
  const fixture = {
    logs: owners.precision_published_logs,
    provenance: [
      owners.final_retained_relation_map.slice(0, 73),
      owners.final_retained_relation_map.slice(73, 146),
    ],
    regulator: owners.final_regulator,
    units: powerCoordinates(owners),
  };
  const source = fs.readFileSync(path.join(__dirname,
    "regulator_interval_authority.py"), "utf8");
  // BLAS thread stacks are unrelated to this single determinant enclosure and
  // can exhaust a 4 GiB address-space ceiling before Sage starts.  Keep this
  // correctness child single-threaded, as the surrounding transaction is.
  const threadVariables = ["OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS",
    "MKL_NUM_THREADS"];
  const previousThreads = Object.fromEntries(threadVariables.map(name =>
    [name, process.env[name]]));
  for (const name of threadVariables) process.env[name] = "1";
  const { createSage } = require("../../dist/tools/kernel.js");
  const session = await createSage({ mode: "python" });
  try {
    const program = source + String.raw`
import json
fixture=json.loads(${JSON.stringify(JSON.stringify(fixture))})
R=PolynomialRing(QQ,"x");x=R.gen();K=NumberField(x**3-20018*x+20034,"a")
authority=build_live_regulator_interval_authority(
 K,fixture["regulator"],fixture["units"],fixture["provenance"],fixture["logs"])
print(json.dumps(authority,sort_keys=True,separators=(",",":")))
`;
    const result = await session.evaluate(program, {
      filename: "row0-fresh-regulator-authority.py",
    });
    assert.equal(result.stderr || "", "");
    if (result.exitCode !== undefined) assert.equal(result.exitCode, 0);
    return JSON.parse(result.stdout.trim().split("\n").at(-1));
  } finally {
    session.close();
    for (const name of threadVariables) {
      if (previousThreads[name] === undefined) delete process.env[name];
      else process.env[name] = previousThreads[name];
    }
  }
}

function evidence(capture) {
  return {
    coldReplay: capture.coldReplay,
    fieldId: adapter.FIELD_ID,
    honesty: capture.honesty,
    rawOwners: capture.rawOwners,
    regulatorAuthority: capture.regulatorAuthority,
    schema: adapter.BOUNDARY_SCHEMA,
  };
}

function makeBoundary(candidate, trusted) {
  const trustedEvidence = evidence(trusted);
  const evidenceSha256 = neutral.sha256Canonical(trustedEvidence);
  const mathematicalAuthoritySha256 = neutral.sha256Canonical({
    coldReplaySha256: trusted.coldReplay.sha256,
    honesty: trusted.honesty,
    rawNativeOwners: trusted.rawOwners,
    regulatorAuthoritySha256: trusted.regulatorAuthority.authority_sha256,
    source: adapter.PARI_SOURCE_SHA256,
  });
  return {
    authority: {
      evidenceSha256, mathematicalAuthoritySha256,
      replay(candidateEvidence) {
        assert.deepEqual(candidateEvidence, trustedEvidence);
        return {
          accepted: true, coldReplaySha256: trusted.coldReplay.sha256,
          correspondenceComplete: true, evidenceSha256,
          fieldId: adapter.FIELD_ID, mathematicalAuthoritySha256,
          publicComplete: false,
          regulatorAuthoritySha256: trusted.regulatorAuthority.authority_sha256,
          schema: adapter.BOUNDARY_REPLAY_SCHEMA,
        };
      },
      replaySchema: adapter.BOUNDARY_REPLAY_SCHEMA,
    },
    ...evidence(candidate),
  };
}

function ownerMap(payload) {
  return new Map(payload.storage.map(owner => [owner.name, owner]));
}

function logical(owner) {
  return owner.entries.slice(0, Number(owner.logicalLength));
}

function canonicalBytes(value) {
  return [...neutral.canonical(value)].map(entry => String(entry));
}

function finalAuthority(prepared, trusted) {
  const mathematicalAuthoritySha256 = prepared.mathematicalAuthoritySha256;
  const trustedPower = powerCoordinates(trusted.rawOwners).flat();
  return neutral.createDetachedClassUnitAuthority({
    envelopeSha256: prepared.envelopeSha256,
    mathematicalAuthoritySha256,
    replay(payload) {
      assert.equal(payload.field.id, adapter.FIELD_ID);
      assert.deepEqual(payload.field.definingPolynomialAscending, adapter.POLYNOMIAL);
      assert.deepEqual(payload.classGroup, { classNumber: "1", generatorCount: "0",
        invariantFactors: [], presentationOwner: "class-presentation" });
      assert.equal(payload.terminal.correspondence_complete, true);
      assert.equal(payload.terminal.public_complete, false);
      assert.equal(payload.honesty.outcome, "equal-bound-source-skip");
      const owners = ownerMap(payload);
      for (const [name, owner] of Object.entries(trusted.rawOwners)) {
        assert.deepEqual(logical(owners.get(`replay-${name}`)), owner,
          `neutral raw owner ${name}`);
      }
      assert.deepEqual(logical(owners.get("class-presentation")),
        trusted.rawOwners.final_presentation);
      assert.deepEqual(logical(owners.get("exact-unit-coordinates")), trustedPower);
      assert.deepEqual(logical(owners.get("exact-unit-norms")),
        trusted.rawOwners.final_exact_norms);
      assert.deepEqual(logical(owners.get("torsion-generator")), ["-1", "0", "0"]);
      assert.deepEqual(logical(owners.get("honesty-evidence")),
        canonicalBytes(trusted.honesty));
      assert.deepEqual(logical(owners.get("regulator-rigorous-authority")),
        canonicalBytes(trusted.regulatorAuthority));
      assert.deepEqual(logical(owners.get("workload-boundary-evidence")),
        canonicalBytes(adapter.WORKLOAD_BOUNDARY));
      return { correspondence_complete: true, fieldId: adapter.FIELD_ID,
        mathematicalAuthoritySha256, payloadSha256: neutral.sha256Canonical(payload),
        public_complete: false, schema: REPLAY_SCHEMA };
    },
    replaySchema: REPLAY_SCHEMA,
  });
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function boundedOwnerCapture(prepared, outputPath) {
  const child = spawnSync("prlimit", [
    "--as=4294967296", "--rss=4294967296", "--cpu=600", "--",
    process.execPath, OWNER_CHILD,
  ], {
    cwd: ROOT,
    input: JSON.stringify({ prepared, outputPath }),
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" },
  });
  assert.equal(child.status, 0, child.stderr || child.stdout || String(child.error));
  const receipt = JSON.parse(child.stdout.trim().split("\n").at(-1));
  assert.equal(receipt.qualifiedTiming, false);
  assert.equal(receipt.nativeRootExecutions, 1);
  assert.equal(path.resolve(receipt.path), path.resolve(outputPath));
  const bytes = fs.readFileSync(outputPath);
  assert.equal(bytes.length, receipt.bytes);
  assert.equal(sha256(bytes), receipt.sha256);
  assert.equal(fs.statSync(outputPath).mode & 0o222, 0);
  return JSON.parse(bytes);
}

async function enrichDetached(live) {
  return {
    cacheKey: live.cacheKey,
    coldReplay: tools.runDetachedReplay(live.copiedOwners),
    honesty: honestyEvidence(live.honestyInput),
    rawOwners: live.copiedOwners,
    regulatorAuthority: await fullRegulatorAuthority(live.copiedOwners),
  };
}

async function produceFreshH1ClassUnitResult(prepared) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row0-fresh-owner-transaction-"));
  fs.chmodSync(temporary, 0o700);
  try {
    const candidateLive = boundedOwnerCapture(prepared,
      path.join(temporary, "candidate.json"));
    const trustedLive = boundedOwnerCapture(prepared,
      path.join(temporary, "trusted.json"));
    assert.deepEqual(candidateLive.copiedOwners, trustedLive.copiedOwners);
    assert.deepEqual(candidateLive.honestyInput, trustedLive.honestyInput);
    const candidate = await enrichDetached(candidateLive);
    const trusted = await enrichDetached(trustedLive);
    assert.deepEqual(candidate.rawOwners, trusted.rawOwners);
    assert.equal(candidate.coldReplay.sha256, trusted.coldReplay.sha256);
    assert.equal(candidate.regulatorAuthority.authority_sha256,
      trusted.regulatorAuthority.authority_sha256);
    assert.deepEqual(candidate.honesty, trusted.honesty);
    const preparedResult = adapter.prepareH1ClassUnitResult(
      makeBoundary(candidate, trusted), { publicationReplaySchema: REPLAY_SCHEMA });
    const result = adapter.publishPreparedH1Result(
      preparedResult, finalAuthority(preparedResult, trusted));
    assert(result instanceof neutral.ImmutableClassUnitCorrespondenceResult);
    return result;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

module.exports = { captureFreshOwners, produceFreshH1ClassUnitResult };
