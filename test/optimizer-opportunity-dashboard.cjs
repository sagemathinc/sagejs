// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const {
  analyzeSources,
  dashboardJson,
  dashboardInputFiles,
  formatQuery,
  queryDashboard,
  renderMarkdown,
  inputIdentity,
  validateDashboard,
} = require("../scripts/optimizer-opportunity-dashboard.cjs");
const {
  canonicalSnapshot,
  querySnapshotDatabase,
  readSnapshotDatabase,
  validateArtifactManifest,
  validateLocalDatabase,
  writeSnapshotArtifacts,
} = require("../tools/optimizer-development/dashboard-artifacts.cjs");
const { canonicalJson } = require("../tools/optimizer-development/common.cjs");
const {
  decisionIdentity,
  functionIdentity,
  semanticRegionIdentity,
  sourceUnitIdentity,
} = require("../tools/optimizer-development/identity.cjs");

test("generated dependency trees cannot change first-party dashboard inputs", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-dashboard-inputs-"));
  try {
    const moduleDirectory = path.join(temporary, "src/lib/sagejs/numerics/backend");
    fs.mkdirSync(moduleDirectory, { recursive: true });
    fs.writeFileSync(path.join(moduleDirectory, "build.py"), "def answer():\n    return 42\n");
    const before = inputIdentity(temporary);
    for (const name of ["build", "dist", ".native", ".cache", "__pycache__", "node_modules", ".git"]) {
      const generated = path.join(moduleDirectory, name, "source/vendor/test");
      fs.mkdirSync(generated, { recursive: true });
      fs.writeFileSync(path.join(generated, "unrelated.py"), "not valid first-party Python\n");
    }
    assert.deepEqual(inputIdentity(temporary), before);
    assert.deepEqual(dashboardInputFiles(temporary), [path.join(moduleDirectory, "build.py")]);
    fs.writeFileSync(path.join(moduleDirectory, "build.py"), "def answer():\n    return 43\n");
    assert.notEqual(inputIdentity(temporary).digest, before.digest);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

function identityRange(source) {
  return {
    startLine: source.line,
    startColumn: source.column,
    endLine: source.endLine,
    endColumn: source.endColumn,
  };
}

function dashboardFunctionIdentity(record) {
  return functionIdentity({
    sourceUnitId: record.sourceUnitId,
    qualifiedName: record.qualifiedName,
    kind: record.kind,
    semanticFingerprint: record.semanticFingerprint,
    range: identityRange(record.source),
    ordinal: record.ordinal,
  });
}

function dashboardLoopIdentity(record, files) {
  const file = files.find((item) => item.id === record.sourceUnitId);
  return semanticRegionIdentity({
    functionId: record.functionId ?? file.moduleIdentity.id,
    kind: record.kind,
    semanticFingerprint: record.semanticFingerprint,
    range: identityRange(record.source),
    ordinal: record.ordinal,
  });
}

const sources = Object.freeze([
  {
    relativePath: "src/lib/dashboard_selected.py",
    source: `
def recurrence(n: int, value: float, scale: float, increment: float):
    for index in range(n):
        value = value*scale + increment
    return value
`,
  },
  {
    relativePath: "src/lib/dashboard_rejected.py",
    source: `
def quotient(n: int, value: int, divisor: int):
    for index in range(n):
        value = value // divisor
    return value
`,
  },
  {
    relativePath: "src/lib/dashboard_unrecognized.py",
    source: `
def dynamic(values):
    for value in values:
        print(value)
`,
  },
  {
    relativePath: "src/lib/dashboard_near_miss.py",
    source: `
def store(values: IntegerBuffer, n: int, value: int):
    for index in range(n):
        values[index] = value
`,
  },
].map((item) => ({
  ...item,
  filename: path.join(root, item.relativePath),
})));

async function fixture({ fixtureSources = sources, logicalRoot = root,
  automaticIdentity = false } = {}) {
  return analyzeSources({
    root: logicalRoot,
    compilerRoot: root,
    sources: fixtureSources,
    identity: automaticIdentity ? undefined : {
      digest: "0".repeat(64),
      files: fixtureSources.length,
      bytes: fixtureSources.reduce(
        (sum, item) => sum + Buffer.byteLength(item.source),
        0,
      ),
    },
  });
}

test("dashboard classifies selected, rejected, and unrecognized loops", async () => {
  const dashboard = await fixture();
  assert.deepEqual(dashboard.summary, {
    sourceFilesDiscovered: 4,
    sourceFilesCompiled: 4,
    sourceFilesFailed: 0,
    librarySourceFilesDiscovered: 4,
    librarySourceFilesCompiled: 4,
    librarySourceFilesFailed: 0,
    controlSourceFilesDiscovered: 0,
    controlSourceFilesCompiled: 0,
    controlSourceFilesFailed: 0,
    functionsCompiled: 4,
    suitableFunctions: 4,
    loopsInFunctions: 4,
    moduleScopeLoops: 0,
    selectedLoops: 1,
    rejectedLoops: 2,
    unrecognizedLoops: 1,
    optimizerDecisions: 4,
    orphanOptimizerDecisions: 0,
    oneReasonNearMisses: 1,
  });

  const byPath = new Map(dashboard.loops.map((loop) => [loop.source.path, loop]));
  const selected = byPath.get("src/lib/dashboard_selected.py");
  assert.equal(selected.status, "selected");
  assert.deepEqual(
    selected.decisions.filter((decision) => decision.selected)
      .map((decision) => decision.passId),
    ["math.strict-float-region.v1"],
  );
  assert.match(selected.suggestedContracts[0].decorator, /strict-float-region/);

  const rejected = byPath.get("src/lib/dashboard_rejected.py");
  assert.equal(rejected.status, "rejected");
  assert.deepEqual(rejected.reasonCodes, [
    "bounded-integer.unsupported-operation://",
    "bounded-integer.unsupported-operation:=",
  ]);

  const unrecognized = byPath.get("src/lib/dashboard_unrecognized.py");
  assert.equal(unrecognized.status, "unrecognized");
  assert.deepEqual(unrecognized.reasonCodes, [
    "dashboard.dynamic-call-sites",
    "dashboard.no-current-pass-claimed",
    "dashboard.no-mathematical-domain-evidence",
  ]);

  const nearMiss = byPath.get("src/lib/dashboard_near_miss.py");
  assert.deepEqual(nearMiss.reasonCodes, [
    "bounded-integer.mutable-buffer-access",
  ]);
  assert.match(nearMiss.suggestedContracts[0].decorator, /target="v8"/);
  assert.equal(dashboard.nearMisses[0].loopId, nearMiss.id);
  assert.match(
    dashboard.nearMisses[0].suggestedContract.decorator,
    /math\.bounded-integer-region\.v1.*target="v8"/,
  );
});

test("dashboard output and location queries are deterministic", async () => {
  const first = await fixture();
  const second = await fixture();
  assert.equal(dashboardJson(first), dashboardJson(second));
  assert.equal(renderMarkdown(first), renderMarkdown(second));
  assert.equal(dashboardJson(first).includes(root), false);

  const query = queryDashboard(first, "src/lib/dashboard_selected.py:3");
  assert.equal(query.loops.length, 1);
  assert.equal(query.functions[0].qualifiedName, "recurrence");
  assert.match(formatQuery(query), /selected math\.strict-float-region\.v1/);

  const exactLoop = queryDashboard(first, query.loops[0].id);
  assert.deepEqual(exactLoop.loops.map((loop) => loop.id), [query.loops[0].id]);
  const exactFunction = queryDashboard(first, query.functions[0].id);
  assert.deepEqual(exactFunction.loops.map((loop) => loop.id), [query.loops[0].id]);
  const exactDecision = queryDashboard(first, query.loops[0].decisions[0].id);
  assert.deepEqual(exactDecision.loops.map((loop) => loop.id), [query.loops[0].id]);
  assert.throws(
    () => queryDashboard(first, `sha256:${"f".repeat(64)}`),
    /no optimizer opportunity has exact identity/,
  );
  assert.throws(
    () => queryDashboard(first, "sha256:not-a-digest"),
    /64 lowercase hex digits/,
  );
});

test("canonical row snapshots round-trip through an indexed SQLite artifact", async () => {
  const dashboard = await fixture();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-opportunities-"));
  try {
    const markdown = renderMarkdown(dashboard);
    const result = writeSnapshotArtifacts({
      root: temporary,
      dashboard,
      dashboardJson: dashboardJson(dashboard),
      markdown,
      repository: "sagemathinc/sagejs",
    });
    assert.equal(result.snapshot.logicalId, canonicalSnapshot(dashboard).logicalId);
    validateArtifactManifest(result.manifest, {
      expectedInput: dashboard.inputs,
      markdown,
    });
    validateLocalDatabase(result.cachePath, result.manifest);
    const roundTrip = readSnapshotDatabase(result.cachePath);
    assert.equal(canonicalJson(roundTrip.dashboard), canonicalJson(dashboard));
    validateDashboard(roundTrip.dashboard);

    const selected = dashboard.loops.find((loop) => loop.status === "selected");
    const byLoop = querySnapshotDatabase(result.cachePath, {
      kind: "identity",
      id: selected.id,
    });
    assert.deepEqual(byLoop.loops.map((loop) => loop.id), [selected.id]);
    assert.equal(byLoop.files.length, 1);
    assert.equal(byLoop.functions.length, 1);
    const byDecision = querySnapshotDatabase(result.cachePath, {
      kind: "identity",
      id: selected.decisions[0].id,
    });
    assert.deepEqual(byDecision.loops.map((loop) => loop.id), [selected.id]);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("explicit optimizer controls have a separate inventory scope", async () => {
  const relativePath = "bench/optimizer-workloads/strict-float-control.py";
  const dashboard = await fixture({
    fixtureSources: [{
      relativePath,
      filename: path.join(root, relativePath),
      scope: "control",
      source: sources[0].source,
    }],
    automaticIdentity: true,
  });
  assert.equal(dashboard.files[0].scope, "control");
  assert.equal(dashboard.summary.librarySourceFilesDiscovered, 0);
  assert.equal(dashboard.summary.controlSourceFilesDiscovered, 1);
  assert.equal(dashboard.summary.controlSourceFilesCompiled, 1);
});

test("exact function identities remain queryable without loops", async () => {
  const relativePath = "src/lib/dashboard_no_loop.py";
  const dashboard = await fixture({
    fixtureSources: [{
      relativePath,
      filename: path.join(root, relativePath),
      source: "def constant():\n    return 5\n",
    }],
    automaticIdentity: true,
  });
  assert.equal(dashboard.functions.length, 1);
  assert.equal(dashboard.loops.length, 0);
  const query = queryDashboard(dashboard, dashboard.functions[0].id);
  assert.equal(query.functions[0].qualifiedName, "constant");
  assert.deepEqual(query.loops, []);
});

test("portable identities survive checkout relocation and distinguish duplicate syntax", async () => {
  const source = `
def duplicate(n: int, value: float, scale: float):
    for index in range(n):
        value = value*scale
    for index in range(n):
        value = value*scale
    return value
`;
  const relativePath = "src/lib/dashboard_duplicate.py";
  const relocated = async (logicalRoot) => fixture({
    logicalRoot,
    fixtureSources: [{
      relativePath,
      filename: path.join(logicalRoot, relativePath),
      source,
    }],
    automaticIdentity: true,
  });
  const first = await relocated("/tmp/sagejs-dashboard-checkout-a");
  const second = await relocated("/tmp/sagejs-dashboard-checkout-b");
  assert.equal(dashboardJson(first), dashboardJson(second));
  assert.equal(first.files[0].id, second.files[0].id);
  assert.equal(first.functions[0].id, second.functions[0].id);
  assert.deepEqual(
    first.loops.map((loop) => loop.id),
    second.loops.map((loop) => loop.id),
  );
  assert.equal(
    first.loops[0].semanticFingerprint,
    first.loops[1].semanticFingerprint,
  );
  assert.deepEqual(first.loops.map((loop) => loop.ordinal), [0, 1]);
  assert.notEqual(first.loops[0].id, first.loops[1].id);
});

test("source mutation changes identities and stale input evidence is rejected", async () => {
  const base = [{
    relativePath: "src/lib/dashboard_stale.py",
    filename: path.join(root, "src/lib/dashboard_stale.py"),
    source: "def f(n: int):\n    for i in range(n):\n        n = n + 1\n    return n\n",
  }];
  const first = await fixture({ fixtureSources: base, automaticIdentity: true });
  const changed = await fixture({
    fixtureSources: [{ ...base[0], source: `${base[0].source}\n# changed\n` }],
    automaticIdentity: true,
  });
  assert.notEqual(first.inputs.digest, changed.inputs.digest);
  assert.notEqual(first.files[0].id, changed.files[0].id);
  assert.notEqual(first.functions[0].id, changed.functions[0].id);
  assert.notEqual(first.loops[0].id, changed.loops[0].id);
  assert.throws(
    () => validateDashboard(changed, { expectedInput: first.inputs }),
    /dashboard is stale/,
  );
});

test("location queries fail closed when nested loop ranges are ambiguous", async () => {
  const source = `
def nested(n: int, value: int):
    for i in range(n):
        for j in range(n):
            value = value + i + j
    return value
`;
  const relativePath = "src/lib/dashboard_nested.py";
  const dashboard = await fixture({
    fixtureSources: [{
      relativePath,
      filename: path.join(root, relativePath),
      source,
    }],
    automaticIdentity: true,
  });
  assert.equal(dashboard.loops.length, 2);
  assert.throws(
    () => queryDashboard(dashboard, `${relativePath}:5`),
    /ambiguous optimizer opportunity location.*query an exact loop identity/,
  );
  const exact = queryDashboard(dashboard, dashboard.loops[1].id);
  assert.deepEqual(exact.loops.map((loop) => loop.id), [dashboard.loops[1].id]);
});

test("portable identities bind real production optimizer IR", async () => {
  const relativePath = "src/lib/sagejs/kernels/matrix/class_group_hnf.py";
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const dashboard = await fixture({
    fixtureSources: [{
      relativePath,
      filename: path.join(root, relativePath),
      source,
    }],
    automaticIdentity: true,
  });
  const production = dashboard.functions.find(
    (fn) => fn.qualifiedName === "resident_exact_relation_hnf_select_v2",
  );
  assert.ok(production, "expected the production resident HNF function");
  const region = dashboard.loops.find(
    (loop) => loop.functionId === production.id &&
      loop.decisions.some(
        (decision) => decision.selected &&
          decision.passId === "math.closed-ring-region.v1",
      ),
  );
  assert.ok(region, "expected the production retained-workspace loop");
  assert.equal(region.status, "selected");
  assert.deepEqual(
    region.decisions.filter((decision) => decision.selected)
      .map((decision) => decision.passId).sort(),
    ["math.closed-ring-region.v1"],
  );
  assert.match(region.id, /^sha256:[0-9a-f]{64}$/);
  assert.match(region.semanticFingerprint, /^sha256:[0-9a-f]{64}$/);
  for (const decision of region.decisions) {
    assert.equal(decision.id, decisionIdentity({
      regionId: region.id,
      passId: decision.passId,
      compilerId: dashboard.compilerIdentity.id,
    }).id);
  }
});

test("dashboard identities exactly join compiler-emitted profile identities", async () => {
  const source = `
def outer(n: int, value: int):
    adjust = lambda x: [x + offset for offset in range(2)][0]
    for i in range(n):
        for j in range(i):
            value = adjust(value + i + j)
    return value
`;
  const relativePath = "src/lib/dashboard_profile_join.py";
  const filename = path.join(root, relativePath);
  const dashboard = await fixture({
    fixtureSources: [{ relativePath, filename, source }],
    automaticIdentity: true,
  });
  const { default: createCompiler } = require("../dist/tools/compiler.js");
  const { createPythonCompilerFrontend } = require(
    "../dist/tools/python/compiler-frontend.js"
  );
  const { CompilerProfileMapCollector } = require(
    "../dist/tools/python/optimizer/profile-map.js"
  );
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(source, {
      filename,
      basedir: path.dirname(filename),
      libdir: path.join(root, "src", "lib"),
      import_dirs: [],
      for_linting: false,
      runtime_imports: true,
      exact_integer_literals: true,
      strict_python_scopes: true,
      scoped_flags: {
        dict_literals: true,
        overload_getitem: true,
        bound_methods: true,
        sequential_definitions: true,
      },
      optimization_level: "O2",
      optimization_explain: true,
      optimization_contract_policy: "diagnose",
    });
    const collector = new CompilerProfileMapCollector(source, filename, root);
    const output = new compiler.OutputStream({
      omit_baselib: true,
      beautify: true,
      source_map: collector,
      python_attributes: true,
      exact_integers: true,
    });
    ast.print(output);
    const map = collector.finish(output.get(), "sagejs-profile:///dashboard-join.js");
    assert.deepEqual(sourceUnitIdentity({
      path: dashboard.files[0].path,
      digest: dashboard.files[0].sourceDigest,
      language: "python",
    }), map.source.identity);
    assert.deepEqual(dashboard.files[0].moduleIdentity, collector.moduleIdentity);
    const profileFunctions = map.spans.filter((span) => span.category !== "loop")
      .map((span) => span.identity).sort((left, right) => left.id.localeCompare(right.id));
    const profileLoops = map.spans.filter((span) => span.category === "loop")
      .map((span) => span.identity).sort((left, right) => left.id.localeCompare(right.id));
    assert.deepEqual(
      dashboard.functions.map(dashboardFunctionIdentity)
        .sort((left, right) => left.id.localeCompare(right.id)),
      profileFunctions,
    );
    assert.equal(
      dashboardFunctionIdentity(
        dashboard.functions.find((record) => record.kind === "lambda"),
      ).kind,
      "lambda",
    );
    assert.deepEqual(
      dashboard.loops.map((loop) => dashboardLoopIdentity(loop, dashboard.files))
        .sort((left, right) => left.id.localeCompare(right.id)),
      profileLoops,
    );
  } finally {
    frontend.close();
  }
});

test("dashboard validation fails closed on incomplete evidence", async () => {
  const dashboard = await fixture();
  assert.throws(
    () => validateDashboard({
      ...dashboard,
      summary: { ...dashboard.summary, sourceFilesFailed: 1 },
    }),
    /sourceFilesFailed is inconsistent/,
  );
  assert.throws(
    () => validateDashboard({
      ...dashboard,
      loops: [...dashboard.loops, dashboard.loops[0]],
    }),
    /duplicate loop identity/,
  );
});
