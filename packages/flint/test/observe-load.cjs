"use strict";

const Module = require("node:module");

const originalLoad = Module._load;

Module._load = function observeFlintLoad(request) {
  if (request === "@sagemath/sagejs-flint") {
    process.stderr.write("SAGEJS_FLINT_LOADED\n");
  }
  return Reflect.apply(originalLoad, this, arguments);
};
