"use strict";

// Preload in a fresh public statistics process. Inspect actual loaded modules,
// not failed optional probes or the compiler's declaration-only source files.
process.on("exit", () => {
  const forbidden = Object.keys(require.cache).filter(filename =>
    /(?:[/\\]node_modules[/\\](?:@sagemath[/\\])?sagejs-(?:flint|pari)|[/\\]packages[/\\](?:flint|flint-wasm)[/\\](?:dist|lib|build)[/\\]|sagejs_native_kernel_pack\.node$|[/\\]node_modules[/\\]plotly(?:\.js)?[/\\])/.test(filename));
  if (forbidden.length) {
    process.stderr.write("Unexpected exact-arithmetic/renderer module load: " + forbidden.join(", ") + "\n");
    process.exitCode = 1;
  }
});
