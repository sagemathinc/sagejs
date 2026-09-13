#!/usr/bin/env node
"use strict";
const runtime = require("../package-qualification/runtime.cjs");
const target = runtime.targetForHost();
const context = runtime.prepareFreshInstall({
  target,
  rootArchive: "build/release/npm/sagejs.tgz",
  platformArchive: `build/release/npm/sagejs-${target}.tgz`,
});
try {
  console.log(`Fresh ${target} npm installation and archive closure verified`);
} finally {
  context.cleanup();
}
