// sagejs-test-tier: specialized
"use strict";

// Runner ownership is co-located in each test file. This module intentionally
// contains no path lists: independently developed branches can add tests
// without contending on a central secondary index.
const { discoverTestManifest } = require("../scripts/test-metadata.cjs");

module.exports = discoverTestManifest();
