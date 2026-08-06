"use strict";

const labels = {
  available: "Available",
  partial: "Partial",
  planned: "Planned",
  certified: "Certified",
  tested: "Tested",
  prototype: "Prototype",
  now: "Now",
  next: "Next",
  later: "Later",
};

const coverageLabels = {
  broad: "Broad surface",
  substantial: "Substantial slice",
  focused: "Focused slice",
  foundational: "Foundation",
  planned: "Planned",
};

const state = { capabilities: [], examples: [], audits: [], auditAreas: [], benchmarks: [], performancePilot: null, filter: "all", area: "all", query: "" };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function badge(kind, value) {
  return el("span", `badge ${kind}-${value}`, labels[value] || value);
}

function renderMetrics(data, examples) {
  document.querySelector("#metric-total").textContent = String(data.length);
  document.querySelector("#metric-available").textContent = String(data.filter((item) => item.state === "available").length);
  document.querySelector("#metric-certified").textContent = String(data.filter((item) => item.quality === "certified").length);
  document.querySelector("#metric-examples").textContent = String(examples.length);
}

function renderAreaOptions(data) {
  const select = document.querySelector("#area-filter");
  const areas = [...new Set(data.map((item) => item.area))].sort();
  for (const area of areas) {
    const option = el("option", "", area);
    option.value = area;
    select.append(option);
  }
}

function examplesFor(capabilityId) {
  return state.examples.filter((example) => example.capability === capabilityId);
}

function auditFor(capabilityId) {
  return state.audits.find((audit) => audit.capability === capabilityId);
}

function benchmarkFor(suiteId) {
  return state.benchmarks.find((suite) => suite.id === suiteId);
}

function auditAreaFor(area) {
  return state.auditAreas.find((entry) => entry.area === area);
}

function auditText(item) {
  const audit = auditFor(item.id);
  const area = auditAreaFor(item.area);
  if (!audit || !area) return "";
  const suites = audit.benchmarkSuites.map(benchmarkFor).filter(Boolean);
  return [
    audit.scopeStatus,
    audit.scopeUnit,
    audit.nextAudit,
    audit.gap.id,
    audit.gap.dimension,
    audit.gap.priority,
    audit.gap.title,
    ...area.systems,
    area.scopeReference,
    area.competitiveTarget,
    ...area.comparisonFocus,
    ...area.benchmarkAxes,
    ...suites.flatMap((suite) => [suite.id, suite.status, ...suite.systems, ...suite.axes]),
  ].join(" ");
}

function exampleText(example) {
  return [example.title, example.language, example.code, example.expected, example.note || ""].join(" ").toLowerCase();
}

function capabilityPassesFilters(item) {
  return (state.filter === "all" || item.state === state.filter) &&
    (state.area === "all" || item.area === state.area);
}

function matches(item) {
  if (!capabilityPassesFilters(item)) return false;
  if (!state.query) return true;
  const score = item.coverage.score || {};
  const facetText = (item.coverage.facets || []).flatMap((facet) => [facet.name, facet.status, facet.detail]);
  const coverageText = [item.coverage.label, item.coverage.summary, ...item.coverage.includes, ...facetText, item.coverage.auditPath || "", score.unit || "", score.reference || "", score.method || ""].join(" ");
  const text = [item.feature, item.area, item.summary, item.implementation, item.evidence, item.target, coverageText, auditText(item)].join(" ").toLowerCase();
  return text.includes(state.query) || examplesFor(item.id).some((example) => exampleText(example).includes(state.query));
}

function chipList(values, className = "audit-chip-list") {
  const list = el("ul", className);
  for (const value of values) list.append(el("li", "", value));
  return list;
}

function competitiveAuditExpander(item) {
  const audit = auditFor(item.id);
  const area = auditAreaFor(item.area);
  if (!audit || !area) return null;
  const suites = audit.benchmarkSuites.map(benchmarkFor).filter(Boolean);
  const existing = suites.filter((suite) => suite.status === "existing").length;
  const details = el("details", "competitive-expander");
  const summary = el("summary", "");
  const heading = el("span", "audit-heading");
  heading.append(el("span", "summary-label", "Competitive audit"), el("strong", "", audit.gap.title));
  summary.append(heading, el("span", `audit-priority audit-priority-${audit.gap.priority.toLowerCase()}`, `${audit.gap.priority} · ${existing}/${suites.length} benchmark suites exist`));

  const body = el("div", "competitive-body");
  const references = el("section", "audit-panel");
  references.append(
    el("h4", "", "Comparison systems"),
    chipList(area.systems),
    el("p", "", area.scopeReference),
    el("h5", "", "Competitive target"),
    el("p", "", area.competitiveTarget),
    chipList(area.comparisonFocus, "audit-focus-list"),
  );
  const scope = el("section", "audit-panel");
  scope.append(el("h4", "", `Scope audit · ${audit.scopeStatus}`), el("strong", "", audit.scopeUnit), el("p", "", audit.nextAudit));
  const performance = el("section", "audit-panel audit-performance");
  performance.append(el("h4", "", "Performance corpus"));
  if (suites.length) {
    const suiteList = el("ul", "benchmark-suite-list");
    for (const suite of suites) {
      const row = el("li", "");
      row.append(el("code", "", suite.id), el("span", `suite-status suite-${suite.status}`, suite.status), el("small", "", suite.axes.join(" · ")));
      suiteList.append(row);
    }
    performance.append(suiteList);
    if (state.performancePilot && suites.some((suite) => suite.id === state.performancePilot.suite)) {
      const resultLink = el("a", "benchmark-result-link", "View the published measured result →");
      resultLink.href = "#performance-results";
      performance.append(resultLink);
    }
  } else {
    performance.append(el("p", "", "No benchmark suite has been defined yet."));
  }
  const lane = el("section", "audit-panel audit-lane");
  lane.append(el("h4", "", "Primary work lane"), el("code", "audit-gap-id", audit.gap.id), el("strong", "", audit.gap.title), el("p", "", `${audit.gap.dimension} · ${audit.gap.priority} · ${audit.gap.parallelizable ? "independently claimable" : "integration/dependency lane"}`));
  body.append(references, scope, performance, lane);
  details.append(summary, body);
  return details;
}

function coverageScoreSummary(score) {
  if (!score) return "Score audit pending";
  const prefix = score.kind === "estimated" ? "~" : "";
  return `${prefix}${score.value}% ${score.kind}`;
}

function coverageScoreBlock(score) {
  const block = el("div", `coverage-score ${score ? `coverage-score-${score.kind}` : "coverage-score-pending"}`);
  if (!score) {
    block.append(el("strong", "", "Not yet measured"), el("span", "", "A denominator-backed surface audit has not yet been completed."));
    return block;
  }
  const prefix = score.kind === "estimated" ? "~" : "";
  const value = el("strong", "coverage-score-value", `${prefix}${score.value}%`);
  const description = el("span", "coverage-score-description");
  if (score.kind === "measured") {
    description.textContent = `${score.numerator} of ${score.denominator} ${score.unit}`;
  } else {
    description.textContent = score.unit;
  }
  const audit = el("small", "", `${score.kind === "measured" ? "Measured" : "Expert estimate"} · ${score.reference} · audited ${score.audited}`);
  block.append(value, description, audit);
  return block;
}

function coverageExpander(item) {
  const details = el("details", "coverage-expander");
  const summary = el("summary", "");
  const heading = el("span", "coverage-heading");
  heading.append(el("span", "summary-label", "Scope"), el("strong", "", item.coverage.label));
  summary.append(heading, el("span", "coverage-score-summary", coverageScoreSummary(item.coverage.score)));
  const body = el("div", "coverage-body");
  body.append(coverageScoreBlock(item.coverage.score), el("p", "", item.coverage.summary));
  if (item.coverage.score?.method) body.append(el("p", "coverage-method", `Method: ${item.coverage.score.method}`));
  if (item.coverage.auditPath) {
    const auditLink = el("a", "coverage-audit-link", "View the machine-readable coverage audit →");
    auditLink.href = `./${item.coverage.auditPath}`;
    body.append(auditLink);
  }
  if (item.coverage.facets?.length) {
    const facets = el("div", "coverage-facets");
    facets.append(el("h4", "", "Semantic facets"));
    for (const facet of item.coverage.facets) {
      const row = el("div", "coverage-facet");
      const heading = el("div", "coverage-facet-heading");
      heading.append(el("strong", "", facet.name), el("span", `coverage-facet-status facet-${facet.status}`, facet.status));
      row.append(heading, el("p", "", facet.detail));
      facets.append(row);
    }
    body.append(facets);
  }
  const list = el("ul", "coverage-list");
  for (const family of item.coverage.includes) list.append(el("li", "", family));
  body.append(list);
  details.append(summary, body);
  return details;
}

function notebookSource(example) {
  return example.language === "sage" ? example.code : `%%${example.language}\n${example.code}`;
}

const prismLanguages = new Set(["sage", "python", "magma", "maple", "matlab", "macaulay2", "wolfram"]);

function highlightExample(code, language) {
  if (!prismLanguages.has(language) || !window.Prism?.languages?.[language]) return;
  code.classList.add(`language-${language}`);
  code.parentElement?.classList.add(`language-${language}`);
  window.Prism.highlightElement(code);
}

async function copyText(button, value) {
  try {
    await navigator.clipboard.writeText(value);
    const previous = button.textContent;
    button.textContent = "Copied";
    window.setTimeout(() => { button.textContent = previous; }, 1400);
  } catch {
    button.textContent = "Select code";
  }
}

function exampleBlock(example) {
  const article = el("article", "example-block");
  article.id = `example-${example.id}`;
  const header = el("div", "example-header");
  const title = el("div", "");
  const meta = el("div", "example-meta");
  meta.append(el("span", `language language-${example.language}`, example.language), el("span", "verified", "✓ CI verified"));
  title.append(meta, el("h4", "", example.title));
  const copy = el("button", "example-copy", "Copy cell");
  copy.type = "button";
  copy.addEventListener("click", () => copyText(copy, notebookSource(example)));
  header.append(title, copy);

  const source = el("pre", "example-code");
  const sourceCode = el("code", "", notebookSource(example));
  source.append(sourceCode);
  highlightExample(sourceCode, example.language);
  const outputLabel = el("p", "output-label", "Expected output");
  const output = el("pre", "example-output");
  output.append(el("code", "", example.expected));
  article.append(header, source, outputLabel, output);
  if (example.note) article.append(el("p", "example-note", example.note));
  return article;
}

function exampleExpander(item) {
  const examples = examplesFor(item.id);
  if (examples.length === 0) return null;
  const details = el("details", "example-expander");
  details.dataset.capability = item.id;
  const summary = el("summary", "");
  summary.append(el("span", "summary-label", `Try ${examples.length} verified ${examples.length === 1 ? "example" : "examples"}`), el("span", "summary-hint", "Copy directly into the polyglot Jupyter kernel"));
  details.append(summary);
  const list = el("div", "example-list");
  for (const example of examples) list.append(exampleBlock(example));
  details.append(list);
  return details;
}

function capabilityCard(item) {
  const article = el("article", "capability-card");
  article.id = item.id;

  const top = el("div", "capability-top");
  const titleWrap = el("div", "capability-title");
  titleWrap.append(el("p", "capability-area", item.area), el("h3", "", item.feature));
  const badges = el("div", "badges");
  badges.append(
    badge("state", item.state),
    badge("quality", item.quality),
    el("span", `badge coverage-${item.coverage.level}`, coverageLabels[item.coverage.level]),
  );
  top.append(titleWrap, badges);

  const summary = el("p", "capability-summary", item.summary);
  const details = el("div", "capability-details");
  const implementation = el("div", "detail");
  implementation.append(el("h4", "", "Implementation"), el("p", "", item.implementation));
  const evidence = el("div", "detail");
  evidence.append(el("h4", "", "Evidence"), el("p", "", item.evidence));
  const target = el("div", "detail target");
  target.append(el("h4", "", `Target · ${labels[item.priority]}`), el("p", "", item.target));
  details.append(implementation, evidence, target);
  article.append(top, summary, details, coverageExpander(item));
  const audit = competitiveAuditExpander(item);
  if (audit) article.append(audit);
  const expander = exampleExpander(item);
  if (expander) article.append(expander);
  return article;
}

function visibleExampleMatches() {
  if (!state.query) return [];
  const allowedCapabilities = new Map(
    state.capabilities.filter(capabilityPassesFilters).map((item) => [item.id, item]),
  );
  return state.examples
    .filter((example) => allowedCapabilities.has(example.capability) && exampleText(example).includes(state.query))
    .map((example) => ({ example, capability: allowedCapabilities.get(example.capability) }));
}

function revealExample(example) {
  let target = document.querySelector(`#example-${CSS.escape(example.id)}`);
  if (!target) {
    resetDashboardFilters();
    renderCapabilities();
    target = document.querySelector(`#example-${CSS.escape(example.id)}`);
  }
  if (!target) return;
  const details = target.closest("details");
  if (details) details.open = true;
  target.classList.add("example-highlight");
  const url = new URL(location.href);
  url.hash = `example-${example.id}`;
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => target.classList.remove("example-highlight"), 2200);
}

function resetDashboardFilters() {
  state.query = "";
  state.filter = "all";
  state.area = "all";
  document.querySelector("#search").value = "";
  document.querySelector("#area-filter").value = "all";
  document.querySelectorAll("#state-filters .filter").forEach((button) => {
    button.classList.toggle("active", button.dataset.state === "all");
  });
  const url = new URL(location.href);
  url.searchParams.delete("q");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function revealCapability(capabilityId) {
  resetDashboardFilters();
  renderCapabilities();
  const target = document.querySelector(`#${CSS.escape(capabilityId)}`);
  if (!target) return;
  history.replaceState(null, "", `#${capabilityId}`);
  target.classList.add("capability-highlight");
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => target.classList.remove("capability-highlight"), 2200);
}

function renderExampleSearch() {
  const section = document.querySelector("#example-search-results");
  const list = document.querySelector("#example-result-list");
  const matches = visibleExampleMatches();
  section.hidden = !state.query || matches.length === 0;
  list.replaceChildren();
  for (const { example, capability } of matches) {
    const button = el("button", "example-result", "");
    button.type = "button";
    const heading = el("span", "example-result-title");
    heading.append(el("span", `language language-${example.language}`, example.language), el("strong", "", example.title));
    const code = example.code.replace(/\s+/g, " ").trim();
    button.append(heading, el("span", "example-result-context", `${capability.area} · ${capability.feature}`), el("code", "", code.length > 120 ? `${code.slice(0, 117)}…` : code));
    button.addEventListener("click", () => revealExample(example));
    list.append(button);
  }
}

function renderCapabilities() {
  const list = document.querySelector("#capability-list");
  list.replaceChildren();
  const filtered = state.capabilities.filter(matches);
  const exampleMatches = visibleExampleMatches().length;
  document.querySelector("#result-count").textContent = state.query
    ? `${filtered.length} capabilities · ${exampleMatches} matching examples`
    : `${filtered.length} of ${state.capabilities.length} capabilities · ${state.examples.length} verified examples`;
  for (const item of filtered) list.append(capabilityCard(item));
  if (filtered.length === 0) list.append(el("p", "empty-state", "No capabilities match these filters."));
  renderExampleSearch();
}

function renderAuditMetrics() {
  const existing = state.benchmarks.filter((suite) => suite.status === "existing").length;
  document.querySelector("#audit-gap-count").textContent = String(state.audits.length);
  document.querySelector("#audit-existing-benchmarks").textContent = String(existing);
  document.querySelector("#audit-planned-benchmarks").textContent = String(state.benchmarks.length - existing);
  const systems = new Set(state.auditAreas.flatMap((area) => area.systems));
  document.querySelector("#audit-system-count").textContent = String(systems.size);
}

function formatDuration(seconds) {
  if (seconds < 0.001) return `${Math.round(seconds * 1e6)} µs`;
  if (seconds < 1) return `${(seconds * 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} ms`;
  return `${seconds.toLocaleString(undefined, { maximumFractionDigits: 3 })} s`;
}

function renderPerformancePilot() {
  const pilot = state.performancePilot;
  if (!pilot) return;
  const section = document.querySelector("#performance-results");
  section.hidden = false;
  document.querySelector("#performance-intro").textContent =
    `All compared systems agree that h(${pilot.case.discriminant}) = ${pilot.case.answer}. ` +
    "The rows deliberately expose their different proof guarantees instead of pretending they are equivalent operations.";

  const environment = document.querySelector("#performance-environment");
  environment.replaceChildren();
  for (const value of [pilot.environment.cpu, `${pilot.environment.allocatedCores} allocated cores`, `Node ${pilot.environment.node}`, `PARI ${pilot.environment.pari}`, `Magma ${pilot.environment.magma}`]) {
    environment.append(el("span", "", value));
  }

  const values = pilot.results.map((result) => result.medianSeconds);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const logRange = Math.log10(maximum) - Math.log10(minimum);
  const bars = document.querySelector("#performance-bars");
  const table = document.querySelector("#performance-table-body");
  bars.replaceChildren();
  table.replaceChildren();
  for (const result of pilot.results) {
    const chartRow = el("div", "performance-bar-row");
    const label = el("div", "performance-bar-label");
    label.append(el("strong", "", result.system), el("small", "", result.operation));
    const track = el("div", "performance-bar-track");
    const bar = el("span", "performance-bar-fill");
    const position = logRange === 0 ? 1 : (Math.log10(result.medianSeconds) - Math.log10(minimum)) / logRange;
    bar.style.width = `${10 + 90 * position}%`;
    bar.title = `${result.system}: ${formatDuration(result.medianSeconds)}`;
    track.append(bar);
    chartRow.append(label, track, el("code", "performance-bar-value", formatDuration(result.medianSeconds)));
    bars.append(chartRow);

    const row = document.createElement("tr");
    for (const value of [result.system, result.operation, result.semantics, formatDuration(result.medianSeconds)]) {
      row.append(el("td", "", value));
    }
    table.append(row);
  }
  document.querySelector("#performance-warning").textContent = pilot.warning;
  document.querySelector("#performance-command").textContent = pilot.reproduce;
}

function renderRoadmap(data) {
  const container = document.querySelector("#roadmap-columns");
  container.replaceChildren();
  const descriptions = {
    now: "Active foundations and release blockers",
    next: "The next coherent layer",
    later: "Designed, but not on the critical path",
  };
  for (const priority of ["now", "next", "later"]) {
    const column = el("article", "roadmap-column");
    const heading = el("div", "roadmap-heading");
    heading.append(el("span", `priority priority-${priority}`, labels[priority]), el("h3", "", descriptions[priority]));
    column.append(heading);
    const list = el("ol", "roadmap-list");
    for (const item of data.filter((entry) => entry.priority === priority)) {
      const li = el("li", "");
      const link = el("a", "", item.feature);
      link.href = `#${item.id}`;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        revealCapability(item.id);
      });
      li.append(link, el("span", "", item.target));
      list.append(li);
    }
    column.append(list);
    container.append(column);
  }
}

function installInteractions() {
  document.querySelectorAll(".copy").forEach((button) => {
    button.addEventListener("click", () => copyText(button, button.dataset.copy));
  });

  document.querySelectorAll("#state-filters .filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.state;
      document.querySelectorAll("#state-filters .filter").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
      renderCapabilities();
    });
  });
  document.querySelector("#area-filter").addEventListener("change", (event) => {
    state.area = event.target.value;
    renderCapabilities();
  });
  document.querySelector("#search").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    const url = new URL(location.href);
    if (event.target.value.trim()) url.searchParams.set("q", event.target.value.trim());
    else url.searchParams.delete("q");
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    renderCapabilities();
  });
}

async function loadDashboard() {
  installInteractions();
  try {
    const [capabilityResponse, exampleResponse, auditResponse, benchmarkResponse, performanceResponse] = await Promise.all([
      fetch("./capabilities.json"),
      fetch("./examples.json"),
      fetch("./competitive-audit.json"),
      fetch("./benchmarks.json"),
      fetch("./performance/quadratic-class-groups-pilot.json"),
    ]);
    if (!capabilityResponse.ok || !exampleResponse.ok || !auditResponse.ok || !benchmarkResponse.ok || !performanceResponse.ok) {
      throw new Error(`HTTP ${capabilityResponse.status}/${exampleResponse.status}/${auditResponse.status}/${benchmarkResponse.status}/${performanceResponse.status}`);
    }
    const [payload, examplePayload, auditPayload, benchmarkPayload, performancePayload] = await Promise.all([
      capabilityResponse.json(),
      exampleResponse.json(),
      auditResponse.json(),
      benchmarkResponse.json(),
      performanceResponse.json(),
    ]);
    state.capabilities = payload.capabilities;
    state.examples = examplePayload.examples;
    state.audits = auditPayload.capabilities;
    state.auditAreas = auditPayload.areas;
    state.benchmarks = benchmarkPayload.suites;
    state.performancePilot = performancePayload;
    const initialQuery = new URLSearchParams(location.search).get("q") || "";
    state.query = initialQuery.trim().toLowerCase();
    document.querySelector("#search").value = initialQuery;
    document.querySelector("#updated-date").dateTime = payload.updated;
    document.querySelector("#updated-date").textContent = new Date(`${payload.updated}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    renderMetrics(state.capabilities, state.examples);
    renderAuditMetrics();
    renderPerformancePilot();
    renderAreaOptions(state.capabilities);
    renderCapabilities();
    renderRoadmap(state.capabilities);
    if (location.hash.startsWith("#example-")) {
      const example = state.examples.find((item) => `#example-${item.id}` === location.hash);
      if (example) window.setTimeout(() => revealExample(example), 0);
    } else if (location.hash.length > 1) {
      const capabilityId = decodeURIComponent(location.hash.slice(1));
      if (state.capabilities.some((item) => item.id === capabilityId)) {
        window.setTimeout(() => revealCapability(capabilityId), 0);
      } else {
        const section = document.getElementById(capabilityId);
        if (section) window.setTimeout(() => section.scrollIntoView({ behavior: "auto", block: "start" }), 0);
      }
    }
    document.documentElement.dataset.dashboardReady = "true";
  } catch (error) {
    document.querySelector("#load-error").hidden = false;
    document.querySelector("#result-count").textContent = "Dashboard unavailable";
    console.error("Unable to load Sage.js capability data", error);
  }
}

loadDashboard();
