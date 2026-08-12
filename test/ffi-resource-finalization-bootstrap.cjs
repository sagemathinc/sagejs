"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");
const declarationHash = "0".repeat(64);
const libraryIdentity = `test@${declarationHash}`;

function runFixture(manifest) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-ffi-finalizer-bootstrap-"));
  try {
    const report = join(directory, "report.json");
    const backend = join(directory, "backend.cjs");
    const program = join(directory, "program.py");
    writeFileSync(backend, [
      '"use strict";',
      'const { writeFileSync } = require("node:fs");',
      "let closes = 0;",
      "module.exports = {",
      `  __sagejs_ffi_manifest__: ${JSON.stringify(manifest)},`,
      "  create() { return Object.create(null); },",
      "  close() {",
      "    closes += 1;",
      "    writeFileSync(" + JSON.stringify(report) + ", JSON.stringify({",
      "      closes,",
      "      registry: globalThis.__sagejs_ffi_resource_registry__ !== undefined,",
      "    }));",
      "  },",
      "};",
      "",
    ].join("\n"));
    writeFileSync(program, [
      "import sagejs.runtime as runtime",
      "resource = runtime.ffi_resource_create(",
      `    ${JSON.stringify(`${libraryIdentity}:create`)},`,
      `    ${JSON.stringify(`resource:${libraryIdentity}:fixture`)},`,
      `    ${JSON.stringify(backend)},`,
      '    "create",',
      '    "close",',
      "    [], [], [],",
      '    "direct", None, None,',
      ")",
      "runtime.ffi_resource_close(resource)",
      "runtime.ffi_resource_close(resource)",
      "",
    ].join("\n"));
    const result = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), "--python", program],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return JSON.parse(readFileSync(report, "utf8"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("bootstrap trusts only matching generated self-finalization markers", () => {
  const capability = {
    schema: "sagejs.ffi/generated-host-adapter-v1",
    library: libraryIdentity,
    resource_lifecycle: {
      model: "node-api-basic-post-finalizer-v1",
      self_finalizing: true,
    },
  };
  assert.deepEqual(runFixture(capability), { closes: 1, registry: false });
  assert.deepEqual(
    runFixture({ ...capability, library: `other@${declarationHash}` }),
    { closes: 1, registry: true },
  );
});

test("unmarked third-party backends retain the JavaScript finalizer fallback", () => {
  assert.deepEqual(runFixture(undefined), { closes: 1, registry: true });
});
