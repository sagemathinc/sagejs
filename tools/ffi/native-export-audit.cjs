"use strict";

const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { extname, join, relative, resolve } = require("node:path");

const boundaryAudit = require("./boundary-audit.cjs");
const {
  loadNativeExportPolicy,
  validateNativeExportPolicy,
} = require("./native-export-policy.cjs");

const repositoryRoot = resolve(__dirname, "..", "..");
const schema = "sagejs.native-export-inventory/v1";
const sourceExtensions = new Set([".c", ".cc", ".cpp"]);
const consumerExtensions = new Set([".cjs", ".js", ".mjs", ".py", ".ts", ".tsx"]);
const ignoredConsumerPrefixes = [
  "architecture/", "dist/", "node_modules/", "tools/tree-sitter-",
];

function lineAt(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function skipQuoted(source, index, quote) {
  for (let cursor = index + 1; cursor < source.length; cursor += 1) {
    if (source[cursor] === "\\") cursor += 1;
    else if (source[cursor] === quote) return cursor + 1;
  }
  return source.length;
}

function skipSpaceAndComments(source, index) {
  let cursor = index;
  while (cursor < source.length) {
    if (/\s/.test(source[cursor])) cursor += 1;
    else if (source.startsWith("//", cursor)) {
      const end = source.indexOf("\n", cursor + 2);
      cursor = end < 0 ? source.length : end + 1;
    } else if (source.startsWith("/*", cursor)) {
      const end = source.indexOf("*/", cursor + 2);
      cursor = end < 0 ? source.length : end + 2;
    } else break;
  }
  return cursor;
}

function matchingDelimiter(source, start, open, close) {
  let depth = 0;
  for (let cursor = start; cursor < source.length; cursor += 1) {
    if (source.startsWith("//", cursor)) {
      const end = source.indexOf("\n", cursor + 2);
      cursor = end < 0 ? source.length : end;
      continue;
    }
    if (source.startsWith("/*", cursor)) {
      const end = source.indexOf("*/", cursor + 2);
      cursor = end < 0 ? source.length : end + 1;
      continue;
    }
    if (source[cursor] === '"' || source[cursor] === "'") {
      cursor = skipQuoted(source, cursor, source[cursor]) - 1;
      continue;
    }
    if (source[cursor] === open) depth += 1;
    else if (source[cursor] === close && --depth === 0) return cursor;
  }
  return -1;
}

function definitionFor(source, symbol) {
  const pattern = new RegExp(`\\b${symbol}\\s*\\(`, "g");
  for (const match of source.matchAll(pattern)) {
    const open = source.indexOf("(", match.index);
    const close = matchingDelimiter(source, open, "(", ")");
    if (close < 0) continue;
    const body = skipSpaceAndComments(source, close + 1);
    if (source[body] !== "{") continue;
    const bodyEnd = matchingDelimiter(source, body, "{", "}");
    if (bodyEnd < 0) continue;
    return {
      offset: match.index,
      line: lineAt(source, match.index),
      bodyStart: body,
      bodyEnd,
      lines: lineAt(source, bodyEnd) - lineAt(source, match.index) + 1,
    };
  }
  return null;
}

function sourceDefinitions(root, files, exports) {
  const sources = new Map();
  for (const path of files.filter((item) => sourceExtensions.has(extname(item)))) {
    sources.set(path, readFileSync(join(root, path), "utf8"));
  }
  const result = new Map();
  for (const item of exports) {
    const matches = [];
    for (const [path, source] of sources) {
      const found = definitionFor(source, item.symbol);
      if (found !== null) matches.push({ path, source, ...found });
    }
    if (matches.length !== 1) {
      throw new Error(
        `${item.id}: expected one definition of ${item.symbol}, found ${matches.length}`,
      );
    }
    result.set(item.id, matches[0]);
  }
  return result;
}

function implementationCalls(source, start, end, ownSymbol) {
  let masked = "";
  for (let cursor = start; cursor <= end;) {
    if (source.startsWith("//", cursor)) {
      const finish = source.indexOf("\n", cursor + 2);
      const length = (finish < 0 ? end + 1 : finish) - cursor;
      masked += " ".repeat(Math.max(0, length));
      cursor += length;
    } else if (source.startsWith("/*", cursor)) {
      const finish = source.indexOf("*/", cursor + 2);
      const length = (finish < 0 ? end + 1 : finish + 2) - cursor;
      masked += " ".repeat(Math.max(0, length));
      cursor += length;
    } else if (source[cursor] === '"' || source[cursor] === "'") {
      const finish = skipQuoted(source, cursor, source[cursor]);
      masked += " ".repeat(Math.max(0, finish - cursor));
      cursor = finish;
    } else {
      masked += source[cursor];
      cursor += 1;
    }
  }
  const calls = new Set();
  const ignored = new Set(["if", "for", "while", "switch", "return", "sizeof"]);
  for (const match of masked.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    if (match[1] !== ownSymbol && !ignored.has(match[1])) calls.add(match[1]);
  }
  return [...calls].sort();
}

function relevantConsumerPackages(path, source) {
  const result = [];
  if (path.startsWith("packages/flint/") || path.startsWith("packages/flint-wasm/") ||
      source.includes("flint_backend") || source.includes("@sagemath/sagejs-flint")) {
    result.push("@sagemath/sagejs-flint");
  }
  if (path.startsWith("packages/graph/") || source.includes("graph_backend") ||
      source.includes("@sagemath/sagejs-graph")) {
    result.push("@sagemath/sagejs-graph");
  }
  return result;
}

function consumerLocationIndex(root, files, exports) {
  const namesByPackage = new Map();
  const result = new Map();
  for (const item of exports) {
    if (!namesByPackage.has(item.package)) namesByPackage.set(item.package, new Set());
    namesByPackage.get(item.package).add(item.export);
    result.set(`${item.package}:${item.export}`, []);
  }
  const dot = /\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
  const bracket = /\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]/g;
  for (const path of files) {
    if (!consumerExtensions.has(extname(path)) ||
        ignoredConsumerPrefixes.some((prefix) => path.startsWith(prefix))) continue;
    const source = readFileSync(join(root, path), "utf8");
    for (const packageId of relevantConsumerPackages(path, source)) {
      const names = namesByPackage.get(packageId);
      if (names === undefined) continue;
      const found = new Set();
      for (const pattern of [dot, bracket]) {
        pattern.lastIndex = 0;
        for (const match of source.matchAll(pattern)) {
          if (names.has(match[1])) found.add(match[1]);
        }
      }
      for (const exportName of found) {
        result.get(`${packageId}:${exportName}`).push(path);
      }
    }
  }
  return result;
}

function createNativeExportInventory(options = {}) {
  const root = resolve(options.root || repositoryRoot);
  const files = boundaryAudit.trackedFiles(root);
  const boundary = boundaryAudit.createBoundarySnapshot({ root });
  const napi = boundary.boundaries.filter((item) => item.kind === "napi-export");
  const policy = loadNativeExportPolicy({ root });
  const classified = validateNativeExportPolicy(policy, napi);
  const definitions = sourceDefinitions(root, files, classified);
  const consumers = consumerLocationIndex(root, files, classified);
  for (const item of classified.filter((entry) =>
    policy.matrixExports.has(entry.export)
  )) {
    const implementation = definitions.get(item.id);
    if (implementation.path !== policy.document.matrix_remediation.scope) {
      throw new Error(
        `${item.id}: matrix remediation expects implementation in ` +
        `${policy.document.matrix_remediation.scope}, found ${implementation.path}`,
      );
    }
  }
  const exports = classified.map((item) => {
    const definition = definitions.get(item.id);
    const family = item.family;
    const decision = item.policy.decision;
    return {
      id: item.id,
      package: item.package,
      export: item.export,
      callback: item.symbol,
      registration: { path: item.path },
      implementation: {
        path: definition.path,
        line: definition.line,
        lines: definition.lines,
        sha256: createHash("sha256").update(
          definition.source.slice(definition.offset, definition.bodyEnd + 1),
        ).digest("hex"),
        calls: implementationCalls(
          definition.source,
          definition.bodyStart,
          definition.bodyEnd,
          item.symbol,
        ),
      },
      family: item.policy.family,
      decision,
      note: item.policy.note || null,
      rationale: family.rationale,
      fallback: family.fallback,
      oracles: family.oracles,
      consumers: consumers.get(`${item.package}:${item.export}`)
        .filter((path) => path !== item.path),
      declared_ffi: item.declaration || null,
    };
  });
  const counts = {};
  for (const entry of exports) counts[entry.decision] = (counts[entry.decision] || 0) + 1;
  return {
    schema,
    policy: relative(root, policy.filename),
    counts: Object.fromEntries(Object.entries(counts).sort()),
    exports,
  };
}

function inventoryPath(root = repositoryRoot) {
  return join(resolve(root), "architecture", "native-exports.json");
}

function validateNativeExportInventory(snapshot, options = {}) {
  const expected = createNativeExportInventory(options);
  const actualText = `${JSON.stringify(snapshot, null, 2)}\n`;
  const expectedText = `${JSON.stringify(expected, null, 2)}\n`;
  if (actualText !== expectedText) {
    throw new Error(
      "native export inventory has drifted; run " +
      "node scripts/audit-native-exports.cjs --write and review the diff",
    );
  }
  return expected;
}

module.exports = {
  consumerLocationIndex,
  createNativeExportInventory,
  inventoryPath,
  schema,
  validateNativeExportInventory,
};
