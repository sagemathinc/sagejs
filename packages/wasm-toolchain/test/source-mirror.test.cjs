"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const mirrorModule = pathToFileURL(join(
  __dirname,
  "..",
  "..",
  "..",
  "tools",
  "source-mirror",
  "scripts",
  "source-mirror.mjs",
)).href;
const { sourceFilename } = require("../scripts/toolchain.cjs");

test("the neutral mirror selects platform and shared objects", async () => {
  const { mirrorObjects, objectKey } = await import(mirrorModule);
  const catalog = {
    r2Prefix: "native-sources/v2",
    objects: [
      { id: "shared", sha256: "a".repeat(64), filename: "shared.tar" },
      { id: "linux", sha256: "b".repeat(64), filename: "linux.tar", platform: "linux-x64" },
      { id: "darwin", sha256: "c".repeat(64), filename: "darwin.tar", platform: "darwin-arm64" },
    ],
  };
  assert.deepEqual(
    mirrorObjects(catalog, { platform: "linux-x64" }).map(({ id }) => id),
    ["shared", "linux"],
  );
  assert.equal(
    objectKey(catalog, catalog.objects[0]),
    `native-sources/v2/sha256/${"a".repeat(64)}/shared.tar`,
  );
});

test("desktop archive environments are emitted only after digest verification", async () => {
  const { sourceArchiveEnvironment } = await import(mirrorModule);
  const root = mkdtempSync(join(tmpdir(), "sagejs-source-mirror-v2-test-"));
  const contents = Buffer.from("authenticated source archive\n");
  const object = {
    id: "native-library",
    filename: "native-library.tar.xz",
    sha256: createHash("sha256").update(contents).digest("hex"),
    archiveEnvironment: "SAGEJS_NATIVE_LIBRARY_TARBALL",
    upstreamUrls: ["https://example.invalid/native-library.tar.xz"],
  };
  const catalog = { r2Prefix: "native-sources/v2", objects: [object] };
  const filename = sourceFilename(root, object);
  try {
    mkdirSync(dirname(filename), { recursive: true });
    writeFileSync(filename, contents);
    assert.deepEqual(
      await sourceArchiveEnvironment({ input: root, catalog }),
      { SAGEJS_NATIVE_LIBRARY_TARBALL: filename },
    );
    writeFileSync(filename, "tampered\n");
    await assert.rejects(
      sourceArchiveEnvironment({ input: root, catalog }),
      /source digest/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
