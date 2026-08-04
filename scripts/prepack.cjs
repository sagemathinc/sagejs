#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");

if (process.env.SAGEJS_SKIP_PREPACK === "1") {
  console.log("Skipping duplicate prepack tests after validated release CI");
  process.exit(0);
}

const pnpmEntrypoint = process.env.npm_execpath;
if (pnpmEntrypoint) {
  execFileSync(process.execPath, [pnpmEntrypoint, "test"], {
    stdio: "inherit",
  });
} else {
  execFileSync("pnpm", ["test"], { stdio: "inherit" });
}
