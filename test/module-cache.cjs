"use strict";

const assert = require("node:assert/strict");
const {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const cli = join(root, "bin", "sagejs");
// Windows commonly shortens part of its temporary path to RUNNER~1.  A tilde
// away from the beginning is ordinary filename data, not a home-directory
// marker.
const temporary = mkdtempSync(join(tmpdir(), "sagejs-module-cache-test-~1-"));
const sourceDirectory = join(temporary, "source");
const compilerCache = join(temporary, "compiler-cache");
const replCache = join(temporary, "repl-cache");
const modulePath = join(sourceDirectory, "cached_value.py");
const mainPath = join(sourceDirectory, "main.py");
const precompiledNumpyCache = join(
  root,
  "dist",
  "module-cache",
  "numpy.json",
);

mkdirSync(sourceDirectory);

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SAGEJSPATH: sourceDirectory,
      XDG_CACHE_HOME: replCache,
    },
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `sagejs ${args.join(" ")} failed:\n${result.stderr}`,
  );
  return result.stdout.trim();
}

function filesBelow(directory) {
  const answer = [];
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else answer.push(path);
    }
  }
  visit(directory);
  return answer;
}

try {
  const numpyCache = JSON.parse(readFileSync(precompiledNumpyCache, "utf8"));
  assert.equal(typeof numpyCache.version, "string");
  assert.ok(numpyCache.outputs["beautify:true keep_docstrings:false"]);
  assert.equal(
    run([], { input: "import numpy\nprint(numpy.arange(3))\n" }),
    "[0 1 2]",
  );
  assert.deepEqual(
    filesBelow(join(replCache, "sagejs", "modules")),
    [],
    "a shipped standard-library cache should avoid recompilation",
  );

  writeFileSync(
    modulePath,
    "value = Integer('123456789012345678901234567890')\n",
  );
  writeFileSync(mainPath, "import cached_value\nprint(cached_value.value)\n");

  const compileArgs = [
    "compile",
    "--execute",
    "--cache-dir",
    compilerCache,
    mainPath,
  ];
  const expected = "123456789012345678901234567890";
  assert.equal(run(compileArgs), expected);
  assert.equal(run(compileArgs), expected);

  const compilerEntries = filesBelow(compilerCache);
  assert.equal(compilerEntries.length, 1);
  const cached = JSON.parse(readFileSync(compilerEntries[0], "utf8"));
  assert.equal(typeof cached.version, "string");
  assert.equal(typeof cached.signature, "string");
  assert.ok(cached.outputs["beautify:true keep_docstrings:false"]);

  assert.equal(
    run([], { input: "import cached_value\nprint(cached_value.value)\n" }),
    expected,
  );
  const replEntries = filesBelow(join(replCache, "sagejs", "modules"));
  assert.equal(replEntries.length, 1);

  writeFileSync(
    modulePath,
    "value = Integer('3141592653589793238462643383279')\n",
  );
  assert.equal(
    run([], { input: "import cached_value\nprint(cached_value.value)\n" }),
    "3141592653589793238462643383279",
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log("Versioned compiler and REPL module caches passed.");
