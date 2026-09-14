"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { buildSync } = require("esbuild");
const layout = require("../../../tools/native-pack-layout.js");

// This is a real executable, but deliberately only a native-pack loading
// fixture. It does not qualify the full Sage.js SEA product or Python frontend.
function qualifySeaFixture({ root, temporary, published, index, numerical, exact }) {
  const support = spawnSync(process.execPath, ["--help"], { encoding: "utf8" });
  assert.equal(support.status, 0, support.stderr);
  assert.match(support.stdout, /--build-sea/, "use a Node SEA builder supporting --build-sea");
  const directory = path.join(temporary, "sea-fixture");
  fs.mkdirSync(directory);
  const entry = path.join(directory, "entry.cjs");
  const program = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import path from 'node:path';
    import {isSea} from 'node:sea';
    import {loadPrecompiledNativeKernel, useSharedSingleExecutableNativeResourceDirectory}
      from ${JSON.stringify(path.join(root, "dist/tools/resources.js"))};
    assert.equal(isSea(), true);
    const extraction = path.resolve(process.argv[2]);
    useSharedSingleExecutableNativeResourceDirectory(extraction);
    let loaded;
    try {
      loaded = loadPrecompiledNativeKernel(
        ${JSON.stringify("/__sagejs_sea__/native-kernels/" + layout.modulePath(numerical))},
        'multipack-sea-fixture');
    } catch (error) {
      if (process.argv[3] !== 'reject') throw error;
      assert.match(String(error), /embedded production native mathematics pack is invalid/);
      assert.equal(fs.readdirSync(extraction).length, 0);
      console.log(JSON.stringify({sea: true, invalidManifestRejected: true}));
      process.exit(0);
    }
    assert.notEqual(process.argv[3], 'reject', 'invalid manifest unexpectedly loaded');
    assert.equal(loaded.finite_sum.nativeAvailable, true);
    const output = new Float64Array(1);
    assert.equal(loaded.finite_sum(new Float64Array([1e100, 1, -1e100]),
      new Float64Array(3), output, 3), 0);
    assert.equal(output[0], 1);
    assert.equal(fs.existsSync(path.join(extraction, 'native-kernels',
      ${JSON.stringify(layout.packDirectory(exact.packKey))})), false);
    console.log(JSON.stringify({sea: true, exactPackExtracted: false, sum: output[0],
      node: process.version, platform: process.platform, arch: process.arch}));
  `;
  buildSync({ stdin: { contents: program, resolveDir: root, sourcefile: "multipack-sea-entry.mjs" },
    outfile: entry, bundle: true, platform: "node", format: "cjs", target: "node22",
    treeShaking: true, packages: "external" });
  const records = [];
  for (const invalid of [false, true]) {
    const scenario = invalid ? "invalid" : "valid";
    const assets = Object.fromEntries(layout.catalogPaths(index)
      .map(relative => ["native-kernels/" + relative, path.join(published, relative)]));
    if (invalid) {
      const relative = `${layout.packDirectory(numerical.packKey)}/pack/index.json`;
      const manifest = JSON.parse(fs.readFileSync(path.join(published, relative), "utf8"));
      manifest.sha256 = "0".repeat(64);
      const filename = path.join(directory, "invalid-manifest.json");
      fs.writeFileSync(filename, JSON.stringify(manifest));
      assets["native-kernels/" + relative] = filename;
    }
    const executable = path.join(directory, scenario + (process.platform === "win32" ? ".exe" : ""));
    const config = path.join(directory, scenario + "-config.json");
    fs.writeFileSync(config, JSON.stringify({main:entry, output:executable,
      disableExperimentalSEAWarning:true, useSnapshot:false, useCodeCache:true, assets}));
    const build = spawnSync(process.execPath, ["--build-sea", config],
      {cwd:directory, encoding:"utf8", timeout:120000, maxBuffer:8*1024*1024});
    assert.equal(build.status, 0, build.error?.message || build.stdout + build.stderr);
    const isolated = path.join(directory, scenario + "-relocated");
    fs.mkdirSync(isolated);
    const relocated = path.join(isolated, path.basename(executable));
    fs.renameSync(executable, relocated);
    if (process.platform === "darwin") {
      const sign = spawnSync("codesign", ["--sign", "-", "--force", relocated], {encoding:"utf8"});
      assert.equal(sign.status, 0, sign.error?.message || sign.stderr);
    }
    const extraction = path.join(isolated, "extracted");
    fs.mkdirSync(extraction);
    const run = spawnSync(relocated, [extraction, ...(invalid ? ["reject"] : [])], {
      cwd:isolated, encoding:"utf8", timeout:60000,
      env:{...process.env, PATH:path.join(isolated,"no-compiler"), NODE_PATH:"",
        SAGEJS_NATIVE_CACHE_DIR:path.join(isolated,"absent-cache"),
        SAGEJS_FLINT_PREFIX:path.join(isolated,"absent-exact-prefix"),
        SAGEJS_NATIVE_MODE:"native", SAGEJS_NATIVE_REQUIRED:"1"},
    });
    assert.equal(run.status, 0, run.error?.message || run.stdout + run.stderr);
    records.push({scenario, result:JSON.parse(run.stdout.trim()),
      executableBytes:fs.statSync(relocated).size,
      executableSha256:createHash("sha256").update(fs.readFileSync(relocated)).digest("hex")});
  }
  return records;
}

module.exports = {qualifySeaFixture};
