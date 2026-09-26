"use strict";

// Same-run owner for row-23 raw relation logs and native Smith class maps.
// The ordinary Python front end factors arbitrary supported ideal HNFs using
// the translated valuation algorithm.  This host independently executes the
// bounded reduction core through Sage.js's GMP native backend.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row23_supported_ideal_map_kernel.py");
const MAP_SOURCE = path.join(__dirname, "row23_supported_ideal_maps.py");
const SCHEMA = "sagejs.pari-class-group/row23-logs-supported-maps-owner-v1";
const ROWS = 40, COLUMNS = 31, LOG_COLUMNS = 35;
const RECEIPTS = new WeakSet();
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const array = (owner, length) =>
  (owner.toArray ? owner.toArray() : Array.from(owner)).slice(0, length);
const strings = (owner, length) => array(owner, length).map(String);

function words(values, minimum = 1) {
  let result = minimum;
  for (const raw of values || []) {
    let value = BigInt(raw); if (value < 0n) value = -value;
    result = Math.max(result,
      Math.ceil(Math.max(1, value.toString(2).length) / 64));
  }
  return result;
}

function pythonMaps(payload, proof) {
  const program = String.raw`
import decimal,gzip,hashlib,json,sys,typing,collections,fractions,math
sys.set_int_max_str_digits(0);sys.path[:0]=[sys.argv[1],sys.argv[2]]
from importlib import import_module
m=import_module('bench.pari-class-group-port.row23_supported_ideal_maps')
x=json.load(sys.stdin);s=m._source(x['payload'],x['proof']);gf,inv=m._generator(s)
probes=[[0]*m.COLUMNS,gf,[2*v for v in gf],[int(i in (0,7,30)) for i in range(m.COLUMNS)]]
print(json.dumps({'receipt':m.replay_supported_maps(x['payload'],x['proof']),
 'generatorFactors':list(map(str,gf)),'generatorCoordinateInverse':str(inv),
 'probes':[list(map(str,p)) for p in probes]},sort_keys=True,separators=(',',':')))
`;
  const run = spawnSync("/usr/bin/python3", ["-c", program, ROOT,
    path.join(ROOT, "src/lib")], { cwd: ROOT, encoding: "utf8",
    input: JSON.stringify({ payload, proof }), timeout: 120_000,
    maxBuffer: 128 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

async function buildFromLiveOwner(live, factorOwner, proof, sourcePayload) {
  assert(live?.values?.log_embeddings && live.values.log_completed,
    "missing live row-23 relation-log owner");
  assert.deepEqual(live.relationState, ["40", "450", "0", "1", "0", "40"]);
  assert.deepEqual(strings(live.values.log_completed, 1), ["40"],
    "row-23 relation logs are incomplete");
  const relations = strings(live.values.relation_records, ROWS * COLUMNS);
  assert.deepEqual(relations, proof.W,
    "row-23 log owner is detached from raw Smith relations");
  assert.deepEqual(relations, sourcePayload.relations.recordsColumnMajor,
    "row-23 log owner is detached from output relations");
  assert.deepEqual(factorOwner.factorBase.ideals.map(ideal => ideal.map(String)),
    sourcePayload.factorBase.ideals, "row-23 map factor owner changed");
  const logs = strings(live.values.log_embeddings, ROWS * LOG_COLUMNS);
  const python = pythonMaps(sourcePayload, proof);
  const built = await compileKernel({ sourcePath: SOURCE });
  const fn = require(built.modulePath).pari_row23_supported_ideal_map;
  assert(fn?.nativeAvailable, "row-23 supported map native backend unavailable");
  const fixed = [...proof.U, ...proof.V];
  // The public results are much smaller than this, but the row-times-U/V
  // loops form products before exact cancellation.  Bound their temporary
  // limbs by the sum of the two retained-matrix bit bounds plus headroom.
  const capacity = 2 * words(fixed, 1) + 128;
  const integer = (length, values, localCapacity = capacity) =>
    fn.createIntegerBuffer(length, Math.max(localCapacity, words(values)),
      values === undefined ? undefined : values.map(BigInt));
  const U = integer(ROWS * ROWS, proof.U);
  const V = integer(COLUMNS * COLUMNS, proof.V);
  const W = integer(ROWS * COLUMNS, proof.W);
  const generator = integer(COLUMNS, python.generatorFactors);
  const native = [];
  for (const probe of python.probes) {
    const owners = {
      exponents: integer(COLUMNS, probe), transformed: integer(COLUMNS),
      representative: integer(COLUMNS), diagonal: integer(ROWS),
      coefficients: integer(ROWS), replay: integer(COLUMNS),
      state: fn.createInt64Buffer(4),
    };
    const status = Number(fn.gmp(owners.exponents, generator,
      BigInt(python.generatorCoordinateInverse), U, V, W,
      owners.transformed, owners.representative, owners.diagonal,
      owners.coefficients, owners.replay, owners.state));
    assert.equal(status, 0, "native row-23 supported map rejected a probe");
    native.push({ exponents: probe, state: strings(owners.state, 4),
      representative: strings(owners.representative, COLUMNS),
      coefficientsSha256: sha(Buffer.from(strings(owners.coefficients, ROWS).join("\n"))),
      replaySha256: sha(Buffer.from(strings(owners.replay, COLUMNS).join("\n"))) });
  }
  const receipt = Object.freeze({
    schema: SCHEMA, logs, logShape: [ROWS, LOG_COLUMNS],
    logsSha256: sha(Buffer.from(logs.join("\n"))),
    relationSha256: sha(Buffer.from(relations.join("\n"))),
    mapReceipt: python.receipt, native,
    nativeSourceSha256: sha(fs.readFileSync(SOURCE)),
    mapSourceSha256: sha(fs.readFileSync(MAP_SOURCE)),
    nativeBackend: "gmp", externalPariRuntime: false,
  });
  RECEIPTS.add(receipt);
  return receipt;
}

function verify(receipt) {
  assert(RECEIPTS.has(receipt), "row-23 log/map owner lacks same-process authority");
  assert(Object.isFrozen(receipt), "row-23 log/map owner is mutable");
  return receipt;
}

module.exports = Object.freeze({ LOG_COLUMNS, SCHEMA, buildFromLiveOwner, verify });
