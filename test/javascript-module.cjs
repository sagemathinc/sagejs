"use strict";

const assert = require("node:assert/strict");
const {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const cli = join(root, "bin", "sagejs-source.cjs");

function writePackage(project, name, files) {
  const directory = join(project, "node_modules", name);
  mkdirSync(directory, { recursive: true });
  for (const [filename, source] of Object.entries(files)) {
    writeFileSync(join(directory, filename), source);
  }
  return directory;
}

test("sagejs.javascript loads project-local packages beside Python packages", () => {
  const project = mkdtempSync(join(tmpdir(), "sagejs-javascript-project-"));
  try {
    writePackage(project, "sagejs-js-fixture", {
      "package.json": JSON.stringify({
        name: "sagejs-js-fixture",
        version: "1.0.0",
        main: "index.cjs",
      }),
      "index.cjs": [
        "module.exports = {",
        "  answer: 42,",
        "  add(left, right) { return left + right; },",
        "  receiver: {",
        "    value: 5,",
        "    increment(delta) { this.value += delta; return this.value; },",
        "  },",
        "};",
        "",
      ].join("\n"),
    });

    const source = [
      "import mpmath",
      "from sagejs.javascript import is_available, require, resolve",
      "fixture = require('sagejs-js-fixture')",
      "print(is_available())",
      "print(fixture.answer)",
      "print(fixture.add(20, 22))",
      "print(fixture.receiver.increment(7))",
      "print(fixture.receiver.value)",
      "print(resolve('sagejs-js-fixture').endswith('index.cjs'))",
      "print(mpmath.mpf('0.1') + mpmath.mpf('0.2'))",
      "path = require('node:path')",
      "print(path.basename('/tmp/project/example.txt'))",
      "",
    ].join("\n");
    const result = spawnSync(process.execPath, [cli, "--python"], {
      cwd: project,
      encoding: "utf8",
      input: source,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout.trim(),
      ["True", "42", "42", "12", "12", "True", "0.3", "example.txt"].join("\n"),
      result.stderr,
    );
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("JavaScript dynamic imports resolve from an explicit project", async () => {
  const project = mkdtempSync(join(tmpdir(), "sagejs-javascript-esm-"));
  try {
    writePackage(project, "sagejs-esm-fixture", {
      "package.json": JSON.stringify({
        name: "sagejs-esm-fixture",
        version: "1.0.0",
        type: "module",
        exports: "./index.mjs",
      }),
      "index.mjs": "export const answer = 42; export default 'esm';\n",
    });
    const {
      importJavaScriptModule,
      resolveJavaScriptModule,
    } = require("../dist/tools/javascript-modules.js");
    assert.match(
      resolveJavaScriptModule("sagejs-esm-fixture", project),
      /index\.mjs$/,
    );
    const module = await importJavaScriptModule("sagejs-esm-fixture", project);
    assert.equal(module.answer, 42);
    assert.equal(module.default, "esm");
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
