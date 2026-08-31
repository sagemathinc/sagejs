const SVG_NS = "http://www.w3.org/2000/svg";

export function getPointer(record, pointer) {
  if (pointer === "") return record;
  if (!pointer.startsWith("/")) throw new TypeError(`invalid JSON pointer: ${pointer}`);
  return pointer.slice(1).split("/").reduce((value, rawPart) => {
    const part = rawPart.replaceAll("~1", "/").replaceAll("~0", "~");
    if (value === null || value === undefined || !(part in Object(value))) {
      throw new Error(`missing narrative evidence at ${pointer}`);
    }
    return value[part];
  }, record);
}

export function diagnosticCodes(result) {
  return (result.diagnostics || []).map((diagnostic) => diagnostic.code);
}

export function buildCaseNarrative(story, caseRecord) {
  const { result } = caseRecord;
  let source = "status";
  let key = result.status;
  let rule;
  if (result.success === true && result.validation?.passed === true) {
    source = "success";
    key = "success";
    rule = story.narrative_catalog.success;
  } else {
    for (const code of diagnosticCodes(result)) {
      if (story.narrative_catalog.diagnostics[code]) {
        source = "diagnostic";
        key = code;
        rule = story.narrative_catalog.diagnostics[code];
        break;
      }
    }
    rule ||= story.narrative_catalog.status_fallbacks[result.status];
  }
  if (!rule) {
    throw new Error(`no evidence narrative for case ${caseRecord.id}: ${result.status}`);
  }
  return {
    source,
    key,
    heading: rule.heading,
    explanation: rule.explanation,
    action: rule.action,
    evidence: rule.evidence.map((pointer) => ({
      pointer,
      value: getPointer(caseRecord, pointer),
    })),
  };
}

function utf8Bytes(value) {
  return new TextEncoder().encode(
    typeof value === "string" ? value : JSON.stringify(value),
  ).byteLength;
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

function tracedResults(story) {
  return story.cases.flatMap((caseRecord) => {
    const records = [{ id: `${caseRecord.id}:result`, value: caseRecord.result }];
    if (caseRecord.verification) {
      records.push({
        id: `${caseRecord.id}:verification`,
        value: caseRecord.verification,
      });
    }
    return records;
  });
}

export function assertStoryBudgets(manifest, story, serializedStory) {
  const budget = manifest.budgets;
  const storyBytes = utf8Bytes(serializedStory ?? story);
  if (storyBytes > budget.max_story_bytes) {
    throw new RangeError(
      `story payload ${storyBytes} exceeds max_story_bytes=${budget.max_story_bytes}`,
    );
  }
  const recordedTraces = new Map();
  for (const measurement of story.visualization.budget_measurements.trace_records) {
    if (recordedTraces.has(measurement.id)) {
      throw new Error(`duplicate trace payload measurement for ${measurement.id}`);
    }
    recordedTraces.set(measurement.id, measurement);
  }
  const traceMeasurements = [];
  for (const record of tracedResults(story)) {
    const trace = record.value.trace;
    const traceBytes = utf8Bytes(trace);
    if (trace.retained_events > budget.max_trace_events_per_result ||
        trace.events.length > budget.max_trace_events_per_result) {
      throw new RangeError(
        `${record.id} trace exceeds max_trace_events_per_result=${budget.max_trace_events_per_result}`,
      );
    }
    if (traceBytes > budget.max_trace_payload_bytes_per_result) {
      throw new RangeError(
        `${record.id} trace payload ${traceBytes} exceeds max_trace_payload_bytes_per_result=${budget.max_trace_payload_bytes_per_result}`,
      );
    }
    const recorded = recordedTraces.get(record.id);
    if (!recorded || recorded.retained_events !== trace.retained_events ||
        recorded.payload_bytes !== traceBytes) {
      throw new Error(`trace payload measurement is stale for ${record.id}`);
    }
    traceMeasurements.push({
      id: record.id,
      retained_events: trace.retained_events,
      payload_bytes: traceBytes,
    });
    recordedTraces.delete(record.id);
  }
  if (recordedTraces.size > 0) {
    throw new Error(
      `trace payload measurement has no result: ${[...recordedTraces.keys()].join(", ")}`,
    );
  }
  const animation = story.visualization.plot_spec_animation;
  if (animation.frames.length > budget.max_animation_frames) {
    throw new RangeError(
      `animation exceeds max_animation_frames=${budget.max_animation_frames}`,
    );
  }
  let maxSamples = 0;
  for (const frame of animation.frames) {
    const samples = frame.state.value.layers.reduce(
      (total, layer) => total + scalarCount(layer.data),
      0,
    );
    maxSamples = Math.max(maxSamples, samples);
    if (samples > budget.max_samples_per_frame) {
      throw new RangeError(
        `${frame.id} has ${samples} samples, exceeding max_samples_per_frame=${budget.max_samples_per_frame}`,
      );
    }
  }
  const measurements = story.visualization.budget_measurements;
  if (measurements.frames !== animation.frames.length ||
      measurements.max_samples_per_frame !== maxSamples) {
    throw new Error("animation frame or sample measurements are stale");
  }
  const semanticBytes = utf8Bytes(animation);
  const plotlyBytes = utf8Bytes(story.visualization.plotly.figure);
  if (semanticBytes !== measurements.semantic_payload_bytes ||
      plotlyBytes !== measurements.plotly_payload_bytes) {
    throw new Error("animation payload measurements are stale");
  }
  if (semanticBytes > budget.max_animation_payload_bytes ||
      plotlyBytes > budget.max_animation_payload_bytes) {
    throw new RangeError(
      `animation payload exceeds max_animation_payload_bytes=${budget.max_animation_payload_bytes}`,
    );
  }
  return {
    story_bytes: storyBytes,
    trace_records: traceMeasurements,
    semantic_animation_bytes: semanticBytes,
    plotly_animation_bytes: plotlyBytes,
  };
}

export function formatNumber(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "number") return String(value);
  if (!Number.isFinite(value)) return String(value);
  const absolute = Math.abs(value);
  if (value !== 0 && (absolute < 1e-5 || absolute >= 1e6)) {
    return value.toExponential(5);
  }
  return value.toLocaleString("en-US", { maximumSignificantDigits: 9 });
}

function iterationEvents(result) {
  return result.trace.events.filter((event) => event.kind === "iteration");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plotGeometry(frame) {
  const layers = frame.state.value.layers;
  const finitePoints = layers.flatMap((layer) =>
    (layer.data?.x || []).map((x, index) => [x, layer.data?.y?.[index]])
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
  );
  if (finitePoints.length === 0) {
    throw new Error("root animation frame has no finite retained evidence");
  }
  const xs = finitePoints.map(([x]) => x);
  const ys = finitePoints.map(([, y]) => y);
  let xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  if (xMin === xMax) {
    const padding = Math.max(Math.abs(xMin) * 0.1, 1);
    xMin -= padding;
    xMax += padding;
  }
  const yMinRaw = Math.min(0, ...ys);
  const yMaxRaw = Math.max(0, ...ys);
  const yPadding = Math.max((yMaxRaw - yMinRaw) * 0.08, 0.05);
  const yMin = yMinRaw - yPadding;
  const yMax = yMaxRaw + yPadding;
  const width = 760;
  const height = 400;
  const left = 62;
  const right = 22;
  const top = 24;
  const bottom = 52;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const sx = (x) => left + ((x - xMin) / (xMax - xMin)) * plotWidth;
  const sy = (y) => top + ((yMax - y) / (yMax - yMin)) * plotHeight;
  return { layers, sx, sy, width, height, left, right, top, bottom, xMin, xMax, yMin, yMax };
}

function markerMarkup(layer, geometry) {
  const points = layer.data.x.map((x, index) => [x, layer.data.y[index]])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  return points.map(([x, y]) => {
    const cx = geometry.sx(x);
    const cy = geometry.sy(y);
    if (layer.source_intent?.role === "candidate") {
      const size = 7;
      return `<polygon points="${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}" class="plot-candidate"><title>candidate x=${escapeHtml(formatNumber(x))}, residual=${escapeHtml(formatNumber(Math.abs(y)))}</title></polygon>`;
    }
    const role = layer.source_intent?.role || "retained evidence";
    return `<circle cx="${cx}" cy="${cy}" r="5" class="plot-evaluation"><title>${escapeHtml(role)} x=${escapeHtml(formatNumber(x))}, y=${escapeHtml(formatNumber(y))}</title></circle>`;
  }).join("");
}

function bracketMarkup(layer, geometry) {
  const points = layer.data.x.map((x, index) => [x, layer.data.y[index]])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (points.length < 2) return "";
  const [[x0, y0], [x1, y1]] = points;
  const endpoints = points.slice(0, 2).map(([x, y]) =>
    `<circle cx="${geometry.sx(x)}" cy="${geometry.sy(y)}" r="6" class="plot-bracket"><title>retained bracket endpoint x=${escapeHtml(formatNumber(x))}</title></circle>`,
  ).join("");
  return `<line x1="${geometry.sx(x0)}" y1="${geometry.sy(y0)}" x2="${geometry.sx(x1)}" y2="${geometry.sy(y1)}" class="plot-bracket-line"/>${endpoints}`;
}

export function svgMarkup(frame, description) {
  const geometry = plotGeometry(frame);
  const brackets = geometry.layers
    .filter((layer) => layer.source_intent?.role === "bracket")
    .map((layer) => bracketMarkup(layer, geometry))
    .join("");
  const markers = geometry.layers
    .filter((layer) => layer.kind === "point" && layer.source_intent?.role !== "bracket")
    .map((layer) => markerMarkup(layer, geometry))
    .join("");
  const zeroY = geometry.sy(0);
  const title = "Brent root-finding iteration";
  return `<svg viewBox="0 0 ${geometry.width} ${geometry.height}" role="img" aria-labelledby="export-plot-title export-plot-desc" xmlns="${SVG_NS}"><title id="export-plot-title">${title}</title><desc id="export-plot-desc">${escapeHtml(description)}</desc><rect width="100%" height="100%" class="plot-background"/><line x1="${geometry.left}" y1="${zeroY}" x2="${geometry.width - geometry.right}" y2="${zeroY}" class="plot-axis"/><line x1="${geometry.left}" y1="${geometry.top}" x2="${geometry.left}" y2="${geometry.height - geometry.bottom}" class="plot-axis"/>${brackets}${markers}<text x="${geometry.width / 2}" y="${geometry.height - 12}" class="plot-label">x</text><text x="18" y="${geometry.height / 2}" transform="rotate(-90 18 ${geometry.height / 2})" class="plot-label">retained value</text><text x="${geometry.left}" y="${geometry.height - 30}" class="plot-tick">${formatNumber(geometry.xMin)}</text><text x="${geometry.width - geometry.right}" y="${geometry.height - 30}" text-anchor="end" class="plot-tick">${formatNumber(geometry.xMax)}</text></svg>`;
}

function traceTableMarkup(result) {
  const rows = iterationEvents(result).map((event) => {
    const data = event.data;
    const bracket = Array.isArray(data.bracket)
      ? `[${formatNumber(data.bracket[0])}, ${formatNumber(data.bracket[1])}]`
      : "—";
    return `<tr><th scope="row">${event.iteration}</th><td>${escapeHtml(data.step_kind || data.derivative_kind || "—")}</td><td>${escapeHtml(formatNumber(data.candidate))}</td><td>${escapeHtml(formatNumber(data.residual))}</td><td>${escapeHtml(bracket)}</td><td>${escapeHtml(formatNumber(data.bracket_width ?? data.step))}</td></tr>`;
  }).join("");
  return `<table><caption>Every retained iteration from the bounded semantic trace.</caption><thead><tr><th scope="col">Iteration</th><th scope="col">Step</th><th scope="col">Candidate</th><th scope="col">Residual</th><th scope="col">Bracket</th><th scope="col">Width or step</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function buildAccessibleExportHtml(story, frameIndex = 0) {
  const successCase = story.cases.find(
    (caseRecord) => caseRecord.id === story.visualization.case_id,
  );
  const frames = story.visualization.plot_spec_animation.frames;
  const boundedIndex = Math.max(0, Math.min(frames.length - 1, frameIndex));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(story.title)} — static export</title><style>body{font:16px/1.55 system-ui,sans-serif;color:#17241f;max-width:70rem;margin:2rem auto;padding:0 1rem}svg{width:100%;height:auto;border:1px solid #bbc8c2}.plot-background{fill:#fbfaf5}.plot-axis{stroke:#66736e;stroke-width:1}.plot-bracket-line{stroke:#a33b20;stroke-width:5}.plot-bracket{fill:#fff;stroke:#a33b20;stroke-width:3}.plot-evaluation{fill:#275d89;stroke:#fff;stroke-width:1.5}.plot-candidate{fill:#1d704f;stroke:#fff;stroke-width:2}.plot-label,.plot-tick{font-family:system-ui,sans-serif;fill:#24332d;font-size:14px}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:.5rem;border:1px solid #ccd6d1;text-align:left}caption{text-align:left;font-weight:700;margin:.75rem 0}@media(prefers-color-scheme:dark){body{color:#e7eee9;background:#16201c}.plot-background{fill:#1d2924}.plot-axis,.plot-label,.plot-tick{stroke:#9dafaa;fill:#dce7e1}th,td{border-color:#506159}}</style></head><body><main><h1>${escapeHtml(story.title)}</h1><p>${escapeHtml(successCase.static_description)}</p><figure>${svgMarkup(frames[boundedIndex], story.accessibility.static_plot_description)}<figcaption>${escapeHtml(story.accessibility.static_plot_description)}</figcaption></figure>${traceTableMarkup(successCase.result)}<h2>Validation</h2><pre>${escapeHtml(JSON.stringify(successCase.result.validation, null, 2))}</pre></main></body></html>`;
}

export function buildPlotlyExport(story) {
  return `${JSON.stringify(story.visualization.plotly.figure, null, 2)}\n`;
}

export function buildPlotSpecExport(story) {
  return `${JSON.stringify(story.visualization.plot_spec_animation, null, 2)}\n`;
}

function svgElement(tag, attributes = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, String(value));
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderSvg(svg, frame, description) {
  const geometry = plotGeometry(frame);
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${geometry.width} ${geometry.height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-labelledby", "root-plot-title root-plot-description");
  svg.append(
    svgElement("title", { id: "root-plot-title" }, "Brent root-finding iteration"),
    svgElement("desc", { id: "root-plot-description" }, description),
    svgElement("rect", { width: "100%", height: "100%", class: "plot-background" }),
    svgElement("line", {
      x1: geometry.left,
      y1: geometry.sy(0),
      x2: geometry.width - geometry.right,
      y2: geometry.sy(0),
      class: "plot-axis",
    }),
    svgElement("line", {
      x1: geometry.left,
      y1: geometry.top,
      x2: geometry.left,
      y2: geometry.height - geometry.bottom,
      class: "plot-axis",
    }),
  );
  for (const layer of geometry.layers.filter(
    (entry) => entry.source_intent?.role === "bracket",
  )) {
    const points = layer.data.x.map((x, index) => [x, layer.data.y[index]])
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    if (points.length < 2) continue;
    const [[x0, y0], [x1, y1]] = points;
    svg.append(svgElement("line", {
      x1: geometry.sx(x0),
      y1: geometry.sy(y0),
      x2: geometry.sx(x1),
      y2: geometry.sy(y1),
      class: "plot-bracket-line",
    }));
    for (const [x, y] of points.slice(0, 2)) {
      const marker = svgElement("circle", {
        cx: geometry.sx(x), cy: geometry.sy(y), r: 6, class: "plot-bracket",
      });
      marker.append(svgElement("title", {}, `retained bracket endpoint x=${formatNumber(x)}`));
      svg.append(marker);
    }
  }
  for (const layer of geometry.layers.filter(
    (entry) => entry.kind === "point" && entry.source_intent?.role !== "bracket",
  )) {
    layer.data.x.forEach((x, index) => {
      const y = layer.data.y[index];
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const cx = geometry.sx(x);
      const cy = geometry.sy(y);
      const role = layer.source_intent?.role;
      const marker = role === "candidate"
        ? svgElement("polygon", {
          points: `${cx},${cy - 7} ${cx + 7},${cy} ${cx},${cy + 7} ${cx - 7},${cy}`,
          class: "plot-candidate",
        })
        : svgElement("circle", { cx, cy, r: 5, class: "plot-evaluation" });
      marker.append(svgElement(
        "title",
        {},
        `${role} x=${formatNumber(x)}, f(x)=${formatNumber(y)}`,
      ));
      svg.append(marker);
    });
  }
  svg.append(
    svgElement("text", {
      x: geometry.width / 2,
      y: geometry.height - 12,
      class: "plot-label",
    }, "x"),
    svgElement("text", {
      x: 18,
      y: geometry.height / 2,
      transform: `rotate(-90 18 ${geometry.height / 2})`,
      class: "plot-label",
    }, "f(x)"),
    svgElement("text", {
      x: geometry.left,
      y: geometry.height - 30,
      class: "plot-tick",
    }, formatNumber(geometry.xMin)),
    svgElement("text", {
      x: geometry.width - geometry.right,
      y: geometry.height - 30,
      "text-anchor": "end",
      class: "plot-tick",
    }, formatNumber(geometry.xMax)),
  );
}

function renderTraceTable(result, tableBody) {
  tableBody.replaceChildren();
  for (const event of iterationEvents(result)) {
    const row = document.createElement("tr");
    const heading = document.createElement("th");
    heading.scope = "row";
    heading.textContent = String(event.iteration);
    row.append(heading);
    const data = event.data;
    const values = [
      data.step_kind || data.derivative_kind || "—",
      formatNumber(data.candidate),
      formatNumber(data.residual),
      Array.isArray(data.bracket)
        ? `[${formatNumber(data.bracket[0])}, ${formatNumber(data.bracket[1])}]`
        : "—",
      formatNumber(data.bracket_width ?? data.step),
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    tableBody.append(row);
  }
}

function downloadText(filename, mimeType, text) {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function setupExamples(story) {
  const buttons = [...document.querySelectorAll("[data-language]")];
  const code = document.querySelector("#language-source");
  const note = document.querySelector("#language-result-shape");
  function select(language) {
    const example = story.language_examples[language];
    code.textContent = example.source;
    note.textContent = `${example.classification} · ${example.result_shape}`;
    for (const button of buttons) {
      const active = button.dataset.language === language;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    }
  }
  for (const button of buttons) {
    button.addEventListener("click", () => select(button.dataset.language));
  }
  select("python");
}

function setupCaseExplorer(story) {
  const buttons = [...document.querySelectorAll("[data-case]")];
  const heading = document.querySelector("#narrative-heading");
  const explanation = document.querySelector("#narrative-explanation");
  const action = document.querySelector("#narrative-action");
  const evidenceList = document.querySelector("#narrative-evidence");
  const status = document.querySelector("#case-status");
  function select(caseId) {
    const caseRecord = story.cases.find((item) => item.id === caseId);
    const narrative = buildCaseNarrative(story, caseRecord);
    heading.textContent = narrative.heading;
    explanation.textContent = narrative.explanation;
    action.textContent = narrative.action;
    evidenceList.replaceChildren();
    for (const item of narrative.evidence) {
      const row = document.createElement("li");
      const pointer = document.createElement("code");
      pointer.textContent = item.pointer;
      const value = document.createElement("span");
      const serialized = typeof item.value === "object"
        ? JSON.stringify(item.value)
        : formatNumber(item.value);
      value.textContent = serialized.length > 180
        ? `${serialized.slice(0, 177)}…`
        : serialized;
      row.append(pointer, value);
      evidenceList.append(row);
    }
    status.textContent = `${caseRecord.title}: ${caseRecord.result.status}; validation ${caseRecord.result.validation.passed ? "passed" : "did not pass"}.`;
    for (const button of buttons) {
      const active = button.dataset.case === caseId;
      button.setAttribute("aria-pressed", String(active));
    }
  }
  for (const button of buttons) {
    button.addEventListener("click", () => select(button.dataset.case));
  }
  select("cosine-fixed-point");
}

function setupAnimation(story) {
  const frames = story.visualization.plot_spec_animation.frames;
  const svg = document.querySelector("#root-plot");
  const slider = document.querySelector("#iteration-slider");
  const frameOutput = document.querySelector("#frame-output");
  const playButton = document.querySelector("#play-animation");
  const pauseButton = document.querySelector("#pause-animation");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let current = 0;
  let timer;
  slider.max = String(frames.length - 1);
  slider.disabled = false;
  pauseButton.disabled = false;
  function stop() {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
    playButton.setAttribute("aria-pressed", "false");
  }
  function show(index) {
    current = Math.max(0, Math.min(frames.length - 1, Number(index)));
    slider.value = String(current);
    const traceData = frames[current].metadata.trace_data;
    const step = traceData.step_kind || "iteration";
    frameOutput.textContent = `Iteration ${current + 1} of ${frames.length}: ${step}; candidate ${formatNumber(traceData.candidate)}; residual ${formatNumber(traceData.residual)}.`;
    renderSvg(svg, frames[current], story.accessibility.static_plot_description);
  }
  function updateMotionPolicy() {
    if (reducedMotion.matches) {
      stop();
      playButton.disabled = true;
      playButton.title = "Timed playback is disabled by your reduced-motion preference. Use the iteration slider.";
    } else {
      playButton.disabled = false;
      playButton.removeAttribute("title");
    }
  }
  playButton.addEventListener("click", () => {
    if (reducedMotion.matches || timer !== undefined) return;
    playButton.setAttribute("aria-pressed", "true");
    timer = window.setInterval(() => {
      if (current >= frames.length - 1) {
        stop();
        return;
      }
      show(current + 1);
    }, story.visualization.plot_spec_animation.timing.frame_duration_ms);
  });
  pauseButton.addEventListener("click", stop);
  slider.addEventListener("input", () => {
    stop();
    show(slider.value);
  });
  reducedMotion.addEventListener?.("change", updateMotionPolicy);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  updateMotionPolicy();
  show(0);
  return { show, stop };
}

export async function initializeGallery() {
  const state = document.querySelector("#gallery-state");
  try {
    const manifestResponse = await fetch("./gallery-manifest.json");
    if (!manifestResponse.ok) throw new Error(`manifest HTTP ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    const storyEntry = manifest.stories.find((entry) => entry.id === "root-finding");
    if (!storyEntry) throw new Error("root-finding story is not in the manifest");
    const storyResponse = await fetch(storyEntry.href);
    if (!storyResponse.ok) throw new Error(`story HTTP ${storyResponse.status}`);
    const storyText = await storyResponse.text();
    const story = JSON.parse(storyText);
    const measurements = assertStoryBudgets(manifest, story, storyText);
    setupExamples(story);
    setupCaseExplorer(story);
    setupAnimation(story);
    const successCase = story.cases.find((entry) => entry.id === "cosine-fixed-point");
    renderTraceTable(successCase.result, document.querySelector("#trace-body"));
    document.querySelector("#story-bytes").textContent =
      `${measurements.story_bytes.toLocaleString("en-US")} bytes`;
    document.querySelector("#semantic-bytes").textContent =
      `${measurements.semantic_animation_bytes.toLocaleString("en-US")} bytes`;
    document.querySelector("#plotly-bytes").textContent =
      `${measurements.plotly_animation_bytes.toLocaleString("en-US")} bytes`;
    const plotSpecExport = document.querySelector("#export-plotspec");
    const plotlyExport = document.querySelector("#export-plotly");
    const htmlExport = document.querySelector("#export-html");
    plotSpecExport.disabled = false;
    plotlyExport.disabled = false;
    htmlExport.disabled = false;
    plotSpecExport.addEventListener("click", () => {
      downloadText("sagejs-root-finding.plotspec.json", "application/json", buildPlotSpecExport(story));
    });
    plotlyExport.addEventListener("click", () => {
      downloadText("sagejs-root-finding.plotly.json", "application/json", buildPlotlyExport(story));
    });
    htmlExport.addEventListener("click", () => {
      downloadText(
        "sagejs-root-finding-static.html",
        "text/html",
        buildAccessibleExportHtml(story, Number(document.querySelector("#iteration-slider").value)),
      );
    });
    document.documentElement.dataset.gallery = "ready";
    state.textContent = "Interactive evidence loaded. The static article remains the fallback.";
  } catch (error) {
    document.documentElement.dataset.gallery = "static";
    state.textContent = `Interactive evidence unavailable: ${error.message}. The complete static story and trace remain below.`;
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  initializeGallery();
}
