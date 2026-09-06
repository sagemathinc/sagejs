#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join, resolve } = require("node:path");
const {
  assertEvidenceEquivalent,
} = require("./evidence-equivalence.cjs");

const root = resolve(__dirname, "../../..");
const storyPath = join(
  root,
  "website/numerical-computing/stories/root-finding.json",
);

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function compactBytes(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function traceMeasurements(cases) {
  return cases.flatMap((caseRecord) => {
    const measurements = [{
      id: `${caseRecord.id}:result`,
      retained_events: caseRecord.result.trace.retained_events,
      payload_bytes: compactBytes(caseRecord.result.trace),
    }];
    const verification = caseRecord.verification ||
      caseRecord.reference_comparison?.reference_result;
    if (verification) {
      measurements.push({
        id: `${caseRecord.id}:verification`,
        retained_events: verification.trace.retained_events,
        payload_bytes: compactBytes(verification.trace),
      });
    }
    return measurements;
  });
}

function pythonEvidence() {
  const source = String.raw`
import collections.abc, hashlib, json, math, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})

from sagejs.numerics import find_root

def normalized(result):
    record = result.to_dict()
    # Runtime duration is deliberately excluded from a deterministic fixture.
    # The solver, trace, validation, and resource counts remain unchanged.
    record["elapsed_ms"] = 0.0
    record["measurements"] = {
        "fixture_elapsed_policy": "normalized; performance is measured separately"
    }
    return record

primary_calls = [0]
def primary_callback(x):
    primary_calls[0] += 1
    return math.cos(x) - x

success = find_root(
    primary_callback,
    0.0,
    1.0,
    method="brent",
    expression="math.cos(x) - x",
    trace="evaluations",
    max_trace_events=64,
    max_trace_bytes=131072,
)
reference_calls = [0]
def reference_callback(x):
    reference_calls[0] += 1
    return math.cos(x) - x

verification = find_root(
    reference_callback,
    0.0,
    1.0,
    method="bisection",
    expression="math.cos(x) - x",
    trace="evaluations",
    max_trace_events=64,
    max_trace_bytes=131072,
)
discontinuity = find_root(
    lambda x: -1.0 if x < 0.0 else 1.0,
    -1.0,
    1.0,
    method="brent",
    expression="-1.0 if x < 0.0 else 1.0",
    trace="iterations",
    max_trace_events=64,
    max_trace_bytes=131072,
)
invalid_bracket = find_root(
    lambda x: x*x + 1.0,
    -1.0,
    1.0,
    method="brent",
    expression="x*x + 1.0",
    trace="iterations",
    max_trace_events=64,
    max_trace_bytes=131072,
)
divergence = find_root(
    lambda x: x*x*x - 2.0*x + 2.0,
    x0=0.0,
    derivative=lambda x: 3.0*x*x - 2.0,
    method="newton",
    expression="x*x*x - 2.0*x + 2.0",
    trace="iterations",
    maxiter=8,
    max_trace_events=64,
    max_trace_bytes=131072,
)

animation = success.animate()
shared_lowering = {"status": "available", "diagnostics": []}
shared_figure = None
try:
    from sagejs.plotting import lower_plot_animation
    shared_figure = lower_plot_animation(animation)
except Exception as error:
    shared_lowering = {
        "status": "blocked",
        "error_type": type(error).__name__,
        "message": str(error),
        "integration_request": "Repair the canonical PlotAnimation lowering boundary.",
    }

print(json.dumps({
    "cases": {
        "cosine-fixed-point": normalized(success),
        "jump-discontinuity": normalized(discontinuity),
        "invalid-bracket": normalized(invalid_bracket),
        "newton-two-cycle": normalized(divergence),
    },
    "verification": normalized(verification),
    "comparison_execution": {
        "primary_callback_calls": primary_calls[0],
        "reference_callback_calls": reference_calls[0],
    },
    "animation": animation.to_dict(),
    "shared_lowering": shared_lowering,
    "shared_figure": shared_figure,
}, allow_nan=False, separators=(",", ":"), sort_keys=True))
`;
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(executable, ["-I", "-c", source], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function plotlyTrace(layer) {
  const common = {
    uid: layer.id,
    name: layer.legend?.label || layer.source_intent?.role || layer.id,
    showlegend: layer.legend?.show === true,
    x: layer.data.x,
    y: layer.data.y,
    type: "scatter",
    hovertemplate: "%{x:.8g}, %{y:.4g}<extra></extra>",
  };
  if (layer.kind === "line") {
    return {
      ...common,
      mode: "lines",
      connectgaps: false,
      line: {
        color: layer.style?.color || "#275d89",
        width: layer.style?.width || 2,
      },
    };
  }
  return {
    ...common,
    mode: "markers",
    marker: {
      color: layer.style?.color || "#9b3d2f",
      size: layer.style?.size || 8,
      symbol: layer.source_intent?.role === "candidate" ? "diamond" : "circle",
    },
  };
}

function plotlyFigure(animation) {
  const frames = animation.frames.map((frame, index) => {
    const spec = frame.state.value;
    const traceData = frame.metadata.trace_data || {};
    return {
      name: frame.id,
      data: spec.layers.map(plotlyTrace),
      traces: spec.layers.map((_, traceIndex) => traceIndex),
      layout: {},
      meta: {
        semantic_frame_id: frame.id,
        trace_iteration: index + 1,
        step_kind: traceData.step_kind || null,
      },
    };
  });
  const timing = animation.timing;
  const stepArgs = (name) => [[name], {
    frame: { duration: timing.frame_duration_ms, redraw: true },
    transition: { duration: timing.transition_duration_ms },
    mode: "immediate",
  }];
  return {
    data: frames[0].data,
    layout: {
      autosize: true,
      xaxis: { title: { text: "x" }, range: [0, 1] },
      yaxis: { title: { text: "f(x)" }, range: [-0.55, 1.05], zeroline: true },
      hovermode: "closest",
      updatemenus: [{
        type: "buttons",
        direction: "left",
        showactive: false,
        buttons: [
          { label: "Play", method: "animate", args: [null, stepArgs(null)[1]] },
          {
            label: "Pause",
            method: "animate",
            args: [[null], {
              frame: { duration: 0, redraw: true },
              transition: { duration: 0 },
              mode: "immediate",
            }],
          },
        ],
      }],
      sliders: [{
        active: 0,
        currentvalue: { prefix: "Iteration: " },
        steps: frames.map((frame, index) => ({
          label: String(index + 1),
          method: "animate",
          args: stepArgs(frame.name),
        })),
      }],
      meta: {
        semantic_source: "PlotAnimation",
        stable_layer_ids: animation.topology.layers.map((layer) => layer.id),
        trace_truncated: animation.metadata.trace_truncated,
      },
    },
    config: { responsive: true, displaylogo: false },
    frames,
  };
}

function scalarCount(value) {
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + scalarCount(item), 0);
  }
  if (value && typeof value === "object") {
    return Object.values(value).reduce(
      (total, item) => total + scalarCount(item),
      0,
    );
  }
  return value === undefined ? 0 : 1;
}

function resultCase(id, title, kind, question, description, result, expected) {
  return {
    id,
    title,
    kind,
    question,
    static_description: description,
    result,
    evidence_expectations: expected,
  };
}

function methodSummary(result, callbackCalls) {
  return {
    method: result.method,
    value: result.value,
    residual: result.validation.residual,
    iterations: result.iterations,
    evaluations: result.evaluations,
    callback_calls: callbackCalls,
    validation_passed: result.validation.passed,
    truth_level: result.validation.truth_level,
  };
}

function referenceComparison(primary, reference, execution) {
  const primaryTolerance = primary.reproducibility.problem.tolerances.xtol;
  const referenceTolerance = reference.reproducibility.problem.tolerances.xtol;
  const difference = Math.abs(primary.value - reference.value);
  const threshold = Math.max(primaryTolerance, referenceTolerance);
  return {
    schema: "sagejs.numerics.reference-comparison/v1",
    claim: "A separately executed bisection solve independently validates its candidate and agrees with Brent within the declared x-tolerance.",
    primary: methodSummary(primary, execution.primary_callback_calls),
    reference: methodSummary(reference, execution.reference_callback_calls),
    agreement: {
      absolute_value_difference: difference,
      threshold,
      passed: difference <= threshold,
    },
    execution: {
      independent_runs: true,
      distinct_callback_instances: true,
      callback_reevaluated_for_presentation: false,
    },
    reference_result: reference,
    evidence: [
      "/result/method",
      "/result/value",
      "/result/validation/residual",
      "/result/iterations",
      "/result/evaluations",
      "/reference_comparison/reference_result/method",
      "/reference_comparison/reference_result/value",
      "/reference_comparison/reference_result/validation/residual",
      "/reference_comparison/reference_result/iterations",
      "/reference_comparison/reference_result/evaluations",
    ],
  };
}

function buildStory() {
  const evidence = pythonEvidence();
  const semantic = evidence.animation;
  const plotly = evidence.shared_figure || plotlyFigure(semantic);
  plotly.layout.meta = {
    ...(plotly.layout.meta || {}),
    semantic_source: "PlotAnimation",
    stable_layer_ids: semantic.topology.layers.map((layer) => layer.id),
    trace_truncated: semantic.metadata.trace_truncated,
  };
  const maxSamples = Math.max(...semantic.frames.map((frame) =>
    frame.state.value.layers.reduce(
      (total, layer) => total + scalarCount(layer.data),
      0,
    ),
  ));
  const cases = [
    resultCase(
      "cosine-fixed-point",
      "Normal success: cos(x) = x",
      "success",
      "Where does the cosine curve meet the line y = x on [0, 1]?",
      "Brent's method returns 0.7390851332151559 after 6 iterations and 8 function evaluations. Independent validation measures a residual of 7.993605777301127e-15 and confirms the final sign-changing bracket. A separate bisection run agrees to the requested tolerance.",
      evidence.cases["cosine-fixed-point"],
      {
        status: "converged",
        success: true,
        validation_passed: true,
        diagnostic_codes: [],
      },
    ),
    resultCase(
      "jump-discontinuity",
      "Failure: a sign change without a root",
      "failure",
      "Does a shrinking sign-changing bracket always contain a zero?",
      "No. For the jump function -1 when x < 0 and 1 otherwise, Brent's stopping test reports converged near zero, but the residual remains 1. Independent validation rejects the solver claim and records validation_failed. The missing assumption is continuity.",
      evidence.cases["jump-discontinuity"],
      {
        status: "converged",
        success: false,
        validation_passed: false,
        diagnostic_codes: ["validation_failed"],
      },
    ),
    resultCase(
      "invalid-bracket",
      "Failure: invalid bracket",
      "failure",
      "What happens when both endpoints have the same sign?",
      "For x squared plus 1 on [-1, 1], both endpoint values are positive. Brent stops after the two endpoint evaluations with invalid_bracket; no candidate is invented and validation stays indeterminate.",
      evidence.cases["invalid-bracket"],
      {
        status: "invalid_bracket",
        success: false,
        validation_passed: false,
        diagnostic_codes: ["invalid_bracket"],
      },
    ),
    resultCase(
      "newton-two-cycle",
      "Failure: Newton enters a two-cycle",
      "failure",
      "Can a valid derivative guarantee Newton convergence from any start?",
      "No. Applied to x cubed minus 2x plus 2 from x0 = 0, Newton alternates between 0 and 1. The bounded run stops at 8 iterations with maximum_iterations, residual 2, and indeterminate validation.",
      evidence.cases["newton-two-cycle"],
      {
        status: "maximum_iterations",
        success: false,
        validation_passed: false,
        diagnostic_codes: ["non_replayable_callback", "maximum_iterations"],
      },
    ),
  ];
  cases[0].reference_comparison = referenceComparison(
    evidence.cases["cosine-fixed-point"],
    evidence.verification,
    evidence.comparison_execution,
  );
  return {
    schema_version: 1,
    id: "root-finding",
    domain: "roots",
    operation: "scalar_root",
    title: "A root is more than a crossing",
    summary: "Follow a robust solve, verify it independently, then inspect three failures that separate method termination from mathematical evidence.",
    learning_objectives: [
      "Choose a bracketed or open root method from its mathematical assumptions.",
      "Read a semantic iteration trace without treating a small step as proof of a root.",
      "Distinguish solver termination from independently validated success.",
      "Compare Brent and bisection using retained accuracy and work measurements.",
      "Respond to discontinuity, invalid-bracket, and divergence diagnostics.",
    ],
    method_assumptions: [
      {
        method: "bisection",
        requires: [
          "A finite closed interval [a, b].",
          "A continuous real-valued function on the interval.",
          "Opposite endpoint signs, or an endpoint that is exactly zero.",
        ],
        guarantee: "Maintains a sign-changing bracket and halves its width each iteration.",
        warning: "A jump discontinuity can preserve opposite signs while the residual never approaches zero.",
      },
      {
        method: "brent",
        requires: [
          "The same continuity and finite sign-changing bracket required by bisection.",
          "Function values only; no derivative is required.",
        ],
        guarantee: "Safeguards secant and inverse-quadratic steps with bracket-preserving bisection steps.",
        warning: "Fast bracket shrinkage is not evidence of a root when continuity is false.",
      },
      {
        method: "secant",
        requires: [
          "Two distinct finite starting estimates with distinct function values.",
          "A sufficiently smooth function near the desired root.",
        ],
        guarantee: "Often converges faster than bisection near a simple root, without derivative evaluations.",
        warning: "It does not preserve a bracket and can stagnate, leave the intended region, or converge to another root.",
      },
      {
        method: "newton",
        requires: [
          "A starting estimate in a useful basin of attraction.",
          "A differentiable function with a nonzero derivative near a simple root.",
          "A reliable explicit derivative or a well-scaled finite-difference approximation.",
        ],
        guarantee: "Has local quadratic convergence for a simple root under the usual smoothness and proximity assumptions.",
        warning: "It is not globally convergent; zero derivatives, cycles, and divergent steps are expected failure modes.",
      },
    ],
    language_examples: {
      sage: {
        label: "Sage",
        source: "from sagejs.numerics import find_root as numerical_find_root\nresult = numerical_find_root(lambda x: cos(x) - x, 0.0, 1.0,\n    method=\"brent\", trace=\"evaluations\")",
        classification: "faithful",
        result_shape: "Rich NumericalResult; use the Sage expression method find_root for the scalar compatibility view.",
      },
      python: {
        label: "Python",
        source: "import math\nfrom sagejs.numerics import find_root\nresult = find_root(lambda x: math.cos(x) - x, 0.0, 1.0,\n    method=\"brent\", trace=\"evaluations\")",
        classification: "canonical",
        result_shape: "Rich NumericalResult with result, validation, diagnostics, and trace.",
      },
      matlab: {
        label: "MATLAB",
        source: "result = fzero(@(x) cos(x) - x, [0 1]);",
        classification: "translated",
        result_shape: "MATLAB-compatible scalar view lowered to the canonical scalar_root operation.",
      },
      wolfram: {
        label: "Wolfram Language",
        source: "result = FindRoot[Cos[x] == x, {x, 0, 1}]",
        classification: "translated",
        result_shape: "Wolfram-compatible replacement-rule view lowered to the canonical scalar_root operation.",
      },
    },
    narrative_catalog: {
      success: {
        heading: "The solver claim survived independent checks.",
        explanation: "The result is successful only because solver termination and every recorded validation check passed.",
        action: "Use the residual and bracket error estimate at the precision your downstream calculation needs; refine if that tolerance is insufficient.",
        evidence: [
          "/result/status",
          "/result/success",
          "/result/validation/passed",
          "/result/validation/residual",
        ],
      },
      diagnostics: {
        validation_failed: {
          heading: "Termination is not a validated root.",
          explanation: "The method's stopping test fired, but an independent residual or invariant check failed.",
          action: "Inspect continuity and the function definition around the candidate; do not tighten the x tolerance until the residual can actually decrease.",
          evidence: [
            "/result/status",
            "/result/validation/passed",
            "/result/validation/checks",
            "/result/diagnostics",
          ],
        },
        invalid_bracket: {
          heading: "The requested bracket does not establish a crossing.",
          explanation: "The bracketed method evaluated both endpoints and did not find opposite signs or an endpoint root.",
          action: "Plot or sample the function, then choose finite endpoints with opposite signs on a continuous interval. Same-sign endpoints do not prove that no roots exist elsewhere.",
          evidence: [
            "/result/status",
            "/result/value",
            "/result/evaluations",
            "/result/diagnostics",
          ],
        },
        maximum_iterations: {
          heading: "The iteration budget exposed nonconvergence.",
          explanation: "The method used its bounded iteration budget without producing a validated root.",
          action: "Inspect the trace for cycles or growing steps. For a continuous scalar problem, find a sign-changing bracket and switch to Brent; otherwise improve the initial estimate or model.",
          evidence: [
            "/result/status",
            "/result/iterations",
            "/result/validation/residual",
            "/result/trace/events",
          ],
        },
      },
      status_fallbacks: {
        nonfinite_evaluation: {
          heading: "The callback left the finite numerical domain.",
          explanation: "At least one required function or derivative evaluation was NaN or infinite.",
          action: "Restrict the interval, check units and domains, or rewrite the callback so every required evaluation is finite.",
          evidence: ["/result/status", "/result/diagnostics"],
        },
        stagnation: {
          heading: "The open method cannot make a distinct step.",
          explanation: "Its current numerical state produces no representable progress.",
          action: "Rescale the function, choose different starting points, or use a valid bracketed method.",
          evidence: ["/result/status", "/result/trace/events"],
        },
      },
    },
    cases,
    visualization: {
      case_id: "cosine-fixed-point",
      plot_spec_animation: semantic,
      plotly: {
        schema: "plotly-compatible/v1",
        source: evidence.shared_figure
          ? "sagejs.plotting.lower_plot_animation over the checked PlotAnimation record."
          : "Deterministic gallery adapter over the checked PlotAnimation record.",
        shared_lowering: evidence.shared_lowering,
        figure: plotly,
      },
      budget_measurements: {
        trace_records: traceMeasurements(cases),
        frames: semantic.frames.length,
        max_samples_per_frame: maxSamples,
        semantic_payload_bytes: compactBytes(semantic),
        plotly_payload_bytes: compactBytes(plotly),
      },
    },
    accessibility: {
      static_plot_description: "Blue circles are only function values retained by Brent's bounded evaluation trace; they are not a newly sampled or interpolated curve. The orange segment and endpoint circles show the current sign-changing bracket on y = 0, and the green diamond marks the retained candidate. The trace table gives every retained iteration without relying on position or color.",
      animation_policy: "Manual play only; pause and an iteration slider are always present, and reduced-motion preference disables timed playback without disabling direct frame selection.",
      table_policy: "Every retained iteration is presented in a captioned table, with dash text for fields that do not apply.",
      color_policy: "Bracket and candidate use both distinct shapes and explicit labels; color is supplementary.",
    },
    provenance: {
      implementation: "sagejs.numerics.roots ordinary Python",
      visualization: "sagejs.numerics.visualization PlotAnimation over retained evaluations; presentation never invokes the callback",
      generation: "test/numerics/gallery/generate-root-story.cjs",
      elapsed_policy: "Runtime durations normalized to zero; operation counts and payload bytes are deterministic evidence.",
      placeholders: [],
    },
  };
}

function main(argv = process.argv.slice(2)) {
  const write = argv.includes("--write");
  const story = buildStory();
  const text = stableJson(story);
  if (write) {
    mkdirSync(join(storyPath, ".."), { recursive: true });
    writeFileSync(storyPath, text);
    process.stdout.write(`Wrote ${storyPath}\n`);
    return story;
  }
  assert.ok(existsSync(storyPath), `${storyPath} does not exist; run with --write`);
  const checkedText = readFileSync(storyPath, "utf8");
  const checkedStory = JSON.parse(checkedText);
  assert.equal(checkedText, stableJson(checkedStory), `${storyPath} is not canonical JSON`);
  assertEvidenceEquivalent(story, checkedStory);
  return checkedStory;
}

if (require.main === module) main();

module.exports = { buildStory, main, plotlyFigure, scalarCount };
