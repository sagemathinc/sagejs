#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const audit = JSON.parse(
  fs.readFileSync(path.join(root, "website/competitive-audit.json"), "utf8"),
);
const capabilities = JSON.parse(
  fs.readFileSync(path.join(root, "website/capabilities.json"), "utf8"),
).capabilities;
const benchmarkCatalog = JSON.parse(
  fs.readFileSync(path.join(root, "website/benchmarks.json"), "utf8"),
);
const byId = new Map(capabilities.map((item) => [item.id, item]));

function option(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : undefined;
}

const priority = option("priority")?.toUpperCase();
const dimension = option("dimension")?.toLowerCase();
const area = option("area")?.toLowerCase();
const query = option("query")?.toLowerCase();
const json = process.argv.includes("--json");

const auditRows = audit.capabilities.map((entry) => {
    const capability = byId.get(entry.capability);
    return {
      id: entry.gap.id,
      priority: entry.gap.priority,
      dimension: entry.gap.dimension,
      parallelizable: entry.gap.parallelizable,
      capability: entry.capability,
      feature: capability.feature,
      area: capability.area,
      title: entry.gap.title,
      scopeStatus: entry.scopeStatus,
      benchmarkSuites: entry.benchmarkSuites,
    };
  });
const benchmarkRows = benchmarkCatalog.suites
  .filter((suite) => suite.status === "planned")
  .map((suite) => {
    const members = suite.capabilities.map((id) => byId.get(id));
    return {
      id: `benchmark-${suite.id}`,
      priority: benchmarkCatalog.plannedPriorities[suite.id],
      dimension: "performance",
      parallelizable: true,
      capability: suite.capabilities.join(","),
      feature: "Competitive benchmark suite",
      area: [...new Set(members.map((item) => item.area))].join(" / "),
      title: `Implement the ${suite.id} competitive benchmark suite`,
      scopeStatus: "planned",
      benchmarkSuites: [suite.id],
    };
  });

const rows = [...auditRows, ...benchmarkRows]
  .filter((row) => !priority || row.priority === priority)
  .filter((row) => !dimension || row.dimension === dimension)
  .filter((row) => !area || row.area.toLowerCase().includes(area))
  .filter((row) => !query || Object.values(row).flat().join(" ").toLowerCase().includes(query))
  .sort((left, right) => left.priority.localeCompare(right.priority) || left.area.localeCompare(right.area) || left.id.localeCompare(right.id));

if (json) {
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
} else {
  const width = Math.max(8, ...rows.map((row) => row.id.length));
  for (const row of rows) {
    console.log(`${row.priority} ${row.dimension.padEnd(11)} ${row.id.padEnd(width)}  ${row.title}`);
  }
  console.log(`\n${rows.length} audit gap lane${rows.length === 1 ? "" : "s"}`);
}
