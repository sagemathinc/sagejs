// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const {
  parseProductTag,
  selectLatestProductRelease,
  selectLatestProductReleaseFromGitHub,
} = require("../scripts/release-latest-policy.cjs");

test("product release tags exclude evidence and dependency catalogs", () => {
  assert.deepEqual(parseProductTag("v0.4.1+release.23"), {
    candidate: 23,
    major: 0,
    minor: 4,
    patch: 1,
    tagName: "v0.4.1+release.23",
  });
  assert.equal(parseProductTag("v0.5.0").candidate, undefined);
  assert.equal(parseProductTag("native-dependencies-6"), undefined);
  assert.equal(
    parseProductTag("optimization-engine-memory-campaign2-2026-08-29"),
    undefined,
  );
});

test("latest product selection ignores newer infrastructure releases", () => {
  assert.equal(
    selectLatestProductRelease([
      [
        {
          draft: false,
          prerelease: false,
          tag_name: "optimization-engine-memory-campaign2-2026-08-29",
        },
        {
          draft: false,
          prerelease: false,
          tag_name: "native-dependencies-6",
        },
        {
          draft: false,
          prerelease: false,
          tag_name: "v0.4.1+release.23",
        },
      ],
      [
        { draft: false, prerelease: false, tag_name: "v0.4.0+release.46" },
        { draft: true, prerelease: false, tag_name: "v9.0.0" },
        { draft: false, prerelease: true, tag_name: "v8.0.0" },
      ],
    ]),
    "v0.4.1+release.23",
  );
  assert.equal(
    selectLatestProductRelease([
      { draft: false, prerelease: false, tag_name: "v0.5.0+release.99" },
      { draft: false, prerelease: false, tag_name: "v0.5.0" },
    ]),
    "v0.5.0",
  );
});

test("GitHub release selection follows pagination", async () => {
  const pages = [
    Array.from({ length: 100 }, (_, index) => ({
      draft: false,
      prerelease: false,
      tag_name: `evidence-${index}`,
    })),
    [
      {
        draft: false,
        prerelease: false,
        tag_name: "v0.4.1+release.23",
      },
    ],
  ];
  const requested = [];
  const fakeFetch = async (url) => {
    requested.push(url);
    return {
      json: async () => pages[requested.length - 1],
      ok: true,
      status: 200,
    };
  };
  assert.equal(
    await selectLatestProductReleaseFromGitHub(
      "sagemathinc/sagejs",
      "token",
      fakeFetch,
    ),
    "v0.4.1+release.23",
  );
  assert.equal(requested.length, 2);
  assert.match(requested[1], /page=2$/);
});

test("release-event guard restores the product release from main", () => {
  const workflow = readFileSync(
    resolve(__dirname, "../.github/workflows/protect-latest-release.yml"),
    "utf8",
  );
  assert.match(workflow, /types: \[published, released, edited\]/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /releases\/latest/);
  assert.match(workflow, /release-latest-policy\.cjs/);
  assert.match(workflow, /gh release edit "\$product"[\s\S]*--latest/);
});
