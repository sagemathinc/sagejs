#!/usr/bin/env node
"use strict";

const {
  readdirSync,
  readFileSync,
  statSync,
} = require("node:fs");
const { relative, resolve } = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");

const repositoryRoot = resolve(__dirname, "..");

function extractTestedSageFences(source, path = "<markdown>") {
  const lines = String(source).replaceAll("\r\n", "\n").split("\n");
  const examples = [];
  for (let index = 0; index < lines.length; index += 1) {
    const opening = lines[index].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!opening) continue;
    const marker = opening[1][0];
    const width = opening[1].length;
    const info = opening[2].trim().split(/\s+/).filter(Boolean);
    const sourceLine = index + 2;
    const body = [];
    let closed = false;
    for (index += 1; index < lines.length; index += 1) {
      const closing = lines[index].match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (
        closing &&
        closing[1][0] === marker &&
        closing[1].length >= width
      ) {
        closed = true;
        break;
      }
      body.push(lines[index]);
    }
    if (!closed) {
      throw new Error(`${path}:${sourceLine - 1}: unclosed Markdown fence`);
    }
    if (info[0] === "sage" && info.includes("test")) {
      if (!body.some((line) => line.trim())) {
        throw new Error(`${path}:${sourceLine}: tested Sage fence is empty`);
      }
      examples.push({
        path,
        line: sourceLine,
        source: body.join("\n"),
      });
    }
  }
  return examples;
}

function markdownFiles(targets, root = repositoryRoot) {
  const files = [];
  const pending = targets.map((target) => resolve(root, target));
  while (pending.length) {
    const path = pending.pop();
    const status = statSync(path);
    if (status.isDirectory()) {
      const children = readdirSync(path, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
      for (let index = children.length - 1; index >= 0; index -= 1) {
        pending.push(resolve(path, children[index].name));
      }
    } else if (status.isFile() && path.endsWith(".md")) {
      files.push(path);
    }
  }
  return files.sort();
}

function collectTestedSageExamples(
  targets = ["docs"],
  root = repositoryRoot,
) {
  const documents = [];
  for (const path of markdownFiles(targets, root)) {
    const displayPath = relative(root, path).replaceAll("\\", "/");
    const examples = extractTestedSageFences(
      readFileSync(path, "utf8"),
      displayPath,
    );
    if (examples.length) documents.push({ path: displayPath, examples });
  }
  return documents;
}

async function runTestedSageExamples({
  targets = ["docs"],
  root = repositoryRoot,
  timeout = 120_000,
} = {}) {
  const documents = collectTestedSageExamples(targets, root);
  let count = 0;
  for (const document of documents) {
    const session = await createSage();
    try {
      for (const example of document.examples) {
        try {
          await session.evaluate(example.source, { timeout });
        } catch (error) {
          const message =
            `${example.path}:${example.line}: tested Sage example failed`;
          throw new Error(message, { cause: error });
        }
        count += 1;
      }
    } finally {
      await session.close();
    }
  }
  return { documents: documents.length, examples: count };
}

async function main() {
  const targets = process.argv.slice(2);
  const result = await runTestedSageExamples({
    targets: targets.length ? targets : ["docs"],
  });
  console.log(
    `Passed ${result.examples} tested Sage documentation examples ` +
      `in ${result.documents} documents.`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    if (error.cause) console.error(error.cause);
    process.exitCode = 1;
  });
}

module.exports = {
  collectTestedSageExamples,
  extractTestedSageFences,
  markdownFiles,
  runTestedSageExamples,
};
