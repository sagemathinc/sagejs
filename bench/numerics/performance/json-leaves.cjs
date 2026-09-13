"use strict";

// Same-runtime source-body comparison, not a public solver or release receipt.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const {execFileSync} = require("node:child_process");
const root = process.env.SAGEJS_JSON_RUNTIME_ROOT || path.resolve(__dirname, "../../..");
const baseline = "c4c126d09ba4f5c2fb30001fd8b561b24105d80f";
const file = "src/lib/sagejs/numerics/_json.py";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const before = process.env.SAGEJS_JSON_BASELINE_SOURCE
  ? fs.readFileSync(process.env.SAGEJS_JSON_BASELINE_SOURCE,"utf8")
  : execFileSync("git", ["show", `${baseline}:${file}`], {cwd:root, encoding:"utf8"});
assert.equal(sha(before),"c83567983bb5f48a95fa8aacfa9e2db9640f177f820747d9fa5191a846a9cde1",
  "baseline bytes must match the pinned source even on an archive-only host");
const after = fs.readFileSync(process.env.SAGEJS_JSON_CANDIDATE_SOURCE || path.join(root,file), "utf8");
function renamed(source, name) {
  const start = source.indexOf("def materialize_json("), end = source.indexOf("\n\ndef materialize_object(");
  assert.ok(start > 0 && end > start);
  return source.slice(start,end).replace(/\bmaterialize_json\b/g, name);
}
const program = `import time, json, math
from collections.abc import Mapping, Sequence
from typing import Any, TypeAlias
JSONScalar: TypeAlias = None | bool | int | float | str
JSONValue: TypeAlias = JSONScalar | list["JSONValue"] | dict[str, "JSONValue"]
${renamed(before,"baseline_materialize_json")}
${renamed(after,"candidate_materialize_json")}
cases = [
    ("plot_float_leaves_514", {"plot": {"values": [float(i) / 7.0 for i in range(514)]}}),
    ("integer_leaves_514", {"plot": {"values": list(range(514))}}),
    ("mixed_metadata", {"method": "brent", "success": True, "count": 32, "bounds": [0.0, 1.0], "optional": None}),
]
records = []
for case, values in cases:
    for round_name, f in [("A1", baseline_materialize_json), ("B1", candidate_materialize_json), ("B2", candidate_materialize_json), ("A2", baseline_materialize_json)]:
        for _ in range(3):
            assert f(values) == values
        samples = []
        for _ in range(7):
            start = time.perf_counter()
            value = f(values)
            samples.append((time.perf_counter() - start) * 1000)
            assert value == values and value is not values
            if "plot" in values:
                assert value["plot"] is not values["plot"]
                assert value["plot"]["values"] is not values["plot"]["values"]
        records.append({"case": case, "round": round_name, "samples_ms": samples, "median_ms": sorted(samples)[3], "equivalent_and_detached": True})
print(json.dumps(records))
`;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-json-leaves-"));
const script = path.join(temporary,"probe.py");
fs.writeFileSync(script,program);
const nodeRows = JSON.parse(execFileSync(process.execPath,[path.join(root,"bin/sagejs"),"--python",script],
  {cwd:root,encoding:"utf8",timeout:120000,env:{...process.env,SAGEJS_NATIVE_DISABLE:"1"}}));
const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const pythonRows = JSON.parse(execFileSync(python,["-I",script],{encoding:"utf8",timeout:120000}));
const receipt = require(path.join(root,"scripts/build-receipt.cjs")).inspectBuildReceipt(root);
// This experiment compiles both pinned bodies into one actual runtime. Adding
// this bench driver invalidates the conservative whole-build fingerprint even
// though the compiler/runtime did not change; retain that status, not a false
// clean-source/public-product qualification. Public tests are separate.
console.log(JSON.stringify({schema:1,scope:"same-runtime renamed source-body materialization; not complete public-query qualification",
  baseline_commit:baseline,baseline_source_sha256:sha(before),candidate_source_sha256:sha(after),
  generated_probe_sha256:sha(program),collector_sha256:sha(fs.readFileSync(__filename)),
  node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model,
  runtime_commit:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),
  runtime_worktree_status:execFileSync("git",["status","--porcelain"],{cwd:root,encoding:"utf8"}).trim(),
  load:os.loadavg(),python:execFileSync(python,["--version"],{encoding:"utf8"}).trim(),
  warmups:3,samples:7,order:["A1","B1","B2","A2"],native_disabled:true,
  source_transformation:"Extract only materialize_json and rename its definition and recursive calls; both bodies compiled together",
  build_receipt:receipt,generated_probe:script,sagejs:nodeRows,cpython:pythonRows},null,2));
