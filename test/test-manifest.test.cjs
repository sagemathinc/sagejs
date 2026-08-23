// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const test = require("node:test");

const manifest = require("./node-test-manifest.cjs");
const {
  discoverTestFiles,
  discoverTestManifest,
  parseTestMetadata,
} = require("../scripts/test-metadata.cjs");

const root = resolve(__dirname, "..");

test("every host test owns its runner tier beside its source", () => {
  const discovered = discoverTestFiles(root);
  assert.deepEqual(
    manifest.records.map((item) => item.filename),
    discovered,
  );
  assert.equal(new Set(manifest.all).size, manifest.all.length);
  assert.deepEqual(
    [...manifest.all, ...manifest.specialized].sort(),
    discovered,
  );
  assert.ok(manifest.portable.every((filename) => manifest.unit.includes(filename)));
  assert.ok(manifest.platform.every((filename) => manifest.unit.includes(filename)));
  assert.ok(manifest.smoke.every((filename) => manifest.all.includes(filename)));
  assert.deepEqual(discoverTestManifest(root), manifest);

  const centralSource = readFileSync(join(root, "test/node-test-manifest.cjs"), "utf8");
  assert.doesNotMatch(centralSource, /["']test\//);
});

test("missing, duplicate, and invalid co-located metadata fail closed", () => {
  assert.throws(() => parseTestMetadata('"use strict";\n', "test/new.cjs"), /needs a co-located/);
  assert.throws(
    () => parseTestMetadata(
      "// sagejs-test-tier: unit\n// sagejs-test-tier: integration\n",
      "test/repeated.cjs",
    ),
    /repeats sagejs-test-tier metadata/,
  );
  assert.throws(
    () => parseTestMetadata("// sagejs-test-tier: overnight\n", "test/unknown.cjs"),
    /unknown test tier overnight/,
  );
  assert.throws(
    () => parseTestMetadata(
      "// sagejs-test-tier: specialized\n// sagejs-test-smoke: true\n",
      "test/specialized.cjs",
    ),
    /cannot put a specialized test/,
  );
  assert.throws(
    () => parseTestMetadata(
      "// sagejs-test-tier: unit\nconst flint = " +
        "require(" + "'../packages/flint');\n",
      "test/native-on-clean-runner.cjs",
    ),
    /must declare.*sagejs-test-portable: false/,
  );
});
