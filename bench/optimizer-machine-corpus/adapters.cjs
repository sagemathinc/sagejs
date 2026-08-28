"use strict";

const { readFileSync } = require("node:fs");

const CUBIC_PROFILE_SCHEMA = "sagejs-cubic-compiler-boundaries/v1";
const PARI_EVIDENCE_SCHEMA =
  "sagejs.number-fields/lmfdb-class-number-benchmark-v1";

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function finite(value, label, minimum = 0) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new TypeError(`${label} must be a finite number at least ${minimum}`);
  }
  return value;
}

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be a safe integer at least ${minimum}`);
  }
  return value;
}

function parseJsonOrPrefixedOutput(source, prefix, label) {
  if (typeof source !== "string" || source.trim() === "") {
    throw new TypeError(`${label} input must be nonempty text`);
  }
  const trimmed = source.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    const lines = trimmed.split(/\r?\n/);
    const line = lines.findLast((item) => item.startsWith(prefix));
    if (!line) throw new Error(`${label} output contains no ${prefix.trim()} payload`);
    try {
      return JSON.parse(line.slice(prefix.length));
    } catch (error) {
      throw new Error(`${label} payload is not valid JSON: ${error.message}`);
    }
  }
}

function adaptCubicProfiler(source) {
  const payload = record(
    typeof source === "string"
      ? parseJsonOrPrefixedOutput(source, "RESULT ", "cubic profiler")
      : source,
    "cubic profiler payload",
  );
  if (payload.schema !== CUBIC_PROFILE_SCHEMA) {
    throw new Error(`unsupported cubic profiler schema ${payload.schema}`);
  }
  if (!new Set(["native", "javascript"]).has(payload.kernel_target)) {
    throw new Error(`unsupported cubic profiler target ${payload.kernel_target}`);
  }
  integer(payload.samples, "cubic profiler samples", 1);
  if (!Array.isArray(payload.records) || payload.records.length === 0) {
    throw new Error("cubic profiler receipt must contain records");
  }
  const cases = payload.records.map((entry, index) => {
    record(entry, `cubic profiler record ${index}`);
    if (typeof entry.label !== "string" || entry.label === "") {
      throw new TypeError(`cubic profiler record ${index} has no label`);
    }
    if (typeof entry.proof !== "boolean") {
      throw new TypeError(`${entry.label} proof must be Boolean`);
    }
    integer(entry.class_number, `${entry.label} class number`, 1);
    finite(entry.seconds, `${entry.label} seconds`);
    if (!Array.isArray(entry.samples) || entry.samples.length !== payload.samples) {
      throw new Error(`${entry.label} sample count does not match the receipt`);
    }
    entry.samples.forEach((value, sample) =>
      finite(value, `${entry.label} sample ${sample}`));
    const boundaries = Object.entries(record(entry.boundaries, `${entry.label} boundaries`))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, evidence]) => {
        record(evidence, `${entry.label} boundary ${name}`);
        return {
          name,
          calls: integer(evidence.calls, `${entry.label} ${name} calls`),
          inclusive_seconds: finite(
            evidence.seconds,
            `${entry.label} ${name} seconds`,
          ),
        };
      });
    return {
      label: entry.label,
      proof: entry.proof,
      exact_class_number: entry.class_number,
      warm_median_seconds: entry.seconds,
      warm_samples_seconds: [...entry.samples],
      boundaries,
      boundary_accounting_note:
        "inclusive profiler boundaries may be nested and are not additive",
      copied_bytes: null,
      materializations: null,
    };
  });
  const targetEvidence = (payload.candidate_kernel_targets || []).map(
    (entry, index) => {
      record(entry, `cubic target ${index}`);
      if (!new Set(["native", "javascript"]).has(entry.target)) {
        throw new Error(`unsupported cubic target evidence ${entry.target}`);
      }
      return {
        target: entry.target,
        call_nanoseconds: finite(
          entry.call_nanoseconds,
          `${entry.target} call nanoseconds`,
        ),
        buffer_inclusive_nanoseconds: finite(
          entry.buffer_inclusive_nanoseconds,
          `${entry.target} inclusive nanoseconds`,
        ),
        exact_metadata: [...entry.metadata],
      };
    },
  );
  return {
    schema: "sagejs.optimizer-machine-evidence/cubic-profiler-adapter-v1",
    source_schema: payload.schema,
    optimization_level: payload.optimization_level,
    kernel_target: payload.kernel_target,
    samples: payload.samples,
    cases,
    target_evidence: targetEvidence,
    accounting: {
      boundary_counts: "available per named inclusive boundary",
      copied_bytes: "unavailable from the v1 profiler receipt",
      materializations: "unavailable from the v1 profiler receipt",
    },
  };
}

function adaptPariEvidence(source) {
  const payload = record(
    typeof source === "string"
      ? parseJsonOrPrefixedOutput(source, "", "Sage/PARI evidence")
      : source,
    "Sage/PARI evidence payload",
  );
  if (payload.schema !== PARI_EVIDENCE_SCHEMA) {
    throw new Error(`unsupported Sage/PARI evidence schema ${payload.schema}`);
  }
  if (!Array.isArray(payload.comparisons) || payload.comparisons.length === 0) {
    throw new Error("Sage/PARI evidence must contain comparisons");
  }
  const pariAvailable = payload.sage_pari !== null;
  const cases = payload.comparisons.map((entry, index) => {
    record(entry, `Sage/PARI comparison ${index}`);
    if (typeof entry.label !== "string" || entry.label === "") {
      throw new TypeError(`Sage/PARI comparison ${index} has no label`);
    }
    if (typeof entry.proof !== "boolean") {
      throw new TypeError(`${entry.label} proof must be Boolean`);
    }
    integer(entry.class_number, `${entry.label} class number`, 1);
    finite(entry.sagejs_seconds, `${entry.label} Sage.js seconds`);
    if (pariAvailable) {
      finite(entry.sage_pari_seconds, `${entry.label} Sage/PARI seconds`);
      finite(entry.ratio, `${entry.label} Sage.js/PARI ratio`);
    } else if (entry.sage_pari_seconds !== null || entry.ratio !== null) {
      throw new Error(`${entry.label} has PARI timing without a PARI receipt`);
    }
    return {
      label: entry.label,
      proof: entry.proof,
      exact_class_number: entry.class_number,
      sagejs_warm_seconds: entry.sagejs_seconds,
      sage_pari_warm_seconds: entry.sage_pari_seconds,
      sagejs_over_sage_pari: entry.ratio,
      dominant_sagejs_phase: entry.dominant_sagejs_phase ?? null,
      dominant_sagejs_phase_seconds:
        entry.dominant_sagejs_phase_seconds ?? null,
      sagejs_proof_status: entry.sagejs_proof_status ?? null,
    };
  });
  return {
    schema: "sagejs.optimizer-machine-evidence/pari-adapter-v1",
    source_schema: payload.schema,
    status: pariAvailable ? "available" : "unavailable",
    boundary: payload.boundary,
    fixture: payload.fixture,
    samples: payload.samples,
    proof_modes: payload.proof_modes,
    cases,
    aggregate_ratio: payload.aggregate_ratio,
    process_total_seconds: {
      sagejs: payload.sagejs?.process_total_seconds ?? null,
      sage_pari: payload.sage_pari?.process_total_seconds ?? null,
    },
  };
}

function loadCubicProfiler(filename) {
  return adaptCubicProfiler(readFileSync(filename, "utf8"));
}

function loadPariEvidence(filename) {
  return adaptPariEvidence(readFileSync(filename, "utf8"));
}

module.exports = {
  CUBIC_PROFILE_SCHEMA,
  PARI_EVIDENCE_SCHEMA,
  adaptCubicProfiler,
  adaptPariEvidence,
  loadCubicProfiler,
  loadPariEvidence,
  parseJsonOrPrefixedOutput,
};
