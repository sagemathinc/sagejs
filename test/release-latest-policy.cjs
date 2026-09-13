// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const {
  parseProductTag,
  selectLatestProductRelease,
  selectLatestProductReleaseFromGitHub,
  requiredInstallerAssets, hasCompleteInstallerAssets,
} = require("../scripts/release-latest-policy.cjs");
const assets = () => requiredInstallerAssets.map((name) => ({ name, state: "uploaded", size: 123 }));

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
          assets: assets(),
        },
      ],
      [
        { draft: false, prerelease: false, tag_name: "v0.4.0+release.46", assets: assets() },
        { draft: true, prerelease: false, tag_name: "v9.0.0" },
        { draft: false, prerelease: true, tag_name: "v8.0.0" },
      ],
    ]),
    "v0.4.1+release.23",
  );
  assert.equal(
    selectLatestProductRelease([
      { draft: false, prerelease: false, tag_name: "v0.5.0+release.99", assets: assets() },
      { draft: false, prerelease: false, tag_name: "v0.5.0", assets: assets() },
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
        assets: assets(),
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

test("Latest repair skips partial uploads and advances only after the installer matrix is complete", () => {
  const old = { tag_name: "v0.7.0+release.6", draft: false, prerelease: false, assets: assets() };
  const next = { tag_name: "v0.8.0", draft: false, prerelease: false, assets: [] };
  for (const asset of assets()) {
    assert.equal(selectLatestProductRelease([old, next]), old.tag_name);
    next.assets.push(asset);
  }
  assert.equal(selectLatestProductRelease([old, next]), next.tag_name);
  for (const name of requiredInstallerAssets) {
    assert.equal(selectLatestProductRelease([old, { ...next, assets: next.assets.filter((asset) => asset.name !== name) }]), old.tag_name);
  }
});

test("missing metadata, non-uploaded, empty and duplicate assets are not complete releases", () => {
  for (const changed of [undefined, [], assets().map((a, i) => i ? a : { ...a, state: "starter" }),
    assets().map((a, i) => i ? a : { ...a, size: 0 }), [...assets(), assets()[0]]]) {
    const release = { draft: false, prerelease: false, tag_name: "v0.8.0", assets: changed };
    assert.equal(hasCompleteInstallerAssets(release), false);
    assert.equal(selectLatestProductRelease([release]), undefined);
  }
  assert.equal(hasCompleteInstallerAssets({ assets: [...assets(), { name: "additional-evidence.json", state: "uploaded", size: 12 }] }), true);
});
