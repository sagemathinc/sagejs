#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: true

const assert = require("node:assert/strict");
const {
  COUNTER_NAMES,
  UnifiedH1DiagnosticRecorder,
  runPariWholeRootDiagnostic,
  runUnifiedH1Diagnostic,
  validateDiagnosticTrace,
} = require("./h1_unified_diagnostic_stages.cjs");

function fakeClock(offsets) {
  let cursor = 0;
  return () => {
    assert(cursor < offsets.length, "fake clock was exhausted");
    return BigInt(offsets[cursor++]);
  };
}

const stages = {
  "relation-retry": async () => ({
    value: { relations: 73 },
    counters: {
      relationAttempts: "81", acceptedRelations: "73",
      relationPrecisionRetries: "2",
    },
  }),
  "sparse-hnf-snf-transform": async outputs => {
    assert.equal(outputs["relation-retry"].relations, 73);
    return {
      value: { rank: 72 },
      counters: {
        hnfRows: "73", hnfColumns: "73", smithPivots: "72",
        transformColumns: "7",
      },
    };
  },
  "unit-regulator": async outputs => {
    assert.equal(outputs["sparse-hnf-snf-transform"].rank, 72);
    return {
      value: { unitRank: 2 },
      counters: {
        unitAttempts: "4", acceptedUnits: "2", regulatorEvaluations: "3",
        unitPrecisionRetries: "2",
      },
    };
  },
  "honesty-generators-final": async outputs => {
    assert.equal(outputs["unit-regulator"].unitRank, 2);
    return {
      value: { terminal: "correspondence-complete" },
      counters: {
        honestyChecks: "1", generatorChecks: "1", replayChecks: "1",
        publications: "1",
      },
    };
  },
};

(async () => {
  const clock = fakeClock([0, 2, 12, 14, 25, 29, 49, 52, 60, 65]);
  const result = await runUnifiedH1Diagnostic({ operations: stages, clock });
  assert.equal(
    result.outputs["honesty-generators-final"].terminal,
    "correspondence-complete",
  );
  const trace = result.diagnostic;
  assert.equal(trace.rootNanoseconds, "65");
  assert.deepEqual(trace.stageTotalsNanoseconds, {
    "relation-retry": "10",
    "sparse-hnf-snf-transform": "11",
    "unit-regulator": "20",
    "honesty-generators-final": "8",
    "unattributed-remainder": "16",
  });
  assert.equal(trace.counterTotals.acceptedRelations, "73");
  assert.equal(trace.counterTotals.smithPivots, "72");
  assert.equal(trace.counterTotals.acceptedUnits, "2");
  assert.equal(trace.counterTotals.publications, "1");
  assert.equal(validateDiagnosticTrace(trace), trace);

  const repeated = new UnifiedH1DiagnosticRecorder({
    clock: fakeClock(Array.from({ length: 20 }, (_, index) => index)),
  });
  repeated.begin();
  const repeatedStages = [
    ["relation-retry", { relationAttempts: "1" }],
    ["sparse-hnf-snf-transform", { hnfRows: "1" }],
    ["unit-regulator", { unitAttempts: "1" }],
    ["sparse-hnf-snf-transform", { smithPivots: "1" }],
    ["unit-regulator", { regulatorEvaluations: "1" }],
    ["sparse-hnf-snf-transform", { transformColumns: "1" }],
    ["unit-regulator", { acceptedUnits: "1" }],
    ["honesty-generators-final", { publications: "1" }],
  ];
  for (const [stage, counters] of repeatedStages) {
    repeated.enter(stage);
    repeated.leave(stage, counters);
  }
  const repeatedTrace = repeated.finish();
  assert.deepEqual(
    repeatedTrace.stageRecords.map(record => [record.stage, record.invocation]),
    [
      ["relation-retry", 1],
      ["sparse-hnf-snf-transform", 1],
      ["unit-regulator", 1],
      ["sparse-hnf-snf-transform", 2],
      ["unit-regulator", 2],
      ["sparse-hnf-snf-transform", 3],
      ["unit-regulator", 3],
      ["honesty-generators-final", 1],
    ],
  );
  assert.equal(
    repeatedTrace.stageTotalsNanoseconds["sparse-hnf-snf-transform"], "3",
  );
  assert.equal(repeatedTrace.stageTotalsNanoseconds["unit-regulator"], "3");
  assert.equal(validateDiagnosticTrace(repeatedTrace), repeatedTrace);

  const pari = await runPariWholeRootDiagnostic({
    operation: async () => "bnfinit-result",
    clock: fakeClock([100, 175]),
  });
  assert.equal(pari.value, "bnfinit-result");
  assert.equal(pari.diagnostic.rootNanoseconds, "75");
  assert.equal(pari.diagnostic.stageTotalsNanoseconds["unattributed-remainder"], "75");
  assert.deepEqual(pari.diagnostic.stageRecords, []);
  assert(COUNTER_NAMES.every(name => pari.diagnostic.counterTotals[name] === "0"));

  function rejected(label, mutate) {
    const changed = structuredClone(trace);
    mutate(changed);
    assert.throws(() => validateDiagnosticTrace(changed), undefined, label);
  }
  rejected("timer overlap", changed => {
    changed.segments[2].startNanoseconds = "13";
  });
  rejected("root omission", changed => {
    changed.rootNanoseconds = "66";
  });
  rejected("stage total forgery", changed => {
    changed.stageTotalsNanoseconds["unit-regulator"] = "21";
  });
  rejected("counter total forgery", changed => {
    changed.counterTotals.acceptedUnits = "3";
  });
  rejected("counter migration", changed => {
    changed.stageRecords[0].counters.unitAttempts = "1";
  });
  rejected("record time forgery", changed => {
    changed.stageRecords[1].nanoseconds = "12";
  });
  rejected("missing stage", changed => {
    changed.stageRecords.splice(2, 1);
  });
  rejected("final timing claim", changed => {
    changed.finalTimingRun = true;
  });
  rejected("qualification claim", changed => {
    changed.qualifiedTiming = true;
  });

  assert.throws(() => {
    const recorder = new UnifiedH1DiagnosticRecorder({
      clock: fakeClock([0, 1, 2]),
    });
    recorder.begin();
    recorder.enter("relation-retry");
    recorder.enter("sparse-hnf-snf-transform");
  }, /cannot nest or overlap/);
  assert.throws(() => {
    const recorder = new UnifiedH1DiagnosticRecorder({
      clock: fakeClock([0, 1, 2]),
    });
    recorder.begin();
    recorder.enter("relation-retry");
    recorder.leave("relation-retry", { unitAttempts: "1" });
  }, /cannot be charged/);
  await assert.rejects(
    runUnifiedH1Diagnostic({
      operations: { ...stages, "unit-regulator": async () => ({ value: 0, counters: {} }) },
      clock: fakeClock([0, 1, 2, 3, 4, 5]),
    }),
    /did not publish a work counter/,
  );

  const pariForgery = structuredClone(pari.diagnostic);
  pariForgery.stageTotalsNanoseconds["relation-retry"] = "75";
  pariForgery.stageTotalsNanoseconds["unattributed-remainder"] = "0";
  pariForgery.segments[0].stage = "relation-retry";
  assert.throws(() => validateDiagnosticTrace(pariForgery), /claimed named-stage time/);

  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/unified-h1-diagnostic-stage-check-v1",
    rootNanoseconds: trace.rootNanoseconds,
    namedNanoseconds: "49",
    residualNanoseconds: "16",
    counterCount: COUNTER_NAMES.length,
    negativeCases: 13,
    repeatedVisitCount: repeatedTrace.stageRecords.length,
    pariWholeRootOnly: true,
    finalTimingRun: false,
  }, null, 2));
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
