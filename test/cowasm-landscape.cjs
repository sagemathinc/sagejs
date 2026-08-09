"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const root = join(__dirname, "..");

test("cross-language landscape validates the unchanged Sage.js source", () => {
  const result = spawnSync(
    process.execPath,
    [
      join(root, "bench", "cowasm", "landscape", "run.cjs"),
      "--warmups", "0",
      "--samples", "1",
      "--only", "sum_stride",
      "--runtime", "sagejs",
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
    },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /sum_stride/);
  assert.match(result.stdout, /Sage.js/);
});

test("standalone benchmark artifacts receive the explicit Node host", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-cowasm-host-"));
  try {
    const fixture = join(temporary, "compiled.cjs");
    writeFileSync(
      fixture,
      "const host = globalThis.__sagejs_host__;\n" +
        "if (!host || !host.call) throw new Error('host missing');\n" +
        "process.stdout.write(process.argv.slice(1).join('|'));\n",
    );
    const result = spawnSync(
      process.execPath,
      [join(root, "bench", "cowasm", "standalone-host.cjs"), fixture, "sample"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${fixture}|sample`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
