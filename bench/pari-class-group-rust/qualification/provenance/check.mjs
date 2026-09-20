#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Ajv = require("ajv/dist/2020");
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const crate = join(root, "bench/pari-class-group-rust");

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function checkFile(record, base = root) {
  const path = join(base, record.path);
  if (!existsSync(path)) fail(`missing recorded file: ${path}`);
  const actual = sha256(readFileSync(path));
  if (actual !== record.sha256) {
    fail(`source drift for ${record.path}: expected ${record.sha256}, got ${actual}`);
  }
}

const arguments_ = process.argv.slice(2);
let pariRoot = process.env.PARI_2_17_4_ROOT || "/home/user/upstream/pari-2.17.4";
for (let index = 0; index < arguments_.length; index += 1) {
  if (arguments_[index] === "--pari-root" && arguments_[index + 1]) {
    pariRoot = resolve(arguments_[++index]);
  } else {
    fail(`unknown or incomplete argument: ${arguments_[index]}`);
  }
}

const schema = readJson(join(here, "manifest.schema.json"));
const manifest = readJson(join(here, "manifest.json"));
const ajv = new Ajv({ allErrors: true, strict: false });
if (!ajv.validate(schema, manifest)) {
  fail(`manifest schema failure:\n${JSON.stringify(ajv.errors, null, 2)}`);
}

for (const record of [
  manifest.inputs.cargo_toml,
  manifest.inputs.cargo_lock,
  manifest.inputs.build_rs,
  ...manifest.inputs.native_dependency_declarations,
]) checkFile(record);

const modulePaths = readdirSync(join(crate, "src"))
  .filter((name) => /\.(?:rs|c)$/.test(name))
  .map((name) => `bench/pari-class-group-rust/src/${name}`)
  .sort();
const recordedModules = manifest.modules.map((entry) => entry.path).sort();
if (JSON.stringify(modulePaths) !== JSON.stringify(recordedModules)) {
  fail(`handwritten module coverage differs:\nactual=${JSON.stringify(modulePaths)}\nrecorded=${JSON.stringify(recordedModules)}`);
}

if (!existsSync(pariRoot)) fail(`PARI root does not exist: ${pariRoot}`);
const sourceIds = new Set(manifest.upstream_sources.map((entry) => entry.id));
const sourceById = new Map(manifest.upstream_sources.map((entry) => [entry.id, entry]));
if (sourceIds.size !== manifest.upstream_sources.length) fail("duplicate upstream source id");
for (const module of manifest.modules) {
  checkFile(module);
  if (module.mapping_status === "missing") {
    if (module.mappings.length !== 0 || !module.missing_mapping_explanation) {
      fail(`missing mapping is not explicit for ${module.path}`);
    }
  } else if (module.mapping_status === "not_applicable") {
    if (module.mappings.length !== 0 || module.missing_mapping_explanation !== null) {
      fail(`not-applicable mapping carries contradictory data for ${module.path}`);
    }
  } else if (module.mapping_status === "partial") {
    if (module.mappings.length === 0 || !module.missing_mapping_explanation) {
      fail(`partial mapping does not state its uncovered scope for ${module.path}`);
    }
  } else if (module.mappings.length === 0 || module.missing_mapping_explanation !== null) {
    fail(`complete mapping lacks evidence or carries a gap for ${module.path}`);
  }
  for (const mapping of module.mappings) {
    if (!sourceIds.has(mapping.source_id)) {
      fail(`unknown upstream source ${mapping.source_id} in ${module.path}`);
    }
    const source = sourceById.get(mapping.source_id);
    if (source.project === "PARI/GP") {
      const text = readFileSync(join(pariRoot, source.relative_path), "utf8");
      const lineCount = text.split("\n").length;
      for (const range of mapping.line_ranges) {
        const [start, end] = range.split("-").map(Number);
        if (start < 1 || end < start || end > lineCount) {
          fail(`invalid source range ${range} for ${mapping.source_id} in ${module.path}`);
        }
      }
      for (const symbol of mapping.symbols) {
        if (!text.includes(symbol)) {
          fail(`mapped symbol ${symbol} is absent from ${mapping.source_id} for ${module.path}`);
        }
      }
    }
  }
}

for (const source of manifest.upstream_sources) {
  if (source.project !== "PARI/GP") continue;
  const path = join(pariRoot, source.relative_path);
  if (!existsSync(path)) fail(`missing PARI source: ${path}`);
  const actual = sha256(readFileSync(path));
  if (actual !== source.sha256) {
    fail(`PARI source drift for ${source.relative_path}: expected ${source.sha256}, got ${actual}`);
  }
}

const cargoMetadata = JSON.parse(execFileSync(
  "cargo",
  ["metadata", "--locked", "--format-version", "1"],
  { cwd: crate, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
));
const actualPackages = cargoMetadata.packages
  .map((entry) => ({
    name: entry.name,
    version: entry.version,
    source: entry.source,
    checksum: entry.checksum,
    license_expression: entry.license,
    repository: entry.repository,
  }))
  .sort((left, right) => `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`));
const expectedPackages = manifest.cargo_packages
  // `cargo metadata` does not expose registry checksums.  Their complete
  // identity is still fail-closed because the checker hashes Cargo.lock and
  // the manifest records every lockfile checksum.
  .map(({ license_evidence: _licenseEvidence, checksum: _checksum, ...entry }) => entry)
  .sort((left, right) => `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`));
if (JSON.stringify(actualPackages) !== JSON.stringify(expectedPackages)) {
  fail(`Cargo package inventory differs:\nactual=${JSON.stringify(actualPackages, null, 2)}\nrecorded=${JSON.stringify(expectedPackages, null, 2)}`);
}

const buildSource = readFileSync(join(root, "packages/flint/scripts/build-deps.cjs"), "utf8");
const buildRs = readFileSync(join(crate, "build.rs"), "utf8");
const gmpSysPackage = cargoMetadata.packages.find((entry) => entry.name === "gmp-mpfr-sys");
if (!gmpSysPackage) fail("gmp-mpfr-sys is absent from the resolved Cargo graph");
const gmpSysBuild = readFileSync(join(dirname(gmpSysPackage.manifest_path), "build.rs"), "utf8");
const foreignKeys = new Set();
for (const dependency of manifest.foreign_dependencies) {
  const key = `${dependency.route}:${dependency.name}`;
  if (foreignKeys.has(key)) fail(`duplicate foreign dependency record: ${key}`);
  foreignKeys.add(key);
  if (dependency.name !== "Arb" && !dependency.license_expression) {
    fail(`missing declared license expression for ${key}`);
  }
  if (dependency.route === "cargo_default") {
    const constant = dependency.name === "GMP" ? "GMP_DIR" :
      dependency.name === "MPFR" ? "MPFR_DIR" : null;
    if (!constant ||
        !gmpSysBuild.includes(`const ${constant}: &str = "${dependency.name.toLowerCase()}-${dependency.version}-c"`)) {
      fail(`gmp-mpfr-sys bundled-source identity differs for ${dependency.name}`);
    }
    if (!dependency.source_url.startsWith(`bundled:gmp-mpfr-sys-${gmpSysPackage.version}/`)) {
      fail(`invalid bundled source identity for ${dependency.name}`);
    }
  }
  if (dependency.route === "flint_normal_form_feature") {
    for (const needle of [dependency.version, dependency.source_url, dependency.source_sha256]) {
      if (needle && !buildSource.includes(needle)) {
        fail(`native dependency declaration missing ${needle} for ${dependency.name}`);
      }
    }
    if (dependency.link_name && !buildRs.includes(`cargo:rustc-link-lib=static=${dependency.link_name}`)) {
      fail(`build.rs no longer links ${dependency.link_name}`);
    }
  }
  if (dependency.route === "incorporated_component") {
    if (dependency.name !== "Arb" || dependency.link_name !== null ||
        dependency.license_expression !== null ||
        !readFileSync(join(crate, "src/flint_normal_form.c"), "utf8").includes("<flint/arb.h>") ||
        buildRs.includes("cargo:rustc-link-lib=static=arb")) {
      fail("Arb is no longer accurately classified as an incorporated FLINT component");
    }
    const flint = manifest.foreign_dependencies.find((entry) =>
      entry.route === "flint_normal_form_feature" && entry.name === "FLINT");
    if (!flint || dependency.source_url !== flint.source_url ||
        dependency.source_sha256 !== flint.source_sha256) {
      fail("integrated Arb identity differs from the FLINT distribution identity");
    }
  }
}

const counts = Object.fromEntries([
  "original",
  "behavioral_reimplementation",
  "source_translation_adaptation",
].map((classification) => [classification,
  manifest.modules.filter((entry) => entry.classification === classification).length]));
const statuses = Object.fromEntries(["complete", "partial", "missing", "not_applicable"]
  .map((status) => [status, manifest.modules.filter((entry) => entry.mapping_status === status).length]));
console.log(JSON.stringify({
  ok: true,
  modules: manifest.modules.length,
  classifications: counts,
  mapping_statuses: statuses,
  cargo_packages: manifest.cargo_packages.length,
  foreign_dependencies: manifest.foreign_dependencies.length,
  pari_root: relative(root, pariRoot) || ".",
}, null, 2));
