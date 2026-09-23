// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const repository = resolve(__dirname, "..");
const corpusPath = resolve(
  repository,
  "test/fixtures/number-field-rust-class-group-release.json",
);
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
const nativeExecutable = process.env.SAGEJS_CLASS_GROUP_CORPUS_EXECUTABLE;
const profile = process.env.SAGEJS_CLASS_GROUP_CORPUS_PROFILE ?? "routine";
const wasmArtifact = process.env.SAGEJS_CLASS_GROUP_WASM_ARTIFACT ?? resolve(
  repository,
  "packages/class-groups/dist/class-group-core.wasm",
);
const serviceSchema = "sagejs.class-groups/service-request-v1";
let serviceRequestId = 0;

function serviceRequest(operation, payload = {}) {
  serviceRequestId += 1;
  return {
    schema: serviceSchema,
    abi: 1,
    id: `release-${serviceRequestId}`,
    operation,
    ...payload,
  };
}

function requestFor(record, overrides = {}) {
  return {
    schema: corpus.requestSchema,
    polynomialAscending: record.polynomialAscending,
    proofMode: "conditional-grh",
    resources: {
      ...corpus.resources,
      ...record.resources,
      ...overrides,
    },
  };
}

function authoritativeProjection(receipt) {
  return {
    discriminant: receipt.preparation.discriminant,
    signature: receipt.preparation.signature,
    equationOrderIndex: receipt.preparation.equationOrderIndex,
    classNumber: receipt.completion.classNumber,
    invariantFactors: receipt.completion.invariantFactors,
    unitRank: receipt.completion.unitRank,
  };
}

function assertCompleteReceipt(receipt, record) {
  assert.equal(receipt.schema, "sagejs.rust-class-group/public-cubic-e2e-receipt-v2");
  assert.equal(receipt.outcome, "complete-conditional-grh");
  assert.equal(receipt.publicComplete, true);
  assert.equal(receipt.requestedProof, "conditional-grh");
  assert.equal(receipt.usesPariInput, false);
  assert.equal(receipt.usesPreparedFixture, false);
  assert.equal(receipt.usesFieldAnswersAsInput, false);
  assert.equal(receipt.preparation.certificateVerified, true);
  assert.equal(receipt.completion.proof, "conditional-grh");
  assert.equal(receipt.completion.sealedEvidenceVerified, true);
  assert.equal(receipt.completion.arbitraryIdealClassMapRetained, true);
  assert.deepEqual(authoritativeProjection(receipt), record.expected);
}

function runNative(request) {
  const envelope = serviceRequest("open", { request });
  const result = spawnSync(nativeExecutable, [], {
    cwd: repository,
    encoding: "utf8",
    input: `${JSON.stringify(envelope)}\n`,
    maxBuffer: 32 * 1024 * 1024,
    timeout: profile === "heavy" ? 120_000 : 30_000,
  });
  assert.equal(result.error, undefined);
  let document;
  assert.doesNotThrow(() => {
    document = JSON.parse(result.stdout);
  }, `producer emitted non-JSON stdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.equal(document.schema, "sagejs.class-groups/service-response-v1");
  assert.equal(document.id, envelope.id);
  return {
    ...result,
    status: document.ok ? 0 : 1,
    response: document,
    document: document.ok
      ? document.result.completion
      : { outcome: "rejected", error: document.error.message },
  };
}

test("the committed class-group corpus is bounded, representative, and honestly labeled", () => {
  assert.equal(corpus.schema, "sagejs.class-group-release-corpus/v1");
  assert.deepEqual(corpus.evidenceStatus, {
    kind: "public-regression",
    unseenEvidence: false,
    note: "These records are committed regression data. They are not held out and must not be described as unseen qualification evidence.",
  });
  assert.equal(corpus.routine.length, 5);
  assert.equal(corpus.heavy.length, 1);
  const coverage = new Set(corpus.routine.flatMap(({ coverage }) => coverage));
  for (const required of ["trivial", "cyclic", "noncyclic", "index-prime", "large-regulator"]) {
    assert.ok(coverage.has(required), `routine corpus lacks ${required}`);
  }
  assert.equal(corpus.routine.some(({ coverage: labels }) => labels.includes("row-6")), false);
  assert.equal(corpus.heavy[0].coverage.includes("row-6"), true);
  for (const record of [...corpus.routine, ...corpus.heavy]) {
    assert.equal(record.polynomialAscending.length, 4);
    assert.equal(record.polynomialAscending[3], "1");
    assert.equal(
      record.expected.invariantFactors.reduce((product, value) => product * BigInt(value), 1n),
      BigInt(record.expected.classNumber),
    );
  }
});

test(
  `the ${profile} native corpus reproduces every exact committed output`,
  { skip: nativeExecutable ? false : "production class-group executable is absent" },
  () => {
    assert.ok(existsSync(nativeExecutable), `missing executable ${nativeExecutable}`);
    const records = profile === "heavy" ? corpus.heavy : corpus.routine;
    for (const record of records) {
      const result = runNative(requestFor(record));
      assert.equal(result.status, 0, `${record.id}: ${result.stderr}\n${result.stdout}`);
      assertCompleteReceipt(result.document, record);
    }
  },
);

test(
  "native proof and resource boundaries fail closed and do not poison a later request",
  { skip: nativeExecutable ? false : "production class-group executable is absent" },
  () => {
    const record = corpus.routine[0];
    const unconditional = requestFor(record);
    unconditional.proofMode = "unconditional";
    const rejectedProof = runNative(unconditional);
    assert.notEqual(rejectedProof.status, 0);
    assert.equal(rejectedProof.document.outcome, "rejected");
    assert.match(rejectedProof.document.error, /UnsupportedProofMode/);

    const exhausted = runNative(requestFor(record, { maximumRelations: 1 }));
    assert.notEqual(exhausted.status, 0);
    assert.equal(exhausted.document.outcome, "rejected");
    assert.equal(
      exhausted.document.error,
      'RelationCollection("ContinuationBudgetExceeded")',
    );

    const recovered = runNative(requestFor(record));
    assert.equal(recovered.status, 0);
    assertCompleteReceipt(recovered.document, record);
  },
);

test(
  "the release projection rejects a mutated authority-bearing result",
  { skip: nativeExecutable ? false : "production class-group executable is absent" },
  () => {
    const record = corpus.routine[2];
    const result = runNative(requestFor(record));
    assert.equal(result.status, 0);
    assertCompleteReceipt(result.document, record);
    const counterfeit = structuredClone(result.document);
    counterfeit.completion.classNumber = "8";
    assert.throws(() => assertCompleteReceipt(counterfeit, record));
  },
);

test(
  "native and Wasm agree on the routine authority projection when the reactor exists",
  { skip: existsSync(wasmArtifact) ? false : "production class-group Wasm reactor is absent" },
  async () => {
    const [{ instantiateClassGroupCore }, bytes] = await Promise.all([
      import(pathToFileURL(resolve(repository, "packages/flint-wasm/class-group-core-loader.mjs"))),
      Promise.resolve(new Uint8Array(readFileSync(wasmArtifact))),
    ]);
    const reactor = await instantiateClassGroupCore(bytes);
    try {
      for (const record of corpus.routine) {
        const opened = serviceRequest("open", { request: requestFor(record) });
        const response = reactor.invoke(opened);
        assert.equal(response.schema, "sagejs.class-groups/service-response-v1");
        assert.equal(response.id, opened.id);
        assert.equal(response.ok, true, JSON.stringify(response));
        const receipt = response.result.completion;
        assertCompleteReceipt(receipt, record);
        const closed = reactor.invoke(serviceRequest("close", {
          generation: response.result.generation,
          handle: response.result.handle,
        }));
        assert.equal(closed.ok, true, JSON.stringify(closed));
        if (nativeExecutable) {
          const native = runNative(requestFor(record));
          assert.equal(native.status, 0);
          assert.deepEqual(
            authoritativeProjection(receipt),
            authoritativeProjection(native.document),
          );
        }
      }
      assert.match(
        createHash("sha256").update(bytes).digest("hex"),
        /^[0-9a-f]{64}$/,
      );
    } finally {
      reactor.close();
    }
  },
);
