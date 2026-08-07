"use strict";

const assert = require("node:assert/strict");
const {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const { testJavaScriptSea } = require("./helpers/javascript-sea.cjs");

const root = join(__dirname, "..");
const executableSuffix = process.platform === "win32" ? ".exe" : "";
const pythonExecutable = join(
  root,
  "build",
  "sea",
  `sagepython${executableSuffix}`,
);
const mathExecutable = join(
  root,
  "build",
  "sea",
  `sagejs${executableSuffix}`,
);
const pythonOnly = process.argv.includes("--python-only");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "sagejs-sea-test-"));

function run(executable, filename, extraArguments = []) {
  const result = spawnSync(executable, [...extraArguments, filename], {
    cwd: temporaryDirectory,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function runArguments(executable, arguments_) {
  const result = spawnSync(executable, arguments_, {
    cwd: temporaryDirectory,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

try {
  // Some filesystems do not preserve an executable bit when an artifact is
  // copied into a test workspace.
  if (process.platform !== "win32") {
    chmodSync(pythonExecutable, 0o755);
    if (!pythonOnly) chmodSync(mathExecutable, 0o755);
  }

  assert.equal(
    runArguments(pythonExecutable, ["--jupyter-kernel-self-test"]),
    "Sage.js Jupyter SEA runtime passed.",
  );

  testJavaScriptSea(pythonExecutable, temporaryDirectory);

  const pythonProgram = join(temporaryDirectory, "portable.py");
  writeFileSync(
    pythonProgram,
    [
      "import time, json, gzip, hashlib, subprocess",
      "import socket, urllib.parse, urllib.request, http.client",
      "import bisect, heapq, statistics",
      "from collections import Counter",
      "from functools import lru_cache",
      "from multiprocessing import Pool",
      "def square(n):",
      "    return n*n",
      "values = {n: n * n for n in range(6)}",
      "started = time.time()",
      "time.sleep(0.005)",
      "print(sum(values.values()))",
      "print(type(started))",
      "print(time.time() >= started)",
      "with open('portable-data.txt', 'w') as output:",
      "    output.write('sea file io\\n')",
      "print(open('portable-data.txt').read().strip())",
      "print(json.loads('{\"n\":12345678901234567890}')['n'])",
      "print(gzip.decompress(gzip.compress(b'sea')), hashlib.sha256(b'sea').hexdigest()[:8])",
      "print(urllib.parse.urljoin('https://example/a/', '../b'))",
      "print(Counter('mississippi').most_common(2))",
      "heap = [5, 1, 3]; heapq.heapify(heap); print([heapq.heappop(heap) for _ in range(3)])",
      "print(statistics.mean([2, 4, 6]), bisect.bisect([1, 3, 5], 3))",
      "with Pool(2) as workers:",
      "    print(workers.map(square, [7, 8, 9]))",
      "",
    ].join("\n"),
  );
  assert.equal(
    run(pythonExecutable, pythonProgram),
    "55\n<class 'float'>\nTrue\nsea file io\n" +
      "12345678901234567890\n" +
      "b'sea' 4a69f19c\n" +
      "https://example/b\n" +
      "[('i', 4), ('s', 4)]\n" +
      "[1, 3, 5]\n" +
      "4 2\n" +
      "[49, 64, 81]",
  );

  const missingBackendProgram = join(
    temporaryDirectory,
    "missing_backend.py",
  );
  writeFileSync(missingBackendProgram, "print(factor(2026))\n");
  const missingBackend = spawnSync(
    pythonExecutable,
    [missingBackendProgram],
    {
      cwd: temporaryDirectory,
      encoding: "utf8",
    },
  );
  assert.notEqual(missingBackend.status, 0);
  assert.match(
    missingBackend.stderr,
    /built without the optional FLINT mathematics backend/,
  );

  const magmaHelper = join(temporaryDirectory, "portable-helper.m");
  const magmaProgram = join(temporaryDirectory, "portable.m");
  writeFileSync(magmaHelper, "loaded_value := 17;\n");
  writeFileSync(
    magmaProgram,
    [
      'load "portable-helper.m";',
      "print loaded_value + 25;",
      "",
    ].join("\n"),
  );
  assert.equal(
    run(pythonExecutable, magmaProgram, ["--magma"]),
    "42",
  );

  const wolframProgram = join(temporaryDirectory, "portable.wl");
  writeFileSync(wolframProgram, "Range[2, 8, 2]\n");
  assert.equal(
    run(pythonExecutable, wolframProgram, ["--wolfram"]),
    "[2, 4, 6, 8]",
  );

  const matlabProgram = join(temporaryDirectory, "portable.matlab");
  writeFileSync(
    matlabProgram,
    ["values = 1:2:7;", "sum(values)", ""].join("\n"),
  );
  assert.equal(
    run(pythonExecutable, matlabProgram, ["--matlab"]),
    "16",
  );

  const mapleProgram = join(temporaryDirectory, "portable.mpl");
  writeFileSync(mapleProgram, "seq(n^2, n=1..4);\n");
  assert.equal(
    run(pythonExecutable, mapleProgram, ["--maple"]),
    "[1, 4, 9, 16]",
  );

  if (!pythonOnly) {
    const mathProgram = join(temporaryDirectory, "portable.sage");
    writeFileSync(
      mathProgram,
      [
        "from multiprocessing import Pool",
        "from pathlib import Path",
        "from sagejs_serialization import dumps, loads",
        "def phi(n):",
        "    return euler_phi(n)",
        "def modular_dimension(n):",
        "    return str(dimension_modular_forms(n, 8))",
        "print(factor(2026))",
        "P = graphs.PetersenGraph()",
        "A = P.automorphism_group()",
        "print(A.order(), len(A.gens()), len(A.list()), len(P.layout('spring')))",
        "R = RealField(100)",
        "print(R('1.25') * R('2.5'))",
        "print(x)",
        "print(sin(x^2).derivative(x))",
        "print(fast_callable(sin(x^2), vars=[x])(2))",
        "u, v = var('u v')",
        "scene = plot3d(u^2-v^2, (u,-1,1), (v,-1,1), plot_points=2)",
        "print(scene)",
        "scene.save('release-smoke.html')",
        "html = Path('release-smoke.html').read_text()",
        "print(Path('release-smoke.html').is_file(), 'plotly' in html.lower())",
        "A = matrix(QQ, [[1/2, 2/3], [3/5, 5/7]])",
        "payload = dumps({'matrix': A, 'factor': str(factor(2026))})",
        "restored = loads(payload)",
        "print(restored['matrix'] == A, restored['factor'] == '2 * 1013', len(payload) < 5000)",
        "with Pool(2) as workers:",
        "    print(workers.map(phi, [1009, 1013, 1019]))",
        "    print(workers.map(modular_dimension, [3, 5, 7]))",
        "",
      ].join("\n"),
    );
    assert.equal(
      run(mathExecutable, mathProgram),
      "2 * 1013\n" +
        "120 3 120 10\n" +
        "3.1250000000000000000000000000\n" +
        "x\n" +
        "2*x*cos(x^2)\n" +
        "-0.7568024953079282\n" +
        "Graphics3d Object\n" +
        "True True\n" +
        "True True True\n" +
        "[1008, 1012, 1018]\n" +
        "['3', '5', '5']",
    );
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log("Sage.js single-executable distributions passed.");
