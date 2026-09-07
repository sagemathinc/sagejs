"use strict";

// Pure output/review comparison. Callers own files, execution, and gate policy.
const {
  schema: evidenceSchema, canonical, executionBytes,
  reviewedEvidence, reviewMatches, compareCaseRecord,
} = require("./evidence.cjs");

const statusOrder = [
  "pass",
  "intentional-incompatibility",
  "output-mismatch",
  "compile-error",
  "missing-module",
  "missing-name",
  "runtime-error",
  "timeout",
  "oracle-error",
  "launch-error",
];
function firstDiagnosticLine(output) {
  return (
    output
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) || "(no diagnostic output)"
  );
}

function classifySagejs(result, expected) {
  if (result.error) {
    return {
      status: "launch-error",
      detail: result.error.message,
    };
  }
  if (result.timedOut) {
    return {
      status: "timeout",
      detail: "Sage.js exceeded the per-runtime timeout",
    };
  }
  if (result.status === 0) {
    if (executionBytes(result, "output").equals(executionBytes(expected, "output"))) {
      return { status: "pass", detail: "" };
    }
    return {
      status: "output-mismatch",
      detail: firstOutputDifference(expected.output, result.output),
    };
  }

  const diagnostic = result.output;
  let status = "runtime-error";
  if (/Failed Import: .* module doesn't exist/.test(diagnostic)) {
    status = "missing-module";
  } else if (
    /Unexpected token|invalid syntax|Invalid syntax|Expecting .* found/.test(
      diagnostic,
    )
  ) {
    status = "compile-error";
  } else if (
    /ReferenceError:|(?:^|\s)[A-Za-z_$][\w$]* is not defined/.test(diagnostic)
  ) {
    status = "missing-name";
  }
  return {
    status,
    detail: firstDiagnosticLine(diagnostic),
  };
}

function firstOutputDifference(expected, actual) {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const count = Math.max(expectedLines.length, actualLines.length);
  for (let index = 0; index < count; index += 1) {
    if (expectedLines[index] !== actualLines[index]) {
      return (
        `line ${index + 1}: expected ${JSON.stringify(expectedLines[index])}, ` +
        `got ${JSON.stringify(actualLines[index])}`
      );
    }
  }
  return "output differs";
}

function validateIntentionalIncompatibilities(document, selected) {
  if (document.format !== 2 || !document.tests) {
    throw new Error(
      "INTENTIONAL-INCOMPATIBILITIES.json must use source/outcome-bound format 2",
    );
  }
  const candidates = new Set(selected.map((test) => test.name));
  for (const [name, entry] of Object.entries(document.tests)) {
    if (!candidates.has(name)) {
      throw new Error(
        `intentional incompatibility ${name} is not a differential candidate`,
      );
    }
    if (
      !entry ||
      !statusOrder.includes(entry.expectedStatus) ||
      ["pass", "intentional-incompatibility", "launch-error", "oracle-error", "timeout"].includes(entry.expectedStatus) ||
      typeof entry.reason !== "string" ||
      !entry.reason || !entry.reference || entry.evidence?.schema !== evidenceSchema ||
      (entry.alternateEvidence !== undefined && !Array.isArray(entry.alternateEvidence))
    ) {
      throw new Error(
        `intentional incompatibility ${name} has an invalid review record`,
      );
    }
    for (const evidence of reviewedEvidence(entry)) {
      if (evidence?.schema !== evidenceSchema ||
          evidence.sourceSha256 !== entry.evidence.sourceSha256 ||
          evidence.normalization !== entry.evidence.normalization ||
          canonical(evidence.oracle) !== canonical(entry.evidence.oracle)) {
        throw new Error(`intentional incompatibility ${name} has an invalid alternate fingerprint`);
      }
    }
  }
  return document.tests;
}

function applyIntentionalIncompatibilities(results, reviewed, reference) {
  return results.map((result) => {
    const entry = reviewed[result.name];
    if (!entry || !reviewMatches(entry, result, reference)) return result;
    return {
      ...result,
      rawStatus: result.status,
      reviewedEvidence: reviewedEvidence(entry),
      status: "intentional-incompatibility",
      detail: `${entry.reason} (observed ${result.status})`,
    };
  });
}

function makeBaselineRecord(results, reference, excluded, provenance, source) {
  return {
    format: 2,
    source,
    provenance,
    reference: {
      implementation: reference.implementation,
      version: reference.version,
      majorMinor: reference.majorMinor,
    },
    selection: {
      candidates: results.length,
      excludedExpected: excluded.expected,
      excludedUnittest: excluded.unittest,
    },
    outcomes: Object.fromEntries(
      results.map((result) => [result.name, result.status]),
    ),
    rawStatuses: Object.fromEntries(
      results.map((result) => [result.name, result.rawStatus ?? result.status]),
    ),
    evidence: Object.fromEntries(
      results.map((result) => [result.name, result.reviewedEvidence?.[0] ?? result.evidence]),
    ),
    reviewedEvidence: Object.fromEntries(results
      .filter((result) => result.status === "intentional-incompatibility")
      .map((result) => [result.name, result.reviewedEvidence])),
  };
}

function compareBaselineRecord(results, reference, excluded, baseline, provenance, source) {
  if (baseline.format !== 2) {
    throw new Error(`baseline format ${baseline.format} lacks source/outcome fingerprints; use report mode and explicitly review a format-2 migration`);
  }
  if (JSON.stringify(baseline.source) !== JSON.stringify(source)) {
    throw new Error("baseline source metadata does not match SOURCE.json");
  }
  if (
    baseline.reference.implementation !== reference.implementation ||
    baseline.reference.version !== reference.version
  ) {
    throw new Error(
      `baseline uses ${baseline.reference.implementation} ` +
        `${baseline.reference.version}, but the reference is ` +
        `${reference.implementation} ${reference.version}`,
    );
  }

  const changes = [];
  if (baseline.selection.candidates !== results.length) {
    changes.push("candidate count changed");
  }
  if (canonical(baseline.provenance) !== canonical(provenance)) {
    changes.push("source/fixture/license/review provenance changed");
  }
  const current = new Map(results.map((result) => [result.name, result]));
  for (const [name, expected] of Object.entries(baseline.outcomes)) {
    const actual = current.get(name);
    changes.push(...compareCaseRecord(name, {
      status: expected, rawStatus: baseline.rawStatuses[name], evidence: baseline.evidence[name],
      reviewedEvidence: baseline.reviewedEvidence?.[name],
    }, actual && { ...actual, rawStatus: actual.rawStatus ?? actual.status }));
  }
  for (const [name, actual] of current) {
    if (!(name in baseline.outcomes)) {
      changes.push(`${name}: new test (${actual.status})`);
    }
  }

  const baselineExpected = baseline.selection.excludedExpected || [];
  const baselineUnittest = baseline.selection.excludedUnittest || [];
  if (JSON.stringify(baselineExpected) !== JSON.stringify(excluded.expected)) {
    changes.push("the set of .exp-excluded tests changed");
  }
  if (JSON.stringify(baselineUnittest) !== JSON.stringify(excluded.unittest)) {
    changes.push("the set of unittest-excluded tests changed");
  }
  return changes;
}

module.exports = {
  statusOrder, firstDiagnosticLine, classifySagejs,
  validateIntentionalIncompatibilities, applyIntentionalIncompatibilities,
  makeBaselineRecord, compareBaselineRecord,
};
