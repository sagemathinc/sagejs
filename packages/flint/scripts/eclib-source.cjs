"use strict";

const { join, relative, resolve } = require("node:path");

const ECLIB_REVISION = "8dca7f18acedf7c2283a5d0e689c269f8258c981";
const ECLIB_SOURCE_NAME = `eclib-${ECLIB_REVISION}`;
const packageRoot = resolve(__dirname, "..");
const defaultPrefix = process.platform === "win32"
  ? join(
      packageRoot,
      ".native",
      "vcpkg-installed",
      "x64-windows-static-md-release",
    )
  : join(packageRoot, ".native", "prefix");
// Default builds keep the patched eclib source in the dependency prefix so a
// cached or prebuilt dependency installation remains sufficient to compile
// the addon. Custom prefixes retain the package-local source layout because
// node-gyp's Make generator cannot derive object paths from external sources.
const ECLIB_SOURCE_PATH = resolve(
  process.env.SAGEJS_FLINT_PREFIX
    ? join(packageRoot, ".native", "sources", ECLIB_SOURCE_NAME)
    : join(defaultPrefix, "share", "sagejs", ECLIB_SOURCE_NAME),
);

module.exports = {
  ECLIB_REVISION,
  ECLIB_SOURCE_NAME,
  ECLIB_SOURCE_PATH,
};

if (require.main === module) {
  // Keep node-gyp sources relative to module_root_dir.  Its make generator
  // cannot derive object targets from absolute source paths.
  process.stdout.write(relative(packageRoot, ECLIB_SOURCE_PATH));
}
