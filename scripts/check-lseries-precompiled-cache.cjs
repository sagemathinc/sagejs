"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const cli = join(root, "bin", "sagejs");
const precompiledDirectory = join(root, "dist", "lazy-module-cache");
const lseriesCacheFilename = join(
  precompiledDirectory,
  "sagejs-elliptic_curves-lseries.json",
);
const filenameMarker = "__sagejs_precompiled_module_filename__";

function filesBelow(directory) {
  const answer = [];
  if (!existsSync(directory)) return answer;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) answer.push(...filesBelow(filename));
    else answer.push(filename);
  }
  return answer;
}

test("the production lazy cache contains and materializes elliptic L-series", () => {
  assert.ok(
    existsSync(lseriesCacheFilename),
    "run `pnpm python:precompile:run` before this focused regression",
  );
  const precompiled = JSON.parse(readFileSync(lseriesCacheFilename, "utf8"));
  assert.equal(precompiled.module, "sagejs.elliptic_curves.lseries");
  assert.equal(precompiled.mode, "python");
  assert.equal(typeof precompiled.version, "string");
  assert.equal(typeof precompiled.signature, "string");
  assert.equal(typeof precompiled.javascriptTemplate, "string");
  assert.ok(
    precompiled.javascriptTemplate.includes(JSON.stringify(filenameMarker)),
  );

  const temporary = mkdtempSync(join(tmpdir(), "sagejs-lseries-precompile-"));
  try {
    const result = spawnSync(process.execPath, [cli, "--python"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        XDG_CACHE_HOME: temporary,
        SAGEJS_PRECOMPILED_MODULE_CACHE_DIR: precompiledDirectory,
      },
      input: [
        "import sagejs.elliptic_curves.lseries as lseries",
        "print(lseries.__name__)",
        "",
      ].join("\n"),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "sagejs.elliptic_curves.lseries");

    const materializedFilename = filesBelow(
      join(temporary, "sagejs", "modules"),
    ).find((filename) => {
      const cached = JSON.parse(readFileSync(filename, "utf8"));
      return (
        typeof cached.filename === "string" &&
        cached.filename
          .replaceAll("\\", "/")
          .endsWith("/sagejs/elliptic_curves/lseries.py")
      );
    });
    assert.ok(materializedFilename, "the portable cache was not materialized");
    const materialized = JSON.parse(readFileSync(materializedFilename, "utf8"));
    const expectedJavaScript = precompiled.javascriptTemplate.replaceAll(
      JSON.stringify(filenameMarker),
      JSON.stringify(materialized.filename),
    );
    assert.equal(materialized.version, precompiled.version);
    assert.equal(materialized.signature, precompiled.signature);
    assert.equal(materialized.mode, precompiled.mode);
    assert.equal(materialized.javascript, expectedJavaScript);
    assert.equal(typeof materialized.cachedData, "string");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
