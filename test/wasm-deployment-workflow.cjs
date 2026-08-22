const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const workflowFile = path.join(root, ".github/workflows/wasm-deploy-cloudflare.yml");
const documentationFile = path.join(root, "docs/webassembly-cloudflare-deployment.md");

test("Cloudflare deployment consumes only a fully validated release artifact", async () => {
  const workflow = await readFile(workflowFile, "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /source_run_id:/);
  assert.match(workflow, /- preview\n\s+- production/);
  assert.doesNotMatch(workflow, /pull_request_target:/);
  assert.match(workflow, /\.github\/workflows\/wasm-release\.yml/);
  assert.match(workflow, /\.conclusion[^\n]+success/);

  for (const gate of [
    "Native Node oracle for the public browser corpus",
    "Clean reproducibility build a",
    "Clean reproducibility build b",
    "reproducibility",
    "Public parity (chromium)",
    "Public parity (firefox)",
    "Public parity (webkit)",
  ]) assert.match(workflow, new RegExp(gate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  assert.match(workflow, /ref: \$\{\{ steps\.source\.outputs\.sha \}\}/);
  assert.match(workflow, /git merge-base --is-ancestor "\$SOURCE_SHA" origin\/main/);
  assert.match(workflow, /gh run download "\$SOURCE_RUN_ID"[\s\S]+--name wasm-clean-build-a/);
  const receipt = workflow.indexOf("production-receipt.cjs validate");
  const stage = workflow.indexOf("website/live/scripts/stage.mjs");
  const prepare = workflow.indexOf("prepare-release.mjs");
  const upload = workflow.indexOf("upload-r2.mjs");
  const deploy = workflow.indexOf("cloudflare/wrangler-action@9acf94ace14e7dc412b076f2c5c20b8ce93c79cd");
  assert.ok(
    receipt >= 0 && receipt < stage && stage < prepare && prepare < upload && upload < deploy,
    "receipt validation, staging, preparation, and R2 upload must precede Worker activation",
  );
  assert.match(workflow, /node --test website\/live\/test\/\*\.test\.mjs/);
  assert.match(workflow, /node --test test\/wasm-deployment-workflow\.cjs/);
  assert.match(workflow, /deploy --config build\/cloudflare-deploy\/wrangler\.json/);
  assert.doesNotMatch(workflow, /pages deploy/);
  assert.match(workflow, /website\/live\/dist\n\s+if-no-files-found: error/);
  assert.match(workflow, /build\/cloudflare-deploy\/deployment\.json/);
});

test("Cloudflare deployment fails closed and checks both remote origins", async () => {
  const workflow = await readFile(workflowFile, "utf8");

  for (const required of [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_WORKER_NAME",
    "R2_BUCKET_NAME",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "SAGEJS_PUBLIC_ORIGIN",
  ]) {
    assert.match(workflow, new RegExp(`Missing(?: or invalid)? ${required}`));
  }
  assert.match(workflow, /environment:\n\s+name: sagejs-app-\$\{\{ inputs\.target \}\}/);
  assert.match(workflow, /browser-wasm-deployment\.cjs[\s\S]+\$DEPLOYMENT_URL/);
  assert.match(workflow, /--origin "\$SAGEJS_PUBLIC_ORIGIN"/);
  assert.match(workflow, /\.workers\\\.dev/);
  assert.match(workflow, /website\/live\/dist\/_headers/);
  assert.doesNotMatch(
    workflow,
    /echo[^\n]*(?:CLOUDFLARE_API_TOKEN|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY)[^\n]*>>/,
  );
});

test("deployment documentation names the non-credentialed origin and external activation boundary", async () => {
  const documentation = await readFile(documentationFile, "utf8");

  assert.match(documentation, /https:\/\/app\.sagejs\.org/);
  assert.match(documentation, /private R2 bucket/);
  assert.match(documentation, /25 MiB/);
  assert.match(documentation, /Brotli/);
  assert.match(documentation, /no authentication cookies|not covered by Cloudflare Access/);
  assert.match(documentation, /sagejs-app-preview/);
  assert.match(documentation, /sagejs-app-production/);
  assert.match(documentation, /Do not describe `app\.sagejs\.org` as deployed until/);
});
