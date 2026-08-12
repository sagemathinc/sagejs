"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const test = require("node:test");

const { loadRegistry } = require("../tools/ffi/declarations.cjs");
const { generatedHostAdapterSource } = require(
  "../tools/ffi/host-adapters.cjs"
);
const {
  adapterPaths,
  hostAdapterManifest,
  publishHostAdapter,
  reconcileInstalledHostAdapters,
} = require("../scripts/build-ffi-host-adapter.cjs");

const repositoryRoot = join(__dirname, "..");
const declaration = loadRegistry({ root: repositoryRoot }).byId.get("flint");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sagejs-ffi-build-graph-"));
  const paths = adapterPaths(root, declaration);
  const expected = generatedHostAdapterSource(declaration);
  mkdirSync(dirname(paths.sourcePath), { recursive: true });
  writeFileSync(paths.sourcePath, expected);
  const artifacts = join(root, "artifacts");
  mkdirSync(artifacts, { recursive: true });
  const compiled = {
    addonPath: join(artifacts, "addon.node"),
    cacheKey: "cache-a",
    coreHeaderPath: join(artifacts, "kernel_core.h"),
    coreSourcePath: join(artifacts, "kernel_core.c"),
  };
  writeFileSync(compiled.addonPath, "native-addon-a");
  writeFileSync(compiled.coreHeaderPath, "/* header a */\n");
  writeFileSync(compiled.coreSourcePath, "/* core a */\n");
  return {
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    expected,
    paths,
    resolved: { compiled, expected, paths },
    root,
  };
}

function registry() {
  return { libraries: [declaration] };
}

test("ordinary build order generates declarations before adapter reconciliation", () => {
  const source = readFileSync(join(repositoryRoot, "scripts", "build.cjs"), "utf8");
  const generate = source.indexOf('"ffi", "generate"');
  const moduleCache = source.indexOf('"build-module-cache.cjs"');
  const reconcile = source.indexOf('"--reconcile-installed"');
  const production = source.indexOf('"build-production-native-kernels.cjs"');
  assert.ok(generate >= 0);
  assert.ok(generate < moduleCache);
  assert.ok(moduleCache < reconcile);
  assert.ok(reconcile < production);
});

test("absent optional adapters are reported without resolving or building", async () => {
  const item = fixture();
  try {
    // An empty build directory is not an installed adapter and must not turn
    // an ordinary source build into optional native dependency provisioning.
    mkdirSync(item.paths.outputDirectory, { recursive: true });
    let resolutions = 0;
    let publications = 0;
    const reports = await reconcileInstalledHostAdapters({
      repositoryRoot: item.root,
      registry: registry(),
      resolve: async () => {
        resolutions += 1;
        return item.resolved;
      },
      publish: () => {
        publications += 1;
      },
    });
    assert.deepEqual(reports, [{ library: "flint", status: "skipped-absent" }]);
    assert.equal(resolutions, 0);
    assert.equal(publications, 0);
  } finally {
    item.cleanup();
  }
});

test("warm installed adapters resolve their cache key without republication", async () => {
  const item = fixture();
  try {
    publishHostAdapter(item.root, declaration, item.resolved);
    const before = readFileSync(item.paths.addonPath);
    let resolutions = 0;
    let publications = 0;
    const reports = await reconcileInstalledHostAdapters({
      repositoryRoot: item.root,
      registry: registry(),
      resolve: async () => {
        resolutions += 1;
        return item.resolved;
      },
      publish: () => {
        publications += 1;
      },
    });
    assert.equal(reports[0].status, "current");
    assert.equal(reports[0].cacheKey, "cache-a");
    assert.equal(resolutions, 1);
    assert.equal(publications, 0);
    assert.deepEqual(readFileSync(item.paths.addonPath), before);
  } finally {
    item.cleanup();
  }
});

test("stale manifests and changed native input keys republish exactly once", async () => {
  const item = fixture();
  try {
    publishHostAdapter(item.root, declaration, item.resolved);
    const stale = JSON.parse(readFileSync(item.paths.manifestPath, "utf8"));
    stale.source_hash = "0".repeat(64);
    writeFileSync(item.paths.manifestPath, `${JSON.stringify(stale, null, 2)}\n`);
    let publications = 0;
    let reports = await reconcileInstalledHostAdapters({
      repositoryRoot: item.root,
      registry: registry(),
      resolve: async () => item.resolved,
      publish: (...args) => {
        publications += 1;
        return publishHostAdapter(...args);
      },
    });
    assert.equal(reports[0].status, "rebuilt");
    assert.match(reports[0].reason, /source_hash/);
    assert.equal(publications, 1);
    assert.deepEqual(
      JSON.parse(readFileSync(item.paths.manifestPath, "utf8")),
      hostAdapterManifest(item.root, declaration, item.resolved),
    );

    const next = structuredClone(item.resolved);
    next.compiled.cacheKey = "cache-b";
    next.compiled.addonPath = join(item.root, "artifacts", "addon-b.node");
    writeFileSync(next.compiled.addonPath, "native-addon-b");
    reports = await reconcileInstalledHostAdapters({
      repositoryRoot: item.root,
      registry: registry(),
      resolve: async () => next,
      publish: (...args) => {
        publications += 1;
        return publishHostAdapter(...args);
      },
    });
    assert.equal(reports[0].status, "rebuilt");
    assert.match(reports[0].reason, /cache_key/);
    assert.equal(publications, 2);
    assert.equal(
      JSON.parse(readFileSync(item.paths.manifestPath, "utf8")).cache_key,
      "cache-b",
    );
    assert.equal(readFileSync(item.paths.addonPath, "utf8"), "native-addon-b");
  } finally {
    item.cleanup();
  }
});

test("tampered installed addon bytes cannot masquerade as current", async () => {
  const item = fixture();
  try {
    publishHostAdapter(item.root, declaration, item.resolved);
    writeFileSync(item.paths.addonPath, "wrong-addon");
    const reports = await reconcileInstalledHostAdapters({
      repositoryRoot: item.root,
      registry: registry(),
      resolve: async () => item.resolved,
      publish: (...args) => publishHostAdapter(...args),
    });
    assert.equal(reports[0].status, "rebuilt");
    assert.match(reports[0].reason, /addon content/);
    assert.equal(readFileSync(item.paths.addonPath, "utf8"), "native-addon-a");
  } finally {
    item.cleanup();
  }
});
