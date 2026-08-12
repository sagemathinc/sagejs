#!/usr/bin/env node
"use strict";

const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { join } = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");
const {
  documentationCoverage,
  renderDocumentationMarkdown,
} = require("../dist/tools/documentation.js");
const {
  collectReferenceSources,
  examplesForEntry,
  sourceForEntry,
} = require("./reference-examples.cjs");
const { buildReferencePrism } = require("./build-reference-prism.cjs");

const root = join(__dirname, "..");
const output = join(root, "docs", "reference", "api.md");
const websiteOutput = join(root, "website", "reference-data.json");
const websiteHtml = join(root, "website", "reference.html");
const check = process.argv.slice(2).includes("--check");

function contentHash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function stampedReferenceHtml(referenceData) {
  const html = readFileSync(websiteHtml, "utf8");
  const assets = {
    "reference.css": readFileSync(join(root, "website", "reference.css"), "utf8"),
    "reference-examples.css": readFileSync(
      join(root, "website", "reference-examples.css"),
      "utf8",
    ),
    "reference-prism.css": readFileSync(
      join(root, "website", "reference-prism.css"),
      "utf8",
    ),
    "reference-prism.js": readFileSync(
      join(root, "website", "reference-prism.js"),
      "utf8",
    ),
    "reference.js": readFileSync(join(root, "website", "reference.js"), "utf8"),
    "reference-data.json": referenceData,
  };
  let stamped = html;
  for (const [filename, contents] of Object.entries(assets)) {
    const escaped = filename.replaceAll(".", "\\.");
    stamped = stamped.replace(
      new RegExp(`\\./${escaped}(?:\\?v=[^\"']*)?`, "g"),
      `./${filename}?v=${contentHash(contents)}`,
    );
  }
  return stamped;
}

async function main() {
  buildReferencePrism({ checkOnly: check });
  const session = await createSage();
  let generated;
  let catalog;
  try {
    catalog = await session.documentation();
    generated = renderDocumentationMarkdown(catalog);
  } finally {
    await session.close();
  }
  const sources = collectReferenceSources(root);
  const resultPath = join(root, "website", "reference-results.json");
  const resultReport = existsSync(resultPath)
    ? JSON.parse(readFileSync(resultPath, "utf8"))
    : { results: [], counts: {} };
  const resultById = new Map(
    (resultReport.results ?? []).map((result) => [result.id, result]),
  );
  const entries = catalog.entries.map((entry) => ({
    ...entry,
    source: sourceForEntry(entry, sources),
    examples: examplesForEntry(entry, sources).map((example) => {
      const { provenance_id: _provenanceId, ...published } = example;
      return {
        ...published,
        verification: resultById.get(example.id) ?? {
          status: "unverified",
          reason: "run pnpm docs:verify",
        },
      };
    }),
  }));
  const examples = [...new Map(
    entries.flatMap((entry) => entry.examples).map(
      (example) => [example.id, example]),
  ).values()];
  const entriesWithExamples = entries.filter(
    (entry) => entry.examples.length > 0).length;
  const verified = examples.filter(
    (example) => example.verification.status === "pass").length;
  const referenceData = JSON.stringify({
    schema: "sagejs.reference/v1",
    docs: catalog,
    entries,
    coverage: {
      definitions: {
        declared_surface: "runtime DocSpec registry",
        warning: (
          "This denominator is the explicitly declared public documentation " +
          "surface, not every runtime-visible name. Semantic and performance " +
          "coverage are reported separately."
        ),
      },
      documentation: documentationCoverage(catalog),
      examples: {
        entries_with_examples: entriesWithExamples,
        entries_without_examples: entries.length - entriesWithExamples,
        documented: examples.length,
        verified,
        skipped: examples.filter(
          (example) => example.verification.status === "skip").length,
        expected_failures: examples.filter(
          (example) => example.verification.status === "xfail").length,
        failing: examples.filter(
          (example) => ["fail", "xpass"].includes(
            example.verification.status)).length,
        unverified: examples.filter(
          (example) => example.verification.status === "unverified").length,
        random_seed: resultReport.randomSeed ?? null,
      },
    },
  }, null, 2) + "\n";
  const referenceHtml = stampedReferenceHtml(referenceData);
  if (check) {
    const current = existsSync(output) ? readFileSync(output, "utf8") : "";
    const currentWebsite = existsSync(websiteOutput)
      ? readFileSync(websiteOutput, "utf8")
      : "";
    const currentHtml = readFileSync(websiteHtml, "utf8");
    if (
      current.replace(/\r\n/g, "\n") !== generated ||
      currentWebsite.replace(/\r\n/g, "\n") !== referenceData ||
      currentHtml.replace(/\r\n/g, "\n") !== referenceHtml
    ) {
      console.error(
        "generated reference documentation is stale; run pnpm docs:generate",
      );
      process.exitCode = 1;
    }
    return;
  }
  mkdirSync(join(root, "docs", "reference"), { recursive: true });
  writeFileSync(output, generated);
  writeFileSync(websiteOutput, referenceData);
  writeFileSync(websiteHtml, referenceHtml);
  console.log(
    "Wrote docs/reference/api.md, website/reference-data.json, and " +
      "fingerprinted website/reference.html",
  );
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
