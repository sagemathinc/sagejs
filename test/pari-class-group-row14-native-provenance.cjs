"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const provenance = require(
  "../bench/pari-class-group-port/row14_live_native_provenance.cjs"
);

const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function fakeBuilt(root, serial) {
  const outputPath = path.join(root, `build-${serial}`);
  fs.mkdirSync(path.join(outputPath, "build", "Release"), { recursive: true });
  const sourcePath = path.join(root, `source-${serial}.py`);
  const dependencyPath = path.join(root, `dependency-${serial}.py`);
  const source = `def f_${serial}():\n    return ${serial}\n`;
  const dependency = `VALUE_${serial} = ${serial}\n`;
  fs.writeFileSync(sourcePath, source);
  fs.writeFileSync(dependencyPath, dependency);
  const cacheKey = hash(`cache-${serial}`);
  const moduleIdentity = cacheKey.slice(0, 16);
  const files = {
    addonPath: path.join(outputPath, "build", "Release",
      "sagejs_native_kernel.node"),
    modulePath: path.join(outputPath, "index.cjs"),
    manifestPath: path.join(outputPath, "manifest.json"),
    coreSourcePath: path.join(outputPath, "kernel_core.c"),
    coreHeaderPath: path.join(outputPath, "kernel_core.h"),
  };
  fs.writeFileSync(files.addonPath, `addon-${serial}`);
  fs.writeFileSync(files.modulePath, `module.exports = ${serial};\n`);
  fs.writeFileSync(files.coreSourcePath, `int core_${serial};\n`);
  fs.writeFileSync(files.coreHeaderPath, `extern int core_${serial};\n`);
  fs.writeFileSync(path.join(outputPath, "kernel.c"), `int adapter_${serial};\n`);
  fs.writeFileSync(path.join(outputPath, "binding.gyp"), JSON.stringify({
    targets: [{ target_name: "sagejs_native_kernel", sources: ["kernel.c"],
      libraries: [] }],
  }));
  fs.writeFileSync(files.manifestPath, JSON.stringify({
    cacheKey, moduleIdentity, nativeAbi: 24, sourcePath,
    sourceHash: hash(source), foreignInputs: [],
    hostIsolation: { isolated: true, hostCallbacks: 0,
      kernelKinds: ["integer"] },
    ir: { nativeSourceDependencies: [{ path: dependencyPath,
      sha256: hash(dependency) }] },
  }));
  return { ...files, outputPath, cacheKey, moduleIdentity, nativeAbi: 24,
    shimSourcePath: null, shimHeaderPath: null };
}

function fakeResident(builds) {
  return {
    rootBuilt: builds[0],
    gateKernels: {
      collector: { built: builds[1] }, hnfspec: { built: builds[2] },
      next: { built: builds[3] }, hnfadd: { built: builds[4] },
    },
    classAssembly: { built: builds[5] },
    postCatalog: { built: builds[6] },
    postTerminal: { built: builds[7] },
    units: {
      selection: { built: builds[8] }, integer: { built: builds[9] },
      real: { built: builds[9] }, compose: { built: builds[9] },
      logs: { built: builds[10] }, clean: { built: builds[11] },
      prepare: { built: builds[11] }, getfu: { built: builds[12] },
    },
  };
}

test("row-14 provenance closes 13 unique warmed native built objects", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "row14-provenance-"));
  try {
    const builds = Array.from({ length: 13 }, (_, index) =>
      fakeBuilt(root, index));
    const resident = fakeResident(builds);
    const inventory = provenance.row14BuiltObjects(resident);
    assert.equal(inventory.length, 13);
    assert.deepEqual(inventory.find(row => row.label === "unit.integer").labels,
      ["unit.integer", "unit.real", "unit.compose"]);
    const report = provenance.collectRow14LiveNativeProvenance(resident, {
      inspectRuntimeDependencies: false, collectToolchain: false,
    });
    assert.equal(report.schema, provenance.SCHEMA);
    assert.equal(report.buildCount, 13);
    assert.match(report.sha256, /^[0-9a-f]{64}$/);
    assert(report.builds.every(row => row.artifacts.addon.sha256.length === 64));
    assert(report.builds.every(row => row.dependencies.length === 2));
    assert.equal(report.builds[9].labels.length, 3);

    fs.appendFileSync(path.join(root, "dependency-4.py"), "MUTATION = 1\n");
    assert.throws(() => provenance.collectRow14LiveNativeProvenance(resident, {
      inspectRuntimeDependencies: false, collectToolchain: false,
    }), /changed after native warmup/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("row-14 provenance rejects a missing native owner", () => {
  assert.throws(() => provenance.row14BuiltObjects({
    rootBuilt: { cacheKey: "a".repeat(64) }, gateKernels: {}, units: {},
  }), /class-assembly lacks native built metadata/);
});
