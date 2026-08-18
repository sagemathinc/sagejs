"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildEvidenceManifest,
} = require("../bench/number-field-maximal-order-final-evidence/corpus.cjs");
const {
  runManifest,
} = require("../tools/number-field-maximal-order/runner.cjs");

async function directRecord(selection, caseId) {
  const manifest = buildEvidenceManifest({
    selection,
    caseIds: [caseId],
    systemBoundaries: { sagejs: ["native-kernel"] },
    timeoutMs: 30_000,
    warmups: 0,
    samples: 1,
  });
  const report = await runManifest(manifest, {
    profile: "final",
    systems: ["sagejs"],
    timeoutMs: 30_000,
    warmups: 0,
    samples: 1,
    memoryMb: 4096,
  });
  assert.equal(report.records.length, 1);
  return report.records[0];
}

function assertExactDirectRecord(record, strategy) {
  assert.equal(record.status, "ok", record.reason);
  assert.equal(record.boundary, "native-kernel");
  assert.equal(record.verification.verified, true, record.verification.errors?.join("\n"));
  assert.equal(record.verification.checks.frozen_certificate, true);
  assert.equal(record.direct_certificate.schema,
    "sagejs.number-fields/direct-polynomial-hnf-certificate-v1");
  assert.equal(record.direct_certificate.strategy, strategy);
  assert.equal(record.direct_certificate.authenticated, true);
  assert.equal(record.direct_certificate.index, record.verification.equation_order_index);
  assert.equal(record.direct_certificate.order_discriminant,
    record.verification.field_discriminant);
  assert.equal(record.cache_identity.applicable, false);
  assert.equal(record.samples.length, 1);
  assert(Number.isFinite(record.samples[0].timing_ms));
  assert.equal(record.samples[0].stages.strategy, strategy);
}

test("direct polynomial-to-HNF evidence authenticates composite and prime support", {
  timeout: 90_000,
}, async () => {
  const composite = await directRecord("standard", "pure-bad-generator-n8-c2pow32");
  assertExactDirectRecord(composite, "authenticated-composite-analysis");
  assert.equal(
    composite.direct_certificate.proof_schema,
    "sagejs.number-fields/authenticated-composite-square-support-v1",
  );

  const prime = await directRecord("stress", "scaled-generator-wild-p2-n16");
  assertExactDirectRecord(prime, "certified-prime-resource");
  assert.equal(
    prime.direct_certificate.proof_schema,
    "sagejs.number-fields/native-order-result-v1",
  );
  assert.equal(prime.direct_certificate.supplied_primes, 1);
  assert.equal(prime.direct_certificate.resolved_primes, 1);
});
