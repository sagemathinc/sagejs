"use strict";

const { readFileSync, readdirSync } = require("node:fs");
const { join, relative, resolve, sep } = require("node:path");

const ROOT = resolve(__dirname, "..");
const TEST_DIRECTORY = "test";
const TIERS = new Set(["unit", "integration", "specialized"]);
const HEADER_LINES = 12;

function repositoryPath(root, filename) {
  return relative(root, filename).split(sep).join("/");
}

function nestedTestFiles(directory, answer = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) nestedTestFiles(filename, answer);
    else if (entry.isFile() && entry.name === "test.cjs") answer.push(filename);
  }
  return answer;
}

function discoverTestFiles(root = ROOT) {
  const testDirectory = join(root, TEST_DIRECTORY);
  const topLevel = readdirSync(testDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".cjs"))
    .map((entry) => join(testDirectory, entry.name));
  const nested = nestedTestFiles(testDirectory)
    .filter((filename) => filename.slice(testDirectory.length + 1).includes(sep));
  return [...topLevel, ...nested]
    .map((filename) => repositoryPath(root, filename))
    .sort();
}

function oneMarker(lines, prefix, filename) {
  const matches = lines.filter((line) => line.startsWith(prefix));
  if (matches.length > 1) {
    throw new Error(`${filename} repeats ${prefix.slice(3).replace(/:\s*$/, "")} metadata`);
  }
  return matches[0]?.slice(prefix.length);
}

function parseTestMetadata(source, filename = "test file") {
  const lines = source.split(/\r?\n/, HEADER_LINES + 1).slice(0, HEADER_LINES);
  const metadataLines = lines.filter((line) => line.startsWith("// sagejs-test-"));
  const recognized = new Set([
    "// sagejs-test-tier:",
    "// sagejs-test-portable:",
    "// sagejs-test-smoke:",
    "// sagejs-test-platform:",
  ]);
  for (const line of metadataLines) {
    const key = `${line.split(":", 1)[0]}:`;
    if (!recognized.has(key)) throw new Error(`${filename} has unknown test metadata: ${line}`);
  }

  const tier = oneMarker(lines, "// sagejs-test-tier: ", filename);
  if (tier === undefined) {
    throw new Error(
      `${filename} needs a co-located // sagejs-test-tier: ` +
        "unit, integration, or specialized declaration",
    );
  }
  if (!TIERS.has(tier)) throw new Error(`${filename} has unknown test tier ${tier}`);

  const portableValue = oneMarker(lines, "// sagejs-test-portable: ", filename);
  if (portableValue !== undefined && !["true", "false"].includes(portableValue)) {
    throw new Error(`${filename} has invalid portable metadata ${portableValue}`);
  }
  if (portableValue !== undefined && tier !== "unit") {
    throw new Error(`${filename} can only declare portability in the unit tier`);
  }
  const smokeValue = oneMarker(lines, "// sagejs-test-smoke: ", filename);
  if (smokeValue !== undefined && smokeValue !== "true") {
    throw new Error(`${filename} has invalid smoke metadata ${smokeValue}`);
  }
  const platformValue = oneMarker(lines, "// sagejs-test-platform: ", filename);
  if (platformValue !== undefined && platformValue !== "true") {
    throw new Error(`${filename} has invalid platform metadata ${platformValue}`);
  }
  if ((smokeValue !== undefined || platformValue !== undefined) && tier === "specialized") {
    throw new Error(`${filename} cannot put a specialized test in a routine runner profile`);
  }
  if (platformValue !== undefined && tier !== "unit") {
    throw new Error(`${filename} platform tests must belong to the unit tier`);
  }

  return Object.freeze({
    tier,
    portable: tier === "unit" && portableValue !== "false",
    smoke: smokeValue === "true",
    platform: platformValue === "true",
  });
}

function discoverTestManifest(root = ROOT) {
  const records = discoverTestFiles(root).map((filename) => ({
    filename,
    ...parseTestMetadata(readFileSync(join(root, filename), "utf8"), filename),
  }));
  const select = (predicate) => records.filter(predicate).map((item) => item.filename);
  const unit = select((item) => item.tier === "unit");
  const integration = select((item) => item.tier === "integration");
  const specialized = select((item) => item.tier === "specialized");
  const portable = select((item) => item.portable);
  const smoke = select((item) => item.smoke);
  const platform = select((item) => item.platform);
  return Object.freeze({
    portable,
    unit,
    smoke,
    platform,
    integration,
    specialized,
    all: [...unit, ...integration],
    records: records.map(Object.freeze),
  });
}

module.exports = {
  discoverTestFiles,
  discoverTestManifest,
  parseTestMetadata,
};
