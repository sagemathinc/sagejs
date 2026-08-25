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
const IMPLEMENTED_SYSTEMS = new Set(["sagejs", "sage-pari", "direct-gp"]);
const ROLES = new Set(["smoke", "tune", "holdout"]);
const PAYLOAD_PREFIX = "SAGEJS_CLASS_UNIT_CORPUS|";
const GP_PAYLOAD_PREFIX = "SAGEJS_CLASS_UNIT_GP|";
const GP_ERROR_PREFIX = "SAGEJS_CLASS_UNIT_GP_ERROR|";
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

Magma, Hecke, and Oscar are inventoried precisely but their corpus execution
adapters are not yet implemented here. Selecting one records an explicit
unsupported terminal state and makes the run fail closed.`;
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
    magma.artifacts = [fileArtifact("executable", magma.executable)];
    magma.libraries = nullLibraries();
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
    const available = julia.status === "available" && project.status === "available";
    const answer = {
      name,
      status: available ? "available" : "unavailable",
      requested_executable: options.julia,
      executable: julia.executable,
      argv_prefix: available
        ? [julia.executable, "--startup-file=no", `--project=${project.path}`]
        : null,
      version: available
        ? `${julia.version}; ${project.package} ${project.package_version || "unknown"}`
        : null,
      project,
      julia_depot: juliaDepot,
      julia_depot_available: juliaDepotAvailable,
      reason: available ? null : julia.reason || project.reason,
    };
    if (available) {
      answer.artifacts = [fileArtifact("executable", julia.executable)];
      answer.libraries = nullLibraries();
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
  if (system === "magma") return [tool.executable, "-b", "<not-implemented>"];
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

function spawn(executable, args, source, timeoutSeconds, env = {}) {
  if (!GNU_TIME || !GNU_TIMEOUT) {
    throw new Error(
      "performance evidence requires GNU /usr/bin/time and /usr/bin/timeout",
    );
  }
  const rssMarker = "SAGEJS_CLASS_UNIT_MAX_RSS_KIB|";
  const started = process.hrtime.bigint();
  // GNU timeout, without --foreground, owns a separate foreground process group
  // for the measured command. TERM followed by KILL therefore reaches the time
  // wrapper and every benchmark descendant instead of orphaning the real CAS.
  const run = childProcess.spawnSync(GNU_TIMEOUT, [
    "--signal=TERM",
    "--kill-after=2s",
    `${timeoutSeconds}s`,
    GNU_TIME,
    "-f",
    `${rssMarker}%M`,
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
  const peakRssKib = rssMatches.length === 1 ? Number(rssMatches[0][1]) : null;
  return {
    run,
    process_total_seconds: Number(process.hrtime.bigint() - started) / 1e9,
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

function parseGpPayload(run) {
  if (run.error || run.status !== 0) {
    throw failedExecution(run, "direct-gp");
  }
  const payload = [];
  for (const line of (run.stdout || "").split(/\r?\n/)) {
    if (line.startsWith(GP_ERROR_PREFIX)) {
      const [label, sample, ...reason] = line.slice(GP_ERROR_PREFIX.length).split("|");
      payload.push({
        label,
        sample: Number(sample),
        status: "error",
        elapsed_seconds: null,
        reason: reason.join("|"),
        answer: null,
      });
      continue;
    }
    if (!line.startsWith(GP_PAYLOAD_PREFIX)) continue;
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
    ] =
      line.slice(GP_PAYLOAD_PREFIX.length).split("|");
    const parsedInvariants = invariants === "[]"
      ? []
      : invariants.slice(1, -1).split(",").map((value) => value.trim());
    const gpNumber = (value) => Number(value.replace(/\s+/g, ""));
    payload.push({
      label,
      sample: Number(sample),
      status: "ok",
      elapsed_seconds: gpNumber(elapsed),
      batch_elapsed_seconds: gpNumber(batchElapsed),
      iteration_count: Number(iterations),
      phases_seconds: {
        initialization: null,
        field_construction: gpNumber(fieldSeconds),
        computation: gpNumber(computationSeconds),
        verification: gpNumber(verificationSeconds),
      },
      answer: {
        class_number: classNumber,
        class_group_invariant_factors: parsedInvariants,
        unit_rank: Number(unitRank),
        torsion_order: torsion,
        regulator: decimalRegulator(regulator),
        _achieved_proof_semantics: certified === "1"
          ? "exact-unconditional"
          : "exact-relations-conditional-grh",
      },
    });
  }
  if (payload.length === 0) throw new Error("direct-gp emitted no corpus payload");
  return payload;
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
  const answer = analyzed[0].answer;
  const mismatches = analyzed.flatMap((item, index) =>
    item.mismatches.map((mismatch) => `sample-${index}:${mismatch}`)
  );
  const answerFingerprint = fingerprint(answer);
  for (const [index, item] of analyzed.entries()) {
    if (item.achieved !== achieved) mismatches.push(`sample-${index}:proof-disagreement`);
    if (fingerprint(item.answer) !== answerFingerprint) {
      mismatches.push(`sample-${index}:answer-disagreement`);
    }
  }
  if (mismatches.length > 0) {
    return {
      ...terminalResult(job, `correctness mismatch: ${mismatches.join(",")}`),
      status: "error",
    };
  }
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
      answer_sha256: fingerprint(analyzed[index].answer),
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

function runPersistentGroup(system, proof, boundary, jobs, recordsByLabel, tool, timeoutSeconds) {
  const records = jobs.map((job) => recordsByLabel.get(job.label));
  const uniqueRecords = [...new Map(records.map((record) => [record.label, record])).values()];
  const source = system === "direct-gp"
    ? gpAdapterSource(uniqueRecords, proof, boundary, jobs[0].samples)
    : pythonAdapterSource(uniqueRecords, proof, boundary, jobs[0].samples, system);
  const args = system === "sagejs"
    ? ["--python", "-"]
    : system === "sage-pari"
      ? ["-python", "-"]
      : ["-fq"];
  const executed = spawn(
    tool.executable,
    args,
    source,
    timeoutSeconds,
    system === "sagejs" ? { SAGEJS_USE_SOURCE: "1" } : {},
  );
  const payload = system === "direct-gp"
    ? parseGpPayload(executed.run)
    : parsePythonPayload(executed.run, system);
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
    const source = job.system === "direct-gp"
      ? gpAdapterSource(
          [expected],
          job.requested_proof === "unconditional",
          job.boundary,
          1,
        )
      : pythonAdapterSource(
          [expected],
          job.requested_proof === "unconditional",
          job.boundary,
          1,
          job.system,
        );
    const args = job.system === "sagejs"
      ? ["--python", "-"]
      : job.system === "sage-pari"
        ? ["-python", "-"]
        : ["-fq"];
    const executed = spawn(
      tool.executable,
      args,
      source,
      timeoutSeconds,
      job.tool_id === "sagejs" ? { SAGEJS_USE_SOURCE: "1" } : {},
    );
    processTotalSeconds += executed.process_total_seconds;
    let payload;
    try {
      payload = job.system === "direct-gp"
        ? parseGpPayload(executed.run)
        : parsePythonPayload(executed.run, job.system);
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
    const tool = boundaryTool(first.system, first.boundary, plan.tools);
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
    const tool = boundaryTool(job.system, job.boundary, plan.tools);
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
  loadFixture,
  parseArguments,
  parseGpPayload,
  parsePythonPayload,
  pythonAdapterSource,
  proofModes,
  runPlan,
  spawnMeasuredProcess: spawn,
};
