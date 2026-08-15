#!/usr/bin/env node
"use strict";

const { writeInternalChecksums } = require("./release-artifact-acceptance.cjs");

function main(arguments_ = process.argv.slice(2)) {
  if (arguments_.length !== 1 || arguments_.includes("--help")) {
    const stream = arguments_.includes("--help") ? process.stdout : process.stderr;
    stream.write(
      "Usage: node scripts/write-release-checksums.cjs DISTRIBUTION\n",
    );
    if (!arguments_.includes("--help")) process.exitCode = 2;
    return;
  }
  const result = writeInternalChecksums(arguments_[0]);
  console.log(
    `Wrote ${result.output} for ${result.files.length} regular file(s); ` +
      `SHA-256 ${result.sha256}.`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
}

module.exports = { main };
