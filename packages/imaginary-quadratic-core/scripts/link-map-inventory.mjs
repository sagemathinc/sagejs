#!/usr/bin/env node
// A linker-input inventory for a byte-identical development Wasm rebuild.
// Link maps omit inlined code and are not artifact-derived SBOMs or approval.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function parseLinkMap(text) {
  if (!text.startsWith("    Addr      Off     Size Out     In      Symbol\n")) {
    throw new TypeError("the Wasm linker map has an unexpected header");
  }
  const contributions = new Map();
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*(?:-|[0-9a-f]+)\s+[0-9a-f]+\s+[0-9a-f]+\s+(\S+):\(/);
    if (!match) continue;
    const source = match[1];
    if (source !== "<internal>" &&
        !/^(?:\/\S+\.(?:rlib|a)\([^)]+\)|\/\S+\.(?:o|obj))$/.test(source)) {
      throw new TypeError(`unsupported linked input in Wasm map: ${source}`);
    }
    contributions.set(source, (contributions.get(source) ?? 0) + 1);
  }
  if (contributions.size === 0) {
    throw new TypeError("the Wasm linker map contains no linked inputs");
  }
  return contributions;
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function inventoryInput(source, count, targetRoot, sysroot) {
  const archive = source.match(/^(.*\.(?:rlib|a))\(([^/()]+)\)$/);
  const filename = archive ? archive[1] : source;
  const actual = fs.realpathSync(filename);
  const kind = inside(targetRoot, actual) ? "cargo-target" :
    inside(sysroot, actual) ? "rust-sysroot" : null;
  if (kind === null) {
    throw new TypeError(`linked input is outside the build target and Rust sysroot: ${source}`);
  }
  const relative = path.relative(kind === "cargo-target" ? targetRoot : sysroot, actual);
  const id = `${kind}/${relative.split(path.sep).join("/")}`;
  const bytes = archive
    ? execFileSync("ar", ["p", filename, archive[2]], { maxBuffer: 128 * 1024 * 1024 })
    : fs.readFileSync(actual);
  if (bytes.byteLength === 0) {
    throw new TypeError(`linked input is empty or the archive member is absent: ${source}`);
  }
  return {
    input: archive ? `${id}(${archive[2]})` : id,
    archiveSha256: archive ? sha256(fs.readFileSync(actual)) : null,
    memberSha256: sha256(bytes),
    contributions: count,
  };
}

export function inspectLinkMap(candidateFile, mappedFile, mapFile, options = {}) {
  const candidate = fs.readFileSync(candidateFile);
  const mapped = fs.readFileSync(mappedFile);
  if (!candidate.equals(mapped) || candidate.byteLength < 8 ||
      candidate.subarray(0, 8).toString("hex") !== "0061736d01000000") {
    throw new TypeError("the mapped rebuild is not byte-identical Wasm");
  }
  const targetRoot = fs.realpathSync(options.targetRoot ??
    path.resolve(path.dirname(mappedFile), "../.."));
  const sysroot = fs.realpathSync(options.sysroot ??
    execFileSync("rustc", ["--print", "sysroot"], { encoding: "utf8" }).trim());
  const map = fs.readFileSync(mapFile, "utf8");
  const contributions = parseLinkMap(map);
  const internalContributions = contributions.get("<internal>") ?? 0;
  contributions.delete("<internal>");
  const inputs = [...contributions].map(([source, count]) =>
    inventoryInput(source, count, targetRoot, sysroot)).sort((a, b) =>
    a.input.localeCompare(b.input));
  const normalizedMap = map.replaceAll(targetRoot, "<CARGO_TARGET>")
    .replaceAll(sysroot, "<RUST_SYSROOT>");
  return {
    schema: "sagejs.imaginary-quadratic/hash-equal-link-map-inventory-v1",
    scope: "linked-object evidence from a byte-identical development rebuild; not an artifact-derived SBOM, complete source inventory, or distribution approval",
    artifact: { bytes: candidate.byteLength, sha256: sha256(candidate) },
    linkMap: {
      rawSha256: sha256(map),
      normalizedSha256: sha256(normalizedMap),
      linkedInputCount: inputs.length,
      linkedContributionCount: inputs.reduce((total, input) => total + input.contributions, 0),
      internalContributions,
    },
    inputs,
    limitations: [
      "Inlined dependency code may reside in another crate's object and not appear as a separate linked member.",
      "The build graph, source closure, licenses, and notices require separate review.",
      "A linker map does not replace an independent safety or legal distribution decision.",
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 5) {
    console.error("usage: node link-map-inventory.mjs CANDIDATE.wasm MAPPED.wasm LINK.map");
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(inspectLinkMap(...process.argv.slice(2)), null, 2));
    } catch (error) {
      console.error(error?.stack ?? String(error));
      process.exitCode = 1;
    }
  }
}
