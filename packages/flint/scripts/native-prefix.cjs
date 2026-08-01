"use strict";

const { join, resolve } = require("node:path");

const defaultPrefix = process.platform === "win32"
  ? join(
      __dirname,
      "..",
      ".native",
      "vcpkg-installed",
      "x64-windows-static-md-release",
    )
  : join(__dirname, "..", ".native", "prefix");

process.stdout.write(
  resolve(process.env.SAGEJS_FLINT_PREFIX || defaultPrefix)
);
