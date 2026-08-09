"use strict";

// `sagejs compile --output` deliberately emits portable JavaScript that can
// run outside Node and therefore cannot install Node filesystem/crypto hooks
// itself.  The performance runner executes that artifact under Node, so give
// it the same explicit host capability as the normal Sage.js CLI without
// placing compilation inside the timed process.
const { resolve } = require("node:path");
const { installNodeHost } = require("../../dist/tools/host.js");

if (process.argv.length < 3) {
  throw new Error("standalone-host.cjs requires a compiled JavaScript path");
}
const compiled = resolve(process.argv[2]);
// Make sys.argv indistinguishable from `node compiled.js ...`.
process.argv.splice(1, 2, compiled);
installNodeHost(globalThis, "python");
require(compiled);
