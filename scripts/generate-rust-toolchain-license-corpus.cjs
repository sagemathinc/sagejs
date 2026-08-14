#!/usr/bin/env node
"use strict";

// Generate the license corpus for the exact official Rust toolchain archive
// used to compile Node's Temporal implementation on Linux.
// Usage: node scripts/generate-rust-toolchain-license-corpus.cjs EXTRACTED_ROOT OUTPUT

const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { basename, join } = require("node:path");

const [source, output] = process.argv.slice(2);
if (!source || !output) {
  throw new Error("expected extracted Rust distribution root and output filename");
}

const files = [
  "COPYRIGHT",
  "LICENSE-APACHE",
  "LICENSE-MIT",
  "cargo/share/doc/cargo/LICENSE-THIRD-PARTY",
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const lines = [
  "Rust 1.86.0 build-tool license corpus",
  "",
  "Sources:",
  "- https://static.rust-lang.org/dist/2025-04-03/rust-1.86.0-x86_64-unknown-linux-gnu.tar.xz",
  "  SHA-256: 6b448b3669e0c74f7f4b87da7da4868a552fcbba1f955032d8925ad2fffb3798",
  "- https://static.rust-lang.org/dist/2025-04-03/rust-1.86.0-aarch64-unknown-linux-gnu.tar.xz",
  "  SHA-256: 2b97d1e09a1d7fdbed748332879318ee7f41c008837f87ccb44ec045df0a8a1b",
  "",
  "Rust is used only to build the custom Linux Node executable; the Rust",
  "compiler and Cargo are not redistributed in Sage.js release archives.",
  "This corpus records the complete top-level Rust terms and Cargo's bundled",
  "third-party terms from the pinned official distribution.",
  "",
];

for (const name of files) {
  const contents = readFileSync(join(source, ...name.split("/")), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\n*$/, "\n");
  lines.push(
    "================================================================================",
    `source file: ${name}`,
    `source-file SHA-256: ${sha256(contents)}`,
    "================================================================================",
    contents.replace(/\n$/, ""),
    "",
  );
}

writeFileSync(output, `${lines.join("\n").replace(/\n*$/, "")}\n`);
console.log(`Wrote ${basename(output)} from ${files.length} Rust distribution notices.`);
