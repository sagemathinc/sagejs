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

const state = { capabilities: [], filter: "all", area: "all", query: "" };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function badge(kind, value) {
  return el("span", `badge ${kind}-${value}`, labels[value] || value);
}

function renderMetrics(data) {
  document.querySelector("#metric-total").textContent = String(data.length);
  document.querySelector("#metric-available").textContent = String(data.filter((item) => item.state === "available").length);
  document.querySelector("#metric-certified").textContent = String(data.filter((item) => item.quality === "certified").length);
  document.querySelector("#metric-now").textContent = String(data.filter((item) => item.priority === "now").length);
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

function matches(item) {
  if (state.filter !== "all" && item.state !== state.filter) return false;
  if (state.area !== "all" && item.area !== state.area) return false;
  if (!state.query) return true;
  const text = [item.feature, item.area, item.summary, item.implementation, item.evidence, item.target].join(" ").toLowerCase();
  return text.includes(state.query);
}

function capabilityCard(item) {
  const article = el("article", "capability-card");
  article.id = item.id;

  const top = el("div", "capability-top");
  const titleWrap = el("div", "capability-title");
  titleWrap.append(el("p", "capability-area", item.area), el("h3", "", item.feature));
  const badges = el("div", "badges");
  badges.append(badge("state", item.state), badge("quality", item.quality));
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
  article.append(top, summary, details);
  return article;
}

function renderCapabilities() {
  const list = document.querySelector("#capability-list");
  list.replaceChildren();
  const filtered = state.capabilities.filter(matches);
  document.querySelector("#result-count").textContent = `${filtered.length} of ${state.capabilities.length} capabilities`;
  for (const item of filtered) list.append(capabilityCard(item));
  if (filtered.length === 0) list.append(el("p", "empty-state", "No capabilities match these filters."));
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
      li.append(link, el("span", "", item.target));
      list.append(li);
    }
    column.append(list);
    container.append(column);
  }
}

function installInteractions() {
  document.querySelectorAll(".copy").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        const previous = button.textContent;
        button.textContent = "Copied";
        window.setTimeout(() => { button.textContent = previous; }, 1400);
      } catch {
        button.textContent = "Select command";
      }
    });
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
    renderCapabilities();
  });
}

async function loadDashboard() {
  installInteractions();
  try {
    const response = await fetch("./capabilities.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.capabilities = payload.capabilities;
    document.querySelector("#updated-date").dateTime = payload.updated;
    document.querySelector("#updated-date").textContent = new Date(`${payload.updated}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    renderMetrics(state.capabilities);
    renderAreaOptions(state.capabilities);
    renderCapabilities();
    renderRoadmap(state.capabilities);
  } catch (error) {
    document.querySelector("#load-error").hidden = false;
    document.querySelector("#result-count").textContent = "Dashboard unavailable";
    console.error("Unable to load Sage.js capability data", error);
  }
}

loadDashboard();
