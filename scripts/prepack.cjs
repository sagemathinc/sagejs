#!/usr/bin/env node
"use strict";

const { runPnpm } = require("./pnpm-invocation.cjs");

if (process.env.SAGEJS_SKIP_PREPACK === "1") {
  console.log("Skipping duplicate prepack tests after validated release CI");
  process.exit(0);
}

runPnpm(["test"], { stdio: "inherit" });
runPnpm(["python:precompile:run"], { stdio: "inherit" });
