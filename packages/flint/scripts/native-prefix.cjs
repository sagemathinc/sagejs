"use strict";

const { resolve } = require("node:path");

process.stdout.write(
  resolve(process.env.SAGEJS_FLINT_PREFIX || `${__dirname}/../.native/prefix`)
);
