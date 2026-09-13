// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const disabledNativePublicCenter = require("./helpers/disabled-native-group-center.cjs");

test("full S8 disabled-native center agrees with the independent fallback", () => {
  assert.equal(disabledNativePublicCenter(
    ["(1,2,3,4,5,6,7,8)", "(1,2)"], 120_000),
  "[40320, True, 'portable-computation', 'compiled-source-unavailable', 0, 1034577]");
});
