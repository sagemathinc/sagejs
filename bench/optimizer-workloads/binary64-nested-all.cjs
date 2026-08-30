#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { pythonExecutable } = require("../../tools/python-executable.cjs");
const {
  attachIdentity,
  canonicalJson,
  sha256,
  verifyDocumentIdentity,
} = require("../../tools/optimizer-development/common.cjs");
const {
  requireCurrentBuild,
} = require("../../tools/optimizer-development/workloads.cjs");
const {
  validateWorkload,
} = require("../../tools/optimizer-development/schemas.cjs");

const SCHEMA = "sagejs.campaign1-binary64-nested-all-feasibility/v1";
const PROFILE_SOURCE = "bench/optimizer-workloads/binary64-nested-all.py";
const PUBLIC_SOURCE = "src/lib/sagejs/plotting/grid_sampling.py";
const SOURCE_PATHS = Object.freeze([PROFILE_SOURCE, PUBLIC_SOURCE]);
const STANDARD_SCALAR_POINTS = 400;
const STANDARD_VECTOR_POINTS = 100;
const STANDARD_SAMPLES = 11;
const STANDARD_WARMUPS = 3;
const ORDER = Object.freeze(["AB", "BA", "BA", "AB"]);
const OUTPUT_PREFIX = "BINARY64_NESTED_ALL|";
const HELPER_START = "# BEGIN CAMPAIGN1 CHECKED NESTED BINARY64 ALL";
const HELPER_END = "# END CAMPAIGN1 CHECKED NESTED BINARY64 ALL";

const SCALAR_EXPRESSION = `if numeric_values is not None and all(
            math.isfinite(value) for row in numeric_values for value in row
        ):`;
const SCALAR_REPLACEMENT = `if numeric_values is not None and _campaign1_checked_nested_binary64_all(
            numeric_values, all, math.isfinite, False
        ):`;
const DIRECT_V8_SCALAR_REPLACEMENT = `if numeric_values is not None and _campaign1_direct_v8_nested_binary64_all(
            numeric_values, all, math.isfinite, False
        ):`;
const VECTOR_EXPRESSION = `if numeric_pairs is not None and all(
            math.isfinite(pair[0]) and math.isfinite(pair[1])
            for row in numeric_pairs
            for pair in row
        ):`;
const VECTOR_REPLACEMENT = `if numeric_pairs is not None and _campaign1_checked_nested_binary64_all(
            numeric_pairs, all, math.isfinite, True
        ):`;
const DIRECT_V8_VECTOR_REPLACEMENT = `if numeric_pairs is not None and _campaign1_direct_v8_nested_binary64_all(
            numeric_pairs, all, math.isfinite, True
        ):`;
const FLOAT_MATERIALIZATION_EXPRESSION =
  "numeric_values = [[float(value) for value in row] for row in raw_values]";
const FLOAT_MATERIALIZATION_REPLACEMENT = `numeric_values = _campaign1_checked_binary64_float_matrix(
                raw_values, float
            )`;

function occurrences(source, needle) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(needle, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + needle.length;
  }
}

function helperSource(profileSource) {
  const start = profileSource.indexOf(HELPER_START);
  const end = profileSource.indexOf(HELPER_END);
  assert.ok(start >= 0 && end > start, "checked-target source markers are missing");
  assert.equal(profileSource.indexOf(HELPER_START, start + 1), -1);
  assert.equal(profileSource.indexOf(HELPER_END, end + 1), -1);
  return profileSource.slice(start, end + HELPER_END.length);
}

function deriveCandidateSource(publicSource, profileSource) {
  assert.equal(
    occurrences(publicSource, SCALAR_EXPRESSION),
    1,
    "the public scalar reduction source changed",
  );
  assert.equal(
    occurrences(publicSource, VECTOR_EXPRESSION),
    1,
    "the public vector reduction source changed",
  );
  const transformed = publicSource
    .replace(SCALAR_EXPRESSION, SCALAR_REPLACEMENT)
    .replace(VECTOR_EXPRESSION, VECTOR_REPLACEMENT);
  assert.equal(occurrences(transformed, SCALAR_EXPRESSION), 0);
  assert.equal(occurrences(transformed, VECTOR_EXPRESSION), 0);
  assert.equal(occurrences(transformed, SCALAR_REPLACEMENT), 1);
  assert.equal(occurrences(transformed, VECTOR_REPLACEMENT), 1);
  return `${transformed.trimEnd()}\n\n${helperSource(profileSource)}\n`;
}

function deriveDirectV8Source(publicSource, profileSource) {
  assert.equal(
    occurrences(publicSource, SCALAR_EXPRESSION),
    1,
    "the public scalar reduction source changed",
  );
  assert.equal(
    occurrences(publicSource, VECTOR_EXPRESSION),
    1,
    "the public vector reduction source changed",
  );
  const transformed = publicSource
    .replace(SCALAR_EXPRESSION, DIRECT_V8_SCALAR_REPLACEMENT)
    .replace(VECTOR_EXPRESSION, DIRECT_V8_VECTOR_REPLACEMENT);
  assert.equal(occurrences(transformed, SCALAR_EXPRESSION), 0);
  assert.equal(occurrences(transformed, VECTOR_EXPRESSION), 0);
  assert.equal(occurrences(transformed, DIRECT_V8_SCALAR_REPLACEMENT), 1);
  assert.equal(occurrences(transformed, DIRECT_V8_VECTOR_REPLACEMENT), 1);
  return `${transformed.trimEnd()}\n\n${helperSource(profileSource)}\n`;
}

function deriveFloatMaterializationSource(publicSource, profileSource) {
  assert.equal(
    occurrences(publicSource, FLOAT_MATERIALIZATION_EXPRESSION),
    1,
    "the public scalar float materialization source changed",
  );
  const transformed = publicSource.replace(
    FLOAT_MATERIALIZATION_EXPRESSION,
    FLOAT_MATERIALIZATION_REPLACEMENT,
  );
  assert.equal(occurrences(transformed, FLOAT_MATERIALIZATION_EXPRESSION), 0);
  assert.equal(occurrences(transformed, FLOAT_MATERIALIZATION_REPLACEMENT), 1);
  return `${transformed.trimEnd()}\n\n${helperSource(profileSource)}\n`;
}

function expectedOrder(index) {
  return ORDER[index % ORDER.length];
}

function median(values) {
  assert.ok(values.length > 0, "median requires observations");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function distribution(values) {
  return {
    unit: "nanoseconds",
    samples: values,
    minimum: Math.min(...values),
    median: median(values),
    maximum: Math.max(...values),
  };
}

function buildPairedComparison({ phase, samples, baseline, candidate, digest }) {
  const rawPairs = [];
  for (let index = 0; index < samples; index += 1) {
    const order = expectedOrder(index);
    let baselineResult;
    let candidateResult;
    if (order === "AB") {
      baselineResult = baseline();
      candidateResult = candidate();
    } else {
      candidateResult = candidate();
      baselineResult = baseline();
    }
    assert.equal(baselineResult.digest, digest, `${phase} baseline digest`);
    assert.equal(candidateResult.digest, digest, `${phase} candidate digest`);
    rawPairs.push({
      index,
      order,
      baselineNanoseconds: baselineResult.nanoseconds,
      candidateNanoseconds: candidateResult.nanoseconds,
      baselineCompleteOutputDigest: baselineResult.digest,
      candidateCompleteOutputDigest: candidateResult.digest,
    });
  }
  const baselineSamples = rawPairs.map((pair) => pair.baselineNanoseconds);
  const candidateSamples = rawPairs.map((pair) => pair.candidateNanoseconds);
  return {
    phase,
    measurementScope: "complete-public-call",
    inclusive: true,
    rawPairs,
    baseline: distribution(baselineSamples),
    candidate: distribution(candidateSamples),
    medianRatioBaselineOverCandidate:
      median(baselineSamples) / median(candidateSamples),
    opportunityEvidencePairs: rawPairs.map((pair) => ({
      order: pair.order,
      baselineMicroseconds: Math.max(
        1,
        Math.round(pair.baselineNanoseconds / 1_000),
      ),
      feasibleLowerBoundMicroseconds: Math.max(
        1,
        Math.round(pair.candidateNanoseconds / 1_000),
      ),
      baselineOutputDigest: pair.baselineCompleteOutputDigest,
      feasibleOutputDigest: pair.candidateCompleteOutputDigest,
    })),
  };
}

function cpythonOracleProgram(scalarPoints, vectorPoints) {
  return `import hashlib
import json
import math

def digest(value):
    payload = json.dumps(value, allow_nan=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def grid(points):
    values = [float(index) for index in range(points)]
    return {
        "x": list(values),
        "y": list(values),
        "shape": [points, points],
        "ranges": {"x": [0.0, float(points - 1)], "y": [0.0, float(points - 1)]},
        "range_variables": {"x": None, "y": None},
        "spacing": [1.0, 1.0],
        "sample_count": points * points,
    }

scalar_points = ${scalarPoints}
scalar = grid(scalar_points)
scalar_values = [
    [float(x_value + 2.0 * y_value) for x_value in scalar["x"]]
    for y_value in scalar["y"]
]
scalar.update({
    "z": scalar_values,
    "finite_mask": [[True] * scalar_points for _ in range(scalar_points)],
    "value_bounds": [0.0, float(3 * (scalar_points - 1))],
    "sampling": {"finite_count": scalar_points * scalar_points, "masked_count": 0, "masked_reasons": {}},
})

vector_points = ${vectorPoints}
vector = grid(vector_points)
u_values = [[float(x_value + 0.25) for x_value in vector["x"]] for _ in vector["y"]]
v_values = [[0.0 for _ in vector["x"]] for _ in vector["y"]]
magnitudes = [[math.hypot(u_value, v_value) for u_value, v_value in zip(u_row, v_row)] for u_row, v_row in zip(u_values, v_values)]
vector.update({
    "u": u_values,
    "v": v_values,
    "magnitude": magnitudes,
    "finite_mask": [[True] * vector_points for _ in range(vector_points)],
    "maximum_magnitude": float(vector_points - 1) + 0.25,
    "sampling": {"finite_count": vector_points * vector_points, "masked_count": 0, "masked_reasons": {}},
})

print(json.dumps({
    "scalar": {"digest": digest(scalar), "shape": scalar["shape"], "bounds": scalar["value_bounds"]},
    "vector": {"digest": digest(vector), "shape": vector["shape"], "maximum_magnitude": vector["maximum_magnitude"]},
}, sort_keys=True, separators=(",", ":")))
`;
}

function independentCpythonOracle(scalarPoints, vectorPoints, options = {}) {
  const spawn = options.spawn ?? spawnSync;
  const executable = pythonExecutable();
  const result = spawn(executable, ["-"], {
    encoding: "utf8",
    input: cpythonOracleProgram(scalarPoints, vectorPoints),
    maxBuffer: 8 * 1024 * 1024,
    timeout: options.timeoutMilliseconds ?? 120_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `independent CPython grid oracle failed: ${result.error?.message || result.stderr || result.stdout}`,
    );
  }
  return {
    executable,
    method:
      "independent construction of every public scalar/vector result field followed by canonical JSON SHA-256",
    ...JSON.parse(result.stdout),
  };
}

function oracleEvidence(oracle) {
  return {
    scalarCompleteOutputDigest: oracle.scalar.digest,
    vectorCompleteOutputDigest: oracle.vector.digest,
  };
}

function workloadCatalogEntry(oracle) {
  const value = {
    encoding: "canonical JSON SHA-256 of every published scalar/vector grid field",
    expected: oracleEvidence(oracle),
    fixture: null,
    input: {
      scalar: {
        field: "float(x + 2*y)",
        plotPoints: [STANDARD_SCALAR_POINTS, STANDARD_SCALAR_POINTS],
        ranges: [[0, STANDARD_SCALAR_POINTS - 1], [0, STANDARD_SCALAR_POINTS - 1]],
      },
      vector: {
        fields: ["float(x + 0.25)", "0.0"],
        plotPoints: [STANDARD_VECTOR_POINTS, STANDARD_VECTOR_POINTS],
        ranges: [[0, STANDARD_VECTOR_POINTS - 1], [0, STANDARD_VECTOR_POINTS - 1]],
      },
    },
    mode: "binary64-nested-all",
    oracleContract: {
      scalarCompleteOutputDigest: oracle.scalar.digest,
      vectorCompleteOutputDigest: oracle.vector.digest,
    },
    policy: {
      compilerRouteClaim: "none-feasibility-evidence-only",
      pairing: "repeating-AB-BA-BA-AB",
      primary: "scalar-grid-400x400",
      positiveHeldout: "vector-grid-100x100",
    },
    profiles: {
      smoke: {
        samples: 1,
        scalar_points: 16,
        timeout_seconds: 120,
        vector_points: 8,
        warmups: 1,
      },
      standard: {
        samples: STANDARD_SAMPLES,
        scalar_points: STANDARD_SCALAR_POINTS,
        timeout_seconds: 900,
        vector_points: STANDARD_VECTOR_POINTS,
        warmups: STANDARD_WARMUPS,
      },
    },
    route: null,
    sourcePaths: SOURCE_PATHS,
  };
  const expectedDigest = sha256(canonicalJson(oracleEvidence(oracle)));
  const corpus = {
    scalar: value.input.scalar,
    vector: value.input.vector,
  };
  return validateWorkload(attachIdentity("sagejs.optimizer-workload/v1", {
    title: "Public nested binary64 scalar and vector grid reductions",
    class: "representative",
    owner: "optimizer-development",
    runner: {
      kind: "node-script",
      path: "bench/optimizer-workloads/binary64-nested-all.cjs",
      argv: ["binary64-nested-all"],
      environment: [],
    },
    input: {
      kind: "deterministic-generator",
      digest: sha256(canonicalJson(value)),
      seed: null,
      value,
    },
    corpus: {
      id: "binary64-grid-sampling",
      digest: sha256(canonicalJson(corpus)),
    },
    oracles: [
      {
        id: "checked-v8-feasibility",
        kind: "invariant",
        runnerPath: "bench/optimizer-workloads/binary64-nested-all.cjs",
        expectedDigest,
      },
      {
        id: "cpython-complete-output",
        kind: "cpython",
        runnerPath: "bench/optimizer-workloads/binary64-nested-all.cjs",
        expectedDigest,
      },
      {
        id: "sagejs-o0-complete-output",
        kind: "invariant",
        runnerPath: null,
        expectedDigest,
      },
      {
        id: "sagejs-o2-complete-output",
        kind: "invariant",
        runnerPath: null,
        expectedDigest,
      },
    ],
    phases: [
      {
        id: "heldout-vector-complete-public",
        label: "complete public 100x100 vector-grid call with exact published output",
      },
      {
        id: "primary-scalar-complete-public",
        label: "complete public 400x400 scalar-grid call with exact published output",
      },
    ],
    protocol: {
      warmupRuns: STANDARD_WARMUPS,
      repetitions: STANDARD_SAMPLES,
      timeoutMilliseconds: 900_000,
      reset: "evaluator",
    },
    capabilities: ["binary64", "nested-reduction", "optimizer-evidence", "plotting"],
    targets: ["generic", "library", "native", "v8", "wasm"],
    modes: ["browser", "python", "sage"],
    platforms: ["linux-arm64", "linux-x64", "macos-arm64", "windows-x64"],
  }));
}

function catalogInsertion(catalog, workload) {
  const ids = [
    ...catalog.workloads
      .map((item) => item.id)
      .filter((id) => id !== workload.id),
    workload.id,
  ].sort();
  return {
    index: ids.indexOf(workload.id),
    beforeId: ids[ids.indexOf(workload.id) - 1] ?? null,
    afterId: ids[ids.indexOf(workload.id) + 1] ?? null,
  };
}

function candidateDispositions() {
  return {
    generic: {
      status: "measured-baseline",
      scope: "complete-public-call",
      detail: "actual current O2 public scalar/vector functions",
    },
    library: {
      status: "rejected-not-a-duplicate",
      scope: "complete-public-call",
      detail:
        "no mature library substitutes Python builtin identity, source-order short circuit, dynamic fallback, and exact nested-list publication",
    },
    native: {
      status: "not-run-inconclusive",
      scope: "complete-public-call",
      detail:
        "a host-isolated target cannot consume dynamic Python lists or call the untouched fallback after marshalling",
    },
    v8: {
      status: "measured-feasibility-not-production-route",
      scope: "complete-public-call",
      detail:
        "exact public source with only the two reviewed nested all expressions replaced by the emitter-faithful direct V8 lower bound",
      productionGap:
        "prototype checks are lower-bound scaffolding; production requires unforgeable runtime list and tuple brands",
    },
    wasm: {
      status: "not-run-inconclusive",
      scope: "complete-public-call",
      detail:
        "copying nested host lists to linear memory and republishing Python lists has no reviewed complete-call target",
    },
  };
}

function consumerObligations() {
  return {
    primaryScalar: {
      source: PUBLIC_SOURCE,
      function: "sample_scalar_grid",
      status: "measured-by-this-receipt",
    },
    positiveHeldoutVector: {
      source: PUBLIC_SOURCE,
      function: "sample_vector_grid",
      status: "measured-by-this-receipt",
    },
    periodConsumer: {
      source: "src/lib/sagejs/hyperelliptic_curves/periods.py",
      status: "not-run-requires-post-implementation-neighbor-receipt",
      obligation:
        "run the authentic period workload and preserve exact values before promotion",
    },
    classUnitConsumer: {
      source: "src/lib/sagejs/number_fields/class_unit_groups.py",
      status: "not-run-requires-post-implementation-neighbor-receipt",
      obligation:
        "rerun the authentic class/unit corpus and preserve the campaign baseline before promotion",
    },
  };
}

function sourceProvenance(
  root,
  publicSource,
  profileSource,
  pythonSourceFeasibilitySource,
  directV8Source,
  floatMaterializationSource,
) {
  const publicFunctionStart = publicSource.indexOf("def sample_scalar_grid(");
  const publicFunctionEnd = publicSource.indexOf("\ndef deterministic_levels(");
  assert.ok(publicFunctionStart >= 0 && publicFunctionEnd > publicFunctionStart);
  return {
    publicPath: PUBLIC_SOURCE,
    publicSha256: sha256(publicSource),
    reviewedFunctionsSha256: sha256(
      publicSource.slice(publicFunctionStart, publicFunctionEnd),
    ),
    profilePath: PROFILE_SOURCE,
    profileSha256: sha256(profileSource),
    pythonSourceFeasibilitySha256: sha256(pythonSourceFeasibilitySource),
    pythonSourceFeasibilityBytes:
      Buffer.byteLength(pythonSourceFeasibilitySource),
    directV8Sha256: sha256(directV8Source),
    directV8Bytes: Buffer.byteLength(directV8Source),
    floatMaterializationNegativeSha256: sha256(floatMaterializationSource),
    floatMaterializationNegativeBytes:
      Buffer.byteLength(floatMaterializationSource),
    pythonSourceFeasibilityTransformation: {
      authority: "exact-byte-source-substitution",
      replacedExpressions: 2,
      scalarOriginalSha256: sha256(SCALAR_EXPRESSION),
      scalarReplacementSha256: sha256(SCALAR_REPLACEMENT),
      vectorOriginalSha256: sha256(VECTOR_EXPRESSION),
      vectorReplacementSha256: sha256(VECTOR_REPLACEMENT),
      appendedCheckedHelperSha256: sha256(helperSource(profileSource)),
      allOtherPublicSourceBytesIdentical: true,
    },
    directV8Transformation: {
      authority: "exact-byte-source-substitution",
      replacedExpressions: 2,
      scalarOriginalSha256: sha256(SCALAR_EXPRESSION),
      scalarReplacementSha256: sha256(DIRECT_V8_SCALAR_REPLACEMENT),
      vectorOriginalSha256: sha256(VECTOR_EXPRESSION),
      vectorReplacementSha256: sha256(DIRECT_V8_VECTOR_REPLACEMENT),
      appendedCheckedHelperSha256: sha256(helperSource(profileSource)),
      allOtherPublicSourceBytesIdentical: true,
      feasibilityOnly:
        "prototype guards are a lower bound; a production route needs unforgeable runtime list and tuple brands",
    },
    negativeTransformation: {
      authority: "exact-byte-source-substitution",
      replacedExpressions: 1,
      originalSha256: sha256(FLOAT_MATERIALIZATION_EXPRESSION),
      replacementSha256: sha256(FLOAT_MATERIALIZATION_REPLACEMENT),
      appendedCheckedHelperSha256: sha256(helperSource(profileSource)),
      allOtherPublicSourceBytesIdentical: true,
    },
    root: path.resolve(root),
  };
}

function evaluatorSetupSource() {
  return `import json as _campaign1_json
import math as _campaign1_math
import sagejs.runtime as _campaign1_runtime

_campaign1_direct_candidate_scalar = _campaign1_direct_v8_scalar
_campaign1_direct_candidate_vector = _campaign1_direct_v8_vector
_campaign1_python_source_scalar = _campaign1_python_nested_all_scalar
_campaign1_python_source_vector = _campaign1_python_nested_all_vector
_campaign1_float_materialization_scalar = sample_scalar_grid

def _campaign1_measure_scalar(target, points):
    if target == "direct-v8":
        sampler = _campaign1_direct_candidate_scalar
    elif target == "python-source":
        sampler = _campaign1_python_source_scalar
    elif target == "float-materialization":
        sampler = _campaign1_float_materialization_scalar
    else:
        sampler = _public_sample_scalar_grid
    started = _campaign1_runtime.wall_time()
    output = campaign1_scalar_grid(sampler=sampler, plot_points=points)
    seconds = _campaign1_runtime.wall_time() - started
    return {"seconds": seconds, "digest": campaign1_complete_output_digest(output)}

def _campaign1_measure_vector(target, points):
    if target == "direct-v8":
        sampler = _campaign1_direct_candidate_vector
    elif target == "python-source":
        sampler = _campaign1_python_source_vector
    else:
        sampler = _public_sample_vector_grid
    started = _campaign1_runtime.wall_time()
    output = campaign1_vector_grid(sampler=sampler, plot_points=points)
    seconds = _campaign1_runtime.wall_time() - started
    return {"seconds": seconds, "digest": campaign1_complete_output_digest(output)}

def _campaign1_guard_audit():
    scalar = [[float(1.0), float(2.0)]]
    pairs = [[(float(0.25), float(0.0)), (float(1.25), float(0.0))]]
    fallback_calls = [0]
    seen = []

    def replacement_all(iterable):
        fallback_calls[0] += 1
        return _CAMPAIGN1_EXPECTED_ALL(iterable)

    def replacement_predicate(value):
        seen.append(float(value))
        return len(seen) < 2

    builtin_identity_fallback = _campaign1_checked_nested_binary64_all(
        scalar, replacement_all, _CAMPAIGN1_EXPECTED_ISFINITE, False
    )
    predicate_identity_fallback = _campaign1_checked_nested_binary64_all(
        scalar, _CAMPAIGN1_EXPECTED_ALL, replacement_predicate, False
    )
    row_shape_fallback = _campaign1_checked_nested_binary64_all(
        (scalar[0],), replacement_all, _CAMPAIGN1_EXPECTED_ISFINITE, False
    )

    direct_fallback_calls = [0]
    direct_seen = []

    def direct_replacement_all(iterable):
        direct_fallback_calls[0] += 1
        return _CAMPAIGN1_EXPECTED_ALL(iterable)

    def direct_replacement_predicate(value):
        direct_seen.append(float(value))
        return len(direct_seen) < 2

    direct_builtin_identity_fallback = _campaign1_direct_v8_nested_binary64_all(
        scalar, direct_replacement_all, _CAMPAIGN1_EXPECTED_ISFINITE, False
    )
    direct_predicate_identity_fallback = _campaign1_direct_v8_nested_binary64_all(
        scalar, _CAMPAIGN1_EXPECTED_ALL, direct_replacement_predicate, False
    )
    direct_row_shape_fallback = _campaign1_direct_v8_nested_binary64_all(
        (scalar[0],), direct_replacement_all, _CAMPAIGN1_EXPECTED_ISFINITE, False
    )
    source_order_row = [[float(1.0), float("inf"), float(3.0)]]
    _campaign1_runtime.reflect.deleteProperty(source_order_row[0], 2)
    source_order_sentinel = _campaign1_runtime.reflect.apply(
        _CAMPAIGN1_DIRECT_V8_NESTED_ALL, None, [source_order_row, False]
    )

    direct_interrupt_calls = [0]
    def direct_count_interrupt():
        direct_interrupt_calls[0] += 1
    direct_saved_interrupt = _campaign1_runtime.reflect.get(
        _campaign1_runtime.global_object, "ρσ_check_interrupt"
    )
    _campaign1_runtime.reflect.set(
        _campaign1_runtime.global_object,
        "ρσ_check_interrupt",
        direct_count_interrupt,
    )
    try:
        direct_interrupt_target = _campaign1_runtime.reflect.apply(
            _CAMPAIGN1_DIRECT_V8_FACTORY,
            None,
            [
                _campaign1_runtime.reflect.get(
                    _campaign1_runtime.global_object, "ρσ_strict_float_unbox"
                ),
                direct_count_interrupt,
                _campaign1_runtime.reflect.get(
                    _campaign1_runtime.global_object, "ρσ_list_decorate"
                ),
                _campaign1_runtime.reflect.get(
                    _campaign1_runtime.global_object, "ρσ_math_tuple"
                ),
            ],
        )
        direct_interrupt_sentinel = _campaign1_runtime.reflect.apply(
            direct_interrupt_target,
            None,
            [[[float(index) + 0.5 for index in range(513)]], False],
        )
    finally:
        _campaign1_runtime.reflect.set(
            _campaign1_runtime.global_object,
            "ρσ_check_interrupt",
            direct_saved_interrupt,
        )

    interrupt_calls = [0]
    saved_interrupt = _campaign1_runtime.check_interrupt
    def count_interrupt():
        interrupt_calls[0] += 1
    _campaign1_runtime.check_interrupt = count_interrupt
    try:
        interrupt_result = _campaign1_checked_nested_binary64_all(
            [[float(index) + 0.5 for index in range(2048)]],
            _CAMPAIGN1_EXPECTED_ALL,
            _CAMPAIGN1_EXPECTED_ISFINITE,
            False,
        )
    finally:
        _campaign1_runtime.check_interrupt = saved_interrupt

    return {
        "accepted_scalar": _campaign1_checked_nested_binary64_all(
            scalar, _CAMPAIGN1_EXPECTED_ALL, _CAMPAIGN1_EXPECTED_ISFINITE, False
        ),
        "accepted_fixed_pair": _campaign1_checked_nested_binary64_all(
            pairs, _CAMPAIGN1_EXPECTED_ALL, _CAMPAIGN1_EXPECTED_ISFINITE, True
        ),
        "nonfinite_short_circuit": _campaign1_checked_nested_binary64_all(
            [[float(1.0), float("inf"), float(3.0)]],
            _CAMPAIGN1_EXPECTED_ALL,
            _CAMPAIGN1_EXPECTED_ISFINITE,
            False,
        ),
        "builtin_identity_fallback": builtin_identity_fallback,
        "predicate_identity_fallback": predicate_identity_fallback,
        "row_shape_fallback": row_shape_fallback,
        "fallback_calls": fallback_calls[0],
        "fallback_predicate_seen": seen,
        "interrupt_replacement_calls": interrupt_calls[0],
        "interrupt_intrinsic_immune_to_module_replacement": interrupt_calls[0] == 0,
        "periodic_interrupt_stride": 1024,
        "interrupt_result": interrupt_result,
        "direct_accepted_scalar": _campaign1_direct_v8_nested_binary64_all(
            scalar, _CAMPAIGN1_EXPECTED_ALL, _CAMPAIGN1_EXPECTED_ISFINITE, False
        ),
        "direct_accepted_fixed_pair": _campaign1_direct_v8_nested_binary64_all(
            pairs, _CAMPAIGN1_EXPECTED_ALL, _CAMPAIGN1_EXPECTED_ISFINITE, True
        ),
        "direct_nonfinite_short_circuit": _campaign1_direct_v8_nested_binary64_all(
            [[float(1.0), float("inf"), float(3.0)]],
            _CAMPAIGN1_EXPECTED_ALL,
            _CAMPAIGN1_EXPECTED_ISFINITE,
            False,
        ),
        "direct_builtin_identity_fallback": direct_builtin_identity_fallback,
        "direct_predicate_identity_fallback": direct_predicate_identity_fallback,
        "direct_row_shape_fallback": direct_row_shape_fallback,
        "direct_fallback_calls": direct_fallback_calls[0],
        "direct_fallback_predicate_seen": direct_seen,
        "direct_periodic_interrupt_stride": 256,
        "direct_nonfinite_before_later_hole_sentinel": source_order_sentinel,
        "direct_interrupt_audit_sentinel": direct_interrupt_sentinel,
        "direct_interrupt_calls_for_513_scalars": direct_interrupt_calls[0],
    }
`;
}

function parseOutputLine(lines, label) {
  const line = lines.findLast((value) => value.startsWith(OUTPUT_PREFIX));
  if (!line) throw new Error(`${label} emitted no ${OUTPUT_PREFIX} payload`);
  lines.length = 0;
  return JSON.parse(line.slice(OUTPUT_PREFIX.length));
}

function runSageLevelExact(
  root,
  profileSource,
  scalarPoints,
  vectorPoints,
  level,
  options = {},
) {
  if (!new Set(["O0", "O2"]).has(level)) {
    throw new Error(`unsupported binary64 exact level ${level}`);
  }
  const program = `${profileSource.trimEnd()}

_campaign1_exact_scalar = campaign1_scalar_grid(plot_points=${scalarPoints})
_campaign1_exact_vector = campaign1_vector_grid(plot_points=${vectorPoints})
print('${OUTPUT_PREFIX}' + json.dumps({
    'scalarCompleteOutputDigest': campaign1_complete_output_digest(_campaign1_exact_scalar),
    'vectorCompleteOutputDigest': campaign1_complete_output_digest(_campaign1_exact_vector),
}, sort_keys=True, separators=(',', ':')))
`;
  const environment = {
    ...process.env,
    SAGEJS_OPT_LEVEL: level,
    SAGEJS_NATIVE_DISABLE: "1",
    SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: "off",
  };
  const spawn = options.spawn ?? spawnSync;
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "sagejs-binary64-nested-all-"),
  );
  const sourcePath = path.join(temporary, "exact.py");
  let result;
  try {
    fs.writeFileSync(sourcePath, program);
    result = spawn(
      process.execPath,
      [path.join(root, "bin/sagejs"), "--python", sourcePath],
      {
        cwd: root,
        encoding: "utf8",
        env: environment,
        maxBuffer: 16 * 1024 * 1024,
        timeout: options.timeoutMilliseconds ?? 300_000,
      },
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  if (result.error || result.status !== 0) {
    throw new Error(
      `binary64 nested-all ${level} exact run failed: ${result.error?.message || result.stderr || result.stdout}`,
    );
  }
  const line = result.stdout.split(/\r?\n/).findLast(
    (value) => value.startsWith(OUTPUT_PREFIX),
  );
  if (!line) throw new Error(`binary64 nested-all ${level} emitted no exact payload`);
  return JSON.parse(line.slice(OUTPUT_PREFIX.length));
}

async function createRunner(
  root,
  profileSource,
  candidateSource,
  directV8Source,
  floatMaterializationSource,
  level = "O2",
) {
  const distPath = path.join(root, "dist/tools/kernel-evaluator.js");
  if (!fs.existsSync(distPath)) {
    throw new Error("binary64 nested-all runner requires a current pnpm build");
  }
  const previousLevel = process.env.SAGEJS_OPT_LEVEL;
  const previousNativeDisable = process.env.SAGEJS_NATIVE_DISABLE;
  const previousHyperellipticPolicy =
    process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY;
  process.env.SAGEJS_OPT_LEVEL = level;
  process.env.SAGEJS_NATIVE_DISABLE = "1";
  // This isolated plotting workload neither imports nor exercises the
  // unrelated receipt-gated hyperelliptic auto selector.
  process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY = "off";
  const { createKernelEvaluatorAsync } = require(distPath);
  const output = [];
  const evaluator = await createKernelEvaluatorAsync({
    mode: "python",
    onOutput(text) {
      for (const line of String(text).split(/\r?\n/)) {
        if (line) output.push(line);
      }
    },
  });
  try {
    evaluator.evaluate(profileSource, {
      filename: path.join(root, PROFILE_SOURCE),
      language: "python",
      suppressResult: true,
    });
    evaluator.evaluate(candidateSource, {
      filename: "sagejs-feasibility:///binary64-nested-all-candidate.py",
      language: "python",
      suppressResult: true,
    });
    evaluator.evaluate(
      "_campaign1_python_nested_all_scalar = sample_scalar_grid\n" +
        "_campaign1_python_nested_all_vector = sample_vector_grid\n",
      {
        filename: "sagejs-feasibility:///binary64-python-source-bind.py",
        language: "python",
        suppressResult: true,
      },
    );
    evaluator.evaluate(directV8Source, {
      filename: "sagejs-feasibility:///binary64-direct-v8-lower-bound.py",
      language: "python",
      suppressResult: true,
    });
    evaluator.evaluate(
      "_campaign1_direct_v8_scalar = sample_scalar_grid\n" +
        "_campaign1_direct_v8_vector = sample_vector_grid\n",
      {
        filename: "sagejs-feasibility:///binary64-direct-v8-bind.py",
        language: "python",
        suppressResult: true,
      },
    );
    evaluator.evaluate(floatMaterializationSource, {
      filename: "sagejs-feasibility:///binary64-float-materialization-negative.py",
      language: "python",
      suppressResult: true,
    });
    evaluator.evaluate(evaluatorSetupSource(), {
      filename: "sagejs-feasibility:///binary64-nested-all-runner.py",
      language: "python",
      suppressResult: true,
    });
  } catch (error) {
    evaluator.close();
    if (previousLevel === undefined) delete process.env.SAGEJS_OPT_LEVEL;
    else process.env.SAGEJS_OPT_LEVEL = previousLevel;
    if (previousNativeDisable === undefined) delete process.env.SAGEJS_NATIVE_DISABLE;
    else process.env.SAGEJS_NATIVE_DISABLE = previousNativeDisable;
    if (previousHyperellipticPolicy === undefined) {
      delete process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY;
    } else {
      process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY =
        previousHyperellipticPolicy;
    }
    throw error;
  }

  function evaluatePayload(expression, label) {
    evaluator.evaluate(
      `print('${OUTPUT_PREFIX}' + _campaign1_json.dumps(${expression}, sort_keys=True, separators=(',', ':')))`,
      { language: "python", suppressResult: true },
    );
    return parseOutputLine(output, label);
  }

  function measure(kind, target, points) {
    if (!new Set([
      "baseline",
      "direct-v8",
      "python-source",
      "float-materialization",
    ]).has(target)) {
      throw new Error(`unknown binary64 target ${target}`);
    }
    if (kind === "vector" && target === "float-materialization") {
      throw new Error("the adjacent float-materialization negative is scalar-only");
    }
    const payload = evaluatePayload(
      `_campaign1_measure_${kind}(${JSON.stringify(target)}, ${points})`,
      `${kind} ${target}`,
    );
    assert.equal(typeof payload.digest, "string");
    assert.ok(Number.isFinite(payload.seconds) && payload.seconds >= 0);
    return {
      digest: payload.digest,
      nanoseconds: Math.max(1, Math.round(payload.seconds * 1e9)),
    };
  }

  return {
    measure,
    guardAudit() {
      return evaluatePayload("_campaign1_guard_audit()", "guard audit");
    },
    close() {
      evaluator.close();
      if (previousLevel === undefined) delete process.env.SAGEJS_OPT_LEVEL;
      else process.env.SAGEJS_OPT_LEVEL = previousLevel;
      if (previousNativeDisable === undefined) delete process.env.SAGEJS_NATIVE_DISABLE;
      else process.env.SAGEJS_NATIVE_DISABLE = previousNativeDisable;
      if (previousHyperellipticPolicy === undefined) {
        delete process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY;
      } else {
        process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY =
          previousHyperellipticPolicy;
      }
    },
  };
}

function validateReport(report) {
  assert.equal(report.schema, SCHEMA);
  verifyDocumentIdentity("binary64 nested-all feasibility receipt", report);
  assert.equal(report.productionCompilerRouteClaim, "none");
  assert.equal(report.protocol.order, "repeating AB,BA,BA,AB");
  assert.equal(report.comparisons.scalar.rawPairs.length, report.protocol.samples);
  assert.equal(report.comparisons.vector.rawPairs.length, report.protocol.samples);
  for (const comparison of Object.values(report.comparisons)) {
    comparison.rawPairs.forEach((pair, index) => {
      assert.equal(pair.order, expectedOrder(index));
      assert.equal(
        pair.baselineCompleteOutputDigest,
        pair.candidateCompleteOutputDigest,
      );
    });
  }
  assert.deepEqual(
    report.exactDifferential.currentGeneric,
    report.exactDifferential.checkedV8,
  );
  assert.deepEqual(
    report.exactDifferential.sagejsO0,
    report.exactDifferential.currentGeneric,
  );
  assert.equal(
    canonicalJson(report.exactDifferential.currentGeneric),
    canonicalJson(oracleEvidence(report.oracle)),
  );
  if (report.promotable) {
    assert.equal(report.status, "standard-current-build-feasibility-evidence");
    assert.equal(report.buildAuthentication.status, "authenticated-current-clean-build");
    assert.equal(report.protocol.standardEvidence, true);
    assert.equal(report.opportunityEvidenceAdapter.consumable, true);
  } else {
    assert.equal(report.status, "development-smoke-non-promotable");
    assert.equal(report.buildAuthentication.status, "not-authenticated");
    assert.equal(report.opportunityEvidenceAdapter.consumable, false);
  }
  assert.equal(report.guardAudit.fallback_calls, 2);
  assert.deepEqual(report.guardAudit.fallback_predicate_seen, [1, 2]);
  assert.equal(report.guardAudit.interrupt_replacement_calls, 0);
  assert.equal(report.guardAudit.interrupt_intrinsic_immune_to_module_replacement, true);
  assert.equal(report.guardAudit.periodic_interrupt_stride, 1024);
  assert.equal(report.guardAudit.interrupt_result, true);
  assert.equal(report.guardAudit.nonfinite_short_circuit, false);
  assert.equal(report.guardAudit.direct_accepted_scalar, true);
  assert.equal(report.guardAudit.direct_accepted_fixed_pair, true);
  assert.equal(report.guardAudit.direct_nonfinite_short_circuit, false);
  assert.equal(report.guardAudit.direct_fallback_calls, 2);
  assert.deepEqual(report.guardAudit.direct_fallback_predicate_seen, [1, 2]);
  assert.equal(report.guardAudit.direct_periodic_interrupt_stride, 256);
  assert.equal(report.guardAudit.direct_nonfinite_before_later_hole_sentinel, 2);
  assert.equal(report.guardAudit.direct_interrupt_audit_sentinel, 1);
  assert.equal(report.guardAudit.direct_interrupt_calls_for_513_scalars, 3);
  assert.deepEqual(
    report.exactDifferential.pythonSourceFeasibility,
    report.exactDifferential.currentGeneric,
  );
  return report;
}

async function runFeasibility({
  root = path.resolve(__dirname, "../.."),
  scalarPoints = STANDARD_SCALAR_POINTS,
  vectorPoints = STANDARD_VECTOR_POINTS,
  samples = STANDARD_SAMPLES,
  warmups = STANDARD_WARMUPS,
  allowUnverifiedBuild = false,
} = {}) {
  for (const [label, value, minimum] of [
    ["scalar points", scalarPoints, 2],
    ["vector points", vectorPoints, 2],
    ["samples", samples, 1],
    ["warmups", warmups, 0],
  ]) {
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new TypeError(`${label} must be an integer at least ${minimum}`);
    }
  }
  const standardEvidence =
    scalarPoints === STANDARD_SCALAR_POINTS &&
    vectorPoints === STANDARD_VECTOR_POINTS &&
    samples === STANDARD_SAMPLES &&
    warmups === STANDARD_WARMUPS;
  if (allowUnverifiedBuild && standardEvidence) {
    throw new Error(
      "standard binary64 nested-all evidence cannot use an unverified build",
    );
  }
  const buildAuthentication = allowUnverifiedBuild
    ? {
        status: "not-authenticated",
        promotable: false,
        reason:
          "explicit smoke-only development run; source-to-dist identity was not authenticated",
      }
    : {
        status: "authenticated-current-clean-build",
        ...requireCurrentBuild(root),
      };
  if (!standardEvidence && !allowUnverifiedBuild) {
    throw new Error("nonstandard measurements must be explicit non-promotable smoke runs");
  }

  const publicSource = fs.readFileSync(path.join(root, PUBLIC_SOURCE), "utf8");
  const profileSource = fs.readFileSync(path.join(root, PROFILE_SOURCE), "utf8");
  const candidateSource = deriveCandidateSource(publicSource, profileSource);
  const directV8Source = deriveDirectV8Source(publicSource, profileSource);
  const floatMaterializationSource = deriveFloatMaterializationSource(
    publicSource,
    profileSource,
  );
  const source = sourceProvenance(
    root,
    publicSource,
    profileSource,
    candidateSource,
    directV8Source,
    floatMaterializationSource,
  );
  const oracle = independentCpythonOracle(scalarPoints, vectorPoints);
  const catalogOracle = standardEvidence
    ? oracle
    : independentCpythonOracle(STANDARD_SCALAR_POINTS, STANDARD_VECTOR_POINTS);
  const workload = workloadCatalogEntry(catalogOracle);
  const catalog = JSON.parse(
    fs.readFileSync(path.join(root, "architecture/optimizer-workloads.json"), "utf8"),
  );

  const o0Exact = runSageLevelExact(
    root,
    profileSource,
    scalarPoints,
    vectorPoints,
    "O0",
  );
  assert.deepEqual(o0Exact, oracleEvidence(oracle));

  const runner = await createRunner(
    root,
    profileSource,
    candidateSource,
    directV8Source,
    floatMaterializationSource,
    "O2",
  );
  try {
    const genericExact = {
      scalarCompleteOutputDigest:
        runner.measure("scalar", "baseline", scalarPoints).digest,
      vectorCompleteOutputDigest:
        runner.measure("vector", "baseline", vectorPoints).digest,
    };
    const directV8Exact = {
      scalarCompleteOutputDigest:
        runner.measure("scalar", "direct-v8", scalarPoints).digest,
      vectorCompleteOutputDigest:
        runner.measure("vector", "direct-v8", vectorPoints).digest,
    };
    const pythonSourceExact = {
      scalarCompleteOutputDigest:
        runner.measure("scalar", "python-source", scalarPoints).digest,
      vectorCompleteOutputDigest:
        runner.measure("vector", "python-source", vectorPoints).digest,
    };
    const negativeExact = {
      scalarCompleteOutputDigest:
        runner.measure("scalar", "float-materialization", scalarPoints).digest,
    };
    assert.deepEqual(genericExact, oracleEvidence(oracle));
    assert.deepEqual(directV8Exact, oracleEvidence(oracle));
    assert.deepEqual(pythonSourceExact, oracleEvidence(oracle));
    assert.equal(
      negativeExact.scalarCompleteOutputDigest,
      oracle.scalar.digest,
      "checked float-materialization negative output differs from CPython",
    );

    for (let index = 0; index < warmups; index += 1) {
      runner.measure("scalar", "baseline", scalarPoints);
      runner.measure("scalar", "direct-v8", scalarPoints);
      runner.measure("scalar", "python-source", scalarPoints);
      runner.measure("scalar", "float-materialization", scalarPoints);
      runner.measure("vector", "baseline", vectorPoints);
      runner.measure("vector", "direct-v8", vectorPoints);
    }
    const scalar = buildPairedComparison({
      phase: "primary-scalar-complete-public",
      samples,
      baseline: () => runner.measure("scalar", "baseline", scalarPoints),
      candidate: () => runner.measure("scalar", "direct-v8", scalarPoints),
      digest: oracle.scalar.digest,
    });
    const vector = buildPairedComparison({
      phase: "heldout-vector-complete-public",
      samples,
      baseline: () => runner.measure("vector", "baseline", vectorPoints),
      candidate: () => runner.measure("vector", "direct-v8", vectorPoints),
      digest: oracle.vector.digest,
    });
    const scalarPythonSourceFeasibility = buildPairedComparison({
      phase: "primary-scalar-python-source-feasibility-negative",
      samples,
      baseline: () => runner.measure("scalar", "baseline", scalarPoints),
      candidate: () => runner.measure("scalar", "python-source", scalarPoints),
      digest: oracle.scalar.digest,
    });
    const scalarFloatMaterializationNegative = buildPairedComparison({
      phase: "primary-scalar-float-materialization-negative",
      samples,
      baseline: () => runner.measure("scalar", "baseline", scalarPoints),
      candidate: () =>
        runner.measure("scalar", "float-materialization", scalarPoints),
      digest: oracle.scalar.digest,
    });
    const guardAudit = runner.guardAudit();
    const dispositions = candidateDispositions();
    const obligations = consumerObligations();
    const promotable = Boolean(
      buildAuthentication.promotable && standardEvidence,
    );
    const adapter = {
      schema: "sagejs.campaign1-reviewed-phase-opportunity-adapter/v1",
      consumable: promotable,
      measurementScope: "complete-public-call",
      workload: {
        id: workload.id,
        primaryOutputDigest: oracle.scalar.digest,
        heldoutOutputDigest: oracle.vector.digest,
      },
      source: {
        path: PUBLIC_SOURCE,
        sha256: source.publicSha256,
        reviewedFunctionsSha256: source.reviewedFunctionsSha256,
      },
      comparisons: {
        primaryScalar: scalar.opportunityEvidencePairs,
        positiveHeldoutVector: vector.opportunityEvidencePairs,
        scalarFloatMaterializationNegative:
          scalarFloatMaterializationNegative.opportunityEvidencePairs,
        scalarPythonSourceFeasibilityNegative:
          scalarPythonSourceFeasibility.opportunityEvidencePairs,
      },
      phaseReceiptData: {
        primaryScalar: {
          baseline: {
            target: "generic",
            samplesNanoseconds: scalar.rawPairs.map(
              (pair) => pair.baselineNanoseconds,
            ),
            outputDigest: oracle.scalar.digest,
          },
          feasibleLowerBound: {
            target: "v8",
            samplesNanoseconds: scalar.rawPairs.map(
              (pair) => pair.candidateNanoseconds,
            ),
            outputDigest: oracle.scalar.digest,
            productionRouteClaim: "none",
          },
        },
        positiveHeldoutVector: {
          baseline: {
            target: "generic",
            samplesNanoseconds: vector.rawPairs.map(
              (pair) => pair.baselineNanoseconds,
            ),
            outputDigest: oracle.vector.digest,
          },
          feasibleLowerBound: {
            target: "v8",
            samplesNanoseconds: vector.rawPairs.map(
              (pair) => pair.candidateNanoseconds,
            ),
            outputDigest: oracle.vector.digest,
            productionRouteClaim: "none",
          },
        },
        negativeTargets: [{
          target: "python-source-feasibility",
          candidate: "checked-nested-all-ordinary-python",
          disposition: "measured-losing-prior-standard-and-retained-as-negative",
          samplesNanoseconds:
            scalarPythonSourceFeasibility.rawPairs.map(
              (pair) => pair.candidateNanoseconds,
            ),
          baselineSamplesNanoseconds:
            scalarPythonSourceFeasibility.rawPairs.map(
              (pair) => pair.baselineNanoseconds,
            ),
          outputDigest: oracle.scalar.digest,
          productionRouteClaim: "none",
          priorStandardEvidence: {
            reportId:
              "sha256:a297acf1e70a1684f476020660e47603041b92e1ed43a8e14b3c5338df7b6364",
            baselineMedianNanoseconds: 524874449,
            candidateMedianNanoseconds: 493808270,
            medianRatioBaselineOverCandidate: 1.0629114190412405,
            losingPairIndices: [2, 6],
            disposition: "rejected-below-campaign-threshold",
          },
        }, {
          target: "v8",
          candidate: "checked-binary64-float-materialization",
          disposition: "measured-losing-prior-standard-and-retained-as-negative",
          samplesNanoseconds:
            scalarFloatMaterializationNegative.rawPairs.map(
              (pair) => pair.candidateNanoseconds,
            ),
          baselineSamplesNanoseconds:
            scalarFloatMaterializationNegative.rawPairs.map(
              (pair) => pair.baselineNanoseconds,
            ),
          outputDigest: oracle.scalar.digest,
          productionRouteClaim: "none",
          priorStandardEvidence: {
            reportId:
              "sha256:a297acf1e70a1684f476020660e47603041b92e1ed43a8e14b3c5338df7b6364",
            baselineMedianNanoseconds: 526810169,
            candidateMedianNanoseconds: 2332798243,
            medianRatioBaselineOverCandidate: 0.22582757449376217,
            disposition: "rejected-materially-slower",
          },
        }],
        unavailableAndInconclusiveTargets: dispositions,
      },
      assemblyInstruction: promotable
        ? "Integration may bind these raw pairs only to phase receipts with this exact workload, public source, compiler, build, and output identity; this adapter authenticates no compiler route."
        : "Do not assemble opportunity evidence from this smoke receipt.",
    };
    const payload = {
      generatedAt: new Date().toISOString(),
      status: promotable
        ? "standard-current-build-feasibility-evidence"
        : "development-smoke-non-promotable",
      promotable,
      productionCompilerRouteClaim: "none",
      buildAuthentication,
      host: {
        platform: process.platform,
        architecture: process.arch,
        runtime: "node",
        runtimeVersion: process.version,
        engine: "v8",
        engineVersion: process.versions.v8,
      },
      protocol: {
        samples,
        warmups,
        scalarPoints,
        vectorPoints,
        order: "repeating AB,BA,BA,AB",
        standardEvidence,
        optimizationLevel: "O2",
        nativeDisabled: true,
        digestPublicationOutsideTimedPublicCall: true,
      },
      source,
      workloadCatalog: {
        document: workload,
        insertion: catalogInsertion(catalog, workload),
      },
      oracle,
      exactDifferential: {
        sagejsO0: o0Exact,
        currentGeneric: genericExact,
        checkedV8: directV8Exact,
        pythonSourceFeasibility: pythonSourceExact,
        checkedFloatMaterializationNegative: negativeExact,
      },
      measurementScope: {
        authority: "complete-public-call",
        included:
          "range validation, coordinate and raw-value construction, float coercion, nested finite reduction, output matrices/masks/bounds/summaries, and returned dictionary publication",
        excluded: [
          "source compilation and module import",
          "warmup calls",
          "complete-output digest construction after the public call returns",
          "independent CPython oracle execution",
        ],
        candidateDifference:
          "only the two exact nested all(math.isfinite(...)) source expressions are replaced by the direct V8 lower-bound wrapper; all preceding and following public-source bytes execute unchanged",
        productionGuardGap:
          "prototype checks are lower-bound scaffolding; production additionally requires unforgeable runtime list and tuple brands",
      },
      guardAudit,
      targetDispositions: dispositions,
      consumerObligations: obligations,
      comparisons: {
        scalar,
        scalarFloatMaterializationNegative,
        scalarPythonSourceFeasibility,
        vector,
      },
      opportunityEvidenceAdapter: adapter,
    };
    return validateReport(attachIdentity(SCHEMA, payload));
  } finally {
    runner.close();
  }
}

function parseArguments(argv) {
  const options = { smoke: false, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "binary64-nested-all") continue;
    if (argument === "--smoke") {
      options.smoke = true;
      continue;
    }
    if (argument === "--output") {
      options.output = argv[++index];
      if (!options.output) throw new Error("--output requires a filename");
      continue;
    }
    throw new Error(`unknown binary64 nested-all argument ${argument}`);
  }
  return options;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const report = await runFeasibility(options.smoke
    ? {
        scalarPoints: 16,
        vectorPoints: 8,
        samples: 1,
        warmups: 1,
        allowUnverifiedBuild: true,
      }
    : {});
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) fs.writeFileSync(path.resolve(options.output), output);
  else process.stdout.write(output);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  PROFILE_SOURCE,
  PUBLIC_SOURCE,
  SOURCE_PATHS,
  STANDARD_SAMPLES,
  STANDARD_SCALAR_POINTS,
  STANDARD_VECTOR_POINTS,
  STANDARD_WARMUPS,
  buildPairedComparison,
  candidateDispositions,
  catalogInsertion,
  consumerObligations,
  cpythonOracleProgram,
  deriveCandidateSource,
  deriveDirectV8Source,
  deriveFloatMaterializationSource,
  expectedOrder,
  helperSource,
  independentCpythonOracle,
  oracleEvidence,
  runSageLevelExact,
  runFeasibility,
  validateReport,
  workloadCatalogEntry,
};
