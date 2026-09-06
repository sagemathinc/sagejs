"use strict";

const { createHash } = require("node:crypto");
const { lstatSync, readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

const schema = "sagejs.python-case-evidence/v1";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${Array.from(value, canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
        Object.getOwnPropertySymbols(value).length) {
      throw new Error("compatibility evidence must contain plain JSON objects");
    }
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonical(value[key])}`,
    ).join(",")}}`;
  }
  if (!["string", "number", "boolean", "object"].includes(typeof value) ||
      (typeof value === "number" && !Number.isFinite(value))) {
    throw new Error("compatibility evidence must contain finite JSON values");
  }
  return JSON.stringify(value);
}

function normalizeOutput(output) {
  // The existing conformance contract permits CRLF versus LF, and nothing else.
  return output.replace(/\r\n/g, "\n");
}

function executionBytes(execution, stream) {
  const bytes = execution.raw?.[stream] === undefined
    ? Buffer.from(execution[stream], "utf8")
    : Buffer.from(execution.raw[stream], "base64");
  // Normalize bytes, not decoded strings: invalid UTF-8 must remain distinct.
  const normalized = Buffer.allocUnsafe(bytes.length);
  let length = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 13 && bytes[index + 1] === 10) continue;
    normalized[length++] = bytes[index];
  }
  return normalized.subarray(0, length);
}

function snapshotSource(directory) {
  const files = [];
  function visit(relative) {
    const path = relative ? join(directory, ...relative.split("/")) : directory;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new Error(`source provenance rejects symlinks: ${relative || "."}`);
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(relative ? `${relative}/${name}` : name);
    } else if (stat.isFile()) {
      const bytes = readFileSync(path);
      files.push({ path: relative, sha256: sha256(bytes), bytes: bytes.length });
    } else {
      throw new Error(`source provenance rejects special files: ${relative}`);
    }
  }
  visit("");
  return { sha256: sha256(canonical(files)), files };
}

function executionIdentity(execution) {
  if (execution === null) return null;
  return {
    exitCode: execution.status,
    signal: execution.signal ?? null,
    timedOut: execution.timedOut,
    errorCode: execution.error?.code ?? null,
    errorMessage: execution.error?.message ?? null,
    outputSha256: sha256(executionBytes(execution, "output")),
    stdoutSha256: sha256(executionBytes(execution, "stdout")),
    stderrSha256: sha256(executionBytes(execution, "stderr")),
  };
}

function caseEvidence(sourceSha256, oracle, subject) {
  if (!/^[a-f0-9]{64}$/.test(sourceSha256)) throw new Error("invalid case source SHA-256");
  return {
    schema,
    sourceSha256,
    normalization: "crlf-to-lf-bytes",
    oracle: executionIdentity(oracle),
    subject: executionIdentity(subject),
  };
}

function reviewedEvidence(review) {
  return [review.evidence, ...(review.alternateEvidence ?? [])];
}

function reviewMatches(review, result, reference) {
  if (!review?.reference || review.evidence?.schema !== schema ||
      result?.evidence?.schema !== schema || !reference) return false;
  if (["pass", "intentional-incompatibility", "launch-error", "oracle-error", "timeout"].includes(result.status)) return false;
  return review.expectedStatus === result.status &&
    canonical(review.reference) === canonical({
      implementation: reference.implementation,
      version: reference.version,
    }) && reviewedEvidence(review).some((evidence) => canonical(evidence) === canonical(result.evidence));
}

function compareCaseRecord(name, expected, actual) {
  const changes = [];
  if (actual === undefined) return [`${name}: missing (baseline ${expected.status})`];
  if (expected.status !== actual.status) {
    changes.push(`${name}: ${expected.status} -> ${actual.status}`);
  }
  if (expected.rawStatus !== actual.rawStatus) {
    changes.push(`${name}: raw status ${expected.rawStatus} -> ${actual.rawStatus}`);
  }
  const accepted = expected.status === "intentional-incompatibility" &&
    actual.status === "intentional-incompatibility" &&
    (expected.reviewedEvidence ?? []).some((evidence) =>
      canonical(evidence) === canonical(actual.evidence));
  const expectedEvidence = accepted ? actual.evidence : expected.evidence;
  for (const key of ["schema", "sourceSha256", "normalization", "oracle", "subject"]) {
    if (canonical(expectedEvidence?.[key] ?? null) !== canonical(actual.evidence?.[key] ?? null)) {
      changes.push(`${name}: ${key} evidence changed`);
    }
  }
  if (!expected.evidence || expected.evidence.schema !== schema || !actual.evidence) {
    changes.push(`${name}: missing or unsupported case evidence`);
  }
  return changes;
}

module.exports = {
  schema, sha256, canonical, normalizeOutput, snapshotSource,
  executionBytes, executionIdentity, caseEvidence, reviewedEvidence, reviewMatches, compareCaseRecord,
};
