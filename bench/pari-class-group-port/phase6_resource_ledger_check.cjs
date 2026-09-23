#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { collect, canonical, sha256 } = require("./phase6_resource_ledger_collect.cjs");

function parseArgs(argv) {
  assert.ok(argv.length === 3, "usage: phase6_resource_ledger_check.cjs LEDGER PHASE0 AGGREGATE");
  return { ledger: argv[0], phase0: argv[1], aggregate: argv[2] };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const actual = JSON.parse(fs.readFileSync(args.ledger, "utf8"));
  const expected = collect({ phase0: args.phase0, aggregate: args.aggregate });
  assert.deepEqual(actual, expected, "ledger does not reproduce from its authoritative inputs");
  const { ledgerSha256, ...body } = actual;
  assert.equal(ledgerSha256, sha256(Buffer.from(canonical(body))));
  assert.equal(actual.currentSixteenRowAggregate.resourceTelemetry.status, "absent-by-contract");
  assert.equal(actual.ownerAndProcessMemorySeparation.compilerOwnerLogicalCapacityEvidence.classification,
    "diagnostic logical/capacity accounting; not a measured live high-water and not RSS");
  assert.equal(actual.phase0HistoricalRuntime.wholeDescendantProcessPeakRssKib.status, "unknown");
  assert.equal(actual.budgets.activeAgentHours.consumed.status, "unknown");

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-phase6-ledger-check-"));
  try {
    const mutatedAggregate = path.join(temporary, "aggregate.json");
    const aggregate = JSON.parse(fs.readFileSync(args.aggregate, "utf8"));
    aggregate.qualifiedTiming = true;
    fs.writeFileSync(mutatedAggregate, `${JSON.stringify(aggregate)}\n`);
    assert.throws(
      () => collect({ phase0: args.phase0, aggregate: mutatedAggregate }),
      /aggregate receipt identity changed/,
    );
    const mutatedPhase0 = path.join(temporary, "phase0.json");
    const phase0 = JSON.parse(fs.readFileSync(args.phase0, "utf8"));
    phase0.build.authorizedStressTier.wallSeconds += 1;
    fs.writeFileSync(mutatedPhase0, `${JSON.stringify(phase0)}\n`);
    assert.throws(
      () => collect({ phase0: mutatedPhase0, aggregate: args.aggregate }),
      /Phase-0 manifest identity changed/,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/phase6-resource-ledger-check-v1",
    ledgerSha256,
    candidateCommit: actual.scope.candidateCommit,
    aggregateRows: actual.currentSixteenRowAggregate.rows,
    phase0Stages: actual.phase0HistoricalRuntime.stages,
    mutationRejection: true,
    verified: true,
  })}\n`);
}

main();
