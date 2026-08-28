// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createBrowserReceipt,
  receiptIdentity,
  validateBrowserReceipt,
} = require("../tools/optimizer-development/promotion.cjs");

const digest = (digit) => digit.repeat(64);
const id = (digit) => `sha256:${digest(digit)}`;
const hex = (digit) => digit.repeat(40);

function route(selected) {
  return {
    pass_id: "math.bounded-integer-region.v1",
    selected,
    lowering: selected ? "v8-number-loop" : "generic-python",
    representation: selected ? "bounded-int53" : "python-object",
    target: selected ? "v8" : "generic",
    fallback_id: "semantic:fixture.py:1:1",
    candidates: [{
      id: selected ? "v8" : "generic",
      kind: selected ? "v8" : "generic",
      availability: "available",
      rejection_reason: null,
    }],
  };
}

function engine(engineName) {
  return {
    engine: engineName,
    version: `${engineName}-fixture-1`,
    status: "pass",
    diagnostics: {
      cross_origin_isolated: true,
      shared_array_buffer: true,
      hardware_concurrency: 4,
      user_agent: `${engineName} fixture`,
      js_heap_size_limit: engineName === "firefox" ? null : 1_000_000,
    },
    domains: [{
      domain: "bounded-integer",
      source_sha256: digest("1"),
      expected_pass_id: "math.bounded-integer-region.v1",
      status: "pass",
      o0: {
        output_sha256: digest("2"),
        stderr_sha256: digest("0"),
        routes: [route(false)],
      },
      o2: {
        output_sha256: digest("2"),
        stderr_sha256: digest("0"),
        routes: [route(true)],
      },
      resources: {
        status: "pass",
        before: 1,
        after_first: 2,
        after_second: 2,
        high_water: 2,
        ceiling: 129,
      },
    }],
    guard_fallback: {
      status: "pass",
      pass_id: "math.strict-float-region.v1",
      optimized_output_sha256: digest("3"),
      generic_output_sha256: digest("3"),
    },
    recovery: {
      status: "pass",
      interrupted: true,
      recovered_output_sha256: digest("4"),
    },
    source_sampling: {
      status: "unavailable",
      reason_code: "browser.uniform-source-sampling-unavailable",
    },
    page_errors: [],
  };
}

function fixture() {
  const source = {
    commit: hex("a"),
    tree: hex("b"),
    workspace_id: id("c"),
    clean: true,
  };
  return {
    source,
    artifact: {
      status: "verified",
      kind: "wasm-production",
      id: id("d"),
      source_commit: source.commit,
      source_closure_id: id("e"),
      manifest_sha256: digest("f"),
      receipt_sha256: digest("1"),
    },
    engines: [engine("chromium"), engine("firefox"), engine("webkit")],
  };
}

test("browser receipts authenticate exact routes, resources, fallback, and recovery", () => {
  const value = fixture();
  const first = createBrowserReceipt(value);
  const second = createBrowserReceipt(value);
  assert.deepEqual(first, second);
  assert.equal(validateBrowserReceipt(first, {
    current_checkout: value.source,
  }).valid, true);
});

test("browser receipts cannot claim source sampling or stale artifact source", () => {
  const sourceSampling = fixture();
  sourceSampling.engines[0].source_sampling = {
    status: "available",
    reason_code: "invented",
  };
  assert.throws(() => createBrowserReceipt(sourceSampling), /source_sampling/);

  const stale = fixture();
  stale.artifact.source_commit = hex("9");
  const receipt = createBrowserReceipt(stale);
  assert.throws(() => validateBrowserReceipt(receipt, {
    current_checkout: stale.source,
  }), /built from this source commit/);
});

test("browser receipt validation rejects differential and route forgery", () => {
  const value = fixture();
  const receipt = createBrowserReceipt(value);
  const forged = JSON.parse(JSON.stringify(receipt));
  forged.engines[0].domains[0].o2.output_sha256 = digest("9");
  forged.id = receiptIdentity(forged);
  assert.throws(() => validateBrowserReceipt(forged, {
    current_checkout: value.source,
  }), /failed route, differential/);
});

test("machine-domain runner exposes deterministic pure receipt helpers", async () => {
  const runner = await import(
    "../packages/flint-wasm/test/optimizer-machine-domains-browser.mjs"
  );
  const options = runner.parseArguments([
    "--engines", "webkit,chromium", "--required-engines", "webkit",
  ], {});
  assert.deepEqual(options.engines, ["webkit", "chromium"]);
  assert.deepEqual([...options.required], ["webkit"]);

  const specification = {
    domain: "bounded-integer",
    expectedPassId: "math.bounded-integer-region.v1",
  };
  const optimized = {
    stdout: "RESULT|42\nRESOURCE|1|2|2\n",
    stderr: "",
    optimization: {
      authority: "compiler-verified-static",
      program: { regions: [{
        passId: specification.expectedPassId,
        selected: true,
        target: {
          lowering: "v8-number-loop",
          kind: "v8",
          candidates: [{
            id: "v8",
            kind: "v8",
            availability: "available",
            rejectionReason: null,
          }],
        },
        representation: { kind: "bounded-int53" },
        fallbackId: "semantic:fixture.py:1:1",
      }] },
    },
  };
  const generic = JSON.parse(JSON.stringify(optimized));
  generic.optimization.program.regions[0].selected = false;
  generic.optimization.program.regions[0].target.kind = "generic";
  generic.optimization.program.regions[0].target.lowering = "generic-python";
  const evidence = runner.domainEvidence(specification, "source", optimized, generic);
  assert.equal(evidence.status, "pass");
  assert.equal(evidence.resources.high_water, 2);
});
