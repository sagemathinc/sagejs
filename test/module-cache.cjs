"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
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
const portableReplCache = join(temporary, "portable-repl-cache");
const portableCache = join(temporary, "portable-cache");
const dynamicCache = join(temporary, "dynamic-cache");
const circularCache = join(temporary, "circular-cache");
const modulePath = join(sourceDirectory, "cached_value.py");
const mainPath = join(sourceDirectory, "main.py");
const circularAPath = join(sourceDirectory, "circular_a.py");
const circularBPath = join(sourceDirectory, "circular_b.py");
const circularMainPath = join(sourceDirectory, "circular_main.py");
const localNumbersPath = join(sourceDirectory, "numbers.py");
const shadowMainPath = join(sourceDirectory, "shadow_main.py");
const shadowOutputPath = join(temporary, "shadow-main.cjs");
const precompiledNumpyCache = join(
  root,
  "dist",
  "module-cache",
  "numpy.json",
);
const dottedPrecompiledModules = [
  "sagejs.linear_algebra.sparse_random",
  "sagejs.kernels.matrix.dense_integer",
];

mkdirSync(sourceDirectory);

function run(args, options = {}) {
  const { env = {}, ...spawnOptions } = options;
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SAGEJSPATH: sourceDirectory,
      XDG_CACHE_HOME: replCache,
      ...env,
    },
    ...spawnOptions,
  });
  assert.equal(
    result.status,
    0,
    `sagejs ${args.join(" ")} failed:\n${result.stderr}`,
  );
  return result.stdout?.trim() ?? "";
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
  for (const name of dottedPrecompiledModules) {
    const canonical = join(
      root,
      "dist",
      "module-cache",
      `${name.replaceAll(".", "-")}.json`,
    );
    const obsolete = join(root, "dist", "module-cache", `${name}.json`);
    assert.ok(existsSync(canonical), `missing canonical cache for ${name}`);
    assert.equal(existsSync(obsolete), false, `obsolete cache name for ${name}`);
    const cachedModule = JSON.parse(readFileSync(canonical, "utf8"));
    assert.ok(cachedModule.outputs["beautify:true keep_docstrings:false"]);
  }

  const numpyCache = JSON.parse(readFileSync(precompiledNumpyCache, "utf8"));
  assert.equal(typeof numpyCache.version, "string");
  assert.ok(numpyCache.outputs["beautify:true keep_docstrings:false"]);
  assert.equal(
    run([], { input: "import numpy\nprint(numpy.arange(3))\n" }),
    "[0 1 2]",
  );
  // Runtime imports maintain their own V8 bytecode cache even when the
  // compiler used a shipped syntax/module artifact for the calling cell.
  for (const filename of filesBelow(join(replCache, "sagejs", "modules"))) {
    const cached = JSON.parse(readFileSync(filename, "utf8"));
    assert.equal(cached.version, numpyCache.version);
    assert.equal(typeof cached.cachedData, "string");
  }

  writeFileSync(
    modulePath,
    "value = Integer('123456789012345678901234567890')\n",
  );
  writeFileSync(mainPath, "import cached_value\nprint(cached_value.value)\n");

  run([
    "compile",
    "--cache-dir",
    compilerCache,
    mainPath,
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const compileArgs = ["compile", "--execute", mainPath];
  const expected = "123456789012345678901234567890";
  assert.equal(run(compileArgs), expected);
  assert.equal(run(compileArgs), expected);

  const compilerEntries = filesBelow(compilerCache);
  // Bootstrap modules may declare lazy source-transparent kernel dependencies.
  // A custom cache therefore contains those reusable dependency artifacts as
  // well as the project module; identify the project artifact explicitly.
  const projectEntries = compilerEntries.filter((filename) =>
    filename.endsWith("cached_value.py.json"),
  );
  assert.equal(projectEntries.length, 1);
  const cached = JSON.parse(readFileSync(projectEntries[0], "utf8"));
  assert.equal(typeof cached.version, "string");
  assert.equal(typeof cached.signature, "string");
  assert.ok(cached.outputs["beautify:true keep_docstrings:false"]);

  writeFileSync(circularAPath, "import circular_b\nvalue = 1\n");
  writeFileSync(circularBPath, "import circular_a\nvalue = 2\n");
  writeFileSync(
    circularMainPath,
    "import circular_a\nimport circular_b\n" +
      "print(circular_a.value + circular_b.value)\n",
  );
  const circularArgs = [
    "compile", "--cache-dir", circularCache, "--execute", circularMainPath,
  ];
  assert.equal(run(circularArgs), "3");
  // The second compile loads both sides of the cycle from their module cache.
  // Cached namespaces must be published before their dependency lists are
  // traversed, just as source-lowered namespaces are.
  assert.equal(run(circularArgs), "3");

  writeFileSync(localNumbersPath, "local_marker = 1729\n");
  writeFileSync(
    shadowMainPath,
    "import numbers\nprint(numbers.local_marker)\n",
  );
  run(
    ["compile", "--python", "--output", shadowOutputPath, shadowMainPath],
    { env: { SAGEJSPATH: "" } },
  );
  const shadowResult = spawnSync(process.execPath, [shadowOutputPath], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(shadowResult.status, 0, shadowResult.stderr);
  assert.equal(shadowResult.stdout.trim(), "1729");

  assert.equal(
    run([], { input: "import cached_value\nprint(cached_value.value)\n" }),
    expected,
  );
  assert.equal(
    run([], {
      input: [
        "import cached_value",
        "namespace = cached_value.__dict__",
        "namespace['injected_from_dict'] = 17",
        "print(namespace is cached_value.__dict__)",
        "print(namespace.get('value'))",
        "print(cached_value.injected_from_dict)",
        "",
      ].join("\n"),
    }),
    `True\n${expected}\n17`,
  );
  const replEntries = filesBelow(join(replCache, "sagejs", "modules"));
  assert.equal(replEntries.filter((filename) => {
    const entry = JSON.parse(readFileSync(filename, "utf8"));
    return entry.filename === modulePath;
  }).length, 1);

  writeFileSync(
    modulePath,
    "value = Integer('3141592653589793238462643383279')\n",
  );
  assert.equal(
    run([], { input: "import cached_value\nprint(cached_value.value)\n" }),
    "3141592653589793238462643383279",
  );

  const currentCacheFilename = filesBelow(
    join(replCache, "sagejs", "modules"),
  ).find((filename) => {
    const cached = JSON.parse(readFileSync(filename, "utf8"));
    return cached.filename === modulePath;
  });
  assert.ok(currentCacheFilename);
  const currentCache = JSON.parse(readFileSync(currentCacheFilename, "utf8"));
  const filenameMarker = "__sagejs_precompiled_module_filename__";
  const filenameLiteral = JSON.stringify(currentCache.filename);
  assert.ok(currentCache.javascript.includes(filenameLiteral));
  mkdirSync(portableCache);
  writeFileSync(
    join(portableCache, "cached_value.json"),
    JSON.stringify({
      version: currentCache.version,
      signature: currentCache.signature,
      mode: currentCache.mode,
      module: "cached_value",
      javascriptTemplate: currentCache.javascript.replaceAll(
        filenameLiteral,
        JSON.stringify(filenameMarker),
      ),
    }),
  );
  assert.equal(
    run([], {
      env: {
        XDG_CACHE_HOME: portableReplCache,
        SAGEJS_PRECOMPILED_MODULE_CACHE_DIR: portableCache,
      },
      input: "import cached_value\nprint(cached_value.value)\n",
    }),
    "3141592653589793238462643383279",
  );
  const materializedFilename = filesBelow(
    join(portableReplCache, "sagejs", "modules"),
  ).find((filename) => {
    const cached = JSON.parse(readFileSync(filename, "utf8"));
    return cached.filename === modulePath;
  });
  assert.ok(materializedFilename);
  const materialized = JSON.parse(readFileSync(materializedFilename, "utf8"));
  assert.equal(materialized.filename, modulePath);
  assert.ok(!materialized.javascript.includes(filenameMarker));

  const dynamicProgram = [
    "namespace = {'input_value': 41}",
    "exec('answer = input_value + 1', namespace)",
    "print(namespace['answer'])",
    "",
  ].join("\n");
  for (let index = 0; index < 2; index += 1) {
    assert.equal(
      run([], {
        env: { SAGEJS_DYNAMIC_CACHE_DIR: dynamicCache },
        input: dynamicProgram,
      }),
      "42",
    );
  }
  assert.equal(filesBelow(dynamicCache).length, 1);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log("Versioned compiler and REPL module caches passed.");
