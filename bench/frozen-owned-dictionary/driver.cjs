"use strict";
// Exact-artifact local diagnostic; not a public performance qualification.
const { createSage } = require("../tools/kernel.js");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const scenario = process.argv[2];
const variant = process.argv[3];
async function child() {
  const session = await createSage({ mode: "python" });
  try {
    const setup = `
from time import perf_counter
import sagejs.runtime as runtime
import sagejs._namespace as ns
class Record:
    pass
def no_guard(owner, namespace):
    pass
enabled = ${variant === "B" ? "True" : "False"}
if not enabled:
    ns._register_namespace_owner = no_guard
def owners(count):
    result = []
    for index in range(count):
        owner = Record()
        owner.value = index
        result.append(owner)
    return result
def plain_create(count):
    return [{"value": index} for index in range(count)]
def owned_expose(items):
    return [owner.__dict__ for owner in items]
def owned_write(mapping):
    for index in range(10000):
        mapping["value"] = index
def guard_state(mapping):
    return runtime.object.getOwnPropertyDescriptor(mapping.jsmap, "set") is not runtime.undefined
samples = []
for attempt in range(10):
    if ${JSON.stringify(scenario)} == "owned_expose":
        inputs = owners(1000)
        start = perf_counter()
        result = owned_expose(inputs)
        elapsed = (perf_counter() - start) * 1000
        assert len(result) == 1000 and result[-1]["value"] == 999
        assert result[0] is inputs[0].__dict__ and result[-1] is inputs[-1].__dict__
        assert guard_state(result[0]) == enabled and guard_state(result[-1]) == enabled
    elif ${JSON.stringify(scenario)} == "owned_write":
        owner = Record()
        owner.value = 0
        mapping = owner.__dict__
        assert guard_state(mapping) == enabled
        start = perf_counter()
        owned_write(mapping)
        elapsed = (perf_counter() - start) * 1000
        assert owner.value == 9999 and mapping["value"] == 9999
    else:
        start = perf_counter()
        result = plain_create(1000)
        elapsed = (perf_counter() - start) * 1000
        assert len(result) == 1000 and result[-1]["value"] == 999
        assert not guard_state(result[0]) and not guard_state(result[-1])
    if attempt >= 3:
        samples.append(elapsed)
print(samples)
`;
    const result = await session.evaluate(setup);
    console.log(JSON.stringify({ scenario, variant, node: process.version,
      samples: JSON.parse(result.stdout.trim()) }));
  } finally { await session.close(); }
}
if (scenario) {
  child().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  for (const workload of ["plain_create", "owned_expose", "owned_write"]) {
    for (const choice of ["A", "B", "B", "A"]) {
      const result = spawnSync(process.execPath, [__filename, workload, choice], {
        cwd: path.join(__dirname, "../.."), encoding: "utf8", timeout: 120000,
      });
      process.stdout.write(result.stdout);
      if (result.status !== 0) throw new Error(result.stderr || String(result.error));
    }
  }
}
