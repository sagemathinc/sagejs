"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const source = require("./row20_phase6_aggregate_source.cjs");

const SOURCE = path.join(__dirname, "row20_phase6_aggregate_root.generated.py");
const EXPORT = "pari_row20_phase6_aggregate_root";

async function prepare(resident) {
  const built = await compileKernel({ sourcePath: SOURCE,
    cacheRoot: "/scratch/sagejs-native-cache-row20-phase6-aggregate" });
  const fn = require(built.modulePath)[EXPORT];
  assert.equal(fn?.nativeAvailable, true);
  const ownerSets = {
    factor: resident.factorResident.owners,
    hnf: resident.hnfInvocation.values,
    catalog: resident.analyticInvocation.cv,
    analytic: resident.analyticInvocation.av,
    acceptance: resident.acceptanceInvocation.values,
    unit: resident.unitResident.inputs,
  };
  const args = [];
  for (const [prefix, filename, name] of source.COMPONENTS)
    for (const [argument] of source.signature(filename, name)) {
      assert(Object.hasOwn(ownerSets[prefix], argument),
        `missing aggregate owner ${prefix}_${argument}`);
      args.push(ownerSets[prefix][argument]);
    }
  return Object.freeze({ args, built, fn });
}

function runNative(resident) { return resident.fn.gmp(...resident.args); }

module.exports = { EXPORT, SOURCE, prepare, runNative };
