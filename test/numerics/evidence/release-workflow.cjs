// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { contentId } = require("../../../scripts/numerical-computing/common.cjs");
const {
  authenticate,
} = require("../../../scripts/numerical-computing/qualification/authenticate-release-gate.cjs");
const {
  expectedEvidence,
  expectedRows,
} = require("../../../scripts/numerical-computing/qualification/assemble-release-gate.cjs");
const {
  parseArguments: parsePlatformArguments,
} = require("../../../scripts/numerical-computing/qualification/collect-platform.cjs");

const root = path.resolve(__dirname, "..", "..", "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const ci = read(".github/workflows/ci.yml");
const manual = read(".github/workflows/publish-validated-release.yml");
const deploy = read(".github/workflows/wasm-deploy-cloudflare.yml");
const browserCollector = read(
  "scripts/numerical-computing/qualification/collect-browser.cjs",
);
const gateAssembler = read(
  "scripts/numerical-computing/qualification/assemble-release-gate.cjs",
);
const packageJson = JSON.parse(read("package.json"));
const template = JSON.parse(read(
  "bench/numerical-computing/qualification/matrix/full-runtime.template.json",
));

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
  const core = {
    schema: "sagejs.numerical-qualification-release-gate/v1",
    candidate,
    status: "passed",
    matrix_report: {},
    matrix_receipts: Array.from({ length: 16 }, (_, index) => ({ index })),
    capability_manifests: [
      ...["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"].flatMap(
        (platform) => ["node", "npm", "sea"].map((kind) => ({ row_id: `${platform}-${kind}` })),
      ),
      ...["chromium", "firefox", "webkit", "worker"].map(
        (suffix) => ({ row_id: `linux-x64-browser-${suffix}` }),
      ),
    ],
    matrix_policy: { rows: 16 },
    matrix_template: { rows: 16 },
    supplemental_report: { rows: 5 },
    supplemental_evidence: Array.from({ length: 7 }, (_, index) => ({ index })),
    artifact_coherence: {
      cminpack_content_sha256: "1".repeat(64),
      nlopt_content_sha256: "2".repeat(64),
      linux_sea_content_sha256: "3".repeat(64),
      browser_distribution_content_sha256: "4".repeat(64),
    },
    scipy_oracle_coherence: {
      platform_bindings: [
        "linux-x64", "linux-arm64", "macos-arm64", "windows-x64",
      ].map((platform) => ({
        platform,
        subjects: Array.from({ length: platform === "linux-x64" ? 7 : 3 }, () => ({})),
      })),
    },
  };
  const gate = { ...core, id: contentId(core) };
  assert.equal(authenticate(gate, candidate), gate);
  assert.throws(
    () => authenticate({ ...gate, supplemental_evidence: gate.supplemental_evidence.slice(1) }, candidate),
    /content ID mismatch/,
  );
  assert.throws(() => authenticate(gate, "2".repeat(40)), /requested candidate/);
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
    assert.equal(expectedRows(relative).length, 16);
    assert.equal(expectedEvidence(relative).length, 7);
    fs.rmSync(path.join(directory, "platform", "linux-arm64", "linux-arm64-sea", "sea.receipt.json"));
    assert.throws(() => expectedRows(relative), /sea receipt/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
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
    /publish-release:[\s\S]*?needs:\n\s+- numerical-release-gate[\s\S]*?Restore and authenticate the mandatory numerical release gate/,
  );
  assert.doesNotMatch(ci, /merge-multiple:\s*true/);
  const gate = ci.indexOf("- name: Require the passing gate for this exact tagged candidate");
  const draft = ci.indexOf("- name: Create or update the draft GitHub release", gate);
  const npm = ci.indexOf("- name: Publish the platform and public npm packages", draft);
  assert.ok(gate >= 0 && gate < draft && draft < npm);
});

test("all publication paths require the same exact numerical gate and npm OIDC", () => {
  for (const workflow of [ci, manual]) {
    assert.match(workflow, /Numerical release qualification gate|numerical-release-gate/);
    assert.match(workflow, /id-token:\s*write/);
    assert.match(workflow, /npm publish "\$archive"/);
    assert.doesNotMatch(workflow, /secrets\.NPM_TOKEN|pnpm publish "\$archive"/);
    assert.match(workflow, /release:qualify:numerics:authenticate/);
  }
  assert.match(manual, /\.conclusion[\s\S]+success/);
  assert.match(manual, /\^\[1-9\]\[0-9\]\*\$/);
  assert.match(manual, /build\/validated-numerical-gate\/release-gate\.json/);
});

test("Cloudflare activation requires the same qualified source SHA", () => {
  assert.match(deploy, /qualification_run_id:/);
  assert.match(deploy, /\.github\/workflows\/ci\.yml/);
  assert.match(deploy, /Numerical release qualification gate/);
  assert.match(deploy, /qualification_sha[\s\S]+source_sha/);
  assert.match(deploy, /--candidate "\$SOURCE_SHA"/);
  assert.doesNotMatch(deploy, /Required legacy release job|if \[\[ "\$release_gate" == "missing" \]\]/);
});
