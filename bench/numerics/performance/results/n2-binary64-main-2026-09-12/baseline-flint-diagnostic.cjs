"use strict";
// Diagnostic only: source-identical FLINT package, built in the candidate's
// isolated checkout. Do not mutate the frozen baseline's filesystem.
const Module = require("node:module");
const candidate = "/home/user/sagejs-worktrees/perf-numerical-binary64-main/packages/flint/index.cjs";
const baseline = "/home/user/sagejs-worktrees/perf-numerical-main-baseline-5b307b65f/packages/flint/index.cjs";
const value = require(candidate);
const wrapper = new Module(baseline);
wrapper.filename = baseline;
wrapper.loaded = true;
wrapper.exports = value;
require.cache[baseline] = wrapper;
