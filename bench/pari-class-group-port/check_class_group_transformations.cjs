"use strict";

/*
 * Exact PARI 2.17.4 oracle for the algebraic prefix of class_group_gen.
 *
 * This is deliberately an evidence generator, not an implementation.  It
 * links a caller-selected PARI build, executes the unmodified exported matrix
 * routines, and independently replays every defining identity with BigInt.
 */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ARCHIVE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const SOURCE_SHA256 = Object.freeze({
  "src/basemath/buch2.c":
    "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
  "src/basemath/hnf_snf.c":
    "264aef9c86b4454b2761d8424571f74c8ecc5ed38f12aa806800c0bef5f6cdbf",
});

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  assert.equal(
    result.status,
    0,
    result.stderr || String(result.error || `${command} failed`),
  );
  return result.stdout;
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    assert(
      [
        "--pari-source",
        "--pari-build",
        "--archive",
        "--collector-fixtures",
        "--artifact-dir",
      ].includes(name),
      `unknown or misplaced argument: ${name}`,
    );
    assert(value, `${name} requires a value`);
    assert(!values.has(name), `duplicate argument: ${name}`);
    values.set(name, path.resolve(value));
  }
  for (const name of [
    "--pari-source",
    "--pari-build",
    "--archive",
    "--collector-fixtures",
    "--artifact-dir",
  ]) {
    assert(values.has(name), `missing required argument: ${name}`);
  }
  return Object.fromEntries(values);
}

function fibonacci(index) {
  let previous = 0n;
  let current = 1n;
  for (let step = 0; step < index; step++) {
    [previous, current] = [current, previous + current];
  }
  return previous;
}

function matrix(rows, columns, entries) {
  assert.equal(entries.length, rows * columns);
  return { rows, columns, entries: entries.map(BigInt) };
}

function multiply(left, right) {
  assert.equal(left.columns, right.rows, "matrix product shape");
  const entries = Array(left.rows * right.columns).fill(0n);
  for (let column = 0; column < right.columns; column++) {
    for (let inner = 0; inner < left.columns; inner++) {
      const scalar = right.entries[column * right.rows + inner];
      for (let row = 0; row < left.rows; row++) {
        entries[column * left.rows + row] +=
          left.entries[inner * left.rows + row] * scalar;
      }
    }
  }
  return matrix(left.rows, right.columns, entries);
}

function add(left, right) {
  assert.equal(left.rows, right.rows, "matrix sum row shape");
  assert.equal(left.columns, right.columns, "matrix sum column shape");
  return matrix(
    left.rows,
    left.columns,
    left.entries.map((value, index) => value + right.entries[index]),
  );
}

function identity(size) {
  return matrix(
    size,
    size,
    Array.from({ length: size * size }, (_, index) =>
      index % size === Math.floor(index / size) ? 1n : 0n,
    ),
  );
}

function prefixColumns(value, columns) {
  assert(columns >= 0 && columns <= value.columns);
  return matrix(value.rows, columns, value.entries.slice(0, value.rows * columns));
}

function gcd(left, right) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function decodeMatrix(raw, rows, columns, name) {
  assert(Array.isArray(raw), `${name} is not an array`);
  assert.equal(raw.length, rows * columns, `${name} length`);
  return matrix(rows, columns, raw);
}

function verifyResult(expectedCase, raw) {
  const n = expectedCase.n;
  assert.equal(raw.n, n);
  assert(Number.isInteger(raw.active) && raw.active >= 0 && raw.active <= n);

  const shapes = {
    W: [n, n],
    Dfull: [n, n],
    U: [n, n],
    Vfull: [n, n],
    Ui: [n, n],
    Ur: [n, n],
    Y: [n, n],
    Uir: [n, n],
    X: [n, n],
    D: [n, raw.active],
    V: [n, raw.active],
    M1: [n, raw.active],
    M2: [n, n],
  };
  const values = Object.fromEntries(
    Object.entries(shapes).map(([name, [rows, columns]]) => [
      name,
      decodeMatrix(raw[name], rows, columns, name),
    ]),
  );

  assert.deepEqual(values.W.entries, expectedCase.W.map(BigInt), "input W changed");
  assert.deepEqual(
    multiply(multiply(values.U, values.W), values.Vfull),
    values.Dfull,
    "U W V = D",
  );
  assert.deepEqual(multiply(values.U, values.Ui), identity(n), "U Ui = 1");
  assert.deepEqual(multiply(values.Ui, values.U), identity(n), "Ui U = 1");
  assert.deepEqual(
    values.Ur,
    add(values.U, multiply(values.Dfull, values.Y)),
    "Ur = U + D Y",
  );
  assert.deepEqual(
    values.Uir,
    add(values.Ui, multiply(values.W, values.X)),
    "Uir = Ui + W X",
  );
  assert.deepEqual(values.D, prefixColumns(values.Dfull, raw.active), "active D");
  assert.deepEqual(values.V, prefixColumns(values.Vfull, raw.active), "active V");
  assert.deepEqual(
    values.M1,
    add(values.V, multiply(values.X, values.D)),
    "M1 = V + X D",
  );
  assert.deepEqual(
    values.M2,
    add(multiply(values.X, values.Ur), multiply(values.Vfull, values.Y)),
    "M2 = X Ur + V Y",
  );

  let active = n;
  for (let index = 0; index < n; index++) {
    for (let row = 0; row < n; row++) {
      if (row !== index) assert.equal(values.Dfull.entries[index * n + row], 0n);
    }
    const diagonal = values.Dfull.entries[index * n + index];
    assert(diagonal > 0n, "positive Smith diagonal");
    if ((diagonal === 1n || diagonal === -1n) && active === n) active = index;
    if (index > 0) {
      const previous = values.Dfull.entries[(index - 1) * n + index - 1];
      assert.equal(previous % diagonal, 0n, "decreasing Smith divisibility");
    }
  }
  assert.equal(raw.active, active, "source active-prefix length");

  if (expectedCase.bezoutPair) {
    assert.equal(raw.bezout.length, 3, "missing direct PARI Bezout convention");
    const [d, u, v] = raw.bezout.map(BigInt);
    const [a, b] = expectedCase.bezoutPair.map(BigInt);
    assert.equal(a * u + b * v, d, "Bezout identity");
    assert.equal(d, gcd(a, b), "positive gcd");
  } else {
    assert.deepEqual(raw.bezout, []);
  }
  return Object.fromEntries(
    Object.entries(raw).map(([name, value]) => [name, value]),
  );
}

function locateBuildDirectory(root) {
  const direct = path.join(root, "libpari.so");
  if (fs.existsSync(direct)) return root;
  const candidates = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("Olinux"))
    .map((entry) => path.join(root, entry.name))
    .filter((candidate) => fs.existsSync(path.join(candidate, "libpari.so")));
  assert.equal(candidates.length, 1, "could not identify one PARI build directory");
  return candidates[0];
}

(function main() {
  const options = parseArguments(process.argv.slice(2));
  const pariSource = options["--pari-source"];
  const pariBuild = locateBuildDirectory(options["--pari-build"]);
  const archivePath = options["--archive"];
  const collectorPath = options["--collector-fixtures"];
  const artifactDirectory = options["--artifact-dir"];

  const archiveBytes = fs.readFileSync(archivePath);
  assert.equal(sha256(archiveBytes), ARCHIVE_SHA256, "unexpected PARI archive");
  const sourceHashes = {};
  for (const [relativePath, expectedHash] of Object.entries(SOURCE_SHA256)) {
    const bytes = fs.readFileSync(path.join(pariSource, relativePath));
    assert.equal(sha256(bytes), expectedHash, `unexpected ${relativePath}`);
    const archived = run("tar", ["-xOf", archivePath, `pari-2.17.4/${relativePath}`]);
    assert.equal(sha256(archived), expectedHash, `archive mismatch for ${relativePath}`);
    sourceHashes[relativePath] = expectedHash;
  }

  const collectorBytes = fs.readFileSync(collectorPath);
  const collector = JSON.parse(collectorBytes);
  assert(Array.isArray(collector.nativeOutputs), "collector native outputs missing");
  assert(Array.isArray(collector.summary?.result), "collector result summary missing");
  const authenticCases = collector.nativeOutputs
    .filter((entry) => entry.backend === "gmp")
    .flatMap((entry) => {
      const result = collector.summary.result.find((item) => item.field === entry.field);
      if (!result || result.hnfStatus !== 0 || entry.hnfState?.[3] !== 0) return [];
      const n = entry.hnfState[0];
      assert.equal(entry.H.length, n * n, "authentic W shape");
      return [
        {
          name: `authentic-field-${entry.field}`,
          origin: "actual GMP connected-relation HNF output",
          field: entry.field,
          relations: entry.hnfState[1] + entry.hnfState[2],
          n,
          W: entry.H.map(String),
          bezoutPair: null,
        },
      ];
    });
  assert.equal(authenticCases.length, 2, "expected exactly two authentic full-rank W cases");

  const f399 = fibonacci(399);
  const f400 = fibonacci(400);
  const f401 = fibonacci(401);
  assert(f399 > 1n << 64n && f399 < f400 && f400 < f401);
  const cases = [
    ...authenticCases,
    {
      name: "multiword-fibonacci-descending",
      origin: "synthetic exact Bezout convention sentinel",
      field: null,
      relations: null,
      n: 2,
      W: [f401, 0n, f399, f400].map(String),
      bezoutPair: [f400, f399].map(String),
    },
    {
      name: "multiword-fibonacci-swapped",
      origin: "synthetic exact Bezout convention sentinel",
      field: null,
      relations: null,
      n: 2,
      W: [f401, 0n, f400, f399].map(String),
      bezoutPair: [f399, f400].map(String),
    },
  ];

  const oracleSource = `/* PARI 2.17.4 exact transformation oracle. GPL-2.0-or-later. */
#include "pari.h"
#include "paripriv.h"
static GEN rd(void) { char s[8192]; if (scanf("%8191s", s) != 1) exit(2); return gp_read_str(s); }
static GEN matrix(long rows, long columns) {
  GEN value = cgetg(columns + 1, t_MAT);
  for (long column = 1; column <= columns; column++) {
    gel(value, column) = cgetg(rows + 1, t_COL);
    for (long row = 1; row <= rows; row++) gcoeff(value, row, column) = rd();
  }
  return value;
}
static void print_matrix(GEN value) {
  putchar('[');
  for (long column = 1; column < lg(value); column++)
    for (long row = 1; row < lg(gel(value, column)); row++) {
      if (column > 1 || row > 1) putchar(',');
      pari_printf("\\\"%Ps\\\"", gcoeff(value, row, column));
    }
  putchar(']');
}
static void field(const char *name, GEN value) {
  printf(",\\\"%s\\\":", name); print_matrix(value);
}
int main(void) {
  pari_init(256000000, 10000);
  long count = itos(rd());
  for (long item = 0; item < count; item++) {
    pari_sp av = avma;
    long n = itos(rd()), has_bezout = itos(rd());
    GEN ba = rd(), bb = rd(), W = matrix(n, n), W0 = gcopy(W);
    GEN U, Vfull, Dfull = ZM_snfall(W, &U, &Vfull);
    GEN Ui = ZM_inv(U, NULL), Y, X;
    GEN Ur = ZM_hnfdivrem(U, Dfull, &Y);
    GEN Uir = ZM_hnfdivrem(Ui, W, &X);
    GEN M2 = ZM_add(ZM_mul(X, Ur), ZM_mul(Vfull, Y));
    long active = n;
    for (long index = 1; index <= n; index++)
      if (is_pm1(gcoeff(Dfull, index, index))) { active = index - 1; break; }
    GEN D = active ? vecslice(Dfull, 1, active) : cgetg(1, t_MAT);
    GEN V = active ? vecslice(Vfull, 1, active) : cgetg(1, t_MAT);
    GEN M1 = ZM_add(V, ZM_mul(X, D));
    if (!gequal(W, W0)) return 10;
    if (!gequal(ZM_mul(ZM_mul(U, W), Vfull), Dfull)) return 11;
    if (!gequal(ZM_mul(U, Ui), matid(n)) || !gequal(ZM_mul(Ui, U), matid(n))) return 12;
    if (!gequal(Ur, ZM_add(U, ZM_mul(Dfull, Y)))) return 13;
    if (!gequal(Uir, ZM_add(Ui, ZM_mul(W, X)))) return 14;
    if (!gequal(M1, ZM_add(V, ZM_mul(X, D)))) return 15;
    if (!gequal(M2, ZM_add(ZM_mul(X, Ur), ZM_mul(Vfull, Y)))) return 16;
    printf("{\\\"n\\\":%ld,\\\"active\\\":%ld", n, active);
    field("W", W); field("Dfull", Dfull); field("U", U); field("Vfull", Vfull);
    field("Ui", Ui); field("Ur", Ur); field("Y", Y); field("Uir", Uir);
    field("X", X); field("D", D); field("V", V); field("M1", M1); field("M2", M2);
    printf(",\\\"bezout\\\":[");
    if (has_bezout) {
      GEN bu, bv, bd = bezout(ba, bb, &bu, &bv);
      pari_printf("\\\"%Ps\\\",\\\"%Ps\\\",\\\"%Ps\\\"", bd, bu, bv);
    }
    puts("]}");
    set_avma(av);
  }
  pari_close();
  return 0;
}
`;

  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "sagejs-class-group-transformations-"),
  );
  const sourcePath = path.join(temporaryDirectory, "oracle.c");
  const executablePath = path.join(temporaryDirectory, "oracle");
  fs.writeFileSync(sourcePath, oracleSource);
  run("cc", [
    "-O1",
    "-fsanitize=undefined",
    "-fno-sanitize-recover=undefined",
    `-I${path.join(pariSource, "src/headers")}`,
    `-I${pariBuild}`,
    sourcePath,
    `-L${pariBuild}`,
    `-Wl,-rpath,${pariBuild}`,
    "-lpari",
    "-lm",
    "-o",
    executablePath,
  ]);

  const input = [
    cases.length,
    ...cases.flatMap((entry) => [
      entry.n,
      entry.bezoutPair ? 1 : 0,
      ...(entry.bezoutPair || ["0", "0"]),
      ...entry.W,
    ]),
  ].join(" ");
  const trace = run(executablePath, [], { input });
  const lines = trace.trim().split("\n");
  assert.equal(lines.length, cases.length, "oracle output count");
  const outputs = lines.map((line, index) => ({
    case: cases[index],
    result: verifyResult(cases[index], JSON.parse(line)),
  }));

  const binaryPath = fs.realpathSync(path.join(pariBuild, "libpari.so"));
  const evidence = {
    schema: "sagejs.pari-class-group-transformations/v1",
    pariVersion: "2.17.4",
    qualifiedTiming: false,
    mathematicalBoundary:
      "Exact algebraic prefix of class_group_gen through M1/M2; no genback, units, archimedean maps, honesty, or completeness claim.",
    provenance: {
      archivePath,
      archiveSha256: ARCHIVE_SHA256,
      pariSource,
      sourceHashes,
      pariBuild,
      binaryPath,
      binarySha256: sha256(fs.readFileSync(binaryPath)),
      collectorFixturePath: collectorPath,
      collectorFixtureSha256: sha256(collectorBytes),
      oracleSourceSha256: sha256(oracleSource),
      oracleBinarySha256: sha256(fs.readFileSync(executablePath)),
      inputSha256: sha256(input),
      outputSha256: sha256(trace),
    },
    identities: [
      "U W Vfull = Dfull",
      "U Ui = Ui U = I",
      "Ur = U + Dfull Y",
      "Uir = Ui + W X",
      "M1 = V + X D",
      "M2 = X Ur + Vfull Y",
    ],
    cases: outputs,
  };
  const canonicalEvidence = `${JSON.stringify(evidence)}\n`;

  assert(!fs.existsSync(artifactDirectory), "artifact directory already exists");
  fs.mkdirSync(path.dirname(artifactDirectory), { recursive: true });
  fs.mkdirSync(artifactDirectory);
  const artifactPath = path.join(artifactDirectory, "fixtures.json");
  fs.writeFileSync(artifactPath, canonicalEvidence, { flag: "wx" });
  const summary = {
    cases: cases.length,
    authenticCases: authenticCases.length,
    multiwordConventionSentinels: 2,
    identities: evidence.identities.length,
    outputSha256: evidence.provenance.outputSha256,
    evidenceSha256: sha256(canonicalEvidence),
    artifactDirectory,
    artifactPath,
    qualifiedTiming: false,
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
})();
