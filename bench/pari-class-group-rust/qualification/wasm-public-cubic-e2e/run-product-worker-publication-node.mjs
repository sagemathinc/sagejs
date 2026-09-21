import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { createClassGroupCore } from "../../../../packages/flint-wasm/class-group-core.mjs";
import { installNodeWorkerHost } from "../../../../packages/flint-wasm/node-worker.mjs";

const artifactUrl = new URL("./build/public-cubic-e2e.wasm", import.meta.url);
const vectorUrl = new URL("./row6.vector.json", import.meta.url);
const outputUrl = new URL("./build/product-worker-publication-node.json", import.meta.url);
const [artifact, vectorSource] = await Promise.all([
  readFile(artifactUrl),
  readFile(vectorUrl, "utf8"),
]);
const row6Request = JSON.parse(vectorSource).request;
const cases = [
  {
    name: "small-c6",
    request: { ...structuredClone(row6Request), polynomialAscending: ["-34", "-30", "-8", "1"] },
    expectedClassNumber: "6",
    expectedInvariantFactors: ["6"],
  },
  {
    name: "row6-c2xc2",
    request: structuredClone(row6Request),
    expectedClassNumber: "4",
    expectedInvariantFactors: ["2", "2"],
  },
];
const sha256 = createHash("sha256").update(artifact).digest("hex");

installNodeWorkerHost();
const service = await createClassGroupCore({
  artifact: artifactUrl,
  receipt: { bytes: artifact.byteLength, sha256 },
});
const results = [];
try {
  for (const testCase of cases) {
    const openStarted = performance.now();
    const session = await service.open(testCase.request);
    const openMilliseconds = performance.now() - openStarted;
    assert.equal(session.openReceipt.outcome, "open");
    const completion = session.openReceipt.completion;
    assert.equal(completion.completion.classNumber, testCase.expectedClassNumber);
    assert.deepEqual(completion.completion.invariantFactors, testCase.expectedInvariantFactors);

    const publicationStarted = performance.now();
    const publication = await session.publication();
    const publicationMilliseconds = performance.now() - publicationStarted;
    const publicationBytes = Buffer.byteLength(JSON.stringify(publication));
    assert.equal(
      publication.schema,
      "sagejs.rust-class-group/public-cubic-publication-candidate-v2",
    );
    assert.equal(publication.status, "detached-replay-required-before-publication");
    assert.equal(publication.presentation.classNumber, testCase.expectedClassNumber);
    assert.deepEqual(
      publication.presentation.invariantFactors,
      testCase.expectedInvariantFactors,
    );
    assert.equal(
      publication.presentation.factorBase.length,
      completion.relations.factorBaseSize,
    );
    assert.equal(
      publication.presentation.principalRelations.length,
      completion.relations.relationCount,
    );
    assert.equal(
      publication.units.fundamentalUnits.length,
      completion.completion.unitRank,
    );
    assert.ok(publicationBytes < 16 * 1024 * 1024);
    await writeFile(
      new URL(`./build/${testCase.name}-publication-candidate.json`, import.meta.url),
      `${JSON.stringify(publication)}\n`,
    );

    results.push({
      name: testCase.name,
      polynomialAscending: testCase.request.polynomialAscending,
      classNumber: publication.presentation.classNumber,
      invariantFactors: publication.presentation.invariantFactors,
      timingsMilliseconds: { open: openMilliseconds, publication: publicationMilliseconds },
      publicationBytes,
      counts: {
        factorBase: publication.presentation.factorBase.length,
        principalRelations: publication.presentation.principalRelations.length,
        relationDependencies: publication.presentation.relationDependencies.length,
        generatorOrders: publication.presentation.generatorOrders.length,
        fundamentalUnits: publication.units.fundamentalUnits.length,
      },
    });
    await session.close();
  }
  const receipt = {
    schema: "sagejs.rust-class-group/product-worker-publication-node-v1",
    outcome: "pass-candidate-requires-detached-replay",
    artifact: { bytes: artifact.byteLength, sha256 },
    transportLimitBytes: 16 * 1024 * 1024,
    cases: results,
  };
  await writeFile(outputUrl, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await service.close();
}
