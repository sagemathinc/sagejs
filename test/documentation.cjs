"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  documentationCatalogFromRegistry,
  documentationCoverage,
  renderDocumentationMarkdown,
  searchDocumentation,
} = require("../dist/tools/documentation.js");

function documented(value, metadata) {
  value.__doc__ = [
    "Construct a finite-field polynomial.",
    "",
    "EXAMPLES::",
    "",
    "    sage: example()",
  ].join("\n");
  value.__name__ = "example";
  value.__argnames__ = ["order"];
  value.__defaults__ = { order: 4 };
  return [["example", value, metadata]];
}

test("DocSpec extraction, normalized search, and Markdown are deterministic", () => {
  const registry = documented(function example() {}, {
    kind: "function",
    module: "sage.example",
    aliases: ["finite_field_example"],
    tags: ["finite fields", "polynomials"],
    backends: ["FLINT"],
    sage_compatibility: {
      status: "partial",
      notes: "The supported constructor is compatible.",
    },
    provenance: [
      {
        kind: "literature-implemented",
        source: "Example paper",
        url: "https://example.com/paper",
      },
    ],
    references: [
      {
        id: "example-paper",
        type: "paper",
        title: "Example algorithms",
        authors: ["A. Author"],
        year: 2026,
      },
    ],
    implementation: {
      algorithm: "Cohen--Oesterlé fixture formula",
    },
    limitations: ["This is a fixture."],
  });
  const catalog = documentationCatalogFromRegistry(registry);
  assert.equal(catalog.schema_version, 1);
  assert.equal(catalog.entries[0].signature, "example(order=4)");
  assert.deepEqual(
    searchDocumentation(catalog, "finite-field").map((entry) => entry.name),
    ["example"],
  );
  assert.equal(
    searchDocumentation(catalog, "Construct a finite-field", {
      regex: true,
    }).length,
    1,
  );
  assert.equal(
    searchDocumentation(catalog, "polynomial", { backend: "flint" }).length,
    1,
  );
  assert.equal(searchDocumentation(catalog, "Oesterle").length, 1);
  assert.equal(documentationCoverage(catalog).incomplete_entries.length, 0);

  const markdown = renderDocumentationMarkdown(catalog);
  assert.match(markdown, /docspec_version: 1/);
  assert.match(markdown, /### Examples/);
  assert.match(markdown, /\[Example paper\]\(https:\/\/example\.com\/paper\)/);
  assert.match(markdown, /A\. Author, Example algorithms \(2026\)/);
});
