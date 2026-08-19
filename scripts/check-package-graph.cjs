#!/usr/bin/env node
"use strict";

const { readFileSync, readdirSync, statSync } = require("node:fs");
const { join, relative, resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");
const MANIFEST = join(ROOT, "architecture", "package-graph.json");

function readJson(filename) {
  return JSON.parse(readFileSync(filename, "utf8"));
}

function normalizedSourceBytes(source) {
  return Buffer.byteLength(source.replaceAll("\r\n", "\n"), "utf8");
}

function allFiles(directory) {
  const result = [];
  for (const name of readdirSync(directory)) {
    const filename = join(directory, name);
    if (statSync(filename).isDirectory()) result.push(...allFiles(filename));
    else result.push(relative(ROOT, filename).replaceAll("\\", "/"));
  }
  return result;
}

function ownerOf(filename, packages) {
  const exactOwners = packages.filter((component) =>
    component.files.includes(filename),
  );
  if (exactOwners.length > 0) return exactOwners;
  return packages.filter((component) =>
    component.prefixes.some((prefix) => filename.startsWith(prefix)),
  );
}

function typescriptOwnerOf(filename, packages) {
  const exactOwners = packages.filter((component) =>
    (component.typescript_files ?? []).includes(filename),
  );
  if (exactOwners.length > 0) return exactOwners;
  return packages.filter((component) =>
    (component.typescript_prefixes ?? []).some((prefix) => filename.startsWith(prefix)),
  );
}

function assertDag(nodes, label) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error(`${label} has duplicate ids`);
  const state = new Map();
  function visit(id, path = []) {
    const node = byId.get(id);
    if (!node) throw new Error(`${label} references unknown dependency ${id}`);
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      throw new Error(`${label} dependency cycle: ${[...path, id].join(" -> ")}`);
    }
    state.set(id, 1);
    for (const dependency of node.depends_on) visit(dependency, [...path, id]);
    state.set(id, 2);
  }
  for (const id of byId.keys()) visit(id);
  return byId;
}

function pythonImports(source) {
  const names = [];
  for (const line of source.split(/\r?\n/)) {
    let match = line.match(/^\s*from\s+([A-Za-z_][A-Za-z0-9_.]*)\s+import\s+/);
    if (match) {
      names.push(match[1]);
      continue;
    }
    match = line.match(/^\s*import\s+(.+)$/);
    if (!match) continue;
    for (const item of match[1].split(",")) {
      const name = item.trim().split(/\s+as\s+/)[0];
      if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name)) names.push(name);
    }
  }
  return names;
}

function validateManifest(manifest, root = ROOT) {
  if (manifest.schema_version !== 1) throw new Error("unsupported package graph schema");
  const packages = manifest.packages;
  const byId = assertDag(packages, "logical package graph");
  const workspaceById = assertDag(
    manifest.workspace_packages,
    "workspace package graph",
  );

  for (const component of packages) {
    if (!Number.isInteger(component.layer) || component.layer < 0) {
      throw new Error(`${component.id} has an invalid layer`);
    }
    if (!['bootstrap', 'lazy'].includes(component.startup)) {
      throw new Error(`${component.id} has an invalid startup policy`);
    }
    for (const dependency of component.depends_on) {
      const target = byId.get(dependency);
      if (target.layer >= component.layer) {
        throw new Error(
          `${component.id} (layer ${component.layer}) depends on ${dependency} ` +
          `(layer ${target.layer}); dependencies must point strictly downward`,
        );
      }
    }
  }

  const ownedFiles = manifest.policy.owned_source_roots.flatMap((directory) =>
    allFiles(join(root, directory)).filter((filename) => filename.endsWith(".py")),
  );
  const ownership = new Map();
  for (const filename of ownedFiles) {
    const owners = ownerOf(filename, packages);
    if (owners.length !== 1) {
      throw new Error(
        `${filename} must have exactly one package owner; found ` +
        (owners.map((owner) => owner.id).join(", ") || "none"),
      );
    }
    ownership.set(filename, owners[0].id);
  }
  const typescriptOwnership = new Map();
  for (const directory of manifest.policy.owned_typescript_roots ?? []) {
    for (const filename of allFiles(join(root, directory)).filter(
      (name) => name.endsWith(".ts") || name.endsWith(".js"),
    )) {
      const owners = typescriptOwnerOf(filename, packages);
      if (owners.length !== 1) {
        throw new Error(
          `${filename} must have exactly one TypeScript package owner; found ` +
          (owners.map((owner) => owner.id).join(", ") || "none"),
        );
      }
      typescriptOwnership.set(filename, owners[0].id);
    }
  }

  for (const component of packages) {
    let bytes = 0;
    for (const [filename, owner] of ownership) {
      if (owner === component.id) {
        bytes += normalizedSourceBytes(
          readFileSync(join(root, filename), "utf8"),
        );
      }
    }
    for (const [filename, owner] of typescriptOwnership) {
      if (owner === component.id) {
        bytes += normalizedSourceBytes(
          readFileSync(join(root, filename), "utf8"),
        );
      }
    }
    if (bytes > component.max_source_bytes) {
      throw new Error(
        `${component.id} owns ${bytes} source bytes, exceeding its ` +
        `${component.max_source_bytes} byte ${component.startup} budget`,
      );
    }
    component.actual_source_bytes = bytes;
  }

  const moduleOwners = new Map();
  for (const component of packages) {
    for (const name of component.modules ?? []) {
      if (moduleOwners.has(name)) throw new Error(`module ${name} has two owners`);
      moduleOwners.set(name, component.id);
    }
  }
  const ignored = new Set(["__future__", "__python__", "typing"]);
  for (const [filename, owner] of ownership) {
    const allowed = new Set([owner, ...byId.get(owner).depends_on]);
    for (const imported of pythonImports(readFileSync(join(root, filename), "utf8"))) {
      const parts = imported.split(".");
      let target;
      for (let length = parts.length; length >= 1 && !target; length -= 1) {
        target = moduleOwners.get(parts.slice(0, length).join("."));
      }
      if (!target && ignored.has(parts[0])) continue;
      if (target && !allowed.has(target)) {
        throw new Error(
          `${filename} (${owner}) imports ${imported} (${target}) without a declared dependency`,
        );
      }
    }
  }

  const workspaceNames = new Map(
    manifest.workspace_packages.map((entry) => [entry.name, entry.id]),
  );
  for (const entry of manifest.workspace_packages) {
    const packageJson = readJson(join(root, entry.path, "package.json"));
    if (packageJson.name !== entry.name) {
      throw new Error(`${entry.path}/package.json is ${packageJson.name}, expected ${entry.name}`);
    }
    const declared = new Set(entry.depends_on);
    for (const section of [
      "dependencies", "devDependencies", "optionalDependencies", "peerDependencies",
    ]) {
      for (const name of Object.keys(packageJson[section] ?? {})) {
        const target = workspaceNames.get(name);
        if (target && !declared.has(target)) {
          throw new Error(`${entry.id} uses workspace package ${target} without declaring it`);
        }
      }
    }
  }

  for (const [name, budget] of Object.entries(manifest.startup_budgets)) {
    for (const key of [
      "normalized_median_ms", "hard_limit_ms", "samples", "reference_node_ms",
    ]) {
      if (!(Number(budget[key]) > 0)) throw new Error(`${name}.${key} must be positive`);
    }
    for (const [platformArch, value] of Object.entries(
      budget.normalized_median_ms_by_platform_arch ?? {},
    )) {
      if (!/^[a-z0-9]+-[a-z0-9_]+$/.test(platformArch)) {
        throw new Error(`${name} has invalid platform-architecture key ${platformArch}`);
      }
      if (!(Number(value) > 0)) {
        throw new Error(
          `${name}.normalized_median_ms_by_platform_arch.${platformArch} must be positive`,
        );
      }
    }
    if (!Number.isInteger(budget.samples) || budget.samples < 3 || budget.samples % 2 === 0) {
      throw new Error(`${name}.samples must be an odd integer of at least 3`);
    }
  }
  return { packages, ownership, typescriptOwnership, workspaceById };
}

function run() {
  const manifest = readJson(MANIFEST);
  const result = validateManifest(manifest);
  console.log("Sage.js package graph is valid and acyclic.");
  for (const component of result.packages) {
    console.log(
      `  ${component.id.padEnd(22)} ${component.startup.padEnd(9)} ` +
      `${String(component.actual_source_bytes).padStart(7)} / ${component.max_source_bytes} bytes`,
    );
  }
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  assertDag,
  normalizedSourceBytes,
  pythonImports,
  validateManifest,
};
