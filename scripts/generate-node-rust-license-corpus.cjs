#!/usr/bin/env node
"use strict";

// Generate the exact license corpus for the Rust crates vendored by Node.
// Usage: node scripts/generate-node-rust-license-corpus.cjs NODE_DEPS_CRATES OUTPUT

const { createHash } = require("node:crypto");
const {
  readFileSync,
  readdirSync,
  writeFileSync,
} = require("node:fs");
const { basename, join } = require("node:path");

const [source, output] = process.argv.slice(2);
if (!source || !output) {
  throw new Error("expected Node deps/crates directory and output filename");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function packageField(contents, name) {
  const packageBlock = contents.match(/\[package\]\n([\s\S]*?)(?=\n\[|$)/)?.[1] || "";
  return packageBlock.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"`, "m"))?.[1];
}

const crates = readdirSync(join(source, "vendor"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const directory = join(source, "vendor", entry.name);
    const manifest = readFileSync(join(directory, "Cargo.toml"), "utf8").replace(/\r\n/g, "\n");
    const name = packageField(manifest, "name");
    const version = packageField(manifest, "version");
    const license = packageField(manifest, "license");
    if (!name || !version || !license) {
      throw new Error(`incomplete package identity in ${entry.name}`);
    }
    const notices = readdirSync(directory)
      .filter((filename) => /^LICENSE/i.test(filename))
      .sort();
    if (notices.length === 0) throw new Error(`${entry.name} has no license file`);
    return { directory, entry: entry.name, license, name, notices, version };
  })
  .sort((left, right) => left.name.localeCompare(right.name));

const lines = [
  "Node.js 26.7.0 vendored Rust crate license corpus",
  "",
  "Source: https://nodejs.org/dist/v26.7.0/node-v26.7.0.tar.xz",
  "Source SHA-256: e6b182cbeeab032d1082ca4ac4fe15e3a57de691d3bde78ecf8a761fd56ee356",
  `Crates: ${crates.length}`,
  "",
  "This file concatenates every LICENSE* file shipped in the pinned Node source",
  "under deps/crates/vendor. The crate package identity and the exact source-file",
  "digest precede each unmodified, LF-normalized license text.",
  "",
];

for (const crate of crates) {
  for (const notice of crate.notices) {
    const contents = readFileSync(join(crate.directory, notice), "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\n*$/, "\n");
    lines.push(
      "================================================================================",
      `crate: ${crate.name}`,
      `version: ${crate.version}`,
      `declared license: ${crate.license}`,
      `source file: deps/crates/vendor/${crate.entry}/${notice}`,
      `source-file SHA-256: ${sha256(contents)}`,
      "================================================================================",
      contents.replace(/\n$/, ""),
      "",
    );
  }
}

writeFileSync(output, `${lines.join("\n").replace(/\n*$/, "")}\n`);
console.log(`Wrote ${basename(output)} for ${crates.length} vendored crates.`);
