"use strict";

const { join, resolve } = require("node:path");

const packageRoot = resolve(__dirname, "..");
process.stdout.write(
  resolve(
    process.env.SAGEJS_FFLAS_PREFIX || join(packageRoot, ".native", "prefix"),
  ),
);
