"use strict";

const { join, resolve } = require("node:path");

const packageRoot = resolve(__dirname, "..");
process.stdout.write(
  resolve(
    process.env.SAGEJS_M4RI_PREFIX || join(packageRoot, ".native", "prefix"),
  ),
);
