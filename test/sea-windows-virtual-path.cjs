"use strict";

const assert = require("node:assert/strict");
const { existsSync, readFileSync, readdirSync } = require("node:fs");
const test = require("node:test");
const { join, resolve, win32 } = require("node:path");

const sea = require("node:sea");
const root = resolve(__dirname, "..");
const resourcesFilename = require.resolve("../dist/tools/resources.js");
const cacheKey = "a".repeat(64);
const source = "def embedded_kernel():\n    return 42\n";
const wrapper = [
  "function embedded_kernel() { return 42; }",
  "embedded_kernel.nativeAvailable = true;",
  "module.exports = { embedded_kernel };",
  "",
].join("\n");
const assets = new Map([
  ["lib/sagejs/kernels/embedded.py", Buffer.from(source)],
  [`native-kernels/${cacheKey}/index.cjs`, Buffer.from(wrapper)],
  [
    `native-kernels/${cacheKey}/build/Release/sagejs_native_kernel.node`,
    Buffer.from("fixture addon bytes"),
  ],
]);

function checkoutRootSpellings() {
  const spellings = new Set([
    root,
    root.replaceAll("\\", "/"),
    root.replaceAll("/", "\\"),
  ]);
  for (const spelling of [...spellings]) {
    spellings.add(JSON.stringify(spelling).slice(1, -1));
  }
  return [...spellings];
}

function assertOmitsCheckoutRoot(filename) {
  const bytes = readFileSync(filename);
  const latin1 = bytes.toString("latin1").toLowerCase();
  const utf16 = bytes
    .subarray(0, bytes.length - (bytes.length % 2))
    .toString("utf16le")
    .toLowerCase();
  for (const spelling of checkoutRootSpellings()) {
    const lower = spelling.toLowerCase();
    assert.equal(
      latin1.includes(lower),
      false,
      `${filename} embeds the physical checkout root as single-byte text`,
    );
    assert.equal(
      utf16.includes(lower),
      false,
      `${filename} embeds the physical checkout root as UTF-16LE text`,
    );
  }
}

test("release compiler and cache artifacts omit the physical checkout root", () => {
  for (const relativeDirectory of ["dist/compiler", "dist/runtime-cache"]) {
    const directory = join(root, relativeDirectory);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile()) assertOmitsCheckoutRoot(join(directory, entry.name));
    }
  }

  const moduleCacheDirectory = join(root, "dist", "module-cache");
  const cacheFilenames = readdirSync(moduleCacheDirectory)
    .filter((filename) => filename.endsWith(".json"))
    .sort();
  assert.ok(cacheFilenames.length > 0, "module cache artifacts must exist");
  for (const filename of cacheFilenames) {
    const fullFilename = join(moduleCacheDirectory, filename);
    assertOmitsCheckoutRoot(fullFilename);
    const cached = JSON.parse(readFileSync(fullFilename, "utf8"));
    assert.equal(cached.filename_policy, null, `${filename} must be relocatable`);
    assert.equal(
      typeof cached.filename,
      "string",
      `${filename} must retain stable source metadata`,
    );
    assert.equal(
      cached.filename.startsWith("src/lib/"),
      true,
      `${filename} must use stable library source metadata`,
    );
    assert.equal(cached.filename.includes("\\"), false);
    assert.equal(existsSync(join(root, cached.filename)), true);
  }
});

test("drive-resolved Windows SEA paths retain embedded native availability", () => {
  const original = {
    getAsset: sea.getAsset,
    getAssetKeys: sea.getAssetKeys,
    isSea: sea.isSea,
  };
  sea.isSea = () => true;
  sea.getAssetKeys = () => [...assets.keys()];
  sea.getAsset = (key) => assets.get(key);
  delete require.cache[resourcesFilename];
  const resources = require(resourcesFilename);

  try {
    const sourcePath = win32.resolve(
      "C:\\checkout",
      "\\__sagejs_sea__\\lib\\sagejs\\kernels\\embedded.py",
    );
    assert.equal(
      sourcePath,
      "C:\\__sagejs_sea__\\lib\\sagejs\\kernels\\embedded.py",
    );
    assert.equal(resources.readResourceText(sourcePath), source);
    assert.equal(
      resources.readResourceText(
        "/__sagejs_sea__/lib/sagejs/kernels/embedded.py",
      ),
      source,
      "POSIX virtual paths must retain their existing behavior",
    );

    const modulePath = win32.resolve(
      "C:\\checkout",
      `\\__sagejs_sea__\\native-kernels\\${cacheKey}\\index.cjs`,
    );
    const loaded = resources.loadPrecompiledNativeKernel(modulePath);
    assert.equal(loaded.embedded_kernel(), 42);
    assert.equal(loaded.embedded_kernel.nativeAvailable, true);

    assert.throws(
      () => resources.readResourceText(
        "C:\\__sagejs_sea___other\\lib\\sagejs\\kernels\\embedded.py",
      ),
      /ENOENT/,
      "sibling filesystem paths must not be treated as embedded assets",
    );
  } finally {
    resources.cleanNativeResources();
    sea.isSea = original.isSea;
    sea.getAsset = original.getAsset;
    sea.getAssetKeys = original.getAssetKeys;
    delete require.cache[resourcesFilename];
  }
});
