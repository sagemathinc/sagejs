"use strict";

const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const packageRoot = resolve(__dirname, "..", "..");
const expectedLicenses = {
  LICENSE: "3a3d01909dbd4ef225282abd72285f8e5d104b1892695e3fb830181f4117a397",
  COPYING: "00f9c0b8927deae0e654d2d3c41d802db606e757e7ac2c67caf7ce002d10619f",
};

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function prepareRforestSource(source) {
  for (const [name, expected] of Object.entries(expectedLicenses)) {
    const path = join(source, name);
    if (digest(path) !== expected) {
      throw new Error(`rforest ${name} does not match pinned upstream text`);
    }
    const checked = join(__dirname, "licenses", name);
    if (digest(checked) !== expected) {
      throw new Error(`checked-in rforest ${name} does not match pinned text`);
    }
  }

  const header = join(source, "hwmpz.h");
  writeFileSync(header, readFileSync(header, "utf8").replace(/\r\n/g, "\n"));
  const result = spawnSync(
    "git",
    [
      "apply",
      "--whitespace=nowarn",
      join(packageRoot, "patches", "rforest-portability.patch"),
    ],
    {
      cwd: source,
      encoding: "utf8",
      env: { ...process.env, GIT_CEILING_DIRECTORIES: packageRoot },
    },
  );
  if (result.status !== 0) {
    throw new Error(`unable to patch rforest\n${result.stdout}${result.stderr}`);
  }
}

if (require.main === module) {
  if (process.argv.length !== 3) {
    throw new Error("usage: node prepare-sources.cjs RFOREST_SOURCE");
  }
  prepareRforestSource(resolve(process.argv[2]));
}

module.exports = { expectedLicenses, prepareRforestSource };
