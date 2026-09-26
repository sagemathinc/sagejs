// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  inspectClassGroupDistributionEligibility,
  requireClassGroupDistributionEligibility,
} = require("../scripts/release/class-group-distribution-eligibility.cjs");

function fixture(t, { legalConclusion = false, distributionStatus = "review-required-before-distribution" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-class-group-distribution-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "packages/class-groups/src"), { recursive: true });
  fs.mkdirSync(path.join(root, "packages/flint-wasm/release"), { recursive: true });
  fs.mkdirSync(path.join(root, "architecture"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "packages/flint-wasm/release/production-layout.json"),
    JSON.stringify({ modules: [{ id: "class-group" }] }),
  );
  fs.writeFileSync(path.join(root, "packages/class-groups/Cargo.toml"), "[package]\nname='fixture'\n");
  fs.writeFileSync(
    path.join(root, "packages/class-groups/provenance.json"),
    JSON.stringify({ legal_conclusion: legalConclusion }),
  );
  fs.writeFileSync(
    path.join(root, "architecture/native-code.json"),
    JSON.stringify({
      files: [
        {
          path: "packages/class-groups/src/core.rs",
          distribution_status: distributionStatus,
          distribution_receipt:
            distributionStatus === "reviewed-for-distribution"
              ? "packages/class-groups/distribution-receipt.json"
              : undefined,
        },
        { path: "packages/class-groups/src/qualification.rs", distribution_status: "qualification-only" },
      ],
    }),
  );
  if (distributionStatus === "reviewed-for-distribution") {
    fs.writeFileSync(
      path.join(root, "packages/class-groups/distribution-receipt.json"),
      "{}\n",
    );
  }
  return root;
}

test("an absent class-group backend does not affect older source releases", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-no-class-group-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(inspectClassGroupDistributionEligibility(root), {
    schema: "sagejs.class-groups/distribution-eligibility/v1",
    applicable: false,
    passed: true,
    failures: [],
  });
});

test("source-only class-group development is eligible only without staged reactor bytes", (t) => {
  const root = fixture(t);
  const layoutPath = path.join(root, "packages/flint-wasm/release/production-layout.json");
  fs.writeFileSync(layoutPath, JSON.stringify({ modules: [] }));
  assert.deepEqual(inspectClassGroupDistributionEligibility(root), {
    schema: "sagejs.class-groups/distribution-eligibility/v1",
    applicable: false,
    passed: true,
    failures: [],
  });
  const artifactPath = path.join(root, "packages/flint-wasm/dist/class-group-core.wasm");
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, "stale reactor");
  const report = inspectClassGroupDistributionEligibility(root);
  assert.equal(report.passed, false);
  assert.match(report.failures[0], /remains staged/);
});

test("unreviewed class-group source fails closed before release packaging", (t) => {
  const root = fixture(t);
  const report = inspectClassGroupDistributionEligibility(root);
  assert.equal(report.passed, false);
  assert.equal(report.legalConclusion, false);
  assert.deepEqual(report.pendingFiles, ["packages/class-groups/src/core.rs"]);
  assert.match(report.remedy, /human\/legal/);
  assert.throws(() => requireClassGroupDistributionEligibility(root), {
    code: "CLASS_GROUP_DISTRIBUTION_INELIGIBLE",
  });
});

test("an affirmative conclusion and reviewed source inventory admit packaging", (t) => {
  const root = fixture(t, {
    legalConclusion: true,
    distributionStatus: "reviewed-for-distribution",
  });
  const report = requireClassGroupDistributionEligibility(root);
  assert.equal(report.passed, true);
  assert.equal(report.productionFiles, 1);
  assert.deepEqual(report.pendingFiles, []);
});

test("publication and deployment gate the exact candidate after checkout", () => {
  const root = path.resolve(__dirname, "..");
  const native = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const publication = native.slice(native.indexOf("  publish-prepared:"));
  const nativeCheckout = publication.indexOf("Check out the unchanged product source");
  const nativeGate = publication.indexOf(
    "Require distribution review for the candidate's class-group backend",
  );
  const nativePublish = publication.indexOf("Publish the frozen artifact set");
  assert.ok(nativeCheckout >= 0 && nativeCheckout < nativeGate && nativeGate < nativePublish);
  assert.match(publication.slice(nativeGate, nativePublish), /working-directory: candidate/);

  const browser = fs.readFileSync(
    path.join(root, ".github/workflows/wasm-deploy-cloudflare.yml"),
    "utf8",
  );
  const browserCheckout = browser.indexOf("Check out exactly the validated source commit");
  const browserGate = browser.indexOf(
    "Require distribution review for the candidate's class-group backend",
  );
  const browserPrepare = browser.indexOf("Prepare the frozen browser artifact set");
  assert.ok(
    browserCheckout >= 0 &&
      browserCheckout < browserGate &&
      browserGate < browserPrepare,
  );
});
