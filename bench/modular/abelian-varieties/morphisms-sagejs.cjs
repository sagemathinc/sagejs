"use strict";
const { createSage } = require("../../../dist/tools/kernel.js");
(async () => {
  const wasm = process.argv.includes("--wasm");
  const factory = wasm ? (await import("../../../packages/flint-wasm/node-kernel.mjs")).createSage : createSage;
  const session = await factory();
  try {
    const decomposition = process.argv.includes("--decomposition");
    const levels = process.argv.slice(2).filter(x => x !== "--decomposition" && x !== "--wasm").map(Number);
    if (!levels.length) levels.push(11,33,37,43,101,389,1009);
    for (const level of levels) {
      if (!Number.isSafeInteger(level) || level <= 0) throw Error("invalid level");
      const result = await session.evaluate(`
import time, json
start=time.perf_counter()
J=J0(${level})
T=${decomposition ? "J.oldform_decomposition().isogeny()" : "J.hecke_morphism(2)-1"}
constructed=time.perf_counter()
invariants=T.component_group().invariants()
rank=T.rank()
done=time.perf_counter()
for repeat in range(10):
    assert T.component_group().invariants() == invariants
    assert T.rank() == rank
warm=time.perf_counter()
print(json.dumps({'system':'${wasm ? "Sage.js/Wasm" : "Sage.js"}','workload':'${decomposition ? "oldform-isogeny" : "T2-minus-1"}','level':${level},'dimension':J.dimension(),'rank':rank,'invariants':list(invariants),'construction_seconds':constructed-start,'smith_seconds':done-constructed,'warm_seconds':(warm-done)/10}))
`, { timeout: wasm ? 120000 : 600000 });
      process.stdout.write(result.stdout);
    }
  } finally { await session.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
