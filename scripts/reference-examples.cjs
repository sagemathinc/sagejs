"use strict";

const { readdirSync, readFileSync } = require("node:fs");
const { join, relative } = require("node:path");

const { extractSageDoctests } = require("../tools/sage-doctest-fixture.cjs");

function walkFiles(directory, predicate) {
  const answer = [];
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) answer.push(...walkFiles(path, predicate));
    else if (item.isFile() && predicate(item.name)) answer.push(path);
  }
  return answer;
}

function sourceExcerpt(source, line, radius = 12) {
  const lines = source.split("\n");
  const start = Math.max(0, line - radius - 1);
  const end = Math.min(lines.length, line + radius);
  return {
    start_line: start + 1,
    text: lines.slice(start, end).join("\n"),
  };
}

function sourceDefinitions(source, path) {
  const definitions = [];
  const lines = source.split("\n");
  const classes = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const indent = line.match(/^\s*/)[0].length;
    while (classes.length && classes.at(-1).indent >= indent) classes.pop();
    const classMatch = line.match(/^\s*class\s+([A-Za-z_]\w*)/);
    if (classMatch) {
      classes.push({ name: classMatch[1], indent });
      continue;
    }
    const match = line.match(/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
    if (!match) continue;
    definitions.push({
      name: match[1],
      qualified: [...classes.map((item) => item.name), match[1]].join("."),
      path,
      line: index + 1,
      excerpt: sourceExcerpt(source, index + 1),
    });
  }
  return definitions;
}

function collectReferenceSources(root) {
  const directory = join(root, "src", "baselib");
  const groups = [];
  const definitions = [];
  for (const filename of walkFiles(
    directory, (name) => name.endsWith(".py"),
  ).sort()) {
    const path = relative(root, filename).replaceAll("\\", "/");
    const source = readFileSync(filename, "utf8");
    const fixture = extractSageDoctests(source, {
      repository: "https://github.com/sagemathinc/sagejs",
      revision: "working-tree",
      path,
      license: "GPL-3.0-only",
    });
    groups.push(...fixture.groups.map((group) => ({
      ...group, path, origin: "sagejs",
    })));
    definitions.push(...sourceDefinitions(source, path));
  }
  const upstreamDirectory = join(root, "upstream-tests", "sage");
  for (const filename of walkFiles(
    upstreamDirectory, (name) => name.endsWith(".doctests.json"),
  ).sort()) {
    const fixture = JSON.parse(readFileSync(filename, "utf8"));
    for (const group of fixture.groups ?? []) {
      groups.push({
        ...group,
        path: fixture.source.path,
        origin: "upstream-sage",
        provenance: fixture.source,
      });
    }
  }
  return { groups, definitions };
}

function tailName(value) {
  return value.split(".").at(-1).toLowerCase();
}

function examplesForEntry(entry, sources) {
  const names = new Set([entry.name, ...entry.aliases].map(tailName));
  const matches = sources.groups.filter((group) => {
    const owner = tailName(group.owner);
    return names.has(owner);
  });
  return matches.flatMap((group) => group.examples.map((example) => ({
    ...example,
    owner: group.owner,
    path: group.path,
    origin: group.origin,
    provenance: group.provenance,
    language: "sage",
  })));
}

function sourceForEntry(entry, sources) {
  const names = new Set([entry.name, ...entry.aliases].map(tailName));
  const candidates = sources.definitions.filter(
    (definition) => names.has(definition.name.toLowerCase()),
  );
  if (!candidates.length) return null;
  const moduleHint = entry.module.replaceAll(".", "/");
  return candidates.find((item) => moduleHint.includes(
    item.path.replace(/^src\/baselib\//, "").replace(/\.py$/, ""),
  )) ?? candidates[0];
}

function combinedFixture(examples, revision) {
  const byOwner = new Map();
  for (const example of examples) {
    const key = `${example.path}#${example.owner}`;
    if (!byOwner.has(key)) {
      byOwner.set(key, {
        id: key,
        owner: example.owner,
        line: example.line,
        examples: [],
      });
    }
    byOwner.get(key).examples.push({
      id: example.id,
      line: example.line,
      source: example.source,
      want: example.want,
      tags: example.tags,
    });
  }
  const groups = [...byOwner.values()];
  return {
    schema: "sagejs.sage-doctests/v1",
    generatedBy: "scripts/reference-examples.cjs",
    source: {
      repository: "https://github.com/sagemathinc/sagejs",
      revision,
      path: "src/baselib",
      license: "GPL-3.0-only",
    },
    summary: {
      groups: groups.length,
      examples: examples.length,
    },
    groups,
  };
}

module.exports = {
  collectReferenceSources,
  combinedFixture,
  examplesForEntry,
  sourceForEntry,
};
