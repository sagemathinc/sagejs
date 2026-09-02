const BUNDLE_SCHEMA = "sagejs.numerics.gallery.bundle/v1";
const STORY_SCHEMA = "sagejs.numerics.gallery.story/v1";

function bytes(value) {
  return new TextEncoder().encode(value).byteLength;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(canonical(value));
}

export function assertTimingBudget(bundle, budgetName, observedMilliseconds) {
  const limit = bundle?.budgets?.[budgetName];
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`gallery timing budget ${budgetName} is missing`);
  }
  if (!Number.isFinite(observedMilliseconds) || observedMilliseconds < 0) {
    throw new TypeError(`${budgetName} observation must be finite and nonnegative`);
  }
  if (observedMilliseconds > limit) {
    throw new RangeError(
      `${budgetName} exceeded: ${observedMilliseconds.toFixed(3)}ms > ${limit}ms`,
    );
  }
  return observedMilliseconds;
}

export function encodeSharedSource(source) {
  const encoded = new TextEncoder().encode(String(source));
  let binary = "";
  for (const byte of encoded) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function openInSageUrl(source) {
  return `https://app.sagejs.org/#code=${encodeSharedSource(source)}`;
}

export function getPointer(value, pointer) {
  if (pointer === "") return value;
  if (typeof pointer !== "string" || !pointer.startsWith("/")) {
    throw new TypeError("gallery evidence pointers must be JSON pointers");
  }
  let current = value;
  for (const encoded of pointer.slice(1).split("/")) {
    const key = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (current === null || typeof current !== "object" || !(key in current)) {
      throw new Error(`missing gallery evidence ${pointer}`);
    }
    current = current[key];
  }
  return current;
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
  return 1;
}

function traceMeasurement(result) {
  return {
    events: result.trace.retained_events,
    payload: bytes(JSON.stringify(result.trace)),
  };
}

function resultSummary(result, callbackCalls) {
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

function assertReferenceComparison(caseRecord, storyId) {
  const comparison = caseRecord.reference_comparison;
  if (!comparison) return null;
  const label = `${storyId}/${caseRecord.id}`;
  if (comparison.schema !== "sagejs.numerics.reference-comparison/v1") {
    throw new Error(`${label}: unknown reference comparison schema`);
  }
  if (
    !comparison.execution.independent_runs ||
    !comparison.execution.distinct_callback_instances ||
    comparison.execution.callback_reevaluated_for_presentation
  ) {
    throw new Error(`${label}: reference comparison is not an independent retained run`);
  }
  const reference = comparison.reference_result;
  const primarySummary = resultSummary(
    caseRecord.result,
    comparison.primary.callback_calls,
  );
  const referenceSummary = resultSummary(
    reference,
    comparison.reference.callback_calls,
  );
  if (stableJson(comparison.primary) !== stableJson(primarySummary)) {
    throw new Error(`${label}: primary comparison summary drifted from its result`);
  }
  if (stableJson(comparison.reference) !== stableJson(referenceSummary)) {
    throw new Error(`${label}: reference comparison summary drifted from its result`);
  }
  if (comparison.primary.method === comparison.reference.method) {
    throw new Error(`${label}: reference comparison reused the primary method`);
  }
  for (const summary of [comparison.primary, comparison.reference]) {
    if (!summary.validation_passed || summary.truth_level !== "validated_approximate") {
      throw new Error(`${label}: reference comparison contains an unvalidated result`);
    }
    if (
      !Number.isInteger(summary.callback_calls) ||
      summary.callback_calls < summary.evaluations
    ) {
      throw new Error(`${label}: invalid retained callback count`);
    }
  }
  const primaryProblem = caseRecord.result.reproducibility.problem;
  const referenceProblem = reference.reproducibility.problem;
  for (const field of [
    "domain",
    "operation",
    "function",
    "bounds",
    "numeric_type",
    "tolerances",
  ]) {
    if (stableJson(primaryProblem[field]) !== stableJson(referenceProblem[field])) {
      throw new Error(`${label}: compared runs do not describe the same ${field}`);
    }
  }
  const difference = Math.abs(caseRecord.result.value - reference.value);
  if (difference !== comparison.agreement.absolute_value_difference) {
    throw new Error(`${label}: candidate difference is not derived from results`);
  }
  if (
    !Number.isFinite(comparison.agreement.threshold) ||
    comparison.agreement.threshold <= 0 ||
    comparison.agreement.passed !== (difference <= comparison.agreement.threshold)
  ) {
    throw new Error(`${label}: invalid reference-method agreement claim`);
  }
  for (const pointer of comparison.evidence) getPointer(caseRecord, pointer);
  return traceMeasurement(reference);
}

function presentationMeasurements(presentation) {
  if (!presentation) {
    return { frames: 0, scalars: 0, semantic: 0, plotly: 0 };
  }
  const animation = presentation.plot_animation;
  let frames = 0;
  let scalars = 0;
  let semantic = 0;
  if (animation) {
    frames = animation.frames.length;
    semantic = bytes(JSON.stringify(animation));
    for (const frame of animation.frames) {
      scalars = Math.max(scalars, scalarCount(frame));
    }
  }
  return {
    frames,
    scalars,
    semantic,
    plotly: bytes(JSON.stringify(presentation.plotly)),
  };
}

function assertStableTopology(animation, storyId, caseId) {
  const baseline = animation.topology.layers;
  if (!Array.isArray(baseline) || baseline.length === 0) {
    throw new Error(`${storyId}/${caseId}: missing animation topology`);
  }
  if (animation.controls.autoplay !== false) {
    throw new Error(`${storyId}/${caseId}: gallery animations must not autoplay`);
  }
  for (const name of ["play", "pause", "step", "restart", "speed", "slider"]) {
    if (animation.controls[name] !== true) {
      throw new Error(`${storyId}/${caseId}: missing ${name} animation control`);
    }
  }
  for (const frame of animation.frames) {
    const layers = frame.state.value.layers;
    const topology = layers.map(({ id, kind }) => ({ id, kind }));
    if (stableJson(topology) !== stableJson(baseline)) {
      throw new Error(`${storyId}/${caseId}: unstable animation topology`);
    }
    if (frame.metadata?.interpolated === true) {
      throw new Error(`${storyId}/${caseId}: fabricated interpolated frame`);
    }
  }
}

function assertPlotly(presentation, storyId, caseId) {
  const record = presentation.plotly;
  if (record.schema !== "plotly-compatible/v1") {
    throw new Error(`${storyId}/${caseId}: unknown Plotly export schema`);
  }
  if (!record.figure || !Array.isArray(record.figure.data)) {
    throw new Error(`${storyId}/${caseId}: invalid Plotly figure`);
  }
  const animation = presentation.plot_animation;
  if (!animation) return;
  if (!Array.isArray(record.figure.frames)) {
    throw new Error(`${storyId}/${caseId}: Plotly animation has no frames`);
  }
  if (record.figure.frames.length !== animation.frames.length) {
    throw new Error(`${storyId}/${caseId}: semantic/Plotly frame mismatch`);
  }
  const semanticIds = animation.frames.map((frame) => frame.id);
  const plotlyIds = record.figure.frames.map((frame) => frame.name);
  if (stableJson(semanticIds) !== stableJson(plotlyIds)) {
    throw new Error(`${storyId}/${caseId}: Plotly frame identities drifted`);
  }
  const protocol = record.figure.layout?.meta?.sagejs_animation_controls;
  if (protocol?.schema !== "sagejs.plotting.animation-controls/v1") {
    throw new Error(`${storyId}/${caseId}: missing animation host protocol`);
  }
  if (!protocol.computed_frames_only || protocol.autoplay || protocol.loop) {
    throw new Error(`${storyId}/${caseId}: unsafe animation host protocol`);
  }
}

export function assertGalleryBudgets(bundle, serialized = undefined) {
  if (!bundle || bundle.schema !== BUNDLE_SCHEMA) {
    throw new Error("unknown numerical gallery bundle schema");
  }
  if (!Array.isArray(bundle.stories) || bundle.stories.length === 0) {
    throw new Error("the numerical gallery must contain stories");
  }
  const actualBundleBytes = serialized === undefined
    ? bundle.measurements.bundle_bytes
    : bytes(serialized);
  if (
    serialized !== undefined &&
    actualBundleBytes !== bundle.measurements.bundle_bytes
  ) {
    throw new Error("gallery bundle byte measurement is stale");
  }
  if (actualBundleBytes > bundle.budgets.max_bundle_bytes) {
    throw new Error("gallery exceeds max_bundle_bytes");
  }
  const ids = new Set();
  const observedOrder = [];
  let caseCount = 0;
  let animatedCaseCount = 0;
  for (const story of bundle.stories) {
    if (story.schema !== STORY_SCHEMA) {
      throw new Error(`${story.id}: unknown gallery story schema`);
    }
    if (ids.has(story.id)) throw new Error(`duplicate gallery story ${story.id}`);
    ids.add(story.id);
    observedOrder.push(story.id);
    if (story.cases.length < 2) {
      throw new Error(`${story.id}: stories require success and failure cases`);
    }
    const kinds = new Set(story.cases.map((item) => item.kind));
    if (!kinds.has("success") || !kinds.has("failure")) {
      throw new Error(`${story.id}: success and failure stories are both required`);
    }
    const actualStoryBytes = bytes(stableJson(story));
    // Python deliberately preserves distinctions such as 1.0 versus 1 in the
    // checked artifact. JavaScript's JSON.stringify canonicalizes both to 1,
    // so its reconstruction can be smaller but must never be larger than the
    // source-side byte receipt.
    if (actualStoryBytes > story.measurements.story_bytes) {
      throw new Error(`${story.id}: story byte receipt understates the payload`);
    }
    if (actualStoryBytes > bundle.budgets.max_story_bytes) {
      throw new Error(`${story.id}: story exceeds max_story_bytes`);
    }
    const observed = {
      traceEvents: 0,
      traceBytes: 0,
      frames: 0,
      scalars: 0,
      semantic: 0,
      plotly: 0,
    };
    for (const caseRecord of story.cases) {
      caseCount += 1;
      if (!caseRecord.static_description || !caseRecord.question) {
        throw new Error(`${story.id}/${caseRecord.id}: missing static lesson`);
      }
      for (const pointer of caseRecord.evidence) getPointer(caseRecord, pointer);
      const trace = traceMeasurement(caseRecord.result);
      observed.traceEvents = Math.max(observed.traceEvents, trace.events);
      observed.traceBytes = Math.max(observed.traceBytes, trace.payload);
      if (trace.events > bundle.budgets.max_trace_events_per_result) {
        throw new Error(`${story.id}/${caseRecord.id}: max_trace_events_per_result`);
      }
      if (trace.payload > bundle.budgets.max_trace_bytes_per_result) {
        throw new Error(`${story.id}/${caseRecord.id}: max_trace_bytes_per_result`);
      }
      const referenceTrace = assertReferenceComparison(caseRecord, story.id);
      if (referenceTrace) {
        observed.traceEvents = Math.max(observed.traceEvents, referenceTrace.events);
        observed.traceBytes = Math.max(observed.traceBytes, referenceTrace.payload);
        if (referenceTrace.events > bundle.budgets.max_trace_events_per_result) {
          throw new Error(
            `${story.id}/${caseRecord.id}: reference max_trace_events_per_result`,
          );
        }
        if (referenceTrace.payload > bundle.budgets.max_trace_bytes_per_result) {
          throw new Error(
            `${story.id}/${caseRecord.id}: reference max_trace_bytes_per_result`,
          );
        }
      }
      const presentation = caseRecord.presentation;
      if (!presentation) continue;
      if (!presentation.computed_evidence_only) {
        throw new Error(`${story.id}/${caseRecord.id}: non-evidence presentation`);
      }
      if (presentation.callback_reevaluated) {
        throw new Error(`${story.id}/${caseRecord.id}: callback was reevaluated`);
      }
      if (
        presentation.callback_count_before !== presentation.callback_count_after
      ) {
        throw new Error(`${story.id}/${caseRecord.id}: callback count changed`);
      }
      const measured = presentationMeasurements(presentation);
      observed.frames = Math.max(observed.frames, measured.frames);
      observed.scalars = Math.max(observed.scalars, measured.scalars);
      observed.semantic = Math.max(observed.semantic, measured.semantic);
      observed.plotly = Math.max(observed.plotly, measured.plotly);
      if (presentation.plot_animation) {
        animatedCaseCount += 1;
        assertStableTopology(presentation.plot_animation, story.id, caseRecord.id);
      }
      assertPlotly(presentation, story.id, caseRecord.id);
    }
    const expected = story.measurements;
    const fields = [
      ["max_trace_events", observed.traceEvents],
      ["max_trace_bytes", observed.traceBytes],
      ["max_animation_frames", observed.frames],
      ["max_frame_scalars", observed.scalars],
      ["max_semantic_animation_bytes", observed.semantic],
      ["max_plotly_bytes", observed.plotly],
    ];
    for (const [field, value] of fields) {
      const byteReceipt = field.includes("bytes");
      if (
        (byteReceipt && value > expected[field]) ||
        (!byteReceipt && expected[field] !== value)
      ) {
        throw new Error(`${story.id}: ${field} measurement is stale`);
      }
    }
    if (observed.frames > bundle.budgets.max_animation_frames) {
      throw new Error(`${story.id}: max_animation_frames`);
    }
    if (observed.scalars > bundle.budgets.max_scalars_per_frame) {
      throw new Error(`${story.id}: max_scalars_per_frame`);
    }
    if (observed.semantic > bundle.budgets.max_semantic_animation_bytes) {
      throw new Error(`${story.id}: max_semantic_animation_bytes`);
    }
    if (observed.plotly > bundle.budgets.max_plotly_bytes) {
      throw new Error(`${story.id}: max_plotly_bytes`);
    }
  }
  if (stableJson(observedOrder) !== stableJson(bundle.story_order)) {
    throw new Error("gallery story order is stale");
  }
  if (caseCount !== bundle.measurements.case_count) {
    throw new Error("gallery case count is stale");
  }
  if (animatedCaseCount !== bundle.measurements.animated_case_count) {
    throw new Error("gallery animated case count is stale");
  }
  return {
    bundle_bytes: actualBundleBytes,
    story_count: bundle.stories.length,
    case_count: caseCount,
    animated_case_count: animatedCaseCount,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resultEvidenceRows(caseRecord) {
  const result = caseRecord.result;
  const rows = [
    ["Status", result.status],
    ["Success", String(result.success)],
    ["Method", result.method],
    ["Backend", result.backend],
    ["Validation", `${result.validation.truth_level}; passed=${result.validation.passed}`],
    ["Iterations", result.iterations],
    ["Evaluations", result.evaluations],
    [
      "Diagnostics",
      result.diagnostics.map((item) => item.code).join(", ") || "none",
    ],
  ];
  return rows.map(([key, value]) =>
    `<tr><th scope="row">${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`
  ).join("");
}

function referenceComparisonHtml(caseRecord) {
  const comparison = caseRecord.reference_comparison;
  if (!comparison) return "";
  const rows = [comparison.primary, comparison.reference].map((record, index) =>
    `<tr><th scope="row">${escapeHtml(index === 0 ? "Primary" : "Reference")}</th>` +
    `<td>${escapeHtml(record.method)}</td>` +
    `<td>${escapeHtml(record.value)}</td>` +
    `<td>${escapeHtml(record.residual)}</td>` +
    `<td>${escapeHtml(record.iterations)}</td>` +
    `<td>${escapeHtml(record.evaluations)}</td>` +
    `<td>${escapeHtml(record.callback_calls)}</td></tr>`
  ).join("");
  const agreement = comparison.agreement;
  return `<section class="reference-comparison" data-reference-comparison>
    <h4>Independent reference-method comparison</h4>
    <p>${escapeHtml(comparison.claim)}</p>
    <div class="table-scroll"><table>
      <caption>Two retained executions of the same numerical problem</caption>
      <thead><tr><th scope="col">Role</th><th scope="col">Method</th><th scope="col">Candidate</th><th scope="col">Residual</th><th scope="col">Iterations</th><th scope="col">Evaluations</th><th scope="col">Callback calls</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p><strong>Agreement:</strong> absolute candidate difference ${escapeHtml(agreement.absolute_value_difference)}; threshold ${escapeHtml(agreement.threshold)}; passed=${escapeHtml(agreement.passed)}.</p>
  </section>`;
}

function animationControlsHtml(presentation) {
  const animation = presentation?.plot_animation;
  if (!animation) return "";
  const controls = animation.controls;
  const buttons = [
    ["play", "Play"],
    ["pause", "Pause"],
    ["step", "Step"],
    ["restart", "Restart"],
  ].filter(([name]) => controls[name]).map(([name, label]) =>
    `<button type="button" data-animation-action="${name}">${label}</button>`
  ).join("");
  const speeds = controls.speed_multipliers.map((speed) =>
    `<option value="${escapeHtml(speed)}"${speed === controls.default_speed ? " selected" : ""}>${escapeHtml(speed)}×</option>`
  ).join("");
  const speed = controls.speed
    ? `<label>Speed <select data-animation-speed>${speeds}</select></label>`
    : "";
  const slider = controls.slider
    ? `<label class="animation-iteration">Iteration
        <input data-animation-slider type="range" min="0" max="${animation.frames.length - 1}" step="1" value="0">
        <output data-animation-frame-label>${escapeHtml(animation.frames[0].label)}</output>
      </label>`
    : "";
  return `<div class="gallery-animation-controls" data-gallery-animation-controls hidden>
    <div class="animation-transport" role="group" aria-label="Animation playback controls">${buttons}</div>
    ${speed}${slider}
    <span class="reduced-motion-note" data-animation-reduced-note hidden>Timed playback is disabled by your reduced-motion preference; Step, Restart, and Iteration remain available.</span>
  </div>`;
}

function caseHtml(story, caseRecord) {
  const presentation = caseRecord.presentation;
  const animationControls = animationControlsHtml(presentation);
  const plot = presentation
    ? `<figure class="gallery-figure">
        <div class="gallery-plot" id="plot-${escapeHtml(story.id)}-${escapeHtml(caseRecord.id)}"
          data-gallery-plot="${escapeHtml(story.id)}:${escapeHtml(caseRecord.id)}"
          role="img" aria-label="${escapeHtml(presentation.static_description)}">
          <p>${escapeHtml(presentation.static_description)}</p>
        </div>${animationControls ? `
        ${animationControls}` : ""}
        <figcaption>${escapeHtml(presentation.static_description)}</figcaption>
        <div class="gallery-actions">
          <button type="button" data-export="plotspec" data-story="${escapeHtml(story.id)}" data-case="${escapeHtml(caseRecord.id)}">Export PlotSpec JSON</button>
          <button type="button" data-export="plotly" data-story="${escapeHtml(story.id)}" data-case="${escapeHtml(caseRecord.id)}">Export Plotly JSON</button>
          <button type="button" data-export="html" data-story="${escapeHtml(story.id)}" data-case="${escapeHtml(caseRecord.id)}">Export accessible HTML</button>
        </div>
      </figure>`
    : `<p class="no-animation">No animation is shown: this result did not retain a complete visual state. The structured failure evidence below remains the lesson.</p>`;
  return `<article class="gallery-case gallery-case-${escapeHtml(caseRecord.kind)}" id="case-${escapeHtml(story.id)}-${escapeHtml(caseRecord.id)}">
    <p class="case-kind">${escapeHtml(caseRecord.kind)}</p>
    <h3>${escapeHtml(caseRecord.title)}</h3>
    <p class="question">${escapeHtml(caseRecord.question)}</p>
    <p>${escapeHtml(caseRecord.static_description)}</p>${referenceComparisonHtml(caseRecord)}
    ${plot}
    <div class="table-scroll"><table>
      <caption>Structured numerical evidence for ${escapeHtml(caseRecord.title)}</caption>
      <tbody>${resultEvidenceRows(caseRecord)}</tbody>
    </table></div>
  </article>`;
}

export function buildAccessibleStoryHtml(story) {
  const openUrl = openInSageUrl(story.canonical_python);
  return `<section class="gallery-story" id="${escapeHtml(story.id)}">
    <header><p class="domain">${escapeHtml(story.domain)} · ${escapeHtml(story.operation)}</p>
      <h2>${escapeHtml(story.title)}</h2><p>${escapeHtml(story.summary)}</p></header>
    <div class="story-columns"><section><h3>Learning objectives</h3><ul>${story.learning_objectives.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
      <section><h3>Method assumptions</h3><ul>${story.method_assumptions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section></div>
    <details><summary>Complete Sage.js example</summary><pre><code>${escapeHtml(story.canonical_python)}</code></pre>
      <p><a class="open-in-sage" href="${escapeHtml(openUrl)}" target="_blank" rel="noopener">Open in Sage.js</a> — starts a fresh browser worksheet containing this self-contained example.</p></details>
    ${story.cases.map((item) => caseHtml(story, item)).join("")}
  </section>`;
}

export function buildGalleryDocument(bundle) {
  const navigation = bundle.stories.map((story) =>
    `<li><a href="#${escapeHtml(story.id)}">${escapeHtml(story.title)}</a></li>`
  ).join("");
  const body = bundle.stories.map(buildAccessibleStoryHtml).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Nine interactive Sage.js numerical lessons with checked results, failures, traces, plots, and animations.">
<title>Sage.js numerical methods laboratory</title><link rel="stylesheet" href="./gallery.css"></head>
<body><header class="hero"><p class="site-links"><a href="../">Sage.js dashboard</a> · <a href="https://app.sagejs.org/">Run Sage.js</a> · <a href="../reference.html">Reference</a></p><p class="eyebrow">Sage.js numerical computing</p><h1>Evidence, not solver theater</h1>
<p>Nine bounded lessons replay retained numerical evidence. Every success and failure remains fully readable without JavaScript or animation.</p></header>
<nav aria-label="Numerical gallery stories"><h2>Stories</h2><ol>${navigation}</ol></nav>
<main>${body}</main>
<noscript><p class="noscript">JavaScript is off. All explanations and result tables are already present; interactive Plotly views and JSON downloads are optional enhancements.</p></noscript>
<footer><p>Animations never autoplay, never re-evaluate a mathematical callback, and never interpolate an uncomputed solver state.</p></footer>
<script src="./plotly.min.js"></script>
<script type="module">import { loadAndHydrate } from "./gallery.mjs"; loadAndHydrate().catch((error) => { document.documentElement.dataset.galleryError = error.message; });</script>
</body></html>\n`;
}

export function caseById(bundle, storyId, caseId) {
  const story = bundle.stories.find((item) => item.id === storyId);
  if (!story) throw new Error(`unknown gallery story ${storyId}`);
  const caseRecord = story.cases.find((item) => item.id === caseId);
  if (!caseRecord) throw new Error(`unknown gallery case ${storyId}/${caseId}`);
  return { story, caseRecord };
}

export function buildPlotSpecExport(bundle, storyId, caseId) {
  const { caseRecord } = caseById(bundle, storyId, caseId);
  if (!caseRecord.presentation) throw new Error("case has no PlotSpec presentation");
  const value = caseRecord.presentation.plot_animation ||
    caseRecord.presentation.plot_spec;
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function buildPlotlyExport(bundle, storyId, caseId) {
  const { caseRecord } = caseById(bundle, storyId, caseId);
  if (!caseRecord.presentation) throw new Error("case has no Plotly presentation");
  return `${JSON.stringify(caseRecord.presentation.plotly.figure, null, 2)}\n`;
}

export function buildAccessibleExportHtml(bundle, storyId, caseId) {
  const { story, caseRecord } = caseById(bundle, storyId, caseId);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(caseRecord.title)}</title></head><body><main><h1>${escapeHtml(story.title)}</h1>${caseHtml(story, caseRecord)}</main></body></html>\n`;
}

function download(documentObject, filename, type, text) {
  const anchor = documentObject.createElement("a");
  const blob = new Blob([text], { type });
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.hidden = true;
  documentObject.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(anchor.href);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function reducedMotionFigure(figure) {
  const copy = clone(figure);
  const menus = copy.layout?.updatemenus;
  if (Array.isArray(menus)) {
    for (const menu of menus) {
      if (Array.isArray(menu.buttons)) {
        menu.buttons = menu.buttons.filter((button) => button.label !== "Play");
      }
    }
  }
  const sliders = copy.layout?.sliders;
  if (Array.isArray(sliders)) {
    for (const slider of sliders) {
      for (const step of slider.steps || []) {
        const options = step.args?.[1];
        if (options?.frame) options.frame.duration = 0;
        if (options?.transition) options.transition.duration = 0;
      }
    }
  }
  return copy;
}

function animationProtocol(presentation) {
  const animation = presentation.plot_animation;
  if (!animation) return null;
  const protocol = presentation.plotly.figure.layout?.meta
    ?.sagejs_animation_controls;
  if (protocol?.schema !== "sagejs.plotting.animation-controls/v1") {
    throw new Error("animated gallery figure lacks the Sage.js host-control protocol");
  }
  if (!protocol.computed_frames_only || protocol.autoplay || protocol.loop) {
    throw new Error("animation host protocol permits non-evidence playback");
  }
  const semanticIds = animation.frames.map((frame) => frame.id);
  const plotlyIds = presentation.plotly.figure.frames.map((frame) => frame.name);
  if (
    stableJson(protocol.frame_ids) !== stableJson(semanticIds) ||
    stableJson(plotlyIds) !== stableJson(semanticIds)
  ) {
    throw new Error("animation host protocol frame identities drifted");
  }
  return protocol;
}

export function attachAnimationControls(
  container,
  presentation,
  Plotly,
  { prefersReducedMotion = false } = {},
) {
  const protocol = animationProtocol(presentation);
  if (!protocol) return null;
  if (typeof Plotly.animate !== "function") {
    throw new Error("Plotly.animate is required for gallery animation controls");
  }
  const toolbar = container.parentElement?.querySelector(
    "[data-gallery-animation-controls]",
  );
  if (!toolbar) throw new Error("animation control host is missing");
  const frameIds = protocol.frame_ids;
  const frameLabels = protocol.frame_labels;
  const slider = toolbar.querySelector("[data-animation-slider]");
  const output = toolbar.querySelector("[data-animation-frame-label]");
  const speedSelect = toolbar.querySelector("[data-animation-speed]");
  const note = toolbar.querySelector("[data-animation-reduced-note]");
  const buttons = Object.fromEntries(
    [...toolbar.querySelectorAll("[data-animation-action]")].map((button) =>
      [button.dataset.animationAction, button]
    ),
  );
  let activeIndex = 0;
  let speed = protocol.default_speed;
  let playing = false;
  let playbackToken = 0;

  function updateUi() {
    if (slider) slider.value = String(activeIndex);
    if (output) output.value = frameLabels[activeIndex];
    if (buttons.play) buttons.play.disabled = prefersReducedMotion || playing || activeIndex >= frameIds.length - 1;
    if (buttons.pause) buttons.pause.disabled = !playing;
    if (buttons.step) buttons.step.disabled = activeIndex >= frameIds.length - 1;
    if (buttons.restart) buttons.restart.disabled = activeIndex === 0;
    if (speedSelect) speedSelect.disabled = prefersReducedMotion;
    if (note) note.hidden = !prefersReducedMotion;
    toolbar.dataset.animationActiveIndex = String(activeIndex);
    toolbar.dataset.animationPlaying = String(playing);
    toolbar.dataset.animationSpeed = String(speed);
    toolbar.dataset.animationReducedMotion = String(prefersReducedMotion);
  }

  function selectIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= frameIds.length) {
      throw new RangeError(`animation frame index ${index} is out of range`);
    }
    activeIndex = index;
    updateUi();
  }

  async function animateTo(index, duration) {
    selectIndex(index);
    await Plotly.animate(container, [frameIds[index]], {
      frame: { duration, redraw: protocol.redraw },
      transition: {
        duration: duration === 0
          ? 0
          : Math.max(0, Math.round(protocol.transition_duration_ms / speed)),
      },
      mode: "immediate",
    });
  }

  async function pause() {
    playbackToken += 1;
    playing = false;
    updateUi();
    await Plotly.animate(container, [null], {
      frame: { duration: 0, redraw: protocol.redraw },
      transition: { duration: 0 },
      mode: "immediate",
    });
  }

  async function step() {
    await pause();
    if (activeIndex < frameIds.length - 1) {
      await animateTo(activeIndex + 1, 0);
    }
  }

  async function restart() {
    await pause();
    await animateTo(0, 0);
  }

  async function play() {
    if (prefersReducedMotion || playing || activeIndex >= frameIds.length - 1) {
      return;
    }
    const token = playbackToken + 1;
    playbackToken = token;
    playing = true;
    updateUi();
    while (token === playbackToken && activeIndex < frameIds.length - 1) {
      const duration = Math.max(
        1,
        Math.round(protocol.frame_duration_ms / speed),
      );
      await animateTo(activeIndex + 1, duration);
    }
    if (token === playbackToken) {
      playing = false;
      updateUi();
    }
  }

  const actions = { play, pause, step, restart };
  function invoke(operation) {
    Promise.resolve(operation()).catch((error) => {
      toolbar.dataset.animationError = error.message;
    });
  }
  for (const [name, button] of Object.entries(buttons)) {
    button.addEventListener("click", () => invoke(actions[name]));
  }
  if (speedSelect) {
    speedSelect.addEventListener("change", () => {
      const candidate = Number(speedSelect.value);
      if (!protocol.speed_multipliers.includes(candidate)) {
        toolbar.dataset.animationError = "unsupported animation speed";
        return;
      }
      speed = candidate;
      updateUi();
    });
  }
  if (slider) {
    slider.addEventListener("change", () => {
      const requestedIndex = Number(slider.value);
      invoke(async () => {
        await pause();
        await animateTo(requestedIndex, 0);
      });
    });
  }
  if (typeof container.on === "function") {
    container.on("plotly_animated", (event) => {
      const index = frameIds.indexOf(event?.name);
      if (index >= 0) selectIndex(index);
    });
    container.on("plotly_sliderchange", (event) => {
      const frameId = event?.step?.args?.[0]?.[0];
      const index = frameIds.indexOf(frameId);
      if (index >= 0) selectIndex(index);
    });
  }
  toolbar.hidden = false;
  updateUi();
  const controller = {
    play,
    pause,
    step,
    restart,
    select: async (index) => {
      await pause();
      await animateTo(index, 0);
    },
    snapshot: () => ({ activeIndex, speed, playing, prefersReducedMotion }),
  };
  container.__sagejsAnimationController = controller;
  return controller;
}

export async function renderPresentation(
  container,
  presentation,
  Plotly,
  { prefersReducedMotion = false } = {},
) {
  if (!Plotly || typeof Plotly.newPlot !== "function") return false;
  const sourceFigure = presentation.plotly.figure;
  const figure = prefersReducedMotion && presentation.plot_animation
    ? reducedMotionFigure(sourceFigure)
    : sourceFigure;
  await Plotly.newPlot(container, figure.data, figure.layout, figure.config);
  if (Array.isArray(figure.frames) && figure.frames.length > 0) {
    if (typeof Plotly.addFrames !== "function") {
      throw new Error("Plotly.addFrames is required for gallery animations");
    }
    await Plotly.addFrames(container, figure.frames);
    attachAnimationControls(container, presentation, Plotly, {
      prefersReducedMotion,
    });
  }
  container.dataset.galleryRendered = "true";
  return true;
}

export async function hydrateGallery(
  bundle,
  {
    documentObject = globalThis.document,
    Plotly = globalThis.Plotly,
    matchMedia = globalThis.matchMedia,
  } = {},
) {
  assertGalleryBudgets(bundle);
  const started = globalThis.performance.now();
  const rendered = [];
  const renderTimes = [];
  const prefersReducedMotion = typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (const container of documentObject.querySelectorAll("[data-gallery-plot]")) {
    const [storyId, caseId] = container.dataset.galleryPlot.split(":");
    const { caseRecord } = caseById(bundle, storyId, caseId);
    const renderStarted = globalThis.performance.now();
    rendered.push(await renderPresentation(
      container,
      caseRecord.presentation,
      Plotly,
      { prefersReducedMotion },
    ));
    renderTimes.push(globalThis.performance.now() - renderStarted);
  }
  for (const button of documentObject.querySelectorAll("[data-export]")) {
    button.addEventListener("click", () => {
      const kind = button.dataset.export;
      const storyId = button.dataset.story;
      const caseId = button.dataset.case;
      if (kind === "plotspec") {
        download(documentObject, `${storyId}-${caseId}-plotspec.json`, "application/json", buildPlotSpecExport(bundle, storyId, caseId));
      } else if (kind === "plotly") {
        download(documentObject, `${storyId}-${caseId}-plotly.json`, "application/json", buildPlotlyExport(bundle, storyId, caseId));
      } else {
        download(documentObject, `${storyId}-${caseId}.html`, "text/html", buildAccessibleExportHtml(bundle, storyId, caseId));
      }
    });
  }
  const hydrationMilliseconds = globalThis.performance.now() - started;
  const maximumRenderMilliseconds = Math.max(0, ...renderTimes);
  assertTimingBudget(
    bundle,
    "max_browser_hydration_ms",
    hydrationMilliseconds,
  );
  assertTimingBudget(
    bundle,
    "max_single_plot_render_ms",
    maximumRenderMilliseconds,
  );
  documentObject.documentElement.dataset.galleryHydrationMs =
    hydrationMilliseconds.toFixed(3);
  documentObject.documentElement.dataset.galleryMaxRenderMs =
    maximumRenderMilliseconds.toFixed(3);
  documentObject.documentElement.dataset.galleryReady = "true";
  documentObject.documentElement.dataset.galleryRenderedCount = String(
    rendered.filter(Boolean).length,
  );
  return rendered;
}

export async function loadAndHydrate({ url = "./evidence.json", ...options } = {}) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`gallery evidence fetch failed: ${response.status}`);
  const text = await response.text();
  const bundle = JSON.parse(text);
  assertGalleryBudgets(bundle, text);
  return hydrateGallery(bundle, options);
}
