"use strict";

const { createHash } = require("node:crypto");
const { readdirSync, readFileSync } = require("node:fs");
const { join, relative } = require("node:path");

const { extractSageDoctests } = require("../tools/sage-doctest-fixture.cjs");

function normalizedExampleText(value) {
  const text = String(value ?? "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

function shortHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function contentAddressedExampleId(path, source, want, occurrence = 1) {
  const normalizedPath = String(path).replaceAll("\\", "/");
  const address = (
    `${normalizedPath}#${shortHash(normalizedExampleText(source))}-` +
    shortHash(normalizedExampleText(want))
  );
  return occurrence === 1 ? address : `${address}~${occurrence}`;
}

function contentAddressExample(example, id) {
  return {
    ...example,
    // Extracted fixture IDs are source coordinates.  They remain useful when
    // joining the upstream expectation corpus, but are not stable identities:
    // inserting an unrelated line changes them.  Verification and published
    // documentation instead address the normalized transcript content.
    provenance_id: example.id,
    id,
  };
}

function referenceExampleIds(groups) {
  const occurrences = new Map();
  const ids = new Map();
  for (const group of groups) {
    for (const example of group.examples) {
      const address = contentAddressedExampleId(
        group.path,
        example.source,
        example.want,
      );
      const occurrence = (occurrences.get(address) ?? 0) + 1;
      occurrences.set(address, occurrence);
      ids.set(
        example.id,
        contentAddressedExampleId(
          group.path,
          example.source,
          example.want,
          occurrence,
        ),
      );
    }
  }
  return ids;
}

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
    const classMatch = line.match(/^\s*class\s+([A-Za-z_]\w*)/);
    if (classMatch) {
      while (classes.length && classes.at(-1).indent >= indent) classes.pop();
      classes.push({ name: classMatch[1], indent });
      continue;
    }
    const match = line.match(/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
    if (!match) continue;
    while (classes.length && classes.at(-1).indent >= indent) classes.pop();
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
  const localFixtures = [
    join(root, "reference-tests", "graphs.cjs"),
  ];
  for (const filename of localFixtures) {
    const fixture = require(filename);
    for (const group of fixture.groups ?? []) {
      groups.push({
        ...group,
        path: fixture.source.path,
        origin: "sagejs-reference",
        provenance: fixture.source,
      });
    }
  }
  return {
    groups,
    definitions,
    referenceExampleIds: referenceExampleIds(groups),
  };
}

function tailName(value) {
  return value.split(".").at(-1).toLowerCase();
}

function examplesForEntry(entry, sources) {
  const names = new Set([entry.name, ...entry.aliases].map(tailName));
  const exactNames = new Set([entry.name, ...entry.aliases]);
  const matches = sources.groups.filter((group) => {
    if ((group.covers ?? []).some((name) => exactNames.has(name))) return true;
    const owner = String(group.owner);
    if (exactNames.has(owner)) return true;
    const ownerParts = owner.split(".");
    if (!names.has(tailName(owner))) return false;
    // An unqualified owner (the common shape for an extracted module-level
    // function) can safely match a namespaced public entry.  Qualified method
    // owners must also agree on their class/namespace, otherwise Graph.order
    // would acquire examples from finite-field order methods.
    if (ownerParts.length === 1) return true;
    return [...exactNames].some((name) => {
      const parts = name.split(".");
      const normalizedOwner = {
        genericgraph: "graph",
        graphgenerators: "graphs",
        digraphgenerators: "digraphs",
      }[ownerParts.at(-2).toLowerCase()] ?? ownerParts.at(-2).toLowerCase();
      return parts.length > 1 && parts.at(-2).toLowerCase() === normalizedOwner;
    });
  });
  return matches.flatMap((group) => group.examples.map((example) => {
    const id = sources.referenceExampleIds?.get(example.id) ??
      contentAddressedExampleId(group.path, example.source, example.want);
    return contentAddressExample(
      {
        ...example,
        owner: group.owner,
        path: group.path,
        origin: group.origin,
        provenance: group.provenance,
        language: "sage",
      },
      id,
    );
  }));
}

function sourceForEntry(entry, sources) {
  const names = new Set([entry.name, ...entry.aliases].map(tailName));
  let candidates = sources.definitions.filter(
    (definition) => names.has(definition.name.toLowerCase()),
  );
  if (!candidates.length) return null;
  if (entry.tags.includes("graph theory")) {
    const owner = entry.name.split(".").at(-2);
    const implementationOwner = {
      Graph: "GenericGraph",
      graphs: "GraphGenerators",
      digraphs: "DigraphGenerators",
    }[owner] ?? owner;
    const graphCandidates = candidates.filter((item) =>
      item.path === "src/baselib/graphs.py" &&
      item.qualified.split(".").at(-2) === implementationOwner);
    if (graphCandidates.length) candidates = graphCandidates;
  }
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
  contentAddressedExampleId,
  examplesForEntry,
  normalizedExampleText,
  sourceForEntry,
};
