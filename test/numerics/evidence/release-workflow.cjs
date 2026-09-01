// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  canonicalJson,
  contentDigestPath,
  contentId,
  digestPath,
  sha256,
} = require("../../../scripts/numerical-computing/common.cjs");
const {
  authenticate,
  authenticatePublicNpmRoot,
  authenticateRebuiltGate,
} = require("../../../scripts/numerical-computing/qualification/authenticate-release-gate.cjs");
const {
  CANONICAL_INPUT,
  CANONICAL_OUTPUT,
  exactInputInventory,
  expectedEvidence,
  expectedRows,
  requireCanonicalLayout,
} = require("../../../scripts/numerical-computing/qualification/assemble-release-gate.cjs");
const {
  parseArguments: parsePlatformArguments,
} = require("../../../scripts/numerical-computing/qualification/collect-platform.cjs");
const {
  manifestBoundArtifacts,
} = require("../../../scripts/numerical-computing/qualification/prepared-artifacts.cjs");
const {
  nodeArtifactSpecifications,
} = require("../../../scripts/numerical-computing/qualification/prepare-node.cjs");
const {
  browserArtifactSpecifications,
} = require("../../../scripts/numerical-computing/qualification/prepare-browser.cjs");
const {
  PUBLISHER,
  REQUIRED_PRODUCERS,
  selectRecoveryPublisher,
} = require("../../../scripts/release/select-recovery-publisher.cjs");

const root = path.resolve(__dirname, "..", "..", "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const ci = read(".github/workflows/ci.yml");
const manual = read(".github/workflows/publish-validated-release.yml");
const deploy = read(".github/workflows/wasm-deploy-cloudflare.yml");
const browserCollector = read(
  "scripts/numerical-computing/qualification/collect-browser.cjs",
);
const platformCollector = read(
  "scripts/numerical-computing/qualification/collect-platform.cjs",
);
const browserMemoryCollector = read(
  "scripts/numerical-computing/qualification/run-browser-memory.cjs",
);
const gateAssembler = read(
  "scripts/numerical-computing/qualification/assemble-release-gate.cjs",
);
const packageJson = JSON.parse(read("package.json"));
const template = JSON.parse(read(
  "bench/numerical-computing/qualification/matrix/full-runtime.template.json",
));
const supplementalTemplate = JSON.parse(read(
  "bench/numerical-computing/qualification/matrix/supplemental-evidence.template.json",
));
const scipyCatalog = JSON.parse(read(
  "bench/numerical-computing/qualification/scipy-oracle-catalog.json",
));

function rowFiles(rowId) {
  const browser = rowId.startsWith("linux-x64-browser-");
  const directory = browser
    ? `build/numerical-qualification/browser/rows/${rowId}`
    : `build/numerical-qualification/platform/${rowId.replace(/-(node|npm|sea)$/, "")}/${rowId}`;
  const suffix = browser ? rowId.slice("linux-x64-browser-".length) : null;
  const receipt = browser
    ? suffix === "worker" ? "worker-chromium.receipt.json" : `browser-${suffix}.receipt.json`
    : `${rowId.match(/(node|npm|sea)$/)[1]}.receipt.json`;
  return { manifest: `${directory}/capabilities.json`, receipt: `${directory}/${receipt}` };
}

function validGate(candidate) {
  let serial = 0;
  const identity = (label) => contentId({ label, serial: serial++ });
  const rows = template.rows.map((row) => row.id).sort();
  const subjects = new Map(template.rows.map((row) => [row.platform, []]));
  for (const row of template.rows) {
    subjects.get(row.platform).push({
      kind: row.subject.kind,
      name: row.subject.name,
      version: ["npm", "sea"].includes(row.subject.kind) ? packageJson.version : "test-version",
      engine: row.subject.engine,
    });
  }
  for (const records of subjects.values()) {
    records.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  }
  const supplemental = [
    ["browser-memory-chromium", "sagejs.numerical-browser-memory-evidence/v1", "memory-browser-chromium/browser-chromium.memory-evidence.json"],
    ["browser-memory-firefox", "sagejs.numerical-browser-memory-evidence/v1", "memory-browser-firefox/browser-firefox.memory-evidence.json"],
    ["browser-memory-webkit", "sagejs.numerical-browser-memory-evidence/v1", "memory-browser-webkit/browser-webkit.memory-evidence.json"],
    ["browser-memory-worker", "sagejs.numerical-browser-memory-evidence/v1", "memory-worker-chromium/worker-chromium.memory-evidence.json"],
    ["native-sanitizers", "sagejs.numerical-native-sanitizer-evidence/v1", "native-sanitizers.evidence.json"],
    ["structural-performance", "sagejs.numerical-structural-performance-evidence/v1", "structural-performance.evidence.json"],
    ["wasm-destructive", "sagejs.numerical-wasm-destructive-evidence/v1", "wasm-destructive.evidence.json"],
  ];
  const core = {
    schema: "sagejs.numerical-qualification-release-gate/v1",
    candidate,
    status: "passed",
    matrix_report: {
      path: "build/numerical-qualification/gate/full-runtime.report.json",
      sha256: sha256("matrix-report"),
      id: identity("matrix-report"),
    },
    matrix_receipts: rows.map((rowId) => ({
      row_id: rowId,
      path: rowFiles(rowId).receipt,
      sha256: sha256(`receipt:${rowId}`),
      id: identity(`receipt:${rowId}`),
    })),
    capability_manifests: rows.map((rowId) => ({
      row_id: rowId,
      path: rowFiles(rowId).manifest,
      sha256: sha256(`manifest:${rowId}`),
      id: identity(`manifest:${rowId}`),
    })),
    matrix_policy: {
      path: "build/numerical-qualification/gate/full-runtime.policy.json",
      sha256: sha256("matrix-policy"),
      id: template.id,
      rows: 16,
    },
    matrix_template: {
      path: "bench/numerical-computing/qualification/matrix/full-runtime.template.json",
      sha256: sha256(Buffer.from(read(
        "bench/numerical-computing/qualification/matrix/full-runtime.template.json",
      ))),
      id: template.id,
      rows: 16,
    },
    supplemental_report: {
      id: identity("supplemental-report"),
      template_sha256: sha256(canonicalJson(supplementalTemplate)),
      rows: 5,
      requirement_ids: supplementalTemplate.requirements.map((item) => item.id).sort(),
    },
    supplemental_evidence: supplemental.map(([category, schema, suffix]) => ({
      category,
      schema,
      path: `build/numerical-qualification/browser/supplemental/${suffix}`,
      sha256: sha256(`evidence:${category}`),
      id: identity(`evidence:${category}`),
    })),
    artifact_coherence: {
      cminpack_content_sha256: sha256("cminpack"),
      nlopt_content_sha256: sha256("nlopt"),
      linux_sea_content_sha256: sha256("linux-sea"),
      browser_distribution_content_sha256: sha256("browser-dist"),
      public_npm_root_content_sha256: sha256("public-root"),
    },
    scipy_oracle_coherence: {
      catalog_id: scipyCatalog.id,
      platform_bindings: [...subjects].sort(([left], [right]) => left.localeCompare(right))
        .map(([platform, platformSubjects]) => ({
          platform,
          binding_id: identity(`scipy:${platform}`),
          subjects: platformSubjects,
        })),
    },
  };
  return { ...core, id: contentId(core) };
}

function reidentify(gate, mutate) {
  const copy = structuredClone(gate);
  mutate(copy);
  delete copy.id;
  return { ...copy, id: contentId(copy) };
}

test("checked-in qualification commands expose fail-closed production entrypoints", () => {
  assert.equal(template.rows.length, 16);
  assert.equal(new Set(template.rows.map((row) => row.id)).size, 16);
  for (const [name, filename] of [
    ["release:qualify:numerics:platform", "collect-platform.cjs"],
    ["release:qualify:numerics:browser", "collect-browser.cjs"],
    ["release:qualify:numerics:gate", "assemble-release-gate.cjs"],
  ]) {
    assert.match(packageJson.scripts[name], new RegExp(filename.replace(".", "\\.")));
    const source = read(`scripts/numerical-computing/qualification/${filename}`);
    assert.match(source, /repositoryIdentity/);
    assert.doesNotMatch(source, /--allow-dirty|--development/);
  }
  assert.match(
    packageJson.scripts["release:qualify:numerics:oracle"],
    /provision-scipy-oracle\.cjs/,
  );
  assert.match(
    packageJson.scripts["release:qualify:numerics:authenticate"],
    /authenticate-release-gate\.cjs/,
  );
});

test("publisher authentication requires an intact exact gate inventory", () => {
  const candidate = "1".repeat(40);
  const gate = validGate(candidate);
  assert.equal(authenticate(gate, candidate), gate);
  assert.throws(() => authenticate(gate, "2".repeat(40)), /requested candidate/);
  const forgeries = [
    [(value) => { value.matrix_receipts[0].path = "../receipt.json"; }, /canonical/],
    [(value) => { value.matrix_receipts[0].sha256 = "bad"; }, /SHA-256/],
    [(value) => { value.matrix_receipts[0].id = value.matrix_receipts[1].id; }, /duplicate/],
    [(value) => { value.matrix_receipts[0].row_id = value.matrix_receipts[1].row_id; }, /duplicates|omits/],
    [(value) => { value.capability_manifests[0].extra = true; }, /unexpected field inventory/],
    [(value) => { value.supplemental_evidence[0].category = value.supplemental_evidence[1].category; }, /duplicates|omits/],
    [(value) => { value.supplemental_evidence[0].schema = "foreign"; }, /wrong schema/],
    [(value) => { value.supplemental_report.requirement_ids.pop(); }, /five requirement/],
    [(value) => { value.scipy_oracle_coherence.catalog_id = contentId({ foreign: true }); }, /source-current catalog/],
    [(value) => { value.scipy_oracle_coherence.platform_bindings[0].binding_id =
      value.scipy_oracle_coherence.platform_bindings[1].binding_id; }, /binding IDs must be unique/],
    [(value) => { value.scipy_oracle_coherence.platform_bindings[0].subjects[0].name = "foreign"; }, /canonical subject/],
    [(value) => { value.scipy_oracle_coherence.platform_bindings[0].subjects[0].version = ""; }, /version must be nonempty/],
    [(value) => { value.artifact_coherence.public_npm_root_content_sha256 = "bad"; }, /SHA-256/],
  ];
  for (const [mutate, pattern] of forgeries) {
    assert.throws(() => authenticate(reidentify(gate, mutate), candidate), pattern);
  }
});

test("raw-evidence rebuild rejects valid-looking recomputed compact substitutions", () => {
  const candidate = "1".repeat(40);
  const rebuilt = validGate(candidate);
  const substitutions = [
    (value) => {
      value.matrix_receipts[0].sha256 = sha256("foreign receipt bytes");
      value.matrix_receipts[0].id = contentId({ foreign: "receipt" });
    },
    (value) => {
      value.supplemental_evidence[0].sha256 = sha256("foreign evidence bytes");
      value.supplemental_evidence[0].id = contentId({ foreign: "evidence" });
    },
    (value) => {
      value.matrix_report.sha256 = sha256("foreign matrix report bytes");
      value.matrix_report.id = contentId({ foreign: "matrix-report" });
    },
    (value) => {
      value.matrix_policy.sha256 = sha256("foreign matrix policy bytes");
    },
    (value) => {
      value.scipy_oracle_coherence.platform_bindings[0].binding_id =
        contentId({ foreign: "scipy-binding" });
    },
  ];
  for (const substitute of substitutions) {
    const forged = reidentify(rebuilt, substitute);
    assert.doesNotThrow(() => authenticate(forged, candidate));
    assert.throws(
      () => authenticateRebuiltGate(forged, rebuilt, candidate),
      /differs from the raw-evidence rebuild/,
    );
  }
});

test("publisher binds the selected public npm root bytes to all four npm rows", () => {
  fs.mkdirSync(path.join(root, "build"), { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, "build", "public-root-binding-"));
  const archive = path.join(directory, "sagejs.tgz");
  try {
    fs.writeFileSync(archive, "qualified public root");
    const relative = path.relative(root, archive).split(path.sep).join("/");
    const gate = validGate("1".repeat(40));
    gate.artifact_coherence.public_npm_root_content_sha256 = sha256("qualified public root");
    delete gate.id;
    gate.id = contentId(gate);
    assert.equal(authenticatePublicNpmRoot(gate, relative), sha256("qualified public root"));
    fs.writeFileSync(archive, "substituted public root");
    assert.throws(() => authenticatePublicNpmRoot(gate, relative), /differs from the four/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("aggregation accepts only the exact producer layout", () => {
  fs.mkdirSync(path.join(root, "build"), { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, "build", "release-wiring-layout-"));
  const relative = path.relative(root, directory).split(path.sep).join("/");
  try {
    for (const platform of ["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"]) {
      for (const kind of ["node", "npm", "sea"]) {
        const row = path.join(directory, "platform", platform, `${platform}-${kind}`);
        fs.mkdirSync(row, { recursive: true });
        fs.writeFileSync(path.join(row, "capabilities.json"), "{}\n");
        fs.writeFileSync(path.join(row, `${kind}.receipt.json`), "{}\n");
      }
    }
    for (const [suffix, receipt] of [
      ["chromium", "browser-chromium.receipt.json"],
      ["firefox", "browser-firefox.receipt.json"],
      ["webkit", "browser-webkit.receipt.json"],
      ["worker", "worker-chromium.receipt.json"],
    ]) {
      const row = path.join(directory, "browser", "rows", `linux-x64-browser-${suffix}`);
      fs.mkdirSync(row, { recursive: true });
      fs.writeFileSync(path.join(row, "capabilities.json"), "{}\n");
      fs.writeFileSync(path.join(row, receipt), "{}\n");
    }
    const supplemental = path.join(directory, "browser", "supplemental");
    for (const filename of [
      "native-sanitizers.evidence.json",
      "wasm-destructive.evidence.json",
      "structural-performance.evidence.json",
    ]) {
      fs.mkdirSync(supplemental, { recursive: true });
      fs.writeFileSync(path.join(supplemental, filename), "{}\n");
    }
    for (const [directoryName, filename] of [
      ["memory-browser-chromium", "browser-chromium.memory-evidence.json"],
      ["memory-browser-firefox", "browser-firefox.memory-evidence.json"],
      ["memory-browser-webkit", "browser-webkit.memory-evidence.json"],
      ["memory-worker-chromium", "worker-chromium.memory-evidence.json"],
    ]) {
      fs.mkdirSync(path.join(supplemental, directoryName), { recursive: true });
      fs.writeFileSync(path.join(supplemental, directoryName, filename), "{}\n");
    }
    const bindBrowserArtifact = (directory, receiptName) => {
      const artifact = path.join(directory, "browser-artifact");
      fs.mkdirSync(artifact, { recursive: true });
      fs.writeFileSync(path.join(artifact, "package.json"), "{\"name\":\"fixture\"}\n");
      const artifactRelative = path.relative(root, artifact).split(path.sep).join("/");
      const binding = {
        name: "sagejs-browser",
        ...digestPath(root, artifactRelative),
        content_sha256: contentDigestPath(root, artifactRelative),
      };
      fs.writeFileSync(path.join(directory, receiptName), JSON.stringify({ artifacts: [binding] }));
    };
    for (const [suffix, receipt] of [
      ["chromium", "browser-chromium.receipt.json"],
      ["firefox", "browser-firefox.receipt.json"],
      ["webkit", "browser-webkit.receipt.json"],
      ["worker", "worker-chromium.receipt.json"],
    ]) {
      bindBrowserArtifact(
        path.join(directory, "browser", "rows", `linux-x64-browser-${suffix}`),
        receipt,
      );
    }
    for (const [directoryName, stem] of [
      ["memory-browser-chromium", "browser-chromium"],
      ["memory-browser-firefox", "browser-firefox"],
      ["memory-browser-webkit", "browser-webkit"],
      ["memory-worker-chromium", "worker-chromium"],
    ]) {
      bindBrowserArtifact(path.join(supplemental, directoryName), `${stem}.receipt.json`);
    }
    const rows = expectedRows(relative);
    const evidence = expectedEvidence(relative);
    assert.equal(rows.length, 16);
    assert.equal(evidence.length, 7);
    assert.ok(exactInputInventory(relative, rows, evidence).length > 23);
    const foreignDirectory = path.join(directory, "browser", "supplemental", "Foreign");
    fs.mkdirSync(foreignDirectory);
    assert.throws(() => exactInputInventory(relative, rows, evidence), /foreign directory/);
    fs.rmdirSync(foreignDirectory);
    const foreignFile = path.join(directory, "foreign-duplicate.receipt.json");
    fs.writeFileSync(foreignFile, "{}\n");
    assert.throws(() => exactInputInventory(relative, rows, evidence), /foreign file/);
    fs.unlinkSync(foreignFile);
    const caseOne = path.join(directory, "browser", "rows", "case-probe");
    const caseTwo = path.join(directory, "browser", "rows", "CASE-PROBE");
    fs.mkdirSync(caseOne);
    fs.mkdirSync(caseTwo);
    assert.throws(() => exactInputInventory(relative, rows, evidence), /case-colliding paths/);
    fs.rmdirSync(caseOne);
    fs.rmdirSync(caseTwo);
    const injected = path.join(
      directory, "browser", "rows", "linux-x64-browser-chromium",
      "browser-artifact", "injected.mjs",
    );
    fs.writeFileSync(injected, "export default 1;\n");
    assert.throws(() => exactInputInventory(relative, rows, evidence), /differs from its authenticated/);
    fs.unlinkSync(injected);
    fs.rmSync(path.join(directory, "platform", "linux-arm64", "linux-arm64-sea", "sea.receipt.json"));
    assert.throws(() => expectedRows(relative), /sea receipt/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("real gate assembler is pinned to the exact reconstructible workflow layout", () => {
  assert.deepEqual(requireCanonicalLayout(CANONICAL_INPUT, CANONICAL_OUTPUT), {
    input: CANONICAL_INPUT,
    output: CANONICAL_OUTPUT,
  });
  assert.throws(
    () => requireCanonicalLayout(CANONICAL_INPUT, "build/rebuilt-numerical-gate"),
    /canonical workflow layout/,
  );
  assert.throws(
    () => requireCanonicalLayout("build/foreign-evidence", CANONICAL_OUTPUT),
    /canonical workflow layout/,
  );
  const realAssembler = spawnSync(process.execPath, [
    "scripts/numerical-computing/qualification/assemble-release-gate.cjs",
    "--candidate", "1".repeat(40),
    "--input", CANONICAL_INPUT,
    "--output", "build/rebuilt-numerical-gate",
  ], { cwd: root, encoding: "utf8" });
  assert.notEqual(realAssembler.status, 0);
  assert.match(realAssembler.stderr, /requires canonical workflow layout/);
});

test("platform collection cannot relabel subjects or omit their release artifacts", () => {
  assert.throws(
    () => parsePlatformArguments([
      "--candidate", "1".repeat(40), "--output", "build/output", "--subjects", "node,node",
    ]),
    /unique comma-separated subset/,
  );
  assert.throws(
    () => parsePlatformArguments([
      "--candidate", "1".repeat(40), "--output", "build/output", "--subjects", "npm",
    ]),
    /requires --root-archive and --platform-archive/,
  );
  assert.throws(
    () => parsePlatformArguments([
      "--candidate", "1".repeat(40), "--output", "build/output", "--subjects", "sea",
    ]),
    /requires --sea-executable/,
  );
});

test("collectors pass every manifest-bound prepared artifact to qualification", () => {
  const prepared = (artifacts) => ({
    artifacts,
    manifest: {
      bindings: {
        artifacts: artifacts.map((specification) => ({
          name: specification.slice(0, specification.indexOf("=")),
        })),
      },
    },
  });
  const nodeArtifacts = nodeArtifactSpecifications({
    artifactPath: "dist",
    cminpackArtifactPath: "packages/cminpack-wasm/cminpack.wasm",
    nloptArtifactPath: "packages/nlopt-wasm/nlopt.wasm",
    scipyOracleBindingPath: "build/node/scipy-oracle.json",
  });
  assert.deepEqual(nodeArtifacts, [
    "sagejs-dist=dist",
    "cminpack-wasm=packages/cminpack-wasm/cminpack.wasm",
    "nlopt-wasm=packages/nlopt-wasm/nlopt.wasm",
    "scipy-oracle-binding=build/node/scipy-oracle.json",
  ]);
  const browserArtifacts = browserArtifactSpecifications({
    stagedArtifactPath: "build/browser/artifact",
    cminpackArtifactPath: "packages/cminpack-wasm/cminpack.wasm",
    nloptArtifactPath: "packages/nlopt-wasm/nlopt.wasm",
    browserExecutableBindingPath: "build/browser/browser-executable.json",
    scipyOracleBindingPath: "build/browser/scipy-oracle.json",
  });
  assert.deepEqual(browserArtifacts, [
    "sagejs-browser=build/browser/artifact",
    "browser-dist=build/browser/artifact/dist",
    "cminpack-wasm=packages/cminpack-wasm/cminpack.wasm",
    "nlopt-wasm=packages/nlopt-wasm/nlopt.wasm",
    "browser-executable-binding=build/browser/browser-executable.json",
    "scipy-oracle-binding=build/browser/scipy-oracle.json",
  ]);
  assert.deepEqual(
    manifestBoundArtifacts(prepared(nodeArtifacts), "linux-x64-node"),
    nodeArtifacts,
  );
  assert.deepEqual(
    manifestBoundArtifacts(prepared(browserArtifacts), "linux-x64-browser-chromium"),
    browserArtifacts,
  );
  for (const source of [platformCollector, browserCollector]) {
    assert.match(source, /manifestBoundArtifacts\(prepared, rowId\)/);
  }
  assert.match(
    browserMemoryCollector,
    /manifestBoundArtifacts\(\s*prepared,\s*`browser memory \$\{options\.kind\}\/\$\{options\.engine\}`/,
  );
});

test("collectors fail closed when prepared artifacts differ from the manifest", () => {
  const artifacts = [
    "sagejs-browser=build/browser/artifact",
    "browser-dist=build/browser/artifact/dist",
    "cminpack-wasm=packages/cminpack-wasm/cminpack.wasm",
    "nlopt-wasm=packages/nlopt-wasm/nlopt.wasm",
    "browser-executable-binding=build/browser/browser-executable.json",
    "scipy-oracle-binding=build/browser/scipy-oracle.json",
  ];
  const manifest = {
    bindings: {
      artifacts: artifacts.map((specification) => ({
        name: specification.slice(0, specification.indexOf("=")),
      })),
    },
  };
  assert.throws(
    () => manifestBoundArtifacts({ artifacts: artifacts.slice(0, -1), manifest }, "browser"),
    /artifacts differ from its capability manifest bindings/,
  );
  assert.throws(
    () => manifestBoundArtifacts({
      artifacts: artifacts.filter((item) => !item.startsWith("browser-executable-binding=")),
      manifest,
    }, "browser"),
    /artifacts differ from its capability manifest bindings/,
  );
  assert.throws(
    () => manifestBoundArtifacts({
      artifacts: [...artifacts, "sagejs-browser=build/browser/other"],
      manifest,
    }, "browser"),
    /duplicate artifact names/,
  );
});

test("tag CI collects 12 platform and four browser rows before publication", () => {
  for (const platform of ["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"]) {
    assert.match(ci, new RegExp(`numerical-qualification-${platform}`));
    assert.match(ci, new RegExp(`platform/${platform.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
  for (const required of [
    "Numerical browser and supplemental qualification",
    "Numerical release qualification gate",
    "numerical-release-evidence",
    "release:qualify:numerics:browser",
    "release:qualify:numerics:gate",
  ]) assert.match(ci, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const required of [
    "native-sanitizers.evidence.json",
    "wasm-destructive.evidence.json",
    "structural-performance.evidence.json",
    "memory-browser-chromium",
    "memory-browser-firefox",
    "memory-browser-webkit",
    "memory-worker-chromium",
  ]) {
    assert.match(gateAssembler, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const required of [
    "run-native-sanitizers.cjs",
    "run-wasm-destructive.cjs",
    "run-browser-memory.cjs",
    "run-structural-performance.cjs",
  ]) assert.match(browserCollector, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(
    ci,
    /publish-release:[\s\S]*?needs:\n\s+- numerical-release-gate[\s\S]*?Restore the mandatory numerical release gate/,
  );
  assert.match(
    ci,
    /Restore the complete raw numerical evidence inventory[\s\S]+name: numerical-release-evidence[\s\S]+path: build\/numerical-qualification/,
  );
  assert.doesNotMatch(ci, /merge-multiple:\s*true/);
  const gate = ci.indexOf("- name: Rebuild and authenticate the gate and exact public npm root");
  const draft = ci.indexOf("- name: Create or update the draft GitHub release", gate);
  const npm = ci.indexOf("- name: Publish the platform and public npm packages", draft);
  assert.ok(gate >= 0 && gate < draft && draft < npm);
  const rawUpload = ci.slice(
    ci.indexOf("name: numerical-release-evidence"),
    ci.indexOf("retention-days: 90", ci.indexOf("name: numerical-release-evidence")),
  );
  assert.doesNotMatch(rawUpload, /numerical-qualification\/gate/);
  const gateJob = ci.slice(
    ci.indexOf("numerical-release-gate:"),
    ci.indexOf("publish-release:"),
  );
  assert.equal(
    [...gateJob.matchAll(/release:qualify:numerics:gate --/g)].length,
    2,
    "the tag gate must execute a real canonical second reconstruction",
  );
  assert.match(
    gateJob,
    /cp build\/numerical-qualification\/gate\/release-gate\.json[\s\S]+rm -rf build\/numerical-qualification\/gate[\s\S]+--output build\/numerical-qualification\/gate[\s\S]+--rebuilt-gate build\/numerical-qualification\/gate\/release-gate\.json/,
  );
});

test("one trusted workflow publishes and recovery reruns its authenticated job", () => {
  assert.match(ci, /Numerical release qualification gate|numerical-release-gate/);
  assert.match(ci, /id-token:\s*write/);
  assert.match(ci, /npm publish "\$archive"/);
  assert.doesNotMatch(ci, /secrets\.NPM_TOKEN|pnpm publish "\$archive"/);
  assert.match(
    ci,
    /release:qualify:numerics:gate[\s\S]+--input build\/numerical-qualification[\s\S]+--output build\/numerical-qualification\/gate[\s\S]+release:qualify:numerics:authenticate[\s\S]+--rebuilt-gate build\/numerical-qualification\/gate\/release-gate\.json[\s\S]+--public-npm-root release\/npm\/sagejs\.tgz/,
  );
  assert.match(ci, /recover-publish:[\s\S]+actions:\s*write/);
  assert.match(ci, /jobs\?filter=all&per_page=100/);
  assert.match(ci, /gh api --paginate --slurp/);
  assert.match(ci, /select-recovery-publisher\.cjs/);
  assert.match(ci, /actions\/jobs\/\$\{publisher_id\}\/rerun/);
  assert.match(ci, /Numerical release qualification gate/);
  assert.match(ci, /npm view "\$\{name\}@\$\{version\}" dist\.integrity --json/);
  assert.match(ci, /createHash\("sha512"\)/);
  assert.match(ci, /\[\[ "\$version" == "\$package_version" \]\]/);
  assert.match(ci, /\.head_branch \/\/ ""[\s\S]+== "\$RECOVERY_TAG"/);
  assert.doesNotMatch(manual, /npm publish|pnpm publish|id-token:\s*write/);
  assert.match(manual, /gh workflow run \.github\/workflows\/ci\.yml/);
  assert.match(manual, /recovery_run_id="\$SOURCE_RUN_ID"/);
  assert.match(manual, /recovery_tag="\$RELEASE_TAG"/);
  assert.match(manual, /\^\[1-9\]\[0-9\]\*\$/);
  const uploads = [...ci.matchAll(/uses: actions\/upload-artifact@v7[\s\S]*?with:\n([\s\S]*?)(?=\n\s{6}-|\n\s{2}\w|$)/g)];
  assert.ok(uploads.length >= 13);
  for (const upload of uploads) assert.match(upload[1], /overwrite:\s*true/);
});

test("recovery selects the latest exact job occurrence across rerun attempts", () => {
  let id = 100;
  const job = (name, runAttempt, conclusion) => ({
    id: id++, name, run_attempt: runAttempt, conclusion,
  });
  const firstPage = {
    jobs: [
      ...REQUIRED_PRODUCERS.map((name) => job(name, 1, "success")),
      job(PUBLISHER, 1, "failure"),
    ],
  };
  const secondPage = { jobs: [job(PUBLISHER, 2, "failure")] };
  const thirdPublisher = job(PUBLISHER, 3, "cancelled");
  assert.deepEqual(selectRecoveryPublisher([firstPage, secondPage, { jobs: [thirdPublisher] }]), {
    id: thirdPublisher.id,
    run_attempt: 3,
    conclusion: "cancelled",
  });

  const staleProducerSuccess = structuredClone([firstPage, secondPage]);
  staleProducerSuccess[1].jobs.push(job(REQUIRED_PRODUCERS[0], 2, "failure"));
  assert.throws(
    () => selectRecoveryPublisher(staleProducerSuccess),
    /latest source job.*attempt 2 concluded failure/,
  );

  const duplicateLatest = structuredClone([firstPage, secondPage]);
  duplicateLatest[1].jobs.push(job(PUBLISHER, 2, "cancelled"));
  assert.throws(
    () => selectRecoveryPublisher(duplicateLatest),
    /2 jobs.*latest attempt 2/,
  );

  const alreadyPublished = structuredClone([firstPage, secondPage]);
  alreadyPublished[1].jobs[0].conclusion = "success";
  assert.throws(() => selectRecoveryPublisher(alreadyPublished), /already succeeded/);
});

test("Cloudflare activation requires the same qualified source SHA", () => {
  assert.match(deploy, /qualification_run_id:/);
  assert.match(deploy, /\.github\/workflows\/ci\.yml/);
  assert.match(deploy, /Numerical release qualification gate/);
  assert.match(deploy, /qualification_sha[\s\S]+source_sha/);
  assert.match(deploy, /--candidate "\$SOURCE_SHA"/);
  assert.match(
    deploy,
    /--name numerical-release-evidence[\s\S]+release:qualify:numerics:gate[\s\S]+--output build\/numerical-qualification\/gate[\s\S]+--rebuilt-gate build\/numerical-qualification\/gate\/release-gate\.json/,
  );
  assert.doesNotMatch(deploy, /Required legacy release job|if \[\[ "\$release_gate" == "missing" \]\]/);
});
