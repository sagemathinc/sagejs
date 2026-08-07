"use strict";

const assert = require("node:assert/strict");
const {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { isAbsolute, join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

function testJavaScriptSea(executable, project) {
  const packageDirectory = join(
    project,
    "node_modules",
    "sagejs-sea-javascript-fixture",
  );
  mkdirSync(packageDirectory, { recursive: true });
  writeFileSync(
    join(packageDirectory, "package.json"),
    JSON.stringify({
      name: "sagejs-sea-javascript-fixture",
      version: "1.0.0",
      main: "index.cjs",
    }),
  );
  writeFileSync(
    join(packageDirectory, "index.cjs"),
    "module.exports = { answer: 42, name() { return this.answer; } };\n",
  );

  const program = join(project, "javascript.py");
  writeFileSync(
    program,
    [
      "import mpmath",
      "from sagejs.javascript import require, resolve",
      "fixture = require('sagejs-sea-javascript-fixture')",
      "print(fixture.name())",
      "print(resolve('sagejs-sea-javascript-fixture').endswith('index.cjs'))",
      "print(mpmath.mpf('0.1') + mpmath.mpf('0.2'))",
      "",
    ].join("\n"),
  );
  const result = spawnSync(executable, [program], {
    cwd: project,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "42\nTrue\n0.3");
}

if (require.main === module) {
  const argument = process.argv[2];
  if (!argument) {
    console.error("usage: node test/helpers/javascript-sea.cjs EXECUTABLE");
    process.exitCode = 2;
  } else {
    const executable = isAbsolute(argument) ? argument : resolve(argument);
    const project = mkdtempSync(join(tmpdir(), "sagejs-sea-javascript-"));
    try {
      if (process.platform !== "win32") chmodSync(executable, 0o755);
      testJavaScriptSea(executable, project);
      console.log("Sage.js JavaScript module SEA runtime passed.");
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }
}

module.exports = { testJavaScriptSea };
