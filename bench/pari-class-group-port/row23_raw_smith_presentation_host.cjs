"use strict";

// Same-process bridge from the fresh row-23 HNF owner to the ordinary-Python
// rectangular Smith proof. No retained result, terminal invariant, or W0 path
// is accepted by this boundary.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = "bench.pari-class-group-port.row23_raw_smith_presentation";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const strings = (owner, length) =>
  (owner.toArray ? owner.toArray() : Array.from(owner))
    .slice(0, length).map(String);

function buildFromLiveOwner(live) {
  assert(live && live.values?.hnf_original && live.values?.relation_records,
    "missing live row-23 relation/HNF owner");
  assert.deepEqual(live.relationState, ["40", "450", "0", "1", "0", "40"]);
  const original = strings(live.values.hnf_original, 40 * 31);
  assert.deepEqual(original, strings(live.values.relation_records, 40 * 31),
    "row-23 Smith input detached from same-run relation records");
  const program = String.raw`
import importlib,json,sys
if hasattr(sys,"set_int_max_str_digits"):sys.set_int_max_str_digits(0)
m=importlib.import_module(sys.argv[1])
r=m.build_row23_raw_smith_presentation(json.load(sys.stdin))
print(json.dumps(r,sort_keys=True,separators=(",",":")))
`;
  const run = spawnSync("python3", ["-c", program, SOURCE], {
    cwd: ROOT, input: JSON.stringify(original), encoding: "utf8",
    timeout: 120_000, maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const raw = Buffer.from(run.stdout.trim(), "ascii");
  const proof = JSON.parse(raw);
  assert.equal(proof.inputSha256, sha(Buffer.from(original.join("\n"))),
    "row-23 Smith proof input digest changed");
  return Object.freeze({ proof, raw, sha256: sha(raw) });
}

module.exports = Object.freeze({ buildFromLiveOwner });

