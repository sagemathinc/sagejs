"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

function pythonSources(directory) {
  const sources = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) sources.push(...pythonSources(filename));
    else if (entry.isFile() && entry.name.endsWith(".py")) sources.push(filename);
  }
  return sources.sort();
}

// Shared by canonical packaging and focused runtime integration tests. Reusing
// this source/signature check avoids relinking unrelated exact libraries merely
// to exercise current Python modules in a browser. It does not issue a receipt
// or qualify any reused compiler or Wasm artifact.
function buildBrowserStandardLibrary({ sourceDirectory, cacheDirectory, requiredModules, output }) {
  for (const name of requiredModules) {
    if (!fs.existsSync(path.join(cacheDirectory, `${name.replaceAll(".", "-")}.json`))) {
      throw new Error(`compiled browser module ${name} is missing (run \`pnpm build\` first)`);
    }
  }
  const modules = {};
  const receiptInputs = [];
  for (const filename of pythonSources(sourceDirectory)) {
    const relative = path.relative(sourceDirectory, filename);
    const components = relative.slice(0, -3).split(path.sep);
    if (components.at(-1) === "__init__") components.pop();
    const name = components.join(".");
    if (!name) continue;
    const cacheFilename = path.join(cacheDirectory, `${name.replaceAll(".", "-")}.json`);
    if (!fs.existsSync(cacheFilename)) continue;
    const source = fs.readFileSync(filename, "utf8");
    const cache = JSON.parse(fs.readFileSync(cacheFilename, "utf8"));
    if (cache.signature !== createHash("sha1").update(source).digest("hex")) {
      throw new Error(`compiled browser module ${name} is stale (run \`pnpm build\` first)`);
    }
    receiptInputs.push(filename, cacheFilename);
    modules[name] = { package: path.basename(filename) === "__init__.py", source, cache };
  }
  fs.writeFileSync(output, JSON.stringify({ modules, preload: requiredModules }));
  return receiptInputs;
}

module.exports = { buildBrowserStandardLibrary };
