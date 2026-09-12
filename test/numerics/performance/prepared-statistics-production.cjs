// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const test = require("node:test");
const layout = require("../../../tools/native-pack-layout.js");

const root = path.resolve(__dirname, "../../..");

test("dependency guard permits only the authenticated numerical pack path", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-pack-load-guard-"));
  try {
    const addon = path.join(directory, "sagejs_native_kernel_pack.node");
    // A cache-inventory fixture, not an executable addon or a backend receipt.
    fs.writeFileSync(addon, "guard fixture");
    const digest = createHash("sha256").update(fs.readFileSync(addon)).digest("hex");
    const other = path.join(directory, "exact", "sagejs_native_kernel_pack.node");
    const run = (loaded, hash) => spawnSync(process.execPath, [
      "--require", path.join(root, "test/helpers/assert-no-exact-numerical-load.cjs"),
      "-e", `require.cache[${JSON.stringify(loaded)}] = {};`,
    ], { encoding: "utf8", timeout: 10000, env: {
      ...process.env,
      SAGEJS_TEST_ALLOWED_NUMERICAL_PACK: addon,
      SAGEJS_TEST_ALLOWED_NUMERICAL_PACK_SHA256: hash,
    } });
    assert.equal(run(addon, digest).status, 0);
    const wrongPath = run(other, digest);
    assert.equal(wrongPath.status, 1);
    assert.match(wrongPath.stderr, /Unexpected exact-arithmetic/);
    const wrongHash = run(addon, "0".repeat(64));
    assert.equal(wrongHash.status, 1);
    assert.match(wrongHash.stderr, /invalid numerical-only pack authorization/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("public prepared statistics uses the production pack without exact dependencies", {
  timeout: 180000,
}, () => {
  const published = path.join(root, "dist/native-kernels");
  const index = JSON.parse(fs.readFileSync(path.join(published, "index.json"), "utf8"));
  layout.catalogPaths(index);
  const sources = ["_packed.py", "_packed_centered.py"].map(
    name => "sagejs/numerics/statistics/" + name,
  );
  const records = sources.map(source => {
    const record = index.logicalSources[source];
    assert.ok(record, "missing production statistics source: " + source);
    assert.ok(layout.selectedPack(index, record));
    return record;
  });
  assert.equal(records[0].packKey, records[1].packKey);
  assert.ok(index.packs.length >= 2, "the exact pack must be independently removable");

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-statistics-production-"));
  try {
    const cache = path.join(directory, "cache");
    fs.mkdirSync(cache);
    fs.copyFileSync(path.join(published, "index.json"), path.join(cache, "index.json"));
    const packPath = layout.packDirectory(records[0].packKey);
    fs.cpSync(path.join(published, packPath), path.join(cache, packPath), { recursive: true });
    const pack = layout.selectedPack(index, records[0]);
    const numericalAddon = path.join(cache, packPath, "pack", layout.PACK_FILENAME);
    for (const pack of index.packs) {
      if (pack.packKey !== records[0].packKey) {
        assert.equal(fs.existsSync(path.join(cache, layout.packDirectory(pack.packKey))), false);
      }
    }
    const source = 'EXPECTED_BACKEND = "source-native"\n' +
      fs.readFileSync(path.join(__dirname, "prepared-statistics.py"), "utf8");
    const filename = path.join(directory, "owned-statistics.py");
    fs.writeFileSync(filename, source);
    const result = spawnSync(process.execPath, [
      "--require", path.join(root, "test/helpers/assert-no-exact-numerical-load.cjs"),
      path.join(root, "bin/sagejs"), "--python", filename,
    ], {
      cwd: root,
      encoding: "utf8",
      timeout: 160000,
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        SAGEJS_NATIVE_CACHE_DIR: cache,
        SAGEJS_NATIVE_DISABLE: "0",
        SAGEJS_NATIVE_MODE: "auto",
        SAGEJS_NATIVE_REQUIRED: "0",
        SAGEJS_TEST_ALLOWED_NUMERICAL_PACK: numericalAddon,
        SAGEJS_TEST_ALLOWED_NUMERICAL_PACK_SHA256: pack.sha256,
      },
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.trim(), "prepared statistics passed");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
