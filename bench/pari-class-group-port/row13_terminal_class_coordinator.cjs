"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  deriveRow13ColumnAncestry,
} = require("./row13_terminal_class_ancestry.cjs");

const ROOT = path.resolve(__dirname, "../..");

async function composeInMemory(accepted, metadata) {
  const ancestry = await deriveRow13ColumnAncestry(accepted, metadata);
  const program = String.raw`import importlib,json,sys
sys.set_int_max_str_digits(1000000);sys.path.extend(['src/lib','src/baselib','bench/pari-class-group-port'])
m=importlib.import_module('bench.pari-class-group-port.row13_terminal_class_owner')
x=json.load(sys.stdin)
json.dump(m.compose_row13_terminal_class_owner(x['accepted'],x['metadata'],x['ancestry']),sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync(
    "prlimit",
    [
      "--as=4294967296",
      "--rss=4294967296",
      "--cpu=600",
      "--",
      "python3",
      "-c",
      program,
    ],
    {
      cwd: ROOT,
      input: JSON.stringify({ accepted, metadata, ancestry }),
      encoding: "utf8",
      timeout: 600_000,
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  assert.equal(run.status, 0, run.stderr || run.stdout || String(run.error));
  const owner = JSON.parse(run.stdout);
  assert.equal(
    owner.schema,
    "sagejs.pari-class-group/row13-terminal-class-owner-v1",
  );
  assert.deepEqual(owner.classWitness.classGroup, {
    classNumber: "2",
    invariants: ["2"],
  });
  assert.equal(owner.principalAuthentication.principalEquations, 1006);
  return { ancestry, owner };
}

module.exports = { composeInMemory };
