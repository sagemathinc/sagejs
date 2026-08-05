"use strict";

// Workspace installation must remain fast and must not require a C toolchain.
// Source bootstrap and release CI invoke `pnpm build` explicitly.
process.stdout.write(
  "@sagemath/sagejs-graph: native build deferred; run pnpm build explicitly\n",
);
