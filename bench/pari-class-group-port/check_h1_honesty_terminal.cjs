"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const output = process.argv[2];
assert.ok(output, "usage: node check_h1_honesty_terminal.cjs LIVE_OUTPUT_JSON");
const root = path.resolve(__dirname, "../..");
const program = String.raw`
import copy,dataclasses,decimal,importlib,json,sys
sys.path[:0]=[sys.argv[1],sys.argv[1]+"/src/lib"]
m=importlib.import_module("bench.pari-class-group-port.h1_honesty_terminal")
with open(sys.argv[2]) as stream: live=json.load(stream)
answer=m.compose_h1_honesty_terminal(live)
assert answer.class_number == 1
assert answer.invariant_count == 0
assert answer.honesty_status == "equal-bound-source-skip"
assert (answer.relation_groups,answer.checking_groups) == (48,48)
changed=copy.deepcopy(live);changed["prep_base_state"][4]="49"
try: m.compose_h1_honesty_terminal(changed)
except m.H1TerminalFailure as error: assert "still requires honesty" in str(error)
else: raise AssertionError("unequal live bounds published an h=1 terminal root")
changed=copy.deepcopy(live);changed["honesty_status"]="verified"
assert m.compose_h1_honesty_terminal(changed) == answer
print(json.dumps(dataclasses.asdict(answer),sort_keys=True))
`;
const result = spawnSync("python3", ["-c", program, root, path.resolve(output)], {
  cwd: root,
  encoding: "utf8",
  timeout: 30000,
});
assert.equal(result.status, 0, result.stderr || String(result.error));
process.stdout.write(result.stdout);
