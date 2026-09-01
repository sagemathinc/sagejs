"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  DEFAULT_DELTA,
  ensureEmptyIgnoredOutput,
  parseArguments: parseBrowserArguments,
  validateBrowserMemoryReceipt,
} = require("../../../scripts/numerical-computing/qualification/run-browser-memory.cjs");
const {
  parseArguments: parseSanitizerArguments,
  usage: sanitizerUsage,
} = require("../../../scripts/numerical-computing/qualification/run-native-sanitizers.cjs");
const {
  stageBrowserArtifact,
  subjectFor,
} = require("../../../scripts/numerical-computing/qualification/prepare-browser.cjs");
const {
  createBinding: createBrowserExecutableBinding,
  executableIdentity: browserExecutableIdentity,
} = require("../../../scripts/numerical-computing/qualification/browser-executable.cjs");
const browserAdapter = require(
  "../../../bench/numerical-computing/qualification/browser-adapter.cjs",
);
const packageAdapter = require(
  "../../../bench/numerical-computing/qualification/package-adapter.cjs",
);
const {
  validateMatrixPolicy,
} = require("../../../scripts/numerical-computing/contracts.cjs");
const {
  qualificationInternals: receiptInternals,
} = require("../../../scripts/numerical-computing/receipt.cjs");
const {
  contentId,
  canonicalJson,
  digestBundle,
  digestPath,
  repositoryPath,
  sha256,
} = require("../../../scripts/numerical-computing/common.cjs");
const {
  buildReleaseGate,
  buildSupplementalReport,
  qualificationInternals: supplementalInternals,
  verifyEvidence,
  verifyMatrixArtifactCoherence,
  verifyMatrixBrowserSubjectCoherence,
  verifyMatrixScipyOracleCoherence,
} = require(
  "../../../scripts/numerical-computing/qualification/supplemental-report.cjs",
);
const {
  CATALOG_PATH: SCIPY_CATALOG_PATH,
  CATALOG_SCHEMA: SCIPY_CATALOG_SCHEMA,
  ORACLE_ENVIRONMENT: SCIPY_ORACLE_ENVIRONMENT,
  POLICY: SCIPY_POLICY,
  PROVENANCE_SCHEMA: SCIPY_PROVENANCE_SCHEMA,
  PROVISIONING_POLICY: SCIPY_PROVISIONING_POLICY,
  SCHEMA: SCIPY_BINDING_SCHEMA,
} = require(
  "../../../scripts/numerical-computing/qualification/scipy-oracle.cjs",
);
const {
  validateHarnessOutput,
  verifyBuildArtifact,
} = require(
  "../../../scripts/numerical-computing/qualification/run-wasm-destructive.cjs",
);

const candidate = "a".repeat(40);
const repositoryRoot = path.resolve(__dirname, "../../..");
const fileBinding = Object.freeze({ path: "evidence.json", sha256: "b".repeat(64), bytes: 1 });

function identified(core) {
  return { ...core, id: contentId(core) };
}

function scipyInput(name, kind, version, sourceSuffix = "v1") {
  return {
    kind,
    name,
    version,
    filename: `${name}-${version}.artifact`,
    source: `https://qualification.invalid/${sourceSuffix}/${name}`,
    sha256: sha256(`${sourceSuffix}:${name}:${version}`),
    bytes: 100,
  };
}

function scipyCatalog(sourceSuffix = "v1") {
  const inputs = [
    scipyInput("cpython", "cpython-standalone", SCIPY_POLICY.python, sourceSuffix),
    scipyInput("numpy", "wheel", SCIPY_POLICY.numpy, sourceSuffix),
    scipyInput("scipy", "wheel", SCIPY_POLICY.scipy, sourceSuffix),
  ];
  return identified({
    schema: SCIPY_CATALOG_SCHEMA,
    policy: { ...SCIPY_POLICY },
    provisioning: SCIPY_PROVISIONING_POLICY,
    platforms: ["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"].map(
      (platformId, index) => ({
        platform: platformId,
        status: "qualified",
        reason: null,
        python_executable: platformId === "windows-x64" ? "python.exe" : "bin/python3",
        site_packages: "lib/site-packages",
        inputs,
        prefix: {
          sha256: sha256(`${sourceSuffix}:${platformId}:prefix`),
          bytes: 10_000 + index,
          files: 100 + index,
          directories: 20 + index,
        },
      }),
    ),
  });
}

function scipyBinding(catalog, platformId, { moduleSuffix = "v1" } = {}) {
  const row = catalog.platforms.find((item) => item.platform === platformId);
  const prefix = platformId === "windows-x64"
    ? "C:/qualification/scipy"
    : `/qualification/${platformId}/scipy`;
  const provenance = identified({
    schema: SCIPY_PROVENANCE_SCHEMA,
    platform: platformId,
    policy: { ...SCIPY_POLICY },
    python_executable: row.python_executable,
    site_packages: row.site_packages,
    provisioning: SCIPY_PROVISIONING_POLICY,
    inputs: row.inputs,
    prefix: row.prefix,
  });
  const environment = platformId === "windows-x64" ? {
    ...SCIPY_ORACLE_ENVIRONMENT,
    SystemRoot: "C:/Windows",
    WINDIR: "C:/Windows",
    TEMP: `${prefix}/.qualification-tmp`,
    TMP: `${prefix}/.qualification-tmp`,
    USERPROFILE: prefix,
  } : {
    ...SCIPY_ORACLE_ENVIRONMENT,
    HOME: prefix,
    TMPDIR: `${prefix}/.qualification-tmp`,
  };
  const catalogBytes = Buffer.from(canonicalJson(catalog));
  return identified({
    schema: SCIPY_BINDING_SCHEMA,
    platform: platformId,
    policy: { ...SCIPY_POLICY },
    catalog: {
      path: SCIPY_CATALOG_PATH,
      sha256: sha256(catalogBytes),
      bytes: catalogBytes.length,
      snapshot: catalog,
    },
    provenance,
    prefix: { path: prefix, ...row.prefix },
    runtime: {
      environment,
      python: {
        version: SCIPY_POLICY.python,
        implementation: "cpython",
        executable_path: row.python_executable,
        executable_sha256: sha256(`${platformId}:python`),
        executable_bytes: 1000,
        site_packages_path: row.site_packages,
        temporary_path: ".qualification-tmp",
        import_paths: [
          { path: row.site_packages, kind: "directory" },
          { path: "lib/python314.zip", kind: "absent" },
        ],
      },
      numpy: {
        version: SCIPY_POLICY.numpy,
        module_path: `${row.site_packages}/numpy/__init__.py`,
        module_sha256: sha256(`${moduleSuffix}:${platformId}:numpy`),
        module_bytes: 100,
      },
      scipy: {
        version: SCIPY_POLICY.scipy,
        module_path: `${row.site_packages}/scipy/__init__.py`,
        module_sha256: sha256(`${moduleSuffix}:${platformId}:scipy`),
        module_bytes: 100,
      },
    },
  });
}

function repository(commit = candidate) {
  return { commit, tree: "c".repeat(40), clean: true, status_sha256: "d".repeat(64) };
}

function platform() {
  return { id: "linux-x64" };
}

function supplementalTemplate() {
  return JSON.parse(fs.readFileSync(path.join(
    __dirname,
    "../../../bench/numerical-computing/qualification/matrix/supplemental-evidence.template.json",
  ), "utf8"));
}

function fullRuntimeTemplate() {
  return JSON.parse(fs.readFileSync(path.join(
    __dirname,
    "../../../bench/numerical-computing/qualification/matrix/full-runtime.template.json",
  ), "utf8"));
}

function sanitizerEvidence() {
  const runs = ["address", "undefined", "leak"].map((sanitizer) => ({
    sanitizer,
    status: "passed",
    executable_sha256: "1".repeat(64),
    execute: { status: 0, signal: null },
  }));
  const component = (id) => ({
    id,
    status: "passed",
    artifact: {
      sha256: "2".repeat(64),
      content_sha256: (id === "cminpack" ? "a" : "b").repeat(64),
    },
    source_closure_sha256: "3".repeat(64),
    build_report: { sha256: "4".repeat(64) },
    harness: { sha256: "5".repeat(64) },
    runs,
  });
  return identified({
    schema: "sagejs.numerical-native-sanitizer-evidence/v1",
    status: "passed",
    repository: repository(),
    platform: platform(),
    components: [component("cminpack"), component("nlopt")],
  });
}

function destructiveEvidence() {
  const checks = Object.fromEntries([
    "allocation-failure", "corrupt-region", "runner-build-report-artifact-mismatch",
    "harness-input-artifact-mismatch", "product-malformed-artifact-fail-closed",
    "post-failure-recovery",
  ].map((name) => [name, { status: "passed" }]));
  return identified({
    schema: "sagejs.numerical-wasm-destructive-evidence/v1",
    status: "passed",
    repository: repository(),
    platform: platform(),
    tool: { sha256: "6".repeat(64) },
    harness: { sha256: "7".repeat(64) },
    artifacts: [
      { name: "cminpack-wasm", path: "cminpack.wasm", sha256: "8".repeat(64), content_sha256: "a".repeat(64), bytes: 10 },
      { name: "nlopt-wasm", path: "nlopt.wasm", sha256: "9".repeat(64), content_sha256: "b".repeat(64), bytes: 20 },
    ],
    runtime_artifacts: [
      ["node-cminpack-wasm", "cminpack", "cminpack.wasm", "8", "a", 10],
      ["node-nlopt-wasm", "nlopt", "dist/nlopt.wasm", "d", "b", 20],
      ["browser-cminpack-wasm", "cminpack", "browser/cminpack.wasm", "e", "a", 10],
      ["browser-nlopt-wasm", "nlopt", "browser/nlopt.wasm", "f", "b", 20],
    ].map(([name, component, artifactPath, framed, raw, bytes]) => ({
      name,
      component,
      path: artifactPath,
      sha256: framed.repeat(64),
      content_sha256: raw.repeat(64),
      bytes,
    })),
    execution: { status: 0, signal: null },
    checks,
    scope: { source_and_artifact_bound: true, host_output_independently_validated: true },
  });
}

function browserEvidence(kind, engine) {
  return identified({
    schema: "sagejs.numerical-browser-memory-evidence/v1",
    status: "passed",
    repository: repository(),
    platform: platform(),
    subject: {
      kind,
      name: kind === "worker" ? "sagejs-browser-worker" : "playwright-browser",
      version: "1",
      engine,
    },
    corpus: {
      sha256: "1".repeat(64),
      snapshot: { id: "sagejs-numerical-browser-memory-v1" },
    },
    source_bundle: { sha256: "2".repeat(64) },
    adapter: { sha256: "3".repeat(64) },
    receipt: { id: `sha256:${"4".repeat(64)}`, sha256: "a".repeat(64) },
    memory: {
      baseline_peak_bytes: 200 * 1024 * 1024,
      pressure_peak_bytes: 240 * 1024 * 1024,
      delta_bytes: 40 * 1024 * 1024,
      minimum_delta_bytes: 32 * 1024 * 1024,
      measurement_method: "linux-procfs-process-tree-sampled-v1",
      measurement_scope: "process_tree",
      authenticated_by: "qualification-collector",
      sample_interval_ms: 5,
      worker_replacement_passed: true,
    },
    scope: { claim: "collector-authenticated-real-browser-process-tree-memory" },
  });
}

function structuralEvidence() {
  const ids = [
    "package-graph-lazy-ownership",
    "sea-startup-budgets",
    "browser-artifact-payload-and-pack-topology",
    "numerical-trace-presentation-payload",
    "wasm-production-resource-closure",
  ];
  const gates = ids.map((id) => ({
    id,
    status: "passed",
    command: "<node>",
    status_code: 0,
    signal: null,
    elapsed_ms: 1,
    bindings: [{ path: `${id}.cjs`, sha256: "1".repeat(64) }],
    artifacts: id === "sea-startup-budgets"
      ? [{ path: "sagejs", sha256: "2".repeat(64), content_sha256: "3".repeat(64) }]
      : id === "browser-artifact-payload-and-pack-topology"
        ? [{ path: "dist", sha256: "4".repeat(64), content_sha256: "8".repeat(64) }]
        : [],
    report: id === "browser-artifact-payload-and-pack-topology"
      ? { sha256: "5".repeat(64), identity: `sha256:${"6".repeat(64)}` }
      : null,
  }));
  return identified({
    schema: "sagejs.numerical-structural-performance-evidence/v1",
    status: "passed",
    repository: repository(),
    platform: platform(),
    tool: { sha256: "7".repeat(64) },
    gates,
    scope: { claim: "source-current-authoritative-structural-and-performance-gates" },
  });
}

function evidenceRecords() {
  return [
    sanitizerEvidence(), destructiveEvidence(), structuralEvidence(),
    browserEvidence("browser", "chromium"), browserEvidence("browser", "firefox"),
    browserEvidence("browser", "webkit"), browserEvidence("worker", "chromium"),
  ].map((value, index) => ({ ...fileBinding, path: `evidence-${index}.json`, value }));
}

function compiledMatrixPolicy(template = fullRuntimeTemplate()) {
  const corpusPath = "bench/numerical-computing/qualification/product.corpus.json";
  const corpus = JSON.parse(fs.readFileSync(path.join(repositoryRoot, corpusPath), "utf8"));
  const corpusSha256 = digestPath(repositoryRoot, corpusPath, "fixture corpus").sha256;
  const sourceSha256 = digestBundle(
    repositoryRoot, corpus.source_paths, "fixture source bundle",
  ).sha256;
  const backend = JSON.parse(fs.readFileSync(path.join(
    repositoryRoot,
    "bench/numerical-computing/qualification/capabilities/node-capability-spec.json",
  ), "utf8")).backend;
  return validateMatrixPolicy({
    schema: "sagejs.numerical-qualification-matrix-policy/v1",
    id: template.id,
    description: template.description,
    require_clean: true,
    rows: template.rows.map((expected, index) => ({
      id: expected.id,
      match: {
        corpus_id: corpus.id,
        corpus_sha256: corpusSha256,
        source_bundle_sha256: sourceSha256,
        capability_manifest_id: `sha256:${String(index).padStart(64, "0")}`,
        backend_id: backend.id,
        backend_version: backend.version,
        platform: expected.platform,
        subject_kind: expected.subject.kind,
        subject_name: expected.subject.name,
        subject_version: "1",
        subject_engine: expected.subject.engine,
      },
      required_program_phases: template.required_program_phases,
      required_case_layers: template.required_case_layers,
      required_capabilities: template.required_capabilities,
      required_artifacts: [{ name: "fixture", sha256: "c".repeat(64) }],
      required_memory_scope: expected.required_memory_scope,
    })),
  });
}

function matrixReport(policy = compiledMatrixPolicy()) {
  return identified({
    schema: "sagejs.numerical-qualification-matrix-report/v1",
    policy: {
      id: policy.id,
      sha256: sha256(canonicalJson(policy)),
      require_clean: true,
      required_rows: policy.rows.length,
    },
    status: "passed",
    rows: policy.rows.map((row) => ({
      row_id: row.id,
      status: "passed",
      receipt: {
        repository_commit: candidate,
        subject: {
          kind: row.match.subject_kind,
          name: row.match.subject_name,
          version: row.match.subject_version,
          engine: row.match.subject_engine,
        },
      },
      bindings: {
        artifacts: [
          { name: "cminpack-wasm", sha256: "1".repeat(64), content_sha256: "a".repeat(64) },
          { name: "nlopt-wasm", sha256: "2".repeat(64), content_sha256: "b".repeat(64) },
          ...(row.match.subject_kind === "browser" || row.match.subject_kind === "worker"
            ? [{ name: "browser-dist", sha256: "3".repeat(64), content_sha256: "8".repeat(64) }]
            : []),
          ...(row.id === "linux-x64-sea"
            ? [{ name: "sea-executable", sha256: "4".repeat(64), content_sha256: "3".repeat(64) }]
            : []),
          ...(row.match.subject_kind === "npm"
            ? [{ name: "npm-root-tarball", sha256: "5".repeat(64), content_sha256: "9".repeat(64) }]
            : []),
        ],
      },
    })),
    unmatched_receipt_ids: [],
  });
}

test("all npm rows bind one identical public root tarball", () => {
  const matrix = matrixReport();
  const supplemental = {
    artifact_coherence: {
      status: "passed",
      reasons: [],
      component_content_sha256: { cminpack: "a".repeat(64), nlopt: "b".repeat(64) },
      browser_distribution: { content_sha256: "8".repeat(64) },
      linux_sea: { content_sha256: "3".repeat(64) },
    },
  };
  assert.deepEqual(verifyMatrixArtifactCoherence(matrix, supplemental), {
    npmRootContentSha256: "9".repeat(64),
  });
  const substituted = structuredClone(matrix);
  substituted.rows.find((row) => row.row_id === "windows-x64-npm")
    .bindings.artifacts.find((artifact) => artifact.name === "npm-root-tarball")
    .content_sha256 = "7".repeat(64);
  assert.throws(
    () => verifyMatrixArtifactCoherence(substituted, supplemental),
    /one identical public root tarball/,
  );
});

function canonicalTemplateRecord(template = fullRuntimeTemplate()) {
  const filename = path.join(
    __dirname,
    "../../../bench/numerical-computing/qualification/matrix/full-runtime.template.json",
  );
  return {
    path: path.relative(repositoryRoot, fs.realpathSync(filename)).split(path.sep).join("/"),
    sha256: sha256(fs.readFileSync(filename)),
    bytes: fs.statSync(filename).size,
    value: template,
  };
}

function canonicalSupplementalTemplateRecord(template = supplementalTemplate()) {
  const filename = path.join(
    __dirname,
    "../../../bench/numerical-computing/qualification/matrix/supplemental-evidence.template.json",
  );
  return {
    path: path.relative(repositoryRoot, fs.realpathSync(filename)).split(path.sep).join("/"),
    sha256: sha256(fs.readFileSync(filename)),
    bytes: fs.statSync(filename).size,
    value: template,
  };
}

function peak(bytes, overrides = {}) {
  return {
    bytes,
    measurement_method: "linux-procfs-process-tree-sampled-v1",
    measurement_scope: "process_tree",
    authenticated_by: "qualification-collector",
    sample_interval_ms: 5,
    ...overrides,
  };
}

function browserReceipt(baseline, pressure) {
  return {
    status: "passed",
    platform: { id: "linux-x64" },
    runtime: { subject: { kind: "browser" } },
    cases: [
      {
        case_id: "p8-browser-memory-baseline",
        status: "passed",
        metrics: { peak_memory: baseline },
      },
      {
        case_id: "p8-browser-memory-pressure",
        status: "passed",
        metrics: { peak_memory: pressure },
      },
      {
        case_id: "p8-browser-worker-replacement",
        status: "passed",
        metrics: { peak_memory: pressure },
      },
    ],
  };
}

test("native sanitizer CLI is explicit and defaults to all three sanitizers", () => {
  const parsed = parseSanitizerArguments(["--output", "build/evidence.json"]);
  assert.deepEqual(parsed.components, ["cminpack", "nlopt"]);
  assert.equal(parsed.requireClean, true);
  assert.match(sanitizerUsage(), /not a claim that Wasm ran under a native sanitizer/);
  assert.throws(
    () => parseSanitizerArguments(["--output", "x", "--component", "cobyla"]),
    /unsupported component/,
  );
});

test("browser memory CLI requires an exact real-engine row", () => {
  const parsed = parseBrowserArguments([
    "--engine", "chromium", "--kind", "worker", "--output", "build/browser-memory",
  ]);
  assert.equal(parsed.minimumDelta, DEFAULT_DELTA);
  assert.equal(parsed.kind, "worker");
  assert.throws(
    () => parseBrowserArguments([
      "--engine", "firefox", "--kind", "worker", "--output", "build/browser-memory",
    ]),
    /worker.*Chromium/i,
  );
});

test("worker qualification preserves and pins exact Chromium engine identity", () => {
  assert.deepEqual(subjectFor("worker", "chromium", "123"), {
    kind: "worker",
    name: "sagejs-browser-worker",
    version: "123",
    engine: "chromium",
  });
  for (const substituted of ["firefox", "webkit", "Chromium", "chrome"]) {
    assert.throws(
      () => subjectFor("worker", substituted, "123"),
      /pinned to Chromium|must be chromium, firefox, or webkit/,
    );
  }
  const previous = process.env.SAGEJS_QUALIFICATION_WORKER_ENGINE;
  process.env.SAGEJS_QUALIFICATION_WORKER_ENGINE = "firefox";
  try {
    assert.equal(browserAdapter._testing.browserEngine({
      kind: "worker", name: "sagejs-browser-worker", version: "123", engine: "chromium",
    }), "chromium");
    assert.throws(
      () => browserAdapter._testing.browserEngine({
        kind: "worker", name: "sagejs-browser-worker", version: "123", engine: "firefox",
      }),
      /pinned to Chromium/,
    );
    assert.throws(
      () => browserAdapter._testing.browserEngine({
        kind: "worker", name: "sagejs-browser-worker", version: "123", engine: null,
      }),
      /unsupported engine/,
    );
  } finally {
    if (previous === undefined) delete process.env.SAGEJS_QUALIFICATION_WORKER_ENGINE;
    else process.env.SAGEJS_QUALIFICATION_WORKER_ENGINE = previous;
  }
});

test("package adapter waits for a clean worker exit after the result", async () => {
  const run = packageAdapter._testing.runQualificationWorker;
  const header = `
    const { parentPort } = require("node:worker_threads");
    parentPort.postMessage({ ok: true, result: 17 });
  `;
  assert.equal(await run(header, {}, { postMessageExitTimeoutMs: 100 }), 17);
  await assert.rejects(
    run(`${header}\nthrow new Error("post-result crash");`, {}, {
      postMessageExitTimeoutMs: 100,
    }),
    /post-result crash|exited with status/,
  );
  await assert.rejects(
    run(`${header}\nsetInterval(() => {}, 1_000);`, {}, {
      postMessageExitTimeoutMs: 50,
      resultTimeoutMs: 1_000,
    }),
    /retained live handles/,
  );
});

test("SEA embedded numerical resources require exact bound identities", () => {
  const validate = packageAdapter._testing.validateSeaResourceDigests;
  const expected = {
    "numerical/cminpack.wasm": { sha256: "a".repeat(64), bytes: 10 },
    "numerical/nlopt-methods.wasm": { sha256: "b".repeat(64), bytes: 20 },
  };
  const record = (resources) => ({
    status: 0,
    stderr: "",
    stdout: `${JSON.stringify({
      schema: "sagejs.sea-qualification-resource-digests/v1",
      schema_version: 1,
      platform: { os: process.platform, arch: process.arch },
      resources,
    })}\n`,
  });
  const resources = Object.entries(expected).map(([name, identity]) => ({ name, ...identity }));
  assert.equal(validate(record(resources), expected).resources.length, 2);
  for (const invalid of [
    [resources[0], { ...resources[1], sha256: "a".repeat(64) }],
    [resources[0]],
    [...resources, { name: "numerical/foreign.wasm", sha256: "c".repeat(64), bytes: 1 }],
  ]) {
    assert.throws(() => validate(record(invalid), expected), /invalid identity|differs|unexpected/);
  }
  assert.throws(
    () => validate({ status: 0, stderr: "", stdout: "not-json\n" }, expected),
    /malformed JSON/,
  );
});

test("package adapter cleans and resets after SEA version or resource setup failure", async (t) => {
  const packageRuntime = require("../../../scripts/package-qualification/runtime.cjs");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-package-init-cleanup-"));
  t.after(async () => {
    await packageAdapter.close().catch(() => {});
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  const executable = path.join(temporary, "sagejs");
  const cminpack = path.join(temporary, "cminpack.wasm");
  const nlopt = path.join(temporary, "nlopt.wasm");
  const scipy = path.join(temporary, "scipy.json");
  for (const [filename, contents] of [
    [executable, "executable"], [cminpack, "cminpack"], [nlopt, "nlopt"], [scipy, "{}\n"],
  ]) fs.writeFileSync(filename, contents);
  const artifacts = [
    ["sea-executable", executable], ["cminpack-wasm", cminpack],
    ["nlopt-wasm", nlopt], ["scipy-oracle-binding", scipy],
  ].map(([name, filename]) => ({ name, path: filename, sha256: "test", bytes: 1 }));
  const originalPrepare = packageRuntime.prepareRelocatedSea;
  const originalRun = packageRuntime.runProcess;
  let mode = "version";
  let cleanupDirectory = null;
  packageRuntime.prepareRelocatedSea = () => {
    cleanupDirectory = fs.mkdtempSync(path.join(temporary, "runtime-"));
    return {
      kind: "relocated-sea",
      target: "linux-x64",
      executable,
      cleanup() {
        fs.rmSync(cleanupDirectory, { recursive: true, force: true });
      },
    };
  };
  packageRuntime.runProcess = (_command, args) => {
    if (args[0] === "--version") {
      return { status: 0, signal: null, stdout: mode === "version" ? "unknown\n" : "sagejs v1.2.3\n", stderr: "" };
    }
    return {
      status: 0,
      signal: null,
      stderr: "",
      stdout: `${JSON.stringify({
        schema: "sagejs.sea-qualification-resource-digests/v1",
        schema_version: 1,
        platform: { os: process.platform, arch: process.arch },
        resources: [
          { name: "numerical/cminpack.wasm", sha256: "0".repeat(64), bytes: 1 },
          { name: "numerical/nlopt-methods.wasm", sha256: "0".repeat(64), bytes: 1 },
        ],
      })}\n`,
    };
  };
  const context = {
    root: repositoryRoot,
    subject: { kind: "sea", name: "sagejs", version: "1.2.3", engine: null },
    artifacts,
    capabilities: [],
  };
  try {
    await assert.rejects(packageAdapter.initialize(context), /returned no semantic version/);
    assert.equal(fs.existsSync(cleanupDirectory), false);
    assert.equal(packageAdapter.qualificationState().initialized, false);
    mode = "resource";
    await assert.rejects(packageAdapter.initialize(context), /differs from the bound/);
    assert.equal(fs.existsSync(cleanupDirectory), false);
    assert.equal(packageAdapter.qualificationState().initialized, false);
  } finally {
    packageRuntime.prepareRelocatedSea = originalPrepare;
    packageRuntime.runProcess = originalRun;
  }
});

test("relocated SEA advertises executable foreign parser guards", () => {
  const available = packageAdapter._testing.foreignFrontendsAvailable;
  assert.equal(available("fresh-npm-install", () => {}), true);
  assert.equal(available("relocated-sea", () => {}), true);
  assert.equal(available("relocated-sea", null), false);
  assert.equal(available("unknown-runtime", () => {}), false);
});

test("package Worker path exposes supervised child RSS to the collector", {
  skip: process.platform !== "linux" || process.arch !== "x64"
    ? "the mandatory supplemental process-tree memory gate is collected on linux-x64"
    : false,
}, async () => {
  const measurement = receiptInternals.memoryMeasurement({ kind: "npm" });
  const baseline = process.memoryUsage().rss;
  const runtimePath = require.resolve("../../../scripts/package-qualification/runtime.cjs");
  const source = String.raw`
    const { parentPort, workerData } = require("node:worker_threads");
    const runtime = require(workerData.runtimePath);
    const child = [
      "const bytes = new Uint8Array(64 * 1024 * 1024);",
      "for (let i = 0; i < bytes.length; i += 4096) bytes[i] = 1;",
      "setTimeout(() => process.exit(0), 250);",
    ].join("\n");
    const result = runtime.runProcess(process.execPath, ["-e", child], { timeout: 10_000 });
    parentPort.postMessage({ ok: true, result });
  `;
  const result = await packageAdapter._testing.runQualificationWorker(
    source,
    { runtimePath },
    { resultTimeoutMs: 15_000, postMessageExitTimeoutMs: 1_000 },
  );
  assert.equal(result.status, 0);
  const peak = measurement.finish();
  assert.equal(peak.measurement_scope, "process_tree");
  assert.equal(peak.authenticated_by, "qualification-collector");
  assert.equal(peak.measurement_method, "linux-procfs-process-tree-sampled-v1");
  assert.ok(
    peak.bytes >= baseline + 32 * 1024 * 1024,
    `process-tree peak ${peak.bytes} did not include touched child above ${baseline}`,
  );
});

test("browser memory evidence requires authenticated process-tree delta", () => {
  const baseline = peak(200 * 1024 * 1024);
  const pressure = peak(240 * 1024 * 1024);
  const measured = validateBrowserMemoryReceipt(
    browserReceipt(baseline, pressure),
    DEFAULT_DELTA,
  );
  assert.equal(measured.delta_bytes, 40 * 1024 * 1024);
  assert.throws(
    () => validateBrowserMemoryReceipt(
      browserReceipt(baseline, peak(220 * 1024 * 1024)),
      DEFAULT_DELTA,
    ),
    /below/,
  );
  assert.throws(
    () => validateBrowserMemoryReceipt(
      browserReceipt(baseline, peak(240 * 1024 * 1024, {
        measurement_scope: "browser_heap",
      })),
      DEFAULT_DELTA,
    ),
    /lacks authenticated/,
  );

  assert.throws(
    () => verifyEvidence(browserEvidence("browser", "chromium"), candidate),
    /collector must be an object|source-current repository bytes/,
  );
  for (const change of [
    { delta_bytes: 1, minimum_delta_bytes: 1 },
    { delta_bytes: 40 * 1024 * 1024 + 1 },
    { measurement_method: "node-process-rss-boundary-v1" },
    { sample_interval_ms: 50 },
  ]) {
    const weakened = browserEvidence("browser", "chromium");
    Object.assign(weakened.memory, change);
    const core = { ...weakened };
    delete core.id;
    weakened.id = contentId(core);
    assert.throws(
      () => verifyEvidence(weakened, candidate),
      /process-tree receipt binding|collector must be an object/,
    );
  }
});

test("destructive Wasm output is independently checked for cleanup and recovery", () => {
  const component = {
    corrupt_region_cases: 128,
    allocation_failure_positions: { fixture: 20 },
    callback_failure_cleanup: true,
    cancellation_cleanup: true,
    post_failure_recovery: true,
    lifecycle_after: { activeContexts: 0, activeHandle: 0, liveAllocations: 0, liveBytes: 0 },
  };
  const checks = validateHarnessOutput({
    schema: "sagejs.numerical-wasm-destructive-output/v1",
    harness_input_artifact_mismatch: { cminpack: "rejected", nlopt: "rejected" },
    product_malformed_artifact: { cminpack: "fail-closed", nlopt: "fail-closed" },
    cminpack: component,
    nlopt: component,
  });
  assert.equal(checks["allocation-failure"].status, "passed");
  assert.throws(
    () => validateHarnessOutput({
      schema: "sagejs.numerical-wasm-destructive-output/v1",
      harness_input_artifact_mismatch: { cminpack: "rejected", nlopt: "rejected" },
      product_malformed_artifact: { cminpack: "fail-closed", nlopt: "fail-closed" },
      cminpack: { ...component, lifecycle_after: { ...component.lifecycle_after, liveBytes: 8 } },
      nlopt: component,
    }),
    /lifecycle did not return to zero/,
  );
});

test("build-report authentication uses raw bytes, distinct from framed path binding", (context) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-digest-domain-test-"));
  context.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const bytes = Buffer.from("exact candidate artifact bytes");
  fs.writeFileSync(path.join(temporary, "artifact.wasm"), bytes);
  const raw = sha256(bytes);
  const framed = digestPath(temporary, "artifact.wasm", "fixture artifact").sha256;
  assert.notEqual(raw, framed);
  const report = { artifact: { sha256: raw, bytes: bytes.length } };
  assert.equal(verifyBuildArtifact(report, bytes, "fixture"), raw);
  const changed = Buffer.from(bytes);
  changed[changed.length - 1] ^= 1;
  assert.throws(
    () => verifyBuildArtifact(report, changed, "fixture"),
    /does not match its build report/,
  );
});

test("supplemental release report fails closed on omission, stale input, and tampering", () => {
  const template = supplementalTemplate();
  const development = buildSupplementalReport(template, [], { candidate, release: false });
  assert.equal(development.status, "pending");
  assert(development.rows.every((row) => row.status === "pending"));
  const releaseMissing = buildSupplementalReport(template, [], { candidate, release: true });
  assert.equal(releaseMissing.status, "failed");

  const stale = destructiveEvidence();
  stale.repository.commit = "e".repeat(40);
  const staleCore = { ...stale };
  delete staleCore.id;
  stale.id = contentId(staleCore);
  assert.throws(() => verifyEvidence(stale, candidate), /expected/);

  const tampered = destructiveEvidence();
  tampered.checks["corrupt-region"].status = "failed";
  assert.throws(() => verifyEvidence(tampered, candidate), /content ID mismatch/);
});

test("browser memory subjects and executable bytes match full-runtime receipts", (context) => {
  const matrix = matrixReport();
  const temporary = fs.mkdtempSync(path.join(repositoryRoot, "build", "browser-identity-test-"));
  context.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const records = evidenceRecords().filter((record) =>
    record.value.schema === "sagejs.numerical-browser-memory-evidence/v1");
  const executable = browserExecutableIdentity(process.execPath, "1");
  const matrixReceipts = records.map((record, index) => {
    record.value.browser_executable = executable;
    const { id: _oldId, ...core } = record.value;
    record.value.id = contentId(core);
    const binding = createBrowserExecutableBinding(record.value.subject, executable);
    const filename = path.join(temporary, `browser-${index}.json`);
    fs.writeFileSync(filename, `${JSON.stringify(binding, null, 2)}\n`);
    const artifact = {
      name: "browser-executable-binding",
      ...digestPath(repositoryRoot, path.relative(repositoryRoot, filename), "browser binding"),
      content_sha256: sha256(fs.readFileSync(filename)),
    };
    return {
      path: `receipt-${index}.json`,
      value: { runtime: { subject: record.value.subject }, artifacts: [artifact] },
    };
  });
  assert.equal(
    verifyMatrixBrowserSubjectCoherence(matrix, records, matrixReceipts),
    true,
  );

  const substituted = structuredClone(records);
  const chromium = substituted.find((record) =>
    record.value.subject.kind === "browser" && record.value.subject.engine === "chromium");
  chromium.value.subject.version = "2";
  chromium.value.browser_executable.version = "2";
  const { id: _oldId, ...core } = chromium.value;
  chromium.value.id = contentId(core);
  assert.throws(
    () => verifyMatrixBrowserSubjectCoherence(matrix, substituted, matrixReceipts),
    /differs from its full-runtime receipt/,
  );

  const differentBytes = structuredClone(records);
  const differentChromium = differentBytes.find((record) =>
    record.value.subject.kind === "browser" && record.value.subject.engine === "chromium");
  const differentExecutable = path.join(temporary, "different-browser");
  fs.writeFileSync(differentExecutable, "different browser executable bytes");
  differentChromium.value.browser_executable = browserExecutableIdentity(
    differentExecutable,
    "1",
  );
  const { id: _oldExecutableId, ...differentCore } = differentChromium.value;
  differentChromium.value.id = contentId(differentCore);
  assert.throws(
    () => verifyMatrixBrowserSubjectCoherence(matrix, differentBytes, matrixReceipts),
    /browser executable.*differs from its full-runtime receipt binding/,
  );
});

test("all full-runtime receipts bind one source-current hermetic SciPy oracle per platform", (context) => {
  const temporary = fs.mkdtempSync(path.join(repositoryRoot, "build", "scipy-coherence-test-"));
  context.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const catalog = scipyCatalog();
  const artifactFor = (binding, name) => {
    const filename = path.join(temporary, `${name}.json`);
    fs.writeFileSync(filename, `${JSON.stringify(binding, null, 2)}\n`);
    const relative = path.relative(repositoryRoot, filename).split(path.sep).join("/");
    return {
      name: "scipy-oracle-binding",
      ...digestPath(repositoryRoot, relative, "fixture SciPy binding"),
      content_sha256: sha256(fs.readFileSync(filename)),
    };
  };
  const artifacts = new Map(catalog.platforms.map((row) => [
    row.platform,
    artifactFor(scipyBinding(catalog, row.platform), row.platform),
  ]));
  const records = fullRuntimeTemplate().rows.map((row) => ({
    path: `${row.id}.receipt.json`,
    value: {
      platform: { id: row.platform },
      runtime: { subject: { ...row.subject, version: "1" } },
      artifacts: [artifacts.get(row.platform)],
    },
  }));
  const coherence = verifyMatrixScipyOracleCoherence(records, { expectedCatalog: catalog });
  assert.equal(coherence.catalog_id, catalog.id);
  assert.equal(coherence.platform_bindings.length, 4);

  const missing = structuredClone(records);
  missing[0].value.artifacts = [];
  assert.throws(
    () => verifyMatrixScipyOracleCoherence(missing, { expectedCatalog: catalog }),
    /lacks one SciPy oracle binding/,
  );

  const missingPlatform = records.filter((record) =>
    record.value.platform.id !== "windows-x64");
  assert.throws(
    () => verifyMatrixScipyOracleCoherence(missingPlatform, { expectedCatalog: catalog }),
    /lacks one source-current SciPy oracle per platform/,
  );

  const duplicatePlatform = structuredClone(records);
  const windows = duplicatePlatform.find((record) =>
    record.value.platform.id === "windows-x64");
  windows.value.platform.id = "macos-arm64";
  windows.value.artifacts = [artifacts.get("macos-arm64")];
  assert.throws(
    () => verifyMatrixScipyOracleCoherence(duplicatePlatform, { expectedCatalog: catalog }),
    /lacks one source-current SciPy oracle per platform|wrong SciPy oracle subject count/,
  );

  const swapped = structuredClone(records);
  swapped.find((record) => record.value.platform.id === "linux-x64")
    .value.artifacts = [artifacts.get("macos-arm64")];
  assert.throws(
    () => verifyMatrixScipyOracleCoherence(swapped, { expectedCatalog: catalog }),
    /uses SciPy oracle for macos-arm64/,
  );

  const different = structuredClone(records);
  different.find((record) =>
    record.value.platform.id === "linux-x64" && record.value.runtime.subject.kind === "npm")
    .value.artifacts = [artifactFor(
      scipyBinding(catalog, "linux-x64", { moduleSuffix: "different" }),
      "linux-x64-different",
    )];
  assert.throws(
    () => verifyMatrixScipyOracleCoherence(different, { expectedCatalog: catalog }),
    /substitute different SciPy oracles on linux-x64/,
  );

  const substitutedCatalog = scipyCatalog("substituted");
  const substituted = structuredClone(records);
  substituted[0].value.artifacts = [artifactFor(
    scipyBinding(substitutedCatalog, substituted[0].value.platform.id),
    "substituted-catalog",
  )];
  assert.throws(
    () => verifyMatrixScipyOracleCoherence(substituted, { expectedCatalog: catalog }),
    /SciPy catalog is not source-current/,
  );

  const wrongDigest = structuredClone(records);
  wrongDigest[0].value.artifacts[0].content_sha256 = "f".repeat(64);
  assert.throws(
    () => verifyMatrixScipyOracleCoherence(wrongDigest, { expectedCatalog: catalog }),
    /content digest does not match source-current bytes/,
  );

  const foreignPath = structuredClone(records);
  foreignPath[0].value.artifacts[0].path = "C:\\foreign\\scipy.json";
  assert.throws(
    () => verifyMatrixScipyOracleCoherence(foreignPath, { expectedCatalog: catalog }),
    /must be repository-relative/,
  );

  const external = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-scipy-coherence-external-"));
  context.after(() => fs.rmSync(external, { recursive: true, force: true }));
  fs.writeFileSync(path.join(external, "scipy.json"), "{}\n");
  const link = path.join(temporary, "escape");
  fs.symlinkSync(external, link, process.platform === "win32" ? "junction" : "dir");
  const linked = structuredClone(records);
  linked[0].value.artifacts[0].path = path.relative(
    repositoryRoot, path.join(link, "scipy.json"),
  ).split(path.sep).join("/");
  assert.throws(
    () => verifyMatrixScipyOracleCoherence(linked, { expectedCatalog: catalog }),
    /symbolic-link path component/,
  );
});

test("browser matrix adapter rejects executable mutation after launch", (context) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-browser-mutation-test-"));
  context.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const filename = path.join(temporary, "browser");
  fs.writeFileSync(filename, "original browser bytes");
  const identity = browserExecutableIdentity(filename, "1");
  assert.deepEqual(browserAdapter._testing.authenticateBrowserExecutable(identity), identity);
  fs.appendFileSync(filename, " changed");
  assert.throws(
    () => browserAdapter._testing.authenticateBrowserExecutable(identity),
    /changed while matrix qualification executed/,
  );
});

test("matrix receipt identity rejects duplicate verified receipts", () => {
  const ids = new Set();
  supplementalInternals.addUniqueReceiptId(ids, "sha256:first");
  assert.throws(
    () => supplementalInternals.addUniqueReceiptId(ids, "sha256:first"),
    /duplicate matrix receipt sha256:first/,
  );
});

test("historical aggregation validates foreign producer tools without reopening them", () => {
  const foreign = {
    path: "C:\\qualification\\node.exe",
    version: "v26.7.0",
    sha256: "a".repeat(64),
    bytes: 42,
  };
  assert.deepEqual(
    supplementalInternals.validateExternalExecutableBinding(foreign, "foreign Node"),
    foreign,
  );
  assert.throws(
    () => supplementalInternals.validateExternalExecutableBinding(
      { ...foreign, sha256: "forged" }, "foreign Node",
    ),
    /invalid producer-authenticated identity/,
  );
  assert.throws(
    () => supplementalInternals.validateExternalExecutableBinding(
      { ...foreign, path: "relative/node" }, "foreign Node",
    ),
    /invalid producer-authenticated identity/,
  );
});

test("recomputed supplemental evidence forgeries and incomplete release inputs fail closed", () => {
  assert.throws(
    () => buildSupplementalReport(
      supplementalTemplate(), evidenceRecords(), { candidate, release: true },
    ),
    /collector must be an object|source-current repository bytes/,
  );
  const policy = compiledMatrixPolicy();
  const matrix = matrixReport(policy);
  const releaseMissing = buildSupplementalReport(
    supplementalTemplate(), [], { candidate, release: true },
  );
  assert.throws(() => buildReleaseGate({
    candidate,
    matrixReportRecord: { path: "matrix.json", sha256: "2".repeat(64), value: matrix },
    matrixPolicyRecord: { path: "policy.json", sha256: "3".repeat(64), value: policy },
    matrixTemplateRecord: canonicalTemplateRecord(),
    matrixManifestRecords: new Map(),
    matrixReceiptRecords: [],
    supplementalTemplateRecord: canonicalSupplementalTemplateRecord(),
    supplementalEvidenceRecords: [],
    supplementalReport: releaseMissing,
  }), /exactly 16 capability manifests/);

  const partial = structuredClone(policy);
  partial.rows.pop();
  assert.throws(
    () => buildReleaseGate({
      candidate,
      matrixReportRecord: { path: "matrix.json", sha256: "2".repeat(64), value: matrixReport(partial) },
      matrixPolicyRecord: { path: "policy.json", sha256: "3".repeat(64), value: partial },
      matrixTemplateRecord: canonicalTemplateRecord(),
      matrixManifestRecords: new Map(),
      matrixReceiptRecords: [],
      supplementalTemplateRecord: canonicalSupplementalTemplateRecord(),
      supplementalEvidenceRecords: [],
      supplementalReport: releaseMissing,
    }),
    /canonical full-runtime policy|compiled policy omits/,
  );
  const emptyCore = {
    ...matrix,
    policy: { ...matrix.policy, required_rows: 0 },
    rows: [],
  };
  delete emptyCore.id;
  const empty = identified(emptyCore);
  assert.throws(
    () => buildReleaseGate({
      candidate,
      matrixReportRecord: { path: "matrix.json", sha256: "2".repeat(64), value: empty },
      matrixPolicyRecord: { path: "policy.json", sha256: "3".repeat(64), value: policy },
      matrixTemplateRecord: canonicalTemplateRecord(),
      matrixManifestRecords: new Map(),
      matrixReceiptRecords: [],
      supplementalTemplateRecord: canonicalSupplementalTemplateRecord(),
      supplementalEvidenceRecords: [],
      supplementalReport: releaseMissing,
    }),
    /content ID mismatch|exact compiled full-runtime policy|exactly 16 capability manifests/,
  );
  const extraMatrix = structuredClone(matrix);
  extraMatrix.rows.push({
    row_id: "foreign-row", status: "passed", receipt: { repository_commit: candidate },
  });
  const extraCore = { ...extraMatrix };
  delete extraCore.id;
  extraMatrix.id = contentId(extraCore);
  assert.throws(
    () => buildReleaseGate({
      candidate,
      matrixReportRecord: { path: "matrix.json", sha256: "2".repeat(64), value: extraMatrix },
      matrixPolicyRecord: { path: "policy.json", sha256: "3".repeat(64), value: policy },
      matrixTemplateRecord: canonicalTemplateRecord(),
      matrixManifestRecords: new Map(),
      matrixReceiptRecords: [],
      supplementalTemplateRecord: canonicalSupplementalTemplateRecord(),
      supplementalEvidenceRecords: [],
      supplementalReport: releaseMissing,
    }),
    /exact compiled full-runtime policy|foreign row|exactly 16 capability manifests/,
  );
  const forgedTemplate = fullRuntimeTemplate();
  forgedTemplate.required_capabilities = Array(
    fullRuntimeTemplate().required_capabilities.length,
  ).fill("numerics.contracts");
  assert.throws(
    () => buildReleaseGate({
      candidate,
      matrixReportRecord: { path: "matrix.json", sha256: "2".repeat(64), value: matrix },
      matrixPolicyRecord: { path: "policy.json", sha256: "3".repeat(64), value: policy },
      matrixTemplateRecord: canonicalTemplateRecord(forgedTemplate),
      matrixManifestRecords: new Map(),
      matrixReceiptRecords: [],
      supplementalTemplateRecord: canonicalSupplementalTemplateRecord(),
      supplementalEvidenceRecords: [],
      supplementalReport: releaseMissing,
    }),
    /checked-in canonical template|source-current canonical|exactly 16 capability manifests/,
  );
  const omittedSupplemental = supplementalTemplate();
  omittedSupplemental.requirements.pop();
  assert.throws(
    () => buildSupplementalReport(omittedSupplemental, evidenceRecords(), {
      candidate, release: true,
    }),
    /canonical supplemental template/,
  );
});

test("browser artifact staging binds runtime-only modules without node_modules", (context) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-browser-stage-test-"));
  context.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const source = path.join(temporary, "source");
  fs.mkdirSync(path.join(source, "dist"), { recursive: true });
  fs.mkdirSync(path.join(source, "release"), { recursive: true });
  fs.mkdirSync(path.join(source, "node_modules"), { recursive: true });
  fs.writeFileSync(path.join(source, "package.json"), JSON.stringify({ files: ["kernel.mjs"] }));
  fs.writeFileSync(path.join(source, "kernel.mjs"), "export default 1;\n");
  fs.writeFileSync(path.join(source, "new-runtime-only.mjs"), "export default 2;\n");
  fs.writeFileSync(path.join(source, "dist", "generated.dat"), "generated\n");
  fs.writeFileSync(path.join(source, "release", "manifest.json"), "{}\n");
  fs.writeFileSync(path.join(source, "node_modules", "excluded.js"), "bad\n");
  const staged = stageBrowserArtifact(temporary, "source", "output");
  assert.equal(staged, "output");
  assert.equal(fs.existsSync(path.join(temporary, "output", "new-runtime-only.mjs")), true);
  assert.equal(fs.existsSync(path.join(temporary, "output", "dist", "generated.dat")), true);
  assert.equal(fs.existsSync(path.join(temporary, "output", "node_modules")), false);
});

test("repository inputs and nonexistent outputs reject symlinked parents", (context) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-path-boundary-test-"));
  context.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const repository = path.join(temporary, "repository");
  const external = path.join(temporary, "external-package");
  fs.mkdirSync(repository);
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, "kernel.mjs"), "export default 'external';\n");
  fs.writeFileSync(path.join(external, "package.json"), JSON.stringify({ files: ["kernel.mjs"] }));
  fs.mkdirSync(path.join(external, "dist"));
  fs.mkdirSync(path.join(external, "release"));
  const directoryLinkType = process.platform === "win32" ? "junction" : "dir";
  fs.symlinkSync(external, path.join(repository, "escape"), directoryLinkType);
  assert.throws(
    () => repositoryPath(repository, "escape/not-created/evidence.json", "escaped output"),
    /symbolic-link path component/,
  );
  assert.throws(
    () => digestPath(repository, "escape/kernel.mjs", "escaped input"),
    /symbolic-link path component/,
  );
  assert.throws(
    () => stageBrowserArtifact(repository, "escape", "staged"),
    /symbolic-link path component/,
  );
  fs.mkdirSync(path.join(repository, "nested-source", "dist"), { recursive: true });
  fs.mkdirSync(path.join(repository, "nested-source", "release"), { recursive: true });
  fs.writeFileSync(
    path.join(repository, "nested-source", "package.json"),
    JSON.stringify({ files: ["escape/kernel.mjs"] }),
  );
  fs.symlinkSync(
    external,
    path.join(repository, "nested-source", "escape"),
    directoryLinkType,
  );
  assert.throws(
    () => stageBrowserArtifact(repository, "nested-source", "nested-staged"),
    /symbolic-link path component/,
  );
  fs.mkdirSync(path.join(repository, "source", "dist"), { recursive: true });
  fs.mkdirSync(path.join(repository, "source", "release"), { recursive: true });
  fs.writeFileSync(
    path.join(repository, "source", "package.json"),
    JSON.stringify({ files: ["kernel.mjs"] }),
  );
  fs.writeFileSync(path.join(repository, "source", "kernel.mjs"), "export default 1;\n");
  fs.symlinkSync(external, path.join(repository, "output-parent"), directoryLinkType);
  assert.throws(
    () => stageBrowserArtifact(repository, "source", "output-parent/staged"),
    /symbolic-link path component/,
  );
  assert.throws(
    () => ensureEmptyIgnoredOutput("output-parent", repository),
    /symbolic-link path component/,
  );
  assert.throws(
    () => ensureEmptyIgnoredOutput("output-parent/not-created/evidence", repository),
    /symbolic-link path component/,
  );
});
