#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const corpusDownloader = require("./download-lmfdb-number-fields.cjs");
const {
  NATIVE_MATH_DEPENDENCY_VERSIONS,
} = require("../../scripts/native-math-profile.cjs");
const { inspectBuildReceipt } = require("../../scripts/build-receipt.cjs");

const {
  SCHEMA,
  SCHEMA_VERSION,
  TIMING_BOUNDARIES,
  collectFixtureIdentity,
  collectGitSourceIdentity,
  collectHostFingerprint,
  createToolFingerprint,
  decimalMetadata,
  finalizeClassUnitEvidence,
  fingerprint,
  performanceEvidenceAccepted,
  regulatorSatisfiesContract,
  semanticComparisonKey,
  sha256File,
} = require("./class-unit-evidence-schema.cjs");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_FIXTURE = path.join(
  ROOT,
  "test/fixtures/number-field-lmfdb-cubic-100.json",
);
const FIXTURE_SCHEMA = "sagejs.number-fields/lmfdb-cubic-stratified-corpus-v2";
const SYSTEMS = Object.freeze([
  "sagejs",
  "sage-pari",
  "direct-gp",
  "magma",
  "hecke",
  "oscar",
]);
const IMPLEMENTED_SYSTEMS = new Set([
  "sagejs",
  "sage-pari",
  "direct-gp",
  "magma",
  "hecke",
]);
const ROLES = new Set(["smoke", "tune", "holdout"]);
const PAYLOAD_PREFIX = "SAGEJS_CLASS_UNIT_CORPUS|";
const GP_PAYLOAD_PREFIX = "SAGEJS_CLASS_UNIT_GP|";
const GP_ERROR_PREFIX = "SAGEJS_CLASS_UNIT_GP_ERROR|";
const MAGMA_PAYLOAD_PREFIX = "SAGEJS_CLASS_UNIT_MAGMA|";
const MAGMA_ERROR_PREFIX = "SAGEJS_CLASS_UNIT_MAGMA_ERROR|";
const MAGMA_DONE_PREFIX = "SAGEJS_CLASS_UNIT_MAGMA_DONE|";
const HECKE_PAYLOAD_PREFIX = "SAGEJS_CLASS_UNIT_HECKE|";
const HECKE_ERROR_PREFIX = "SAGEJS_CLASS_UNIT_HECKE_ERROR|";
const HECKE_DONE_PREFIX = "SAGEJS_CLASS_UNIT_HECKE_DONE|";
const REGULATOR_CONTRACT = Object.freeze({
  minimum_decimal_digits: 10,
  require_rigorous: false,
});
const GNU_TIME = process.platform === "linux" && fs.existsSync("/usr/bin/time")
  ? "/usr/bin/time"
  : null;
const GNU_TIMEOUT = process.platform === "linux" && fs.existsSync("/usr/bin/timeout")
  ? "/usr/bin/timeout"
  : null;

function usage() {
  return `Usage: node ${path.relative(ROOT, __filename)} [options]

Run a versioned subset of the stratified cubic class/unit corpus. An actual
evidence run is accepted only from a clean Git source tree. Sub-10ms direct-GP
kernel and field samples are means of independent-field batches lasting at
least one second; every sample records its batch size, scoped process peak RSS,
and available phase times. Timing acceptance and per-operation memory
acceptance are reported separately.

Corpus and measurement options:
  --tier TIER            smoke, tune, holdout, or all (default: smoke)
  --proof MODE           false, true, or both (default: false)
  --boundaries LIST      comma-separated kernel-warm, field-cold,
                         process-cold, release-cold (default: all four)
  --systems LIST         comma-separated comparator families (default: sagejs)
  --samples N            retained samples per job (default: 5)
  --limit N              deterministic debugging prefix after tier selection
  --timeout-seconds N    timeout per persistent group or fresh process (default: 900)
  --fixture PATH         alternate v2 offline fixture
  --output PATH          write the plan or finalized evidence JSON
  --dry-run              detect tools and print the complete plan; do no arithmetic

Tool overrides:
  --sagejs PATH          source-tree Sage.js launcher
  --sagejs-release PATH  installed/packaged Sage.js release launcher
  --sage PATH            Sage/PARI launcher
  --gp PATH              direct GP/PARI launcher
  --magma PATH           Magma launcher
  --julia PATH           Julia launcher shared by Hecke and Oscar
  --hecke-project PATH   pinned Hecke Julia project
  --oscar-project PATH   pinned Oscar Julia project
  --julia-depot PATH     pinned Julia depot
  --help                 show this text

Magma and pinned Hecke 0.40 have exact corpus adapters. Oscar remains
inventory-only: selecting it records an explicit unsupported terminal state
and makes the run fail closed.`;
}

function parseList(value, label) {
  const values = String(value).split(",").map((item) => item.trim()).filter(Boolean);
  if (values.length === 0 || new Set(values).size !== values.length) {
    throw new Error(`${label} must be a nonempty list without duplicates`);
  }
  return values;
}

function parsePositiveInteger(value, label) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return result;
}

function parseArguments(argv) {
  const options = {
    tier: "smoke",
    proof: "false",
    boundaries: [...TIMING_BOUNDARIES],
    systems: ["sagejs"],
    samples: 5,
    limit: null,
    timeoutSeconds: 900,
    fixture: DEFAULT_FIXTURE,
    output: null,
    dryRun: false,
    sagejs:
      process.env.SAGEJS_CLASS_UNIT_EXECUTABLE ||
      process.env.SAGEJS_BENCH_EXECUTABLE ||
      path.join(ROOT, "bin/sagejs"),
    sagejsRelease: process.env.SAGEJS_RELEASE_EXECUTABLE || null,
    sage:
      process.env.SAGE_ORACLE ||
      (fs.existsSync("/home/user/sagelite/sage") ? "/home/user/sagelite/sage" : "sage"),
    gp: process.env.GP_ORACLE || process.env.PARI_ORACLE || "gp",
    magma:
      process.env.MAGMA_ORACLE ||
      (fs.existsSync("/home/user/bin/magma") ? "/home/user/bin/magma" : "magma"),
    julia:
      process.env.JULIA_ORACLE ||
      (fs.existsSync("/home/user/upstream/julia-1.10.10/bin/julia")
        ? "/home/user/upstream/julia-1.10.10/bin/julia"
        : "julia"),
    heckeProject:
      process.env.HECKE_ORACLE_PROJECT ||
      process.env.HECKE_PROJECT ||
      "/home/user/upstream/Hecke.jl",
    oscarProject:
      process.env.OSCAR_ORACLE_PROJECT ||
      process.env.OSCAR_PROJECT ||
      "/home/user/upstream/Oscar.jl",
    juliaDepot:
      process.env.JULIA_DEPOT_PATH || "/home/user/upstream/julia-class-unit-depot",
  };
  const valueOptions = new Map([
    ["--tier", "tier"],
    ["--proof", "proof"],
    ["--boundaries", "boundaries"],
    ["--systems", "systems"],
    ["--samples", "samples"],
    ["--limit", "limit"],
    ["--timeout-seconds", "timeoutSeconds"],
    ["--fixture", "fixture"],
    ["--output", "output"],
    ["--sagejs", "sagejs"],
    ["--sagejs-release", "sagejsRelease"],
    ["--sage", "sage"],
    ["--gp", "gp"],
    ["--magma", "magma"],
    ["--julia", "julia"],
    ["--hecke-project", "heckeProject"],
    ["--oscar-project", "oscarProject"],
    ["--julia-depot", "juliaDepot"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--help") {
      console.log(usage());
      process.exit(0);
    }
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    const key = valueOptions.get(argument);
    if (!key) throw new Error(`unknown argument: ${argument}`);
    if (index + 1 >= argv.length) throw new Error(`${argument} needs a value`);
    options[key] = argv[(index += 1)];
  }
  if (!new Set(["smoke", "tune", "holdout", "all"]).has(options.tier)) {
    throw new Error("--tier must be smoke, tune, holdout, or all");
  }
  if (!new Set(["false", "true", "both"]).has(options.proof)) {
    throw new Error("--proof must be false, true, or both");
  }
  options.boundaries = Array.isArray(options.boundaries)
    ? options.boundaries
    : parseList(options.boundaries, "--boundaries");
  if (options.boundaries.some((name) => !TIMING_BOUNDARIES.includes(name))) {
    throw new Error(`--boundaries must be selected from ${TIMING_BOUNDARIES.join(",")}`);
  }
  options.systems = Array.isArray(options.systems)
    ? options.systems
    : parseList(options.systems, "--systems");
  if (options.systems.some((name) => !SYSTEMS.includes(name))) {
    throw new Error(`--systems must be selected from ${SYSTEMS.join(",")}`);
  }
  options.samples = parsePositiveInteger(options.samples, "--samples");
  options.timeoutSeconds = parsePositiveInteger(
    options.timeoutSeconds,
    "--timeout-seconds",
  );
  if (options.limit !== null) options.limit = parsePositiveInteger(options.limit, "--limit");
  options.fixture = path.resolve(options.fixture);
  if (options.output) options.output = path.resolve(options.output);
  return options;
}

function proofModes(mode) {
  if (mode === "both") return ["conditional-grh", "unconditional"];
  return [mode === "true" ? "unconditional" : "conditional-grh"];
}

function resolveExecutable(requested) {
  if (!requested) return null;
  const hasSeparator = requested.includes("/") || requested.includes("\\");
  const extensions = process.platform === "win32"
    ? ["", ...(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")]
    : [""];
  const bases = hasSeparator
    ? [path.resolve(requested)]
    : (process.env.PATH || "").split(path.delimiter).map((directory) =>
        path.join(directory, requested)
      );
  for (const base of bases) {
    for (const extension of extensions) {
      const candidate = `${base}${extension}`;
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return fs.realpathSync(candidate);
      } catch {
        // Continue through the deterministic candidate list.
      }
    }
  }
  return null;
}

function resolveProject(requested, packageName) {
  const absolute = requested ? path.resolve(requested) : null;
  const projectFile = absolute && fs.statSync(absolute, { throwIfNoEntry: false })?.isDirectory()
    ? path.join(absolute, "Project.toml")
    : absolute;
  if (!projectFile || !fs.existsSync(projectFile)) {
    return { status: "unavailable", requested, path: null, reason: "Project.toml does not exist" };
  }
  const source = fs.readFileSync(projectFile, "utf8");
  const name = /^name\s*=\s*"([^"]+)"/m.exec(source)?.[1] || null;
  const version = /^version\s*=\s*"([^"]+)"/m.exec(source)?.[1] || null;
  if (name !== packageName) {
    return {
      status: "unavailable",
      requested,
      path: fs.realpathSync(projectFile),
      reason: `project declares ${name || "no package name"}, expected ${packageName}`,
    };
  }
  const projectDirectory = path.dirname(fs.realpathSync(projectFile));
  const manifest = path.join(projectDirectory, "Manifest.toml");
  return {
    status: "available",
    requested,
    path: projectDirectory,
    project_toml: fs.realpathSync(projectFile),
    project_toml_sha256: sha256File(projectFile),
    manifest_toml: fs.existsSync(manifest) ? fs.realpathSync(manifest) : null,
    manifest_toml_sha256: fs.existsSync(manifest) ? sha256File(manifest) : null,
    package: name,
    package_version: version,
  };
}

function probe(executable, args, { input = null, env = {}, timeout = 20_000 } = {}) {
  const run = childProcess.spawnSync(executable, args, {
    cwd: ROOT,
    encoding: "utf8",
    input,
    env: { ...process.env, ...env },
    maxBuffer: 4 * 1024 * 1024,
    timeout,
    killSignal: "SIGKILL",
  });
  return {
    ok: !run.error && run.status === 0,
    status: run.status,
    signal: run.signal,
    error: run.error?.message || null,
    stdout: (run.stdout || "").trim(),
    stderr: (run.stderr || "").trim(),
  };
}

function packageVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version || null;
  } catch {
    return null;
  }
}

function displayedPath(filename) {
  const absolute = fs.realpathSync(filename);
  const relative = path.relative(ROOT, absolute).replaceAll("\\", "/");
  return relative !== "" && !relative.startsWith("../") && !path.isAbsolute(relative)
    ? relative
    : absolute;
}

function fileArtifact(role, filename) {
  const absolute = fs.realpathSync(filename);
  return { role, path: displayedPath(absolute), sha256: sha256File(absolute) };
}

function dynamicLibraryInventory(executables) {
  if (process.platform !== "linux") return { artifacts: [], libraries: [] };
  const ldd = resolveExecutable("ldd");
  if (!ldd) throw new Error("exact Linux tool identity requires ldd");
  const librariesByPath = new Map();
  for (const executable of executables) {
    const run = childProcess.spawnSync(ldd, [executable], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 20_000,
    });
    if (run.error || run.status !== 0) {
      throw new Error(
        `ldd failed for ${executable}: ${run.error?.message || run.stderr || `exit ${run.status}`}`,
      );
    }
    for (const line of String(run.stdout || "").split(/\r?\n/)) {
      const match = /^\s*([^\s]+)\s+=>\s+(\/[^\s]+)\s+\(/.exec(line) ||
        /^\s*(\/[^\s]+)\s+\(/.exec(line);
      if (!match) continue;
      const soname = match.length === 3 ? match[1] : path.basename(match[1]);
      const filename = match.length === 3 ? match[2] : match[1];
      if (!fs.existsSync(filename)) continue;
      const absolute = fs.realpathSync(filename);
      if (!librariesByPath.has(absolute)) librariesByPath.set(absolute, { soname, path: absolute });
    }
  }
  const libraries = [...librariesByPath.values()].sort((left, right) =>
    left.path.localeCompare(right.path)
  );
  return {
    libraries,
    artifacts: libraries.map((library, index) =>
      fileArtifact(`dynamic-library-${String(index).padStart(3, "0")}`, library.path)
    ),
  };
}

function exactLibraryIdentity(inventory, pattern) {
  const library = inventory.libraries.find((entry) => pattern.test(entry.soname));
  if (!library) return null;
  return `${library.soname}@sha256:${sha256File(library.path)}`;
}

function sageRuntimeIdentity(executable) {
  const marker = "SAGEJS_SAGE_RUNTIME|";
  const source = `import json, sys
import sage.all
import cypari2
import cypari2.gen
import cypari2.pari_instance
import sage.rings.real_arb
import sage.rings.polynomial.polynomial_integer_dense_flint
print(${JSON.stringify(marker)} + json.dumps({
    "python-runtime": sys.executable,
    "sage-entrypoint": sage.all.__file__,
    "cypari-entrypoint": cypari2.__file__,
    "cypari-gen-extension": cypari2.gen.__file__,
    "cypari-instance-extension": cypari2.pari_instance.__file__,
    "arb-extension": sage.rings.real_arb.__file__,
    "flint-extension": sage.rings.polynomial.polynomial_integer_dense_flint.__file__,
}, sort_keys=True))
`;
  const result = probe(executable, ["-python", "-"], { input: source });
  const line = result.stdout.split(/\r?\n/).find((item) => item.startsWith(marker));
  if (!result.ok || !line) {
    throw new Error(result.error || result.stderr || "Sage runtime identity probe emitted no marker");
  }
  let paths;
  try {
    paths = JSON.parse(line.slice(marker.length));
  } catch (error) {
    throw new Error(`Sage runtime identity probe emitted invalid JSON: ${error.message}`);
  }
  const expectedRoles = [
    "arb-extension",
    "cypari-entrypoint",
    "cypari-gen-extension",
    "cypari-instance-extension",
    "flint-extension",
    "python-runtime",
    "sage-entrypoint",
  ];
  if (JSON.stringify(Object.keys(paths).sort()) !== JSON.stringify(expectedRoles)) {
    throw new Error("Sage runtime identity probe omitted a required runtime component");
  }
  for (const [role, filename] of Object.entries(paths)) {
    if (typeof filename !== "string" || !fs.statSync(filename, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Sage runtime identity ${role} is not an existing file`);
    }
  }
  const dynamic = dynamicLibraryInventory([
    paths["python-runtime"],
    paths["arb-extension"],
    paths["cypari-gen-extension"],
    paths["cypari-instance-extension"],
    paths["flint-extension"],
  ]);
  return {
    artifacts: [
      fileArtifact("launcher", executable),
      ...expectedRoles.map((role) => fileArtifact(role, paths[role])),
      ...dynamic.artifacts,
    ],
    libraries: {
      arb: exactLibraryIdentity(dynamic, /^libarb(?:[-.]|$)/i),
      flint: exactLibraryIdentity(dynamic, /^libflint(?:[-.]|$)/i),
      gmp: exactLibraryIdentity(dynamic, /^libgmp(?:[-.]|$)/i),
      pari: exactLibraryIdentity(dynamic, /^libpari(?:[-.]|$)/i),
    },
  };
}

function treeArtifact(role, directory) {
  const absolute = fs.realpathSync(directory);
  const records = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(filename);
      } else if (entry.isFile()) {
        const stats = fs.statSync(filename);
        records.push({
          path: path.relative(absolute, filename).replaceAll("\\", "/"),
          bytes: stats.size,
          sha256: sha256File(filename),
        });
      } else {
        throw new Error(`runtime artifact tree contains a non-file entry: ${filename}`);
      }
    }
  }
  visit(absolute);
  if (records.length === 0) throw new Error(`runtime artifact tree is empty: ${absolute}`);
  return { role, path: displayedPath(absolute), sha256: fingerprint(records) };
}

function sourceRuntimeArtifacts(executable) {
  const inspected = inspectBuildReceipt(ROOT);
  if (!inspected.current) {
    throw new Error(`source Sage.js build receipt is stale: ${inspected.reason}`);
  }
  const receiptFile = path.join(ROOT, "dist/build-receipt.json");
  const receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8"));
  if (receipt.schema !== "sagejs.build-receipt/v1" ||
      !/^[0-9a-f]{64}$/.test(receipt.identity?.workspaceSha256 || "")) {
    throw new Error("source Sage.js requires a valid dist/build-receipt.json");
  }
  for (const input of receipt.identity.nativeInputs || []) {
    for (const file of input.files || []) {
      const filename = path.join(ROOT, file.path);
      if (!fs.existsSync(filename) || fs.statSync(filename).size !== file.bytes ||
          sha256File(filename) !== file.sha256) {
        throw new Error(`native build receipt mismatch at ${file.path}`);
      }
    }
  }
  const nativeIndexFile = path.join(ROOT, "dist/native-kernels/index.json");
  const nativeIndex = JSON.parse(fs.readFileSync(nativeIndexFile, "utf8"));
  const pack = nativeIndex.packs?.[0];
  const packFile = path.join(ROOT, "dist/native-kernels/pack/sagejs_native_kernel_pack.node");
  if (!pack || !fs.existsSync(packFile) || fs.statSync(packFile).size !== pack.bytes ||
      sha256File(packFile) !== pack.sha256) {
    throw new Error("production native-kernel pack disagrees with its authenticated index");
  }
  return [
    fileArtifact("source-launcher", executable),
    fileArtifact("source-entrypoint", path.join(ROOT, "bin/sagejs-source.cjs")),
    fileArtifact("node-runtime", process.execPath),
    fileArtifact("build-receipt", receiptFile),
    treeArtifact("tools-tree", path.join(ROOT, "dist/tools")),
    treeArtifact("module-cache-tree", path.join(ROOT, "dist/module-cache")),
    treeArtifact("runtime-cache-tree", path.join(ROOT, "dist/runtime-cache")),
    treeArtifact("native-kernels-tree", path.join(ROOT, "dist/native-kernels")),
  ];
}

function sourceLibraries() {
  const createCompiler = require(path.join(ROOT, "dist/tools/compiler.js")).default;
  const compiler = createCompiler().get_compiler_version();
  return {
    arb: `integrated-with-flint-${NATIVE_MATH_DEPENDENCY_VERSIONS.flint}`,
    compiler,
    flint: NATIVE_MATH_DEPENDENCY_VERSIONS.flint,
    gmp: NATIVE_MATH_DEPENDENCY_VERSIONS.gmp,
    pari: null,
  };
}

function nullLibraries(overrides = {}) {
  return { arb: null, compiler: null, flint: null, gmp: null, pari: null, ...overrides };
}

function magmaRuntimeIdentity(executable) {
  const artifacts = [fileArtifact("launcher", executable)];
  const siblingRuntime = `${executable}.exe`;
  const runtime = fs.statSync(siblingRuntime, { throwIfNoEntry: false })?.isFile()
    ? fs.realpathSync(siblingRuntime)
    : executable;
  if (runtime === executable) {
    throw new Error(
      "Magma comparator requires its authenticated launcher next to magma.exe",
    );
  }
  artifacts.push(fileArtifact("runtime-executable", runtime));
  const installationRoot = path.dirname(path.dirname(executable));
  const packageDirectory = path.join(installationRoot, "package");
  if (!fs.statSync(packageDirectory, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error("Magma launcher identity did not resolve its required package tree");
  }
  artifacts.push(treeArtifact("magma-package-tree", packageDirectory));
  // The supported Magma 2.18 distribution is a shell launcher around a
  // statically linked runtime. If a deployment supplies a dynamic runtime,
  // bind its entire resolved shared-library set as well.
  const header = fs.readFileSync(runtime).subarray(0, 4);
  let dynamic = { artifacts: [], libraries: [] };
  if (header.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    const ldd = probe(resolveExecutable("ldd"), [runtime]);
    if (ldd.ok) dynamic = dynamicLibraryInventory([runtime]);
  }
  return {
    artifacts: [...artifacts, ...dynamic.artifacts],
    libraries: nullLibraries({
      gmp: exactLibraryIdentity(dynamic, /^libgmp(?:[-.]|$)/i),
    }),
  };
}

function heckeRuntimeIdentity(executable, project, juliaDepot) {
  if (!fs.statSync(juliaDepot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`pinned Hecke identity requires Julia depot ${juliaDepot}`);
  }
  const marker = "SAGEJS_HECKE_RUNTIME|";
  const source = `using Hecke
import Nemo, AbstractAlgebra, FLINT_jll, GMP_jll, MPFR_jll, Libdl
items = [
    "julia-version" => string(VERSION),
    "hecke-version" => string(pkgversion(Hecke)),
    "nemo-version" => string(pkgversion(Nemo)),
    "abstractalgebra-version" => string(pkgversion(AbstractAlgebra)),
    "flint-jll-version" => string(pkgversion(FLINT_jll)),
    "gmp-jll-version" => string(pkgversion(GMP_jll)),
    "mpfr-jll-version" => string(pkgversion(MPFR_jll)),
    "hecke-entrypoint" => pathof(Hecke),
    "nemo-entrypoint" => pathof(Nemo),
    "abstractalgebra-entrypoint" => pathof(AbstractAlgebra),
    "flint-library" => FLINT_jll.libflint_path,
    "gmp-library" => GMP_jll.libgmp_path,
    "mpfr-library" => MPFR_jll.libmpfr_path,
    "system-image" => unsafe_string(Base.JLOptions().image_file),
]
for (key, value) in items
    println(${JSON.stringify(marker)}, key, "|", value)
end
library_paths = sort!(unique!(filter(
    path -> isabspath(path) && isfile(path) && occursin(".so", basename(path)),
    Libdl.dllist(),
)))
for library_path in library_paths
    if occursin("/compiled/v", library_path) && endswith(library_path, ".so")
        cache_path = library_path
        println(${JSON.stringify(marker)}, "compiled-cache|", cache_path)
    end
    println(${JSON.stringify(marker)}, "loaded-library|", library_path)
end
`;
  const result = probe(
    executable,
    [
      "--startup-file=no",
      "--history-file=no",
      "--threads=1",
      "--compiled-modules=yes",
      "--pkgimages=yes",
      `--project=${project.path}`,
      "-",
    ],
    {
      input: source,
      env: {
        JULIA_DEPOT_PATH: juliaDepot,
        JULIA_LOAD_PATH: "@:@stdlib",
        JULIA_PKG_OFFLINE: "true",
      },
      timeout: 120_000,
    },
  );
  if (!result.ok) {
    throw new Error(result.error || result.stderr || "Hecke runtime identity probe failed");
  }
  const fields = {};
  const compiledCaches = [];
  const loadedLibraries = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.startsWith(marker)) continue;
    const separator = line.indexOf("|", marker.length);
    if (separator < 0) throw new Error("Hecke runtime identity emitted a malformed marker");
    const key = line.slice(marker.length, separator);
    const value = line.slice(separator + 1);
    if (key === "compiled-cache") compiledCaches.push(value);
    else if (key === "loaded-library") loadedLibraries.push(value);
    else fields[key] = value;
  }
  const required = [
    "julia-version",
    "hecke-version",
    "nemo-version",
    "abstractalgebra-version",
    "flint-jll-version",
    "gmp-jll-version",
    "mpfr-jll-version",
    "hecke-entrypoint",
    "nemo-entrypoint",
    "abstractalgebra-entrypoint",
    "flint-library",
    "gmp-library",
    "mpfr-library",
    "system-image",
  ];
  if (required.some((key) => !fields[key])) {
    throw new Error("Hecke runtime identity probe omitted a required component");
  }
  if (!/^0\.40\./.test(fields["hecke-version"])) {
    throw new Error(`Hecke comparator requires pinned Hecke 0.40, got ${fields["hecke-version"]}`);
  }
  if (process.platform === "linux" && compiledCaches.length === 0) {
    throw new Error("Hecke runtime identity did not resolve a loaded compiled package image");
  }
  if (process.platform === "linux" && loadedLibraries.length === 0) {
    throw new Error("Hecke runtime identity did not resolve its loaded shared libraries");
  }
  const fileRoles = ["flint-library", "gmp-library", "mpfr-library", "system-image"];
  for (const role of fileRoles) {
    if (!fs.statSync(fields[role], { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Hecke runtime identity ${role} is not an existing file`);
    }
  }
  const sourceRoles = ["hecke-entrypoint", "nemo-entrypoint", "abstractalgebra-entrypoint"];
  for (const role of sourceRoles) {
    if (!fs.statSync(fields[role], { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Hecke runtime identity ${role} is not an existing file`);
    }
  }
  const dynamic = dynamicLibraryInventory([executable]);
  const sourceIdentity = collectGitSourceIdentity({ root: project.path });
  if (sourceIdentity.clean !== true) {
    throw new Error("pinned Hecke comparator source tree is dirty");
  }
  const compiledArtifacts = [];
  for (const [cacheIndex, cache] of [...new Set(compiledCaches)].sort().entries()) {
    if (!fs.statSync(cache, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Hecke loaded cache image does not exist: ${cache}`);
    }
    const suffix = String(cacheIndex).padStart(3, "0");
    compiledArtifacts.push(fileArtifact(`loaded-package-image-${suffix}`, cache));
    const ji = cache.replace(/\.so$/, ".ji");
    if (fs.statSync(ji, { throwIfNoEntry: false })?.isFile()) {
      compiledArtifacts.push(fileArtifact(`loaded-package-cache-${suffix}`, ji));
    }
  }
  const loadedLibraryArtifacts = [...new Set(loadedLibraries)].sort().map(
    (library, libraryIndex) => {
      if (!fs.statSync(library, { throwIfNoEntry: false })?.isFile()) {
        throw new Error(`Hecke loaded library does not exist: ${library}`);
      }
      return fileArtifact(
        `loaded-shared-library-${String(libraryIndex).padStart(3, "0")}`,
        library,
      );
    },
  );
  const flintIdentity =
    `FLINT_jll-${fields["flint-jll-version"]}@sha256:${sha256File(fields["flint-library"])}`;
  const gmpIdentity =
    `GMP_jll-${fields["gmp-jll-version"]}@sha256:${sha256File(fields["gmp-library"])}`;
  return {
    version:
      `Julia ${fields["julia-version"]}; Hecke ${fields["hecke-version"]}; ` +
      `Nemo ${fields["nemo-version"]}; AbstractAlgebra ${fields["abstractalgebra-version"]}`,
    artifacts: [
      fileArtifact("julia-executable", executable),
      fileArtifact("julia-system-image", fields["system-image"]),
      fileArtifact("project-toml", project.project_toml),
      ...(project.manifest_toml ? [fileArtifact("manifest-toml", project.manifest_toml)] : []),
      ...sourceRoles.map((role) =>
        treeArtifact(role.replace("entrypoint", "source-tree"), path.dirname(fields[role]))
      ),
      ...compiledArtifacts,
      ...loadedLibraryArtifacts,
      fileArtifact("flint-library", fields["flint-library"]),
      fileArtifact("gmp-library", fields["gmp-library"]),
      fileArtifact("mpfr-library", fields["mpfr-library"]),
      ...dynamic.artifacts,
    ],
    libraries: nullLibraries({
      arb: `integrated-with-${flintIdentity}`,
      compiler: `Julia ${fields["julia-version"]}`,
      flint: flintIdentity,
      gmp: gmpIdentity,
    }),
    source_identity: sourceIdentity,
  };
}

function executableTool(name, requested, versionProbe) {
  const executable = resolveExecutable(requested);
  if (!executable) {
    return {
      name,
      status: "unavailable",
      requested_executable: requested,
      executable: null,
      version: null,
      reason: "executable was not found or is not executable",
    };
  }
  const version = versionProbe(executable);
  return {
    name,
    status: version.ok ? "available" : "unavailable",
    requested_executable: requested,
    executable,
    version: version.version,
    version_probe: version.probe,
    reason: version.ok ? null : version.reason,
  };
}

function detectTools(options) {
  const sagejs = executableTool("sagejs", options.sagejs, (executable) => {
    const result = probe(executable, ["--python", "-"], {
      input: 'print("SAGEJS_CORPUS_PROBE_OK")\n',
      env: { SAGEJS_USE_SOURCE: "1" },
    });
    return {
      ok: result.ok && result.stdout.split(/\r?\n/).includes("SAGEJS_CORPUS_PROBE_OK"),
      version: packageVersion(),
      probe: { argv: [executable, "--python", "-"], ...result },
      reason: result.error || result.stderr || "Sage.js probe emitted no success marker",
    };
  });
  sagejs.argv_prefix = sagejs.executable ? [sagejs.executable, "--python"] : null;
  if (sagejs.status === "available") {
    try {
      sagejs.artifacts = sourceRuntimeArtifacts(sagejs.executable);
      sagejs.libraries = sourceLibraries();
      sagejs.execution_mode = "source-forced";
    } catch (error) {
      sagejs.status = "unavailable";
      sagejs.reason = error.message;
    }
  }

  const sagejsRelease = options.sagejsRelease
    ? executableTool("sagejs-release", options.sagejsRelease, (executable) => {
        const result = probe(executable, ["--python", "-"], {
          input: 'print("SAGEJS_RELEASE_PROBE_OK")\n',
        });
        return {
          ok: result.ok && result.stdout.split(/\r?\n/).includes("SAGEJS_RELEASE_PROBE_OK"),
          version: null,
          probe: { argv: [executable, "--python", "-"], ...result },
          reason: result.error || result.stderr || "release probe emitted no success marker",
        };
      })
    : {
        name: "sagejs-release",
        status: "unavailable",
        requested_executable: null,
        executable: null,
        version: null,
        reason: "no packaged release launcher was supplied",
      };
  sagejsRelease.argv_prefix = sagejsRelease.executable
    ? [sagejsRelease.executable, "--python"]
    : null;
  if (sagejsRelease.status === "available") {
    if (sagejs.executable && sagejsRelease.executable === sagejs.executable) {
      sagejsRelease.status = "unavailable";
      sagejsRelease.reason = "release launcher must be distinct from the forced source launcher";
    } else {
      sagejsRelease.artifacts = [fileArtifact("release-executable", sagejsRelease.executable)];
      sagejsRelease.libraries = nullLibraries();
      sagejsRelease.execution_mode = "release-explicit";
    }
  }

  const sage = executableTool("sage-pari", options.sage, (executable) => {
    const result = probe(executable, ["--version"]);
    const text = `${result.stdout}\n${result.stderr}`.trim();
    return {
      ok: result.ok && /SageMath version/i.test(text),
      version: text.split(/\r?\n/).find((line) => /SageMath version/i.test(line)) || null,
      probe: { argv: [executable, "--version"], ...result },
      reason: result.error || text || "Sage version probe failed",
    };
  });
  sage.argv_prefix = sage.executable ? [sage.executable, "-python"] : null;
  if (sage.status === "available") {
    const pariProbe = probe(sage.executable, ["-python", "-"], {
      input: 'from sage.all import pari\nprint("SAGEJS_PARI_VERSION|" + str(pari("version()")))\n',
    });
    try {
      const runtime = sageRuntimeIdentity(sage.executable);
      const pariVersion = /SAGEJS_PARI_VERSION\|([^\r\n]+)/.exec(pariProbe.stdout)?.[1] ||
        "unreported";
      sage.artifacts = runtime.artifacts;
      sage.libraries = nullLibraries({
        ...runtime.libraries,
        pari: runtime.libraries.pari
          ? `${pariVersion}; ${runtime.libraries.pari}`
          : pariVersion,
      });
      sage.execution_mode = "authenticated-sage-runtime";
    } catch (error) {
      sage.status = "unavailable";
      sage.reason = error.message;
    }
  }

  const gp = executableTool("direct-gp", options.gp, (executable) => {
    const result = probe(executable, ["--version"]);
    const text = `${result.stdout}\n${result.stderr}`.trim();
    return {
      ok: result.ok && /GP\/PARI CALCULATOR Version/i.test(text),
      version: /GP\/PARI CALCULATOR Version[^\r\n]*/i.exec(text)?.[0] || null,
      probe: { argv: [executable, "--version"], ...result },
      reason: result.error || text || "GP/PARI version probe failed",
    };
  });
  gp.argv_prefix = gp.executable ? [gp.executable, "-fq"] : null;
  if (gp.status === "available") {
    try {
      const dynamic = dynamicLibraryInventory([gp.executable]);
      const gmp = exactLibraryIdentity(dynamic, /^libgmp(?:[-.]|$)/i);
      if (process.platform === "linux" && !gmp) {
        throw new Error("direct GP identity did not resolve its GMP dependency");
      }
      gp.artifacts = [fileArtifact("executable", gp.executable), ...dynamic.artifacts];
      gp.libraries = nullLibraries({
        gmp,
        pari: `${gp.version}; integrated-executable-sha256:${sha256File(gp.executable)}`,
      });
    } catch (error) {
      gp.status = "unavailable";
      gp.reason = error.message;
    }
  }

  const magma = executableTool("magma", options.magma, (executable) => {
    const result = probe(executable, ["-b"], {
      input: 'print "SAGEJS_MAGMA_VERSION|", GetVersion();\nquit;\n',
    });
    const match = /SAGEJS_MAGMA_VERSION\|\s*(\d+)\s+(\d+)\s+(\d+)/.exec(result.stdout);
    return {
      ok: result.ok && Boolean(match),
      version: match ? `Magma ${match[1]}.${match[2]}-${match[3]}` : null,
      probe: { argv: [executable, "-b"], ...result },
      reason: result.error || result.stderr || "Magma version probe emitted no marker",
    };
  });
  magma.argv_prefix = magma.executable ? [magma.executable, "-b"] : null;
  if (magma.status === "available") {
    try {
      const runtime = magmaRuntimeIdentity(magma.executable);
      magma.artifacts = runtime.artifacts;
      magma.libraries = runtime.libraries;
      magma.execution_mode = "authenticated-magma-runtime-default-libraries";
    } catch (error) {
      magma.status = "unavailable";
      magma.reason = error.message;
    }
  }

  const julia = executableTool("julia", options.julia, (executable) => {
    const result = probe(executable, ["--version"]);
    return {
      ok: result.ok && /^julia version /i.test(result.stdout),
      version: result.stdout.split(/\r?\n/)[0] || null,
      probe: { argv: [executable, "--version"], ...result },
      reason: result.error || result.stderr || result.stdout || "Julia version probe failed",
    };
  });
  const heckeProject = resolveProject(options.heckeProject, "Hecke");
  const oscarProject = resolveProject(options.oscarProject, "Oscar");
  const juliaDepot = path.resolve(options.juliaDepot);
  const juliaDepotAvailable = fs.statSync(juliaDepot, { throwIfNoEntry: false })?.isDirectory() || false;
  function juliaFamily(name, project) {
    const available = julia.status === "available" && project.status === "available" &&
      (name !== "hecke" || juliaDepotAvailable);
    const answer = {
      name,
      status: available ? "available" : "unavailable",
      requested_executable: options.julia,
      executable: julia.executable,
      argv_prefix: available
        ? [
            julia.executable,
            "--startup-file=no",
            "--history-file=no",
            "--threads=1",
            "--compiled-modules=yes",
            "--pkgimages=yes",
            `--project=${project.path}`,
          ]
        : null,
      version: available
        ? `${julia.version}; ${project.package} ${project.package_version || "unknown"}`
        : null,
      project,
      julia_depot: juliaDepot,
      julia_depot_available: juliaDepotAvailable,
      reason: available
        ? null
        : julia.reason || project.reason ||
          (name === "hecke" ? `Julia depot is unavailable: ${juliaDepot}` : null),
    };
    if (available) {
      if (name === "hecke") {
        try {
          const runtime = heckeRuntimeIdentity(julia.executable, project, juliaDepot);
          answer.version =
            `${runtime.version}; git ${runtime.source_identity.commit}; ` +
            `tree ${runtime.source_identity.tree}`;
          answer.artifacts = runtime.artifacts;
          answer.libraries = runtime.libraries;
          answer.execution_mode = "authenticated-pinned-hecke";
        } catch (error) {
          answer.status = "unavailable";
          answer.reason = error.message;
        }
      } else {
        answer.artifacts = [fileArtifact("executable", julia.executable)];
        answer.libraries = nullLibraries();
      }
    }
    return answer;
  }
  const answer = {
    sagejs,
    "sagejs-release": sagejsRelease,
    "sage-pari": sage,
    "direct-gp": gp,
    magma,
    hecke: juliaFamily("hecke", heckeProject),
    oscar: juliaFamily("oscar", oscarProject),
  };
  for (const tool of Object.values(answer)) {
    tool.artifacts ||= [];
    tool.libraries ||= nullLibraries();
  }
  return answer;
}

function evidenceTool(name, tool) {
  const available = tool.status === "available";
  const argvPrefix = tool.argv_prefix || [tool.requested_executable || name];
  const projectRecord = tool.project?.path ? tool.project : null;
  const project = projectRecord
    ? `${projectRecord.path}@project-sha256:${projectRecord.project_toml_sha256}` +
      `@manifest-sha256:${projectRecord.manifest_toml_sha256 || "unavailable"}` +
      (tool.julia_depot ? `@depot:${tool.julia_depot}` : "")
    : null;
  const artifacts = [...(tool.artifacts || [])];
  if (available && GNU_TIME) artifacts.push(fileArtifact("measurement-wrapper", GNU_TIME));
  if (available && GNU_TIMEOUT) artifacts.push(fileArtifact("timeout-supervisor", GNU_TIMEOUT));
  return createToolFingerprint(name, {
    status: available ? "ok" : "unavailable",
    executable: available ? tool.executable : null,
    argv_prefix: argvPrefix,
    project,
    version: available ? (tool.version || "version not reported") : null,
    executable_sha256: available ? sha256File(tool.executable) : null,
    execution_mode: available ? (tool.execution_mode || "direct-executable") : null,
    artifacts: available ? artifacts : [],
    libraries: tool.libraries || nullLibraries(),
    reason: available ? null : tool.reason,
  });
}

function evidenceTools(detected) {
  return Object.fromEntries(Object.entries(detected).map(([name, tool]) => [
    name,
    evidenceTool(name, tool),
  ]));
}

function loadFixture(filename, tier, limit) {
  const fixture = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (fixture.schema !== FIXTURE_SCHEMA || !Array.isArray(fixture.records)) {
    throw new Error(`unsupported class/unit corpus fixture: expected ${FIXTURE_SCHEMA}`);
  }
  corpusDownloader.validateCorpus(fixture);
  const labels = new Set();
  for (const record of fixture.records) {
    if (record.degree !== 3 || !Array.isArray(record.coefficients) || record.coefficients.length !== 4) {
      throw new Error(`${record.label || "unlabelled record"}: expected a monic cubic coefficient vector`);
    }
    if (record.coefficients[3] !== "1") {
      throw new Error(`${record.label}: coefficient vector is not monic`);
    }
    if (labels.has(record.label)) throw new Error(`duplicate fixture label ${record.label}`);
    labels.add(record.label);
    if (!ROLES.has(record.selection?.role)) {
      throw new Error(`${record.label}: invalid or missing selection.role`);
    }
  }
  let records = tier === "all"
    ? fixture.records
    : fixture.records.filter((record) => record.selection.role === tier);
  if (records.length === 0) throw new Error(`fixture has no records in tier ${tier}`);
  if (limit !== null) records = records.slice(0, limit);
  return { fixture, records };
}

function boundaryTool(system, boundary, tools) {
  if (system === "sagejs" && boundary === "release-cold") {
    return tools["sagejs-release"];
  }
  return tools[system];
}

function invocationFor(system, boundary, tools) {
  const tool = boundaryTool(system, boundary, tools);
  if (tool?.status !== "available") return null;
  if (system === "sagejs") return [tool.executable, "--python", "<generated-adapter.py>"];
  if (system === "sage-pari") return [tool.executable, "-python", "<generated-adapter.py>"];
  if (system === "direct-gp") return [tool.executable, "-fq", "<generated-adapter.gp>"];
  if (system === "magma") return [tool.executable, "-b", "<generated-adapter.m>"];
  if (system === "hecke") return [...tool.argv_prefix, "-", "<generated-adapter.jl>"];
  return [...tool.argv_prefix, "<not-implemented>"];
}

function createPlan(options, fixture, records, detectedTools, source) {
  const proofs = proofModes(options.proof);
  const tools = evidenceTools(detectedTools);
  const jobs = [];
  for (const system of options.systems) {
    for (const boundary of options.boundaries) {
      const tool = boundaryTool(system, boundary, detectedTools);
      let status = "selected";
      if (tool?.status !== "available") {
        status = "unavailable";
      } else if (!IMPLEMENTED_SYSTEMS.has(system)) {
        status = "unsupported";
      }
      for (const proof of proofs) {
        for (const record of records) {
          jobs.push({
            system,
            tool_id: system === "sagejs" && boundary === "release-cold"
              ? "sagejs-release"
              : system,
            case_id: record.label,
            label: record.label,
            role: record.selection.role,
            requested_proof: proof,
            boundary,
            samples: options.samples,
            status,
            invocation: invocationFor(system, boundary, detectedTools) || [],
          });
        }
      }
    }
  }
  return {
    schema: "sagejs.number-fields/class-unit-corpus-plan-v1",
    schema_version: 1,
    created_at: new Date().toISOString(),
    source,
    host: collectHostFingerprint(),
    fixture: collectFixtureIdentity(options.fixture, {
      root: ROOT,
      recordCount: fixture.records.length,
      schema: fixture.schema,
      selectionQuerySha256: fixture.checksums?.selection_sql_sha256 || null,
      selectedLabelsSha256: fixture.checksums?.labels_sha256 || null,
    }),
    configuration: {
      tier: options.limit === null ? options.tier : `${options.tier}-limit-${options.limit}`,
      requested_proofs: proofs,
      requested_output: "class-invariants-unit-summary-regulator",
      regulator_contract: REGULATOR_CONTRACT,
      boundaries: options.boundaries,
      systems: options.systems,
      samples: options.samples,
      timeout_seconds: options.timeoutSeconds,
    },
    tools,
    tool_inventory: detectedTools,
    plan: {
      case_count: records.length,
      job_count: jobs.length,
      jobs,
    },
  };
}

function pythonAdapterSource(records, proof, boundary, samples, implementation) {
  const fixtureRecords = records.map((record) => ({
    label: record.label,
    coefficients: record.coefficients,
    role: record.selection.role,
  }));
  const importLine = implementation === "sage-pari"
    ? "from sage.all import QQ, PolynomialRing, NumberField"
    : "";
  const compute = implementation === "sage-pari"
    ? `
def compute_answer(field, proof):
    class_group = field.class_group(proof=proof)
    unit_group = field.unit_group(proof=proof)
    regulator = field.regulator(proof=proof)
    return {
        "class_number": str(class_group.order()),
        "class_group_invariant_factors": [str(value) for value in class_group.invariants()],
        "unit_rank": int(unit_group.rank()),
        "torsion_order": str(field.number_of_roots_of_unity()),
        "regulator": {"kind": "decimal", "value": str(regulator)},
        "_achieved_proof_semantics": "exact-unconditional" if proof else "exact-relations-conditional-grh",
    }
`
    : `
def compute_answer(field, proof):
    computation = field.class_unit_group(proof=proof)
    if not computation.complete:
        raise RuntimeError("incomplete class/unit computation: " + str(computation.reason))
    class_group = computation.class_group()
    unit_group = computation.unit_group()
    regulator = computation.regulator()
    return {
        "class_number": str(class_group.order()),
        "class_group_invariant_factors": [str(value) for value in class_group.invariants()],
        "unit_rank": int(unit_group.unit_rank),
        "torsion_order": str(unit_group.torsion.order),
        "regulator": {
            "kind": "interval",
            "lower": str(regulator.lower),
            "upper": str(regulator.upper),
            "precision_bits": regulator.precision_bits,
            "rigorous": regulator.rigorous,
        },
        "_achieved_proof_semantics": computation.proof_status,
    }
`;
  return `${importLine}
import json
import time

records = json.loads(${JSON.stringify(JSON.stringify(fixtureRecords))})
proof = ${proof ? "True" : "False"}
boundary = ${JSON.stringify(boundary)}
samples = ${samples}
${compute}

def fresh_field(record, sample):
    ring = PolynomialRing(QQ, "x")
    x = ring.gen()
    polynomial = ring(0)
    for exponent, coefficient in enumerate(record["coefficients"]):
        polynomial += int(coefficient) * x**exponent
    safe_label = record["label"].replace(".", "_")
    return NumberField(polynomial, "a_" + safe_label + "_" + str(sample))

payload = []
for record in records:
    for sample in range(samples):
        try:
            if sample == 0 and boundary in ("kernel-warm", "field-cold"):
                warm_field = fresh_field(record, "warm")
                warm_field.maximal_order()
                compute_answer(warm_field, proof)
            field_started = time.perf_counter_ns()
            field = fresh_field(record, sample)
            field.maximal_order()
            field_seconds = (time.perf_counter_ns() - field_started) / 1000000000
            if boundary == "kernel-warm":
                started = time.perf_counter_ns()
                answer = compute_answer(field, proof)
                computation_seconds = (time.perf_counter_ns() - started) / 1000000000
                elapsed = computation_seconds
            else:
                computation_started = time.perf_counter_ns()
                answer = compute_answer(field, proof)
                computation_seconds = (time.perf_counter_ns() - computation_started) / 1000000000
                elapsed = field_seconds + computation_seconds
            payload.append({
                "label": record["label"],
                "sample": sample,
                "status": "ok",
                "elapsed_seconds": elapsed,
                "batch_elapsed_seconds": elapsed,
                "iteration_count": 1,
                "phases_seconds": {
                    "initialization": None,
                    "field_construction": field_seconds,
                    "computation": computation_seconds,
                    "verification": None,
                },
                "answer": answer,
            })
        except Exception as error:
            payload.append({
                "label": record["label"],
                "sample": sample,
                "status": "error",
                "elapsed_seconds": None,
                "reason": type(error).__name__ + ": " + str(error),
                "answer": None,
            })
print(${JSON.stringify(PAYLOAD_PREFIX)} + json.dumps(payload, sort_keys=True, separators=(",", ":")))
`;
}

function gpVector(values) {
  return `[${values.map((value) => {
    if (!/^-?\d+$/.test(value)) throw new Error(`nonintegral GP coefficient ${value}`);
    return value;
  }).join(",")}]`;
}

function gpAdapterSource(records, proof, boundary, samples) {
  const statements = ["default(parisizemax, 2147483648);"];
  let jobIndex = 0;
  for (const record of records) {
    if (!/^[0-9.]+$/.test(record.label)) throw new Error(`unsafe GP label ${record.label}`);
    for (let sample = 0; sample < samples; sample += 1) {
      const prefix = `${record.label}|${sample}`;
      const functionName = `sagejs_cu_job_${jobIndex++}`;
      statements.push(`${functionName}() = {
  f = Polrev(${gpVector(record.coefficients)});
  persistent = ${["kernel-warm", "field-cold"].includes(boundary) ? 1 : 0};
  if(persistent,
    warm_nf = nfinit(f);
    warm_bnf = bnfinit(warm_nf, 1);
    ${proof ? "if(!bnfcertify(warm_bnf), error(\"warm bnfcertify returned false\"));" : ""}
  );
  field_ms = 0;
  computation_ms = 0;
  verification_ms = 0;
  answer_no = 0;
  answer_cyc = [];
  answer_unit_rank = 0;
  answer_torsion = 0;
  answer_regulator = 0;
  certified = ${proof ? 1 : 0};
  iterations = 0;
  target_batch_ms = 0;
  if(persistent, target_batch_ms = 1200);
  while(iterations == 0 || (persistent && (${boundary === "kernel-warm"
    ? "computation_ms + verification_ms"
    : "field_ms + computation_ms + verification_ms"}) < target_batch_ms),
    if(iterations >= 100000, error("GP microbatch exceeded its iteration safety limit"));
    iterations += 1;
    i = iterations;
    my(field_started, current_nf, computation_started, current_bnf, verification_started);
    field_started = getwalltime();
    current_nf = nfinit(f);
    if(${boundary === "kernel-warm" ? 0 : 1}, field_ms += getwalltime() - field_started);
    computation_started = getwalltime();
    current_bnf = bnfinit(current_nf, 1);
    computation_ms += getwalltime() - computation_started;
    if(${proof ? 1 : 0},
      verification_started = getwalltime();
      if(!bnfcertify(current_bnf), error("bnfcertify returned false"));
      verification_ms += getwalltime() - verification_started
    );
    if(i == iterations,
      answer_no = current_bnf.no;
      answer_cyc = current_bnf.cyc;
      answer_unit_rank = current_nf.sign[1] + current_nf.sign[2] - 1;
      answer_torsion = current_bnf.tu[1];
      answer_regulator = current_bnf.reg
    )
  );
  batch_ms = ${boundary === "kernel-warm"
    ? "computation_ms + verification_ms"
    : "field_ms + computation_ms + verification_ms"};
  if(persistent && batch_ms < 1000, error("GP microbatch did not reach one second"));
  elapsed = batch_ms / iterations / 1000.;
  batch_seconds = batch_ms / 1000.;
  field_seconds = field_ms / iterations / 1000.;
  computation_seconds = computation_ms / iterations / 1000.;
  verification_seconds = verification_ms / iterations / 1000.;
  if(elapsed <= 0, error("GP wall timer resolution was insufficient"));
  print("${GP_PAYLOAD_PREFIX}${prefix}|", elapsed, "|", batch_seconds, "|", iterations, "|", field_seconds, "|", computation_seconds, "|", verification_seconds, "|", answer_no, "|", answer_cyc, "|", answer_unit_rank, "|", answer_torsion, "|", answer_regulator, "|", certified);
};
iferr(${functionName}(), E, print("${GP_ERROR_PREFIX}${prefix}|", E));`);
    }
  }
  statements.push("quit;");
  return `${statements.join("\n")}\n`;
}

function integralVector(values, system) {
  return `[${values.map((value) => {
    if (!/^-?\d+$/.test(value)) throw new Error(`nonintegral ${system} coefficient ${value}`);
    return value;
  }).join(",")}]`;
}

function magmaAdapterSource(records, proof, boundary, samples) {
  const statements = [
    "SetSeed(1);",
    "SetColumns(1024);",
    "Qx<x> := PolynomialRing(Rationals());",
    `proof_name := ${JSON.stringify(proof ? "Full" : "GRH")};`,
    `persistent := ${["kernel-warm", "field-cold"].includes(boundary) ? "true" : "false"};`,
    `include_field := ${boundary === "kernel-warm" ? "false" : "true"};`,
    `certified := ${proof ? 1 : 0};`,
    `function FreshOrder(coefficients)
  f := &+[ Rationals()!coefficients[i + 1] * x^i : i in [0..#coefficients - 1] ];
  K := NumberField(f);
  O := MaximalOrder(K);
  return K, O;
end function;`,
    `function IntegerSequenceText(values)
  if #values eq 0 then
    return "[]";
  end if;
  return "[" cat Join([ IntegerToString(Integers()!value) : value in values ], ",") cat "]";
end function;`,
    `function RealText(value)
  return Sprintf("%.17o", RealField(30)!value);
end function;`,
  ];
  let jobIndex = 0;
  for (const record of records) {
    if (!/^[0-9.]+$/.test(record.label)) throw new Error(`unsafe Magma label ${record.label}`);
    const coefficients = integralVector(record.coefficients, "Magma");
    for (let sample = 0; sample < samples; sample += 1) {
      const prefix = `${record.label}|${sample}`;
      const procedureName = `SagejsClassUnitJob${jobIndex++}`;
      statements.push(`procedure ${procedureName}()
  try
    coefficients := ${coefficients};
    if persistent then
      warm_K, warm_O := FreshOrder(coefficients);
      warm_C, warm_mC := ClassGroup(warm_O : Proof := proof_name);
      warm_U, warm_mU := UnitGroup(warm_O);
      warm_regulator := Regulator(warm_O);
    end if;
    field_seconds := 0.0;
    computation_seconds := 0.0;
    answer_no := 0;
    answer_cyc := [];
    answer_unit_rank := 0;
    answer_torsion := 0;
    answer_regulator := "";
    iterations := 0;
    target_batch_seconds := persistent select 1.2 else 0.0;
    chunk_size := persistent select 8 else 1;
    repeat
      if iterations ge 100000 then
        error "Magma microbatch exceeded its iteration safety limit";
      end if;
      chunk_fields := [* *];
      chunk_orders := [* *];
      field_started := Realtime();
      for chunk_index in [1..chunk_size] do
        current_K, current_O := FreshOrder(coefficients);
        Append(~chunk_fields, current_K);
        Append(~chunk_orders, current_O);
      end for;
      chunk_field_seconds := Realtime() - field_started;
      if include_field then
        field_seconds +:= chunk_field_seconds;
      end if;
      computation_started := Realtime();
      for chunk_index in [1..chunk_size] do
        current_K := chunk_fields[chunk_index];
        current_O := chunk_orders[chunk_index];
        current_C, current_mC := ClassGroup(current_O : Proof := proof_name);
        current_U, current_mU := UnitGroup(current_O);
        current_T := TorsionSubgroup(current_U);
        answer_no := #current_C;
        answer_cyc := Invariants(current_C);
        answer_unit_rank := UnitRank(current_O);
        answer_torsion := #current_T;
        answer_regulator := Sprintf("%.30o", RealField(40)!Regulator(current_O));
      end for;
      chunk_computation_seconds := Realtime() - computation_started;
      computation_seconds +:= chunk_computation_seconds;
      iterations +:= chunk_size;
      batch_seconds := field_seconds + computation_seconds;
      if persistent and chunk_field_seconds + chunk_computation_seconds lt 0.2 and
          chunk_size lt 256 then
        chunk_size := Minimum(2 * chunk_size, 256);
      end if;
    until not persistent or batch_seconds ge target_batch_seconds;
    if persistent and batch_seconds lt 1.0 then
      error "Magma microbatch did not reach one second";
    end if;
    elapsed := batch_seconds / iterations;
    if persistent and elapsed le 0 then
      error "Magma wall timer resolution was insufficient";
    end if;
    line := ${JSON.stringify(MAGMA_PAYLOAD_PREFIX + prefix + "|")} cat
      RealText(elapsed) cat "|" cat RealText(batch_seconds) cat "|" cat
      IntegerToString(iterations) cat "|" cat RealText(field_seconds / iterations) cat "|" cat
      RealText(computation_seconds / iterations) cat "||" cat
      IntegerToString(Integers()!answer_no) cat "|" cat IntegerSequenceText(answer_cyc) cat "|" cat
      IntegerToString(answer_unit_rank) cat "|" cat IntegerToString(Integers()!answer_torsion) cat "|" cat
      answer_regulator cat "|" cat IntegerToString(certified);
    print line;
  catch error_value
    reason := SubstituteString(SubstituteString(Sprint(error_value), "|", "/"), "\n", " ");
    print ${JSON.stringify(MAGMA_ERROR_PREFIX + prefix + "|")} cat reason;
  end try;
end procedure;
${procedureName}();`);
    }
  }
  statements.push(`print ${JSON.stringify(MAGMA_DONE_PREFIX + records.length * samples)};`);
  statements.push("quit;");
  return `${statements.join("\n")}\n`;
}

function heckeAdapterSource(records, proof, boundary, samples, sampleBase = 0) {
  const recordsLiteral = records.map((record) => {
    if (!/^[0-9.]+$/.test(record.label)) throw new Error(`unsafe Hecke label ${record.label}`);
    const coefficients = integralVector(record.coefficients, "Hecke");
    return `(${JSON.stringify(record.label)}, BigInt${coefficients})`;
  }).join(",\n    ");
  return `using Hecke
using Printf
using Random
import Nemo

const SAGEJS_RECORDS = [
    ${recordsLiteral}
]
const SAGEJS_PROOF_GRH = ${proof ? "false" : "true"}
const SAGEJS_PERSISTENT = ${["kernel-warm", "field-cold"].includes(boundary) ? "true" : "false"}
const SAGEJS_INCLUDE_FIELD = ${boundary === "kernel-warm" ? "false" : "true"}
const SAGEJS_CERTIFIED = ${proof ? 1 : 0}
const SAGEJS_SAMPLES = ${samples}
const SAGEJS_TARGET_BATCH_SECONDS = SAGEJS_PERSISTENT ? 1.2 : 0.0
const SAGEJS_QQX, SAGEJS_X = polynomial_ring(QQ, "x"; cached=false)

function sagejs_fresh_order(coefficients, name)
    polynomial = SAGEJS_QQX(0)
    for (exponent, coefficient) in enumerate(coefficients)
        polynomial += ZZ(coefficient) * SAGEJS_X^(exponent - 1)
    end
    field, generator = number_field(polynomial, name; cached=false)
    return field, maximal_order(field)
end

function sagejs_rational_text(value::Rational{BigInt})
    return string(numerator(value)) * "/" * string(denominator(value))
end

function sagejs_materialize(order, class_group_value, unit_group_value, regulator_value)
    class_invariants = elementary_divisors(class_group_value)
    unit_invariants = elementary_divisors(unit_group_value)
    rank = Hecke.unit_group_rank(order)
    length(unit_invariants) == rank + 1 || error("unexpected Hecke unit invariant shape")
    all(iszero, unit_invariants[2:end]) || error("unexpected nonfree Hecke unit invariant")
    lower = setprecision(BigFloat, 256) do
        BigFloat(regulator_value, RoundDown)
    end
    upper = setprecision(BigFloat, 256) do
        BigFloat(regulator_value, RoundUp)
    end
    lower_rational = Rational{BigInt}(lower)
    upper_rational = Rational{BigInt}(upper)
    interval = "interval:" * sagejs_rational_text(lower_rational) * ":" *
        sagejs_rational_text(upper_rational) * ":" * string(precision(parent(regulator_value)))
    return (
        string(Hecke.order(class_group_value)),
        "[" * join(string.(class_invariants), ",") * "]",
        rank,
        string(Hecke.order(unit_group_value[1])),
        interval,
    )
end

function sagejs_compute(field, order)
    computation_started = time_ns()
    class_group_value, class_map = class_group(order; GRH=true)
    unit_group_value, unit_map = unit_group_fac_elem(order; GRH=true)
    regulator_value = regulator(order; GRH=true)
    if SAGEJS_PROOF_GRH
        answer = sagejs_materialize(
            order, class_group_value, unit_group_value, regulator_value,
        )
        computation_seconds = (time_ns() - computation_started) / 1.0e9
        return answer, computation_seconds, nothing
    end
    computation_seconds = (time_ns() - computation_started) / 1.0e9
    verification_started = time_ns()
    class_group_value, class_map = class_group(order; GRH=false)
    unit_group_value, unit_map = unit_group_fac_elem(order; GRH=false)
    regulator_value = regulator(order; GRH=false)
    rank = Hecke.unit_group_rank(order)
    reduced_order = lll(maximal_order(field))
    class_context = get_attribute(reduced_order, :ClassGrpCtx)
    unit_context = get_attribute(reduced_order, :UnitGrpCtx)
    (class_context === nothing || class_context.GRH) &&
        error("Hecke class proof-state audit failed")
    (rank > 0 && (unit_context === nothing || unit_context.GRH)) &&
        error("Hecke unit proof-state audit failed")
    answer = sagejs_materialize(
        order, class_group_value, unit_group_value, regulator_value,
    )
    verification_seconds = (time_ns() - verification_started) / 1.0e9
    return answer, computation_seconds, verification_seconds
end

for (job_index, (label, coefficients)) in enumerate(SAGEJS_RECORDS)
    for sample in 0:(SAGEJS_SAMPLES - 1)
        try
            Random.seed!(${proof ? 700000001 : 300000001} +
                1000003 * job_index + 10007 * (sample + ${sampleBase}))
            if SAGEJS_PERSISTENT
                # Warm multiple independent fields through the exact requested
                # proof and interval-publication path. The first few Hecke
                # invocations can trigger method-specialization work even
                # after package images have loaded.
                for warm_index in 1:8
                    warm_field, warm_order = sagejs_fresh_order(
                        coefficients,
                        "sagejs_warm_$(job_index)_$(sample)_$(warm_index)",
                    )
                    sagejs_compute(warm_field, warm_order)
                end
            end
            field_seconds = 0.0
            computation_seconds = 0.0
            verification_seconds = 0.0
            answer = nothing
            iterations = 0
            batch_seconds = 0.0
            while iterations == 0 || (SAGEJS_PERSISTENT && batch_seconds < SAGEJS_TARGET_BATCH_SECONDS)
                iterations >= 100000 && error("Hecke microbatch exceeded its iteration safety limit")
                iterations += 1
                field_started = time_ns()
                field, order = sagejs_fresh_order(
                    coefficients,
                    "sagejs_$(job_index)_$(sample)_$(iterations)",
                )
                current_field_seconds = (time_ns() - field_started) / 1.0e9
                if SAGEJS_INCLUDE_FIELD
                    field_seconds += current_field_seconds
                end
                answer, current_computation_seconds, current_verification_seconds =
                    sagejs_compute(field, order)
                computation_seconds += current_computation_seconds
                verification_seconds += something(current_verification_seconds, 0.0)
                batch_seconds = field_seconds + computation_seconds + verification_seconds
            end
            SAGEJS_PERSISTENT && batch_seconds < 1.0 &&
                error("Hecke microbatch did not reach one second")
            elapsed = batch_seconds / iterations
            elapsed > 0 || error("Hecke wall timer resolution was insufficient")
            fields = [
                label,
                string(sample),
                @sprintf("%.17g", elapsed),
                @sprintf("%.17g", batch_seconds),
                string(iterations),
                @sprintf("%.17g", field_seconds / iterations),
                @sprintf("%.17g", computation_seconds / iterations),
                SAGEJS_PROOF_GRH ? "" : @sprintf("%.17g", verification_seconds / iterations),
                answer[1], answer[2], string(answer[3]), answer[4], answer[5],
                string(SAGEJS_CERTIFIED),
            ]
            println(${JSON.stringify(HECKE_PAYLOAD_PREFIX)}, join(fields, "|"))
        catch error_value
            reason = bytes2hex(codeunits(sprint(showerror, error_value)))
            println(${JSON.stringify(HECKE_ERROR_PREFIX)}, label, "|", sample, "|hex:", reason)
        end
    end
end
println(${JSON.stringify(HECKE_DONE_PREFIX + records.length * samples)})
`;
}

function spawn(executable, args, source, timeoutSeconds, env = {}) {
  if (!GNU_TIME || !GNU_TIMEOUT) {
    throw new Error(
      "performance evidence requires GNU /usr/bin/time and /usr/bin/timeout",
    );
  }
  const rssMarker = "SAGEJS_CLASS_UNIT_MAX_RSS_KIB|";
  const elapsedMarker = "SAGEJS_CLASS_UNIT_ELAPSED_SECONDS|";
  const supervisorStarted = process.hrtime.bigint();
  // GNU timeout, without --foreground, owns a separate foreground process group
  // for the measured command. TERM followed by KILL therefore reaches the time
  // wrapper and every benchmark descendant instead of orphaning the real CAS.
  const run = childProcess.spawnSync(GNU_TIMEOUT, [
    "--signal=TERM",
    "--kill-after=2s",
    `${timeoutSeconds}s`,
    GNU_TIME,
    "-f",
    `${rssMarker}%M\n${elapsedMarker}%e`,
    executable,
    ...args,
  ], {
    cwd: ROOT,
    encoding: "utf8",
    input: source,
    env: { ...process.env, ...env },
    // This is a last-resort guard around the process-group supervisor itself.
    timeout: (timeoutSeconds + 5) * 1000,
    killSignal: "SIGKILL",
    maxBuffer: 64 * 1024 * 1024,
  });
  const rssMatches = [...(run.stderr || "").matchAll(
    new RegExp(`${rssMarker.replaceAll("|", "\\|")}(\\d+)`, "g"),
  )];
  const elapsedMatches = [...(run.stderr || "").matchAll(
    new RegExp(`${elapsedMarker.replaceAll("|", "\\|")}([0-9]+(?:\\.[0-9]+)?)`, "g"),
  )];
  const peakRssKib = rssMatches.length === 1 ? Number(rssMatches[0][1]) : null;
  const measuredElapsed = elapsedMatches.length === 1 ? Number(elapsedMatches[0][1]) : null;
  const supervisorElapsed = Number(process.hrtime.bigint() - supervisorStarted) / 1e9;
  return {
    run,
    // GNU time starts immediately before exec'ing the benchmark, so this
    // excludes the process-group supervisor's own startup cost from cold
    // boundaries. The outer clock is retained only for failed/timed-out runs.
    process_total_seconds:
      Number.isFinite(measuredElapsed) && measuredElapsed > 0
        ? measuredElapsed
        : supervisorElapsed,
    process_peak_rss_bytes: Number.isSafeInteger(peakRssKib) && peakRssKib > 0
      ? peakRssKib * 1024
      : null,
  };
}

function rationalText(parts) {
  return parts[1] === 1n ? String(parts[0]) : `${parts[0]}/${parts[1]}`;
}

function decimalRegulator(value) {
  const text = String(value);
  const metadata = decimalMetadata(text);
  return {
    kind: "decimal",
    value: text,
    precision_digits: metadata.precisionDigits,
    absolute_error_bound: rationalText(metadata.radius),
    rigorous: false,
  };
}

function decoratePayload(payload) {
  return payload.map((sample) => {
    if (sample.answer?.regulator?.kind !== "decimal") return sample;
    return {
      ...sample,
      answer: { ...sample.answer, regulator: decimalRegulator(sample.answer.regulator.value) },
    };
  });
}

function failedExecution(run, system) {
  const error = new Error(
    `${system} failed: ${run.error?.message || `exit ${run.status}`}\n${run.stderr || ""}`,
  );
  if (run.status === 124 || run.error?.code === "ETIMEDOUT") {
    error.terminalStatus = "timeout";
  }
  return error;
}

function parsePythonPayload(run, system) {
  if (run.error || run.status !== 0) {
    throw failedExecution(run, system);
  }
  const line = (run.stdout || "").split(/\r?\n/).findLast((item) =>
    item.startsWith(PAYLOAD_PREFIX)
  );
  if (!line) throw new Error(`${system} emitted no corpus payload`);
  return decoratePayload(JSON.parse(line.slice(PAYLOAD_PREFIX.length)));
}

function adapterRegulator(value, system) {
  const text = value.trim();
  if (!text.startsWith("interval:")) {
    const regulator = decimalRegulator(text);
    if (compareRationals(decimalMetadata(text).value, [0n, 1n]) <= 0) {
      throw new Error(`${system} emitted a nonpositive regulator`);
    }
    return regulator;
  }
  const parts = text.split(":");
  if (parts.length !== 4 || !/^\d+$/.test(parts[3])) {
    throw new Error(`${system} emitted an invalid regulator interval`);
  }
  const lower = rationalParts(parts[1]);
  const upper = rationalParts(parts[2]);
  if (compareRationals(lower, [0n, 1n]) <= 0 || compareRationals(lower, upper) > 0) {
    throw new Error(`${system} emitted unordered or nonpositive regulator bounds`);
  }
  const precisionBits = Number(parts[3]);
  if (!Number.isSafeInteger(precisionBits) || precisionBits < 1) {
    throw new Error(`${system} emitted an invalid regulator precision`);
  }
  return {
    kind: "interval",
    lower: parts[1],
    upper: parts[2],
    precision_bits: precisionBits,
    rigorous: true,
  };
}

function parseNonnegativeNumberToken(value, system, label) {
  const normalized = value.replace(/\s+/g, "");
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) {
    throw new Error(`${system} emitted invalid ${label} ${value}`);
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${system} emitted invalid ${label} ${value}`);
  }
  return parsed;
}

function parseNonnegativeIntegerToken(value, system, label, { positive = false } = {}) {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)$/.test(normalized)) {
    throw new Error(`${system} emitted invalid ${label} ${value}`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || (positive ? parsed < 1 : parsed < 0)) {
    throw new Error(`${system} emitted invalid ${label} ${value}`);
  }
  return parsed;
}

function validatePositiveIntegerText(value, system, label) {
  const normalized = value.trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new Error(`${system} emitted invalid ${label} ${value}`);
  }
  return normalized;
}

function parseDelimitedPayload(run, {
  system,
  payloadPrefix,
  errorPrefix,
  donePrefix = null,
}) {
  if (run.error || run.status !== 0) {
    throw failedExecution(run, system);
  }
  const payload = [];
  const lines = (run.stdout || "").split(/\r?\n/);
  if (donePrefix) {
    const sentinels = lines.filter((line) => line.startsWith(donePrefix));
    if (sentinels.length !== 1 ||
        !/^[1-9]\d*$/.test(sentinels[0].slice(donePrefix.length))) {
      throw new Error(`${system} omitted its unique authenticated completion sentinel`);
    }
    const expectedCount = Number(sentinels[0].slice(donePrefix.length));
    const observedCount = lines.filter((line) =>
      line.startsWith(payloadPrefix) || line.startsWith(errorPrefix)
    ).length;
    if (observedCount !== expectedCount) {
      throw new Error(
        `${system} completion sentinel expected ${expectedCount} samples, got ${observedCount}`,
      );
    }
  }
  for (const line of lines) {
    if (line.startsWith(errorPrefix)) {
      const [label, sample, ...reason] = line.slice(errorPrefix.length).split("|");
      if (!/^[0-9]+(?:\.[0-9]+)+$/.test(label || "")) {
        throw new Error(`${system} emitted an invalid error label`);
      }
      const sampleIndex = parseNonnegativeIntegerToken(sample, system, "sample index");
      const rawReason = reason.join("|");
      let decodedReason = rawReason;
      if (rawReason.startsWith("hex:")) {
        const encoded = rawReason.slice(4);
        if (!/^(?:[0-9a-f]{2})*$/i.test(encoded)) {
          throw new Error(`${system} emitted an invalid hex-encoded error`);
        }
        decodedReason = Buffer.from(encoded, "hex").toString("utf8");
      }
      payload.push({
        label,
        sample: sampleIndex,
        status: "error",
        elapsed_seconds: null,
        reason: decodedReason,
        answer: null,
      });
      continue;
    }
    if (!line.startsWith(payloadPrefix)) continue;
    const fields = line.slice(payloadPrefix.length).split("|");
    if (fields.length !== 14) {
      throw new Error(`${system} emitted a malformed ${fields.length}-field payload`);
    }
    const [
      label,
      sample,
      elapsed,
      batchElapsed,
      iterations,
      fieldSeconds,
      computationSeconds,
      verificationSeconds,
      classNumber,
      invariants,
      unitRank,
      torsion,
      regulator,
      certified,
    ] = fields;
    if (!/^[0-9]+(?:\.[0-9]+)+$/.test(label)) {
      throw new Error(`${system} emitted an invalid label ${label}`);
    }
    const sampleIndex = parseNonnegativeIntegerToken(sample, system, "sample index");
    const elapsedNumber = parseNonnegativeNumberToken(elapsed, system, "elapsed time");
    const batchElapsedNumber = parseNonnegativeNumberToken(
      batchElapsed,
      system,
      "batch elapsed time",
    );
    const iterationCount = parseNonnegativeIntegerToken(
      iterations,
      system,
      "iteration count",
      { positive: true },
    );
    const fieldNumber = parseNonnegativeNumberToken(
      fieldSeconds,
      system,
      "field-construction time",
    );
    const computationNumber = parseNonnegativeNumberToken(
      computationSeconds,
      system,
      "computation time",
    );
    if (!/^[01]$/.test(certified.trim())) {
      throw new Error(`${system} emitted invalid proof certificate token ${certified}`);
    }
    const compactInvariants = invariants.replace(/\s+/g, "");
    if (!/^\[(?:\d+(?:,\d+)*)?\]$/.test(compactInvariants)) {
      throw new Error(`${system} emitted invalid class invariants ${invariants}`);
    }
    const parsedInvariants = compactInvariants === "[]"
      ? []
      : compactInvariants.slice(1, -1).split(",");
    for (const invariant of parsedInvariants) {
      validatePositiveIntegerText(invariant, system, "class invariant");
    }
    const verification = verificationSeconds.trim() === ""
      ? null
      : parseNonnegativeNumberToken(verificationSeconds, system, "verification time");
    const classNumberText = validatePositiveIntegerText(classNumber, system, "class number");
    const unitRankNumber = parseNonnegativeIntegerToken(unitRank, system, "unit rank");
    const torsionText = validatePositiveIntegerText(torsion, system, "torsion order");
    payload.push({
      label,
      sample: sampleIndex,
      status: "ok",
      elapsed_seconds: elapsedNumber,
      batch_elapsed_seconds: batchElapsedNumber,
      iteration_count: iterationCount,
      phases_seconds: {
        initialization: null,
        field_construction: fieldNumber,
        computation: computationNumber,
        verification,
      },
      answer: {
        class_number: classNumberText,
        class_group_invariant_factors: parsedInvariants,
        unit_rank: unitRankNumber,
        torsion_order: torsionText,
        regulator: adapterRegulator(regulator, system),
        _achieved_proof_semantics: certified.trim() === "1"
          ? "exact-unconditional"
          : "exact-relations-conditional-grh",
      },
    });
  }
  if (payload.length === 0) throw new Error(`${system} emitted no corpus payload`);
  return payload;
}

function parseGpPayload(run) {
  return parseDelimitedPayload(run, {
    system: "direct-gp",
    payloadPrefix: GP_PAYLOAD_PREFIX,
    errorPrefix: GP_ERROR_PREFIX,
  });
}

function parseMagmaPayload(run) {
  return parseDelimitedPayload(run, {
    system: "magma",
    payloadPrefix: MAGMA_PAYLOAD_PREFIX,
    errorPrefix: MAGMA_ERROR_PREFIX,
    donePrefix: MAGMA_DONE_PREFIX,
  });
}

function parseHeckePayload(run) {
  return parseDelimitedPayload(run, {
    system: "hecke",
    payloadPrefix: HECKE_PAYLOAD_PREFIX,
    errorPrefix: HECKE_ERROR_PREFIX,
    donePrefix: HECKE_DONE_PREFIX,
  });
}

function rationalParts(text) {
  const match = /^(-?(?:0|[1-9][0-9]*))(?:\/([1-9][0-9]*))?$/.exec(String(text));
  if (!match) throw new Error(`invalid rational ${text}`);
  return [BigInt(match[1]), BigInt(match[2] || "1")];
}

function compareRationals(left, right) {
  const difference = left[0] * right[1] - right[0] * left[1];
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function addRationals(left, right) {
  return [left[0] * right[1] + right[0] * left[1], left[1] * right[1]];
}

function negateRational(value) {
  return [-value[0], value[1]];
}

function decimalCell(text) {
  const metadata = decimalMetadata(String(text));
  return {
    lower: addRationals(metadata.value, negateRational(metadata.radius)),
    upper: addRationals(metadata.value, metadata.radius),
  };
}

function cellsOverlap(left, right) {
  return compareRationals(left.lower, right.upper) <= 0 &&
    compareRationals(right.lower, left.upper) <= 0;
}

function regulatorCell(regulator) {
  if (regulator?.kind === "interval") {
    return {
      lower: rationalParts(regulator.lower),
      upper: rationalParts(regulator.upper),
    };
  }
  if (regulator?.kind === "decimal") return decimalCell(regulator.value);
  throw new Error("unsupported regulator observation");
}

function discreteAnswersEqual(left, right) {
  for (const key of [
    "class_number",
    "class_group_invariant_factors",
    "unit_rank",
    "torsion_order",
  ]) {
    if (JSON.stringify(left?.[key]) !== JSON.stringify(right?.[key])) return false;
  }
  return true;
}

function commonRegulatorCell(answers) {
  const cells = answers.map((answer) => regulatorCell(answer.regulator));
  let lower = cells[0].lower;
  let upper = cells[0].upper;
  for (const cell of cells.slice(1)) {
    if (compareRationals(cell.lower, lower) > 0) lower = cell.lower;
    if (compareRationals(cell.upper, upper) < 0) upper = cell.upper;
  }
  return compareRationals(lower, upper) <= 0 ? { lower, upper } : null;
}

function correctnessMismatches(answer, expected, regulatorContract = REGULATOR_CONTRACT) {
  if (!answer) return ["missing-answer"];
  const mismatches = [];
  if (answer.class_number !== expected.class_number) mismatches.push("class_number");
  if (
    JSON.stringify(answer.class_group_invariant_factors) !==
    JSON.stringify(expected.class_group)
  ) {
    mismatches.push("class_group_invariant_factors");
  }
  if (answer.unit_rank !== expected.unit_rank) mismatches.push("unit_rank");
  if (answer.torsion_order !== String(expected.torsion_order)) mismatches.push("torsion_order");
  let expectedCell;
  try {
    expectedCell = decimalCell(expected.regulator);
  } catch {
    mismatches.push("fixture_regulator");
  }
  if (expectedCell && answer.regulator?.kind === "interval") {
    let interval;
    try {
      interval = {
        lower: rationalParts(answer.regulator.lower),
        upper: rationalParts(answer.regulator.upper),
      };
    } catch {
      interval = null;
    }
    if (!interval || !cellsOverlap(interval, expectedCell) ||
        !regulatorSatisfiesContract(answer.regulator, regulatorContract)) {
      mismatches.push("regulator_interval");
    }
  } else if (expectedCell) {
    let observedCell;
    try {
      observedCell = decimalCell(answer.regulator?.value);
    } catch {
      observedCell = null;
    }
    if (!observedCell || !cellsOverlap(observedCell, expectedCell) ||
        !regulatorSatisfiesContract(answer.regulator, regulatorContract)) {
      mismatches.push("regulator_decimal");
    }
  }
  return mismatches;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function terminalReason(job, tools) {
  if (job.status === "unsupported") {
    return `${job.system} corpus execution adapter is not implemented`;
  }
  return tools[job.tool_id]?.reason || `${job.tool_id} is unavailable`;
}

function terminalResult(job, reason = null) {
  return {
    system: job.system,
    tool_id: job.tool_id,
    case_id: job.case_id,
    label: job.label,
    role: job.role,
    requested_proof: job.requested_proof,
    achieved_proof_semantics: null,
    semantic_parity: null,
    boundary: job.boundary,
    status: job.status,
    reason: reason || `${job.status} job`,
    process_total_seconds: null,
    samples: [],
    summary: null,
    answer: null,
    correctness: null,
  };
}

function aggregateJob(
  job,
  samples,
  expected,
  processTotalSeconds = null,
  processPeakRssBytes = null,
  rssScope = "case-process-peak",
) {
  const identityErrors = [];
  const indices = new Set();
  for (const sample of samples) {
    if (sample.label !== job.label) identityErrors.push(`foreign label ${sample.label}`);
    if (!Number.isInteger(sample.sample) || sample.sample < 0 || sample.sample >= job.samples) {
      identityErrors.push(`invalid sample index ${sample.sample}`);
    } else if (indices.has(sample.sample)) {
      identityErrors.push(`duplicate sample index ${sample.sample}`);
    } else {
      indices.add(sample.sample);
    }
  }
  if (samples.length !== job.samples || indices.size !== job.samples) {
    identityErrors.push(`expected exact sample indices 0..${job.samples - 1}`);
  }
  if (identityErrors.length > 0) {
    return {
      ...terminalResult(job, `sample identity mismatch: ${identityErrors.join("; ")}`),
      status: "error",
    };
  }
  samples = [...samples].sort((left, right) => left.sample - right.sample);
  const failures = samples.filter((sample) => sample.status !== "ok");
  const successful = samples.filter((sample) => sample.status === "ok");
  if (failures.length > 0 || successful.length !== job.samples) {
    const reason = failures.map((sample) => sample.reason).filter(Boolean).join("; ") ||
      `expected ${job.samples} samples, received ${successful.length}`;
    return {
      ...terminalResult(job, reason),
      status: "error",
    };
  }
  const analyzed = successful.map((sample) => {
    const internalAnswer = sample.answer;
    const answer = internalAnswer
      ? Object.fromEntries(Object.entries(internalAnswer).filter(([key]) => !key.startsWith("_")))
      : null;
    const achieved = internalAnswer?._achieved_proof_semantics || null;
    const mismatches = correctnessMismatches(answer, expected, REGULATOR_CONTRACT);
    const proofSatisfied = achieved === "exact-unconditional" ||
      (achieved === "exact-relations-conditional-grh" &&
        job.requested_proof === "conditional-grh");
    if (!proofSatisfied) mismatches.push("achieved_proof_semantics");
    return { achieved, answer, mismatches };
  });
  const achieved = analyzed[0].achieved;
  let answer = analyzed[0].answer;
  const mismatches = analyzed.flatMap((item, index) =>
    item.mismatches.map((mismatch) => `sample-${index}:${mismatch}`)
  );
  for (const [index, item] of analyzed.entries()) {
    if (item.achieved !== achieved) mismatches.push(`sample-${index}:proof-disagreement`);
    if (!discreteAnswersEqual(item.answer, answer)) {
      mismatches.push(`sample-${index}:answer-disagreement`);
    }
  }
  let regulatorConsensus = null;
  try {
    regulatorConsensus = commonRegulatorCell(analyzed.map((item) => item.answer));
  } catch {
    // The individual correctness checks above report malformed observations.
  }
  if (!regulatorConsensus) mismatches.push("regulator-observations-have-empty-intersection");
  if (mismatches.length > 0) {
    return {
      ...terminalResult(job, `correctness mismatch: ${mismatches.join(",")}`),
      status: "error",
    };
  }
  if (analyzed.every((item) =>
    item.answer.regulator.kind === "interval" && item.answer.regulator.rigorous === true
  )) {
    answer = {
      ...answer,
      regulator: {
        kind: "interval",
        lower: rationalText(regulatorConsensus.lower),
        upper: rationalText(regulatorConsensus.upper),
        precision_bits: Math.min(...analyzed.map(
          (item) => item.answer.regulator.precision_bits,
        )),
        rigorous: true,
      },
    };
  }
  const answerFingerprint = fingerprint(answer);
  const sampleAnswersFingerprint = fingerprint(analyzed.map((item) => item.answer));
  const elapsed = successful.map((sample) => sample.elapsed_seconds);
  return {
    system: job.system,
    tool_id: job.tool_id,
    case_id: job.case_id,
    label: job.label,
    role: job.role,
    requested_proof: job.requested_proof,
    achieved_proof_semantics: achieved,
    semantic_parity: {
      request_satisfied: true,
      comparison_key: semanticComparisonKey({
        achievedProofSemantics: achieved,
        requestedOutput: "class-invariants-unit-summary-regulator",
        regulatorContract: REGULATOR_CONTRACT,
      }),
    },
    boundary: job.boundary,
    status: "ok",
    reason: null,
    process_total_seconds: processTotalSeconds,
    samples: samples.map((sample, index) => ({
      sample_index: sample.sample,
      // v3 stores one semantically representative answer. Every retained
      // sample was checked above for exact discrete agreement and overlapping
      // regulator evidence before it is bound to that aggregate digest.
      answer_sha256: answerFingerprint,
      achieved_proof_semantics: analyzed[index].achieved,
      elapsed_seconds: sample.elapsed_seconds,
      batch_elapsed_seconds: sample.batch_elapsed_seconds || sample.elapsed_seconds,
      iteration_count: sample.iteration_count || 1,
      process_peak_rss_bytes:
        sample.process_peak_rss_bytes || processPeakRssBytes,
      rss_scope: sample.rss_scope || rssScope,
      phases_seconds: sample.phases_seconds || {
        initialization: null,
        field_construction: null,
        computation: null,
        verification: null,
      },
    })),
    summary: elapsed.length === 0
      ? null
      : {
          minimum_seconds: Math.min(...elapsed),
          median_seconds: median(elapsed),
          maximum_seconds: Math.max(...elapsed),
        },
    answer,
    correctness: {
      oracle: "LMFDB nf_fields stratified cubic snapshot",
      matched: true,
      digests: {
        answer_sha256: fingerprint(answer),
        sample_answers_sha256: sampleAnswersFingerprint,
        expected_projection_sha256: fingerprint({
          class_number: expected.class_number,
          class_group_invariant_factors: expected.class_group,
          unit_rank: expected.unit_rank,
          torsion_order: String(expected.torsion_order),
          regulator: expected.regulator,
        }),
      },
    },
  };
}

function adapterSource(system, records, proof, boundary, samples, sampleBase = 0) {
  if (system === "direct-gp") return gpAdapterSource(records, proof, boundary, samples);
  if (system === "magma") return magmaAdapterSource(records, proof, boundary, samples);
  if (system === "hecke") {
    return heckeAdapterSource(records, proof, boundary, samples, sampleBase);
  }
  return pythonAdapterSource(records, proof, boundary, samples, system);
}

function adapterExecution(system, tool) {
  if (system === "sagejs") {
    return { args: ["--python", "-"], env: { SAGEJS_USE_SOURCE: "1" } };
  }
  if (system === "sage-pari") return { args: ["-python", "-"], env: {} };
  if (system === "direct-gp") return { args: ["-fq"], env: {} };
  if (system === "magma") {
    // An inherited nonempty value makes Magma's launcher bypass its pinned
    // default library list. Clear it so the authenticated launcher selects
    // the package-relative defaults recorded by its own hashed source.
    return { args: ["-b"], env: { MAGMA_LIBRARIES: "" } };
  }
  if (system === "hecke") {
    return {
      args: [...tool.argv_prefix.slice(1), "-"],
      env: {
        JULIA_DEPOT_PATH: tool.julia_depot,
        JULIA_LOAD_PATH: "@:@stdlib",
        JULIA_PKG_OFFLINE: "true",
      },
    };
  }
  throw new Error(`${system} has no corpus execution adapter`);
}

function parseAdapterPayload(system, run) {
  if (system === "direct-gp") return parseGpPayload(run);
  if (system === "magma") return parseMagmaPayload(run);
  if (system === "hecke") return parseHeckePayload(run);
  return parsePythonPayload(run, system);
}

function runPersistentGroup(system, proof, boundary, jobs, recordsByLabel, tool, timeoutSeconds) {
  const records = jobs.map((job) => recordsByLabel.get(job.label));
  const uniqueRecords = [...new Map(records.map((record) => [record.label, record])).values()];
  const source = adapterSource(system, uniqueRecords, proof, boundary, jobs[0].samples);
  const execution = adapterExecution(system, tool);
  const executed = spawn(
    tool.executable,
    execution.args,
    source,
    timeoutSeconds,
    execution.env,
  );
  const payload = parseAdapterPayload(system, executed.run);
  return jobs.map((job) => aggregateJob(
    job,
    payload.filter((sample) => sample.label === job.label),
    recordsByLabel.get(job.label),
    executed.process_total_seconds,
    executed.process_peak_rss_bytes,
    "case-process-peak",
  ));
}

function runFreshJob(job, expected, tool, timeoutSeconds) {
  const samples = [];
  let processTotalSeconds = 0;
  for (let sample = 0; sample < job.samples; sample += 1) {
    const source = adapterSource(
      job.system,
      [expected],
      job.requested_proof === "unconditional",
      job.boundary,
      1,
      sample,
    );
    const execution = adapterExecution(job.system, tool);
    const executed = spawn(
      tool.executable,
      execution.args,
      source,
      timeoutSeconds,
      execution.env,
    );
    processTotalSeconds += executed.process_total_seconds;
    let payload;
    try {
      payload = parseAdapterPayload(job.system, executed.run);
      if (payload.length !== 1 || payload[0].label !== job.label || payload[0].sample !== 0) {
        throw new Error(
          `fresh process must return exactly sample 0 for ${job.label}; got ` +
            payload.map((item) => `${item.label}:${item.sample}`).join(","),
        );
      }
      const item = payload[0];
      const initializationSeconds = Math.max(
        0,
        executed.process_total_seconds - (item.elapsed_seconds || 0),
      );
      samples.push({
        ...item,
        sample,
        elapsed_seconds: executed.process_total_seconds,
        batch_elapsed_seconds: executed.process_total_seconds,
        iteration_count: 1,
        process_peak_rss_bytes: executed.process_peak_rss_bytes,
        rss_scope: "single-operation-process-peak",
        phases_seconds: {
          initialization: initializationSeconds,
          field_construction: item.phases_seconds?.field_construction ?? null,
          computation: item.phases_seconds?.computation ?? null,
          verification: item.phases_seconds?.verification ?? null,
        },
      });
    } catch (error) {
      if (error.terminalStatus === "timeout") {
        return {
          ...terminalResult(job, error.message),
          status: "timeout",
          process_total_seconds: processTotalSeconds,
        };
      }
      samples.push({
        sample,
        status: "error",
        elapsed_seconds: null,
        reason: error.message,
        answer: null,
      });
    }
  }
  return aggregateJob(
    job,
    samples,
    expected,
    processTotalSeconds,
    null,
    "single-operation-process-peak",
  );
}

function runPlan(plan, records, options) {
  if (plan.source.clean !== true) {
    throw new Error(
      "refusing to emit class/unit performance evidence from a dirty source tree",
    );
  }
  const recordsByLabel = new Map(records.map((record) => [record.label, record]));
  const results = plan.plan.jobs.filter((job) => job.status !== "selected").map((job) =>
    terminalResult(job, terminalReason(job, plan.tools))
  );
  const ready = plan.plan.jobs.filter((job) => job.status === "selected");
  const persistent = ready.filter((job) =>
    job.boundary === "kernel-warm" || job.boundary === "field-cold"
  );
  const fresh = ready.filter((job) =>
    job.boundary === "process-cold" || job.boundary === "release-cold"
  );
  const grouped = new Map();
  for (const job of persistent) {
    const key = `${job.system}|${job.requested_proof}|${job.boundary}|${job.label}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(job);
  }
  for (const jobs of grouped.values()) {
    const first = jobs[0];
    const tool = boundaryTool(first.system, first.boundary, plan.tool_inventory);
    try {
      results.push(...runPersistentGroup(
        first.system,
        first.requested_proof === "unconditional",
        first.boundary,
        jobs,
        recordsByLabel,
        tool,
        options.timeoutSeconds,
      ));
    } catch (error) {
      results.push(...jobs.map((job) => ({
        ...terminalResult(job),
        status: error.terminalStatus === "timeout" ? "timeout" : "error",
        reason: error.message,
      })));
    }
  }
  for (const job of fresh) {
    const tool = boundaryTool(job.system, job.boundary, plan.tool_inventory);
    results.push(runFreshJob(job, recordsByLabel.get(job.label), tool, options.timeoutSeconds));
  }
  const order = new Map(plan.plan.jobs.map((job, index) => [
    `${job.system}|${job.label}|${job.requested_proof}|${job.boundary}`,
    index,
  ]));
  results.sort((left, right) =>
    order.get(`${left.system}|${left.label}|${left.requested_proof}|${left.boundary}`) -
    order.get(`${right.system}|${right.label}|${right.requested_proof}|${right.boundary}`)
  );
  const finalSource = collectGitSourceIdentity({ root: ROOT });
  if (fingerprint(finalSource) !== fingerprint(plan.source)) {
    throw new Error("source identity changed while the class/unit corpus was running");
  }
  const finalTools = evidenceTools(detectTools(options));
  for (const [name, original] of Object.entries(plan.tools)) {
    if (!finalTools[name] || finalTools[name].fingerprint !== original.fingerprint) {
      throw new Error(`tool or executed artifact identity changed while running: ${name}`);
    }
  }
  const raw = {
    schema: SCHEMA,
    schema_version: SCHEMA_VERSION,
    captured_at: new Date().toISOString(),
    source: plan.source,
    host: plan.host,
    fixture: plan.fixture,
    configuration: plan.configuration,
    tools: plan.tools,
    plan: plan.plan,
    results,
  };
  return finalizeClassUnitEvidence(raw).report;
}

function writeJson(filename, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (filename) fs.writeFileSync(filename, text);
  process.stdout.write(text);
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (!options.dryRun &&
      JSON.stringify(options.boundaries) !== JSON.stringify(TIMING_BOUNDARIES)) {
    throw new Error(
      `evidence runs require all four boundaries in this order: ${TIMING_BOUNDARIES.join(",")}`,
    );
  }
  const source = collectGitSourceIdentity({ root: ROOT, allowDirty: options.dryRun });
  const { fixture, records } = loadFixture(options.fixture, options.tier, options.limit);
  const tools = detectTools(options);
  const plan = createPlan(options, fixture, records, tools, source);
  if (options.dryRun) {
    writeJson(options.output, plan);
    return;
  }
  const report = runPlan(plan, records, options);
  writeJson(options.output, report);
  if (!performanceEvidenceAccepted(report)) {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  SYSTEMS,
  aggregateJob,
  correctnessMismatches,
  createPlan,
  detectTools,
  gpAdapterSource,
  heckeAdapterSource,
  loadFixture,
  magmaAdapterSource,
  parseArguments,
  parseGpPayload,
  parseHeckePayload,
  parseMagmaPayload,
  parsePythonPayload,
  pythonAdapterSource,
  proofModes,
  runPlan,
  spawnMeasuredProcess: spawn,
};
