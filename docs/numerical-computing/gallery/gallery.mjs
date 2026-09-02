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

function caseHtml(story, caseRecord) {
  const presentation = caseRecord.presentation;
  const plot = presentation
    ? `<figure class="gallery-figure">
        <div class="gallery-plot" id="plot-${escapeHtml(story.id)}-${escapeHtml(caseRecord.id)}"
          data-gallery-plot="${escapeHtml(story.id)}:${escapeHtml(caseRecord.id)}"
          role="img" aria-label="${escapeHtml(presentation.static_description)}">
          <p>${escapeHtml(presentation.static_description)}</p>
        </div>
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
    <p>${escapeHtml(caseRecord.static_description)}</p>
    ${plot}
    <div class="table-scroll"><table>
      <caption>Structured numerical evidence for ${escapeHtml(caseRecord.title)}</caption>
      <tbody>${resultEvidenceRows(caseRecord)}</tbody>
    </table></div>
  </article>`;
}

export function buildAccessibleStoryHtml(story) {
  return `<section class="gallery-story" id="${escapeHtml(story.id)}">
    <header><p class="domain">${escapeHtml(story.domain)} · ${escapeHtml(story.operation)}</p>
      <h2>${escapeHtml(story.title)}</h2><p>${escapeHtml(story.summary)}</p></header>
    <div class="story-columns"><section><h3>Learning objectives</h3><ul>${story.learning_objectives.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
      <section><h3>Method assumptions</h3><ul>${story.method_assumptions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section></div>
    <details><summary>Canonical Python</summary><pre><code>${escapeHtml(story.canonical_python)}</code></pre></details>
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
<title>Sage.js numerical methods laboratory</title><link rel="stylesheet" href="./gallery.css"></head>
<body><header class="hero"><p class="eyebrow">Sage.js numerical computing</p><h1>Evidence, not solver theater</h1>
<p>Nine bounded lessons replay retained numerical evidence. Every success and failure remains fully readable without JavaScript or animation.</p></header>
<nav aria-label="Numerical gallery stories"><h2>Stories</h2><ol>${navigation}</ol></nav>
<main>${body}</main>
<noscript><p class="noscript">JavaScript is off. All explanations and result tables are already present; interactive Plotly views and JSON downloads are optional enhancements.</p></noscript>
<footer><p>Animations never autoplay, never re-evaluate a mathematical callback, and never interpolate an uncomputed solver state.</p></footer>
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

export async function renderPresentation(container, presentation, Plotly) {
  if (!Plotly || typeof Plotly.newPlot !== "function") return false;
  const figure = presentation.plotly.figure;
  await Plotly.newPlot(container, figure.data, figure.layout, figure.config);
  if (Array.isArray(figure.frames) && figure.frames.length > 0) {
    if (typeof Plotly.addFrames !== "function") {
      throw new Error("Plotly.addFrames is required for gallery animations");
    }
    await Plotly.addFrames(container, figure.frames);
  }
  container.dataset.galleryRendered = "true";
  return true;
}

export async function hydrateGallery(
  bundle,
  {
    documentObject = globalThis.document,
    Plotly = globalThis.Plotly,
  } = {},
) {
  assertGalleryBudgets(bundle);
  const rendered = [];
  for (const container of documentObject.querySelectorAll("[data-gallery-plot]")) {
    const [storyId, caseId] = container.dataset.galleryPlot.split(":");
    const { caseRecord } = caseById(bundle, storyId, caseId);
    rendered.push(await renderPresentation(
      container,
      caseRecord.presentation,
      Plotly,
    ));
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
