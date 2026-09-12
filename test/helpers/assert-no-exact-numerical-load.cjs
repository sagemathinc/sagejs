"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
// Production-pack tests may authorize one exact, authenticated numerical-only
// artifact. The default remains reject-all for aggregate packs. Never exempt a
// basename or an entire cache directory: the exact pack uses the same basename.
const allowedPack = process.env.SAGEJS_TEST_ALLOWED_NUMERICAL_PACK;
const allowedHash = process.env.SAGEJS_TEST_ALLOWED_NUMERICAL_PACK_SHA256;
if (allowedPack !== undefined || allowedHash !== undefined) {
  if (!allowedPack || !path.isAbsolute(allowedPack) ||
      path.basename(allowedPack) !== "sagejs_native_kernel_pack.node" ||
      !/^[a-f0-9]{64}$/.test(allowedHash || "") ||
      createHash("sha256").update(fs.readFileSync(allowedPack)).digest("hex") !== allowedHash) {
    throw new Error("invalid numerical-only pack authorization");
  }
}

// Preload in a fresh public statistics process. Inspect actual loaded modules,
// not failed optional probes or the compiler's declaration-only source files.
process.on("exit", () => {
  const forbidden = Object.keys(require.cache).filter(filename =>
    /(?:[/\\]node_modules[/\\](?:@sagemath[/\\])?sagejs-(?:flint|pari)|[/\\]packages[/\\](?:flint|flint-wasm)[/\\](?:dist|lib|build)[/\\]|sagejs_native_kernel_pack\.node$|[/\\]node_modules[/\\]plotly(?:\.js)?[/\\])/.test(filename) &&
    filename !== allowedPack);
  if (forbidden.length) {
    process.stderr.write("Unexpected exact-arithmetic/renderer module load: " + forbidden.join(", ") + "\n");
    process.exitCode = 1;
  }
});
