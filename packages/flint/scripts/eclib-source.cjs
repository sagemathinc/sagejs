"use strict";

const { resolve } = require("node:path");

const ECLIB_REVISION = "8dca7f18acedf7c2283a5d0e689c269f8258c981";
const ECLIB_SOURCE_NAME = `eclib-${ECLIB_REVISION}`;
const ECLIB_SOURCE_PATH = resolve(
  __dirname,
  "..",
  ".native",
  "sources",
  ECLIB_SOURCE_NAME,
);

module.exports = {
  ECLIB_REVISION,
  ECLIB_SOURCE_NAME,
  ECLIB_SOURCE_PATH,
};

if (require.main === module) {
  // Keep node-gyp sources relative to module_root_dir.  Its make generator
  // cannot derive object targets from absolute source paths.
  process.stdout.write(`.native/sources/${ECLIB_SOURCE_NAME}`);
}
