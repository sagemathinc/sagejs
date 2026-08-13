#!/usr/bin/env node
"use strict";

const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const checkNames = [
  "matrices-zz",
  "matrices-qq",
  "matrices-gfp",
  "matrices-gf2",
  "polynomials-exact",
  "polynomials-finite",
  "finite-extensions",
  "graphs",
  "modular-symbols",
  "serialization-mutation",
  "lazy-native-witness",
];

// This is deliberately one ordinary Sage program. The exact same source runs
// through a repository checkout, an installed npm package, and a SEA binary.
const sageProgram = String.raw`
def release_check(name):
    print("SAGEJS_RELEASE_CHECK " + name)

# Dense integer matrices: exact arithmetic, determinant, characteristic
# polynomial, mutation isolation, and a nontrivial Smith form.
A = matrix(ZZ, [[2, 3], [5, 7]])
assert A.det() == -1
assert A*A == matrix(ZZ, [[19, 27], [45, 64]])
assert A.charpoly() == PolynomialRing(ZZ, "x")([-1, -9, 1])
A_copy = matrix(ZZ, A.nrows(), A.ncols(), A.list())
A_copy[0, 0] = 11
assert A[0, 0] == 2 and A_copy[0, 0] == 11
smith_source = matrix(ZZ, [[4, 6], [10, 14]])
S, smith_left, smith_right = smith_source.smith_form()
assert S == diagonal_matrix(ZZ, [2, 2])
assert smith_left*smith_source*smith_right == S
release_check("matrices-zz")

# Rational matrices: reduced echelon form, inverse, determinant, and solve.
Q = matrix(QQ, [[1/2, 1/3], [2/5, 3/7]])
assert Q.det() == 17/210
assert Q.rref() == identity_matrix(QQ, 2)
assert Q*Q.inverse() == identity_matrix(QQ, 2)
rhs = matrix(QQ, [[1], [2]])
solution = Q.solve_right(rhs)
assert Q*solution == rhs
release_check("matrices-qq")

# Word-prime and binary matrices exercise distinct packed representations.
F = GF(97)
P = matrix(F, [[1, 2, 3], [0, 1, 4], [5, 6, 0]])
assert P.det() == 1 and P.rank() == 3
assert P*P.inverse() == identity_matrix(F, 3)
assert P.charpoly() == PolynomialRing(F, "x")([-1, -38, -2, 1])
release_check("matrices-gfp")

B = matrix(GF(2), [[1, 1, 0], [0, 1, 1], [1, 1, 1]])
assert B.det() == 1 and B*B.inverse() == identity_matrix(GF(2), 3)
W = matrix(GF(2), [[1, 0, 1, 1], [0, 1, 1, 0]])
K = W.right_kernel().basis_matrix()
assert K.nrows() == 2 and W*K.transpose() == zero_matrix(GF(2), 2, 2)
release_check("matrices-gf2")

# Exact polynomials verify factorization, gcd, evaluation, and reconstruction.
R.<x> = PolynomialRing(ZZ)
f = (x^2 - 1)*(x^3 + 2)*(x - 5)
assert f(2) == -90
assert f.gcd((x^2 - 1)*(x + 4)) == x^2 - 1
assert f.factor().value() == f
assert repr(f.factor()) == "(x + 1) * (x - 1) * (x - 5) * (x^3 + 2)"
T.<q> = PolynomialRing(QQ)
g = (3/10)*(q - 1)^2*(q + 2)
assert g.factor().value() == g and g(3) == 6
assert g.derivative()(1) == 0
release_check("polynomials-exact")

U.<u> = PolynomialRing(GF(5))
h = u^4 - 1
assert repr(h.factor()) == "(u + 1) * (u + 2) * (u + 3) * (u + 4)"
assert h.gcd((u - 1)^2*(u + 2)) == u^2 + u + 3
assert h(2) == 0
release_check("polynomials-finite")

# A genuine GF(p^n), including its chosen defining relation and polynomial
# arithmetic over extension-field coefficients.
E.<a> = GF(9)
assert a*a == a + 1 and a^8 == 1 and 1/a == a + 2
V.<v> = PolynomialRing(E)
extension_polynomial = (v + a)*(v + a + 1)
assert extension_polynomial // (v + a) == v + a + 1
assert extension_polynomial.gcd(v^9 - v) == extension_polynomial
release_check("finite-extensions")

G = graphs.PetersenGraph()
assert G.order() == 10 and G.size() == 15 and G.girth() == 5
assert G.chromatic_number() == 3 and G.automorphism_group().order() == 120
encoded_graph = G.graph6_string()
assert encoded_graph == "IheA@GUAo" and Graph(encoded_graph).is_isomorphic(G)
release_check("graphs")

M = ModularSymbols(11)
assert M.dimension() == 3 and M.cuspidal_submodule().dimension() == 2
assert M.T(6).matrix() == M.T(2).matrix()*M.T(3).matrix()
assert M.cuspidal_submodule().T(2).matrix() == -2*identity_matrix(QQ, 2)
release_check("modular-symbols")

# SagePack round trips mathematical parents and variable-sized exact entries.
from sagejs_serialization import dumps, loads
payload_value = {
    "integer": matrix(ZZ, [[2^100 + 7, -2^130], [255, -999999]]),
    "rational": Q,
    "polynomial": g,
    "extension": extension_polynomial,
}
restored = loads(dumps(payload_value))
assert restored["integer"] == payload_value["integer"]
assert restored["rational"] == Q and restored["rational"].base_ring() is QQ
assert restored["polynomial"] == g and restored["polynomial"].parent() is T
assert restored["extension"] == extension_polynomial
release_check("serialization-mutation")

# Deterministic random construction is a lazy source-transparent native witness
# when production kernels are installed, and a correct explicit fallback when
# they are not. The launcher reports which implementation was observed.
set_random_seed(20260813)
N = random_matrix(GF(97), 8)
set_random_seed(20260813)
assert N == random_matrix(GF(97), 8)
assert N.rank() == 8 and N*N.inverse() == identity_matrix(GF(97), 8)
release_check("lazy-native-witness")
print("SAGEJS_RELEASE_SMOKE_OK")
`;

function usage() {
  return `Usage: node scripts/release-math-smoke.cjs [OPTIONS]

Run one authoritative exact-mathematics program through a release candidate.

Options:
  --source-root PATH     Run PATH/bin/sagejs through the current Node.js
  --package-root PATH    Run the sagejs bin declared by PATH/package.json
  --executable PATH      Run a standalone Sage.js/SEA executable
  --require-native       Fail unless an isolated/resource native path is observed
  --max-seconds N        Runtime budget (default: 30)
  --json                 Emit the result as JSON
  -h, --help             Show this help
`;
}

function parseArguments(argv) {
  const options = {
    sourceRoot: root,
    packageRoot: undefined,
    executable: undefined,
    requireNative: false,
    maxSeconds: 30,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--source-root") {
      options.sourceRoot = resolve(argv[++index]);
    } else if (argument === "--package-root") {
      options.packageRoot = resolve(argv[++index]);
    } else if (argument === "--executable") {
      options.executable = resolve(argv[++index]);
    } else if (argument === "--require-native") {
      options.requireNative = true;
    } else if (argument === "--max-seconds") {
      options.maxSeconds = Number(argv[++index]);
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "-h" || argument === "--help") {
      options.help = true;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  const targets = [options.packageRoot, options.executable].filter(Boolean);
  if (targets.length > 1) {
    throw new Error("choose only one of --package-root and --executable");
  }
  if (!(options.maxSeconds > 0) || !Number.isFinite(options.maxSeconds)) {
    throw new Error("--max-seconds must be a positive finite number");
  }
  return options;
}

function packageBin(packageRoot) {
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json")));
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.sagejs;
  if (typeof bin !== "string") {
    throw new Error(`${packageRoot}/package.json does not declare bin.sagejs`);
  }
  return resolve(packageRoot, bin);
}

function runnerFor(options) {
  if (options.executable) {
    return {
      kind: "standalone-executable",
      command: options.executable,
      prefixArguments: [],
      identity: basename(options.executable),
    };
  }
  const packageRoot = options.packageRoot || options.sourceRoot;
  const script = options.packageRoot
    ? packageBin(packageRoot)
    : resolve(packageRoot, "bin", "sagejs");
  return {
    kind: options.packageRoot ? "npm-package" : "source-checkout",
    command: process.execPath,
    prefixArguments: [script],
    identity: script,
  };
}

function nativeSelection(line) {
  const match = line.match(/^\[sagejs native\] (.+) -> ([^\s]+)\s*$/);
  if (!match) return undefined;
  return { operation: match[1], implementation: match[2] };
}

function isNativeImplementation(implementation) {
  return !/dynamic|fallback|unavailable|disabled/i.test(implementation) &&
    /isolated|resource|flint|fflas|m4ri|native/i.test(implementation);
}

function targetVersion(runner, cwd) {
  const probe = spawnSync(
    runner.command,
    [...runner.prefixArguments, "--version"],
    { cwd, encoding: "utf8", timeout: 5_000 },
  );
  if (probe.error) throw probe.error;
  if (probe.status !== 0) {
    throw new Error(
      `release candidate --version failed with status ${probe.status}: ` +
      `${probe.stderr || probe.stdout}`,
    );
  }
  const version = probe.stdout.trim();
  if (!/^sagejs \S+$/.test(version)) {
    throw new Error(`unexpected release candidate version: ${JSON.stringify(version)}`);
  }
  return version;
}

function runSmoke(options) {
  const runner = runnerFor(options);
  const directory = mkdtempSync(join(tmpdir(), "sagejs-release-math-smoke-"));
  const source = join(directory, "release-math-smoke.sage");
  writeFileSync(source, sageProgram);
  let version;
  let started;
  let child;
  try {
    version = targetVersion(runner, directory);
    started = process.hrtime.bigint();
    child = spawnSync(
      runner.command,
      [...runner.prefixArguments, source],
      {
        // A release artifact must not accidentally obtain modules or native
        // libraries from the repository that launched this verifier.
        cwd: directory,
        encoding: "utf8",
        env: { ...process.env, SAGEJS_NATIVE_TRACE: "1" },
        timeout: Math.ceil(options.maxSeconds * 1000),
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(
      `release mathematics smoke failed with status ${child.status}\n` +
      `stdout:\n${child.stdout}\nstderr:\n${child.stderr}`,
    );
  }
  if (seconds > options.maxSeconds) {
    throw new Error(
      `release mathematics smoke took ${seconds.toFixed(3)}s; ` +
      `budget is ${options.maxSeconds}s`,
    );
  }
  const lines = `${child.stdout}\n${child.stderr}`.split(/\r?\n/);
  const completed = lines
    .filter((line) => line.startsWith("SAGEJS_RELEASE_CHECK "))
    .map((line) => line.slice("SAGEJS_RELEASE_CHECK ".length));
  if (JSON.stringify(completed) !== JSON.stringify(checkNames)) {
    throw new Error(
      `release mathematics checks were incomplete: ${JSON.stringify(completed)}`,
    );
  }
  if (!lines.includes("SAGEJS_RELEASE_SMOKE_OK")) {
    throw new Error("release mathematics completion marker is missing");
  }
  const selections = lines.map(nativeSelection).filter(Boolean);
  const nativeObserved = selections.some(({ implementation }) =>
    isNativeImplementation(implementation));
  if (options.requireNative && !nativeObserved) {
    throw new Error(
      "--require-native was set, but no isolated/resource native selection " +
      `was observed; selections=${JSON.stringify(selections)}`,
    );
  }
  return {
    schema_version: 1,
    ok: true,
    runner: { kind: runner.kind, identity: runner.identity, version },
    host_platform: `${process.platform}-${process.arch}`,
    verifier_node: process.version,
    seconds: Number(seconds.toFixed(3)),
    budget_seconds: options.maxSeconds,
    checks: completed,
    native: {
      required: options.requireNative,
      observed: nativeObserved,
      status: nativeObserved ? "observed" : "explicit-fallback",
      selections,
    },
  };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const result = runSmoke(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  console.log(
    `Release mathematics smoke passed: ${result.checks.length} checks in ` +
    `${result.seconds.toFixed(3)}s ` +
    `(${result.host_platform}, ${result.runner.kind}).`,
  );
  console.log(
    `Native capability: ${result.native.status}` +
    (result.native.selections.length === 0
      ? " (no traced selections)"
      : ` (${result.native.selections.length} traced selections)`),
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`release-math-smoke: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  checkNames,
  isNativeImplementation,
  main,
  nativeSelection,
  packageBin,
  parseArguments,
  runSmoke,
  runnerFor,
  sageProgram,
  targetVersion,
  usage,
};
