"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { win32 } = require("node:path");

const sea = require("node:sea");
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
