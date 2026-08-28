// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { createSage } = require("../../dist/tools/kernel.js");
const { pythonExecutable } = require("../../tools/python-executable.cjs");
const {
  adaptCubicProfiler,
  adaptPariEvidence,
} = require("../../bench/optimizer-machine-corpus/adapters.cjs");
const {
  detachedRegionEvidence,
} = require("../../bench/optimizer-machine-corpus/harness.cjs");
const { parseArguments } = require("../../bench/optimizer-machine-corpus/run.cjs");
const {
  CORPUS_SCHEMA,
  CORPUS_SEED,
  DOMAIN_IDS,
  buildCorpus,
  corpusFingerprint,
  expectedLines,
  parseCaseLines,
  renderCPythonProgram,
  renderSageProgram,
} = require("./corpus.cjs");

async function sessionAtLevel(level) {
  const previous = process.env.SAGEJS_OPT_LEVEL;
  process.env.SAGEJS_OPT_LEVEL = level;
  try {
    return await createSage();
  } finally {
    if (previous === undefined) delete process.env.SAGEJS_OPT_LEVEL;
    else process.env.SAGEJS_OPT_LEVEL = previous;
  }
}

test("the seeded corpus covers every machine domain and adversarial class", () => {
  const corpus = buildCorpus();
  assert.equal(corpus.schema, CORPUS_SCHEMA);
  assert.equal(corpus.seed, CORPUS_SEED);
  assert.deepEqual(corpus.domains, DOMAIN_IDS);
  assert.equal(corpus.cases.length, 25);
  assert.equal(
    corpusFingerprint(corpus),
    "aa8d03bf1eda4e238354dc61ebd6ce9a137ad6ddbebab704eb4ed831f37c372e",
  );
  const tags = new Set(corpus.cases.flatMap((item) => item.tags));
  for (const required of [
    "generated",
    "zero-trip",
    "overflow",
    "alias",
    "mutation",
    "callback",
    "shadowed-builtin",
    "signed-zero",
    "subnormal",
    "nan",
    "infinity",
    "owner-bound-view",
    "transactional-failure",
  ]) {
    assert.ok(tags.has(required), `missing adversarial tag ${required}`);
  }
  for (const domain of DOMAIN_IDS) {
    assert.equal(
      corpus.cases.filter((item) => item.domain === domain).length,
      5,
      domain,
    );
  }
});

test("the independent CPython program agrees with the JavaScript exact oracles", () => {
  const corpus = buildCorpus();
  const result = spawnSync(pythonExecutable(), ["-"], {
    encoding: "utf8",
    input: renderCPythonProgram(corpus),
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(parseCaseLines(result.stdout), expectedLines(corpus));
});

test("Sage.js O0 and O2 exactly match the held-out CPython corpus", async () => {
  const corpus = buildCorpus();
  const source = renderSageProgram(corpus);
  assert.doesNotMatch(source, /optimizer|passId|loweringId|OptimizationRoute/);
  const [o0, o2] = await Promise.all([
    sessionAtLevel("O0"),
    sessionAtLevel("O2"),
  ]);
  try {
    const [generic, optimized] = await Promise.all([
      o0.evaluate(source),
      o2.evaluate(source),
    ]);
    assert.equal(generic.stderr || "", "");
    assert.equal(optimized.stderr || "", "");
    const expected = expectedLines(corpus);
    assert.deepEqual(parseCaseLines(generic.stdout), expected);
    assert.deepEqual(parseCaseLines(optimized.stdout), expected);
  } finally {
    await Promise.all([o0.close(), o2.close()]);
  }
});

test("optimizer accounting is detached without assuming domain pass IDs", () => {
  const evidence = detachedRegionEvidence({
    regions: [
      {
        id: "region:test",
        passId: "future.machine.pass.v1",
        selected: true,
        rejectionReasons: [],
        mathematical: { domain: "test domain" },
        representation: { kind: "packed-test", materializations: 2 },
        target: {
          kind: "wasm",
          lowering: "resident batch",
          selectedCandidate: "wasm-test",
          boundaryCrossings: 1,
          copiedBytes: 64,
          candidates: [
            {
              id: "wasm-test",
              kind: "wasm",
              availability: "selected",
              rejectionReason: null,
              cost: {
                boundaryCrossings: 1,
                copiedBytes: 64,
                allocations: 1,
                materializations: 2,
                compileMilliseconds: 3,
                instantiateMilliseconds: 4,
                loadMilliseconds: 5,
                emittedBytes: 128,
              },
            },
          ],
        },
        fallbackId: "semantic:test.py:1:1",
      },
    ],
  });
  assert.deepEqual(evidence[0], {
    id: "region:test",
    pass_id: "future.machine.pass.v1",
    selected: true,
    rejection_reasons: [],
    mathematical_domain: "test domain",
    representation: "packed-test",
    target: "wasm",
    lowering: "resident batch",
    selected_candidate: "wasm-test",
    boundary_crossings: 1,
    copied_bytes: 64,
    materializations: 2,
    fallback_id: "semantic:test.py:1:1",
    candidates: [
      {
        id: "wasm-test",
        kind: "wasm",
        availability: "selected",
        rejection_reason: null,
        cost: {
          boundary_crossings: 1,
          copied_bytes: 64,
          allocations: 1,
          materializations: 2,
          compile_milliseconds: 3,
          instantiate_milliseconds: 4,
          load_milliseconds: 5,
          emitted_bytes: 128,
        },
      },
    ],
  });
});

test("origin/class-group profiler output adapts without adding nested timings", () => {
  const payload = {
    schema: "sagejs-cubic-compiler-boundaries/v1",
    optimization_level: "O2",
    kernel_target: "javascript",
    samples: 3,
    candidate_kernel_targets: [
      {
        target: "native",
        call_nanoseconds: 57_000,
        buffer_inclusive_nanoseconds: 181_000,
        metadata: [105, 364, 0, 4],
      },
      {
        target: "javascript",
        call_nanoseconds: 1_500_000,
        buffer_inclusive_nanoseconds: 1_640_000,
        metadata: [105, 364, 0, 4],
      },
    ],
    records: [
      {
        label: "3.1.588.1",
        proof: false,
        class_number: 3,
        seconds: 0.095,
        samples: [0.094, 0.095, 0.096],
        boundaries: {
          exact_relation_hnf_support: { calls: 4, seconds: 0.025 },
          packed_cubic_factor_records: { calls: 1, seconds: 0.031 },
        },
      },
    ],
  };
  const adapted = adaptCubicProfiler(`diagnostic\nRESULT ${JSON.stringify(payload)}\n`);
  assert.equal(adapted.cases[0].exact_class_number, 3);
  assert.equal(adapted.cases[0].boundaries.length, 2);
  assert.equal(adapted.cases[0].copied_bytes, null);
  assert.match(adapted.cases[0].boundary_accounting_note, /not additive/);
  assert.equal(adapted.target_evidence[1].target, "javascript");
});

test("LMFDB Sage/PARI evidence preserves exact outputs and comparison boundaries", () => {
  const adapted = adaptPariEvidence({
    schema: "sagejs.number-fields/lmfdb-class-number-benchmark-v1",
    boundary: "fresh prepared field; persistent process",
    fixture: "test/fixtures/example.json",
    samples: 5,
    proof_modes: [false, true],
    sagejs: { process_total_seconds: 2.5 },
    sage_pari: { process_total_seconds: 0.5 },
    comparisons: [
      {
        label: "3.1.588.1",
        proof: false,
        class_number: 3,
        sagejs_seconds: 0.095,
        sage_pari_seconds: 0.0018,
        ratio: 52.7777777778,
        dominant_sagejs_phase: "presentation",
        dominant_sagejs_phase_seconds: 0.031,
        sagejs_proof_status: "exact-relations-conditional-grh",
      },
    ],
    aggregate_ratio: {
      count: 1,
      geometric_mean: 52.7777777778,
      median: 52.7777777778,
      p90: 52.7777777778,
      p95: 52.7777777778,
      worst: 52.7777777778,
    },
  });
  assert.equal(adapted.status, "available");
  assert.equal(adapted.cases[0].exact_class_number, 3);
  assert.equal(adapted.cases[0].sagejs_over_sage_pari, 52.7777777778);
  assert.deepEqual(adapted.process_total_seconds, {
    sagejs: 2.5,
    sage_pari: 0.5,
  });
});

test("the benchmark CLI accepts portable paths and stable domain subsets", () => {
  assert.deepEqual(
    parseArguments([
      "--check",
      "--samples=3",
      "--compile-samples",
      "4",
      "--scale=0.1",
      "--domains=bounded-integer,packed-container",
      "--cubic-profile",
      "cubic.txt",
      "--pari-evidence=pari.json",
      "--output",
      "receipt.json",
    ]),
    {
      check: true,
      samples: 3,
      compileSamples: 4,
      scale: 0.1,
      domains: ["bounded-integer", "packed-container"],
      cubicProfile: "cubic.txt",
      pariEvidence: "pari.json",
      output: "receipt.json",
    },
  );
  assert.throws(() => parseArguments(["--surprise"]), /unknown argument/);
});
