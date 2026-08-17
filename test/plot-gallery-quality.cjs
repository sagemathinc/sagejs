#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const gallery = join(root, "docs/sage-compatibility/plotting/gallery");
const generator = require("../scripts/plotting/generate-gallery.cjs");

function read(name) {
  return JSON.parse(readFileSync(join(gallery, name), "utf8"));
}

test("gallery fixtures remain generated from current PlotSpec lowering", async () => {
  await generator.main(["--skip-render"]);
  const document = read("fixtures.json");
  assert.equal(document.fixtures.length, 10);
  assert.deepEqual(document.scope.dimensions, [2, 3]);
  assert.deepEqual(document.scope.themes, [
    "notebook",
    "presentation",
    "publication",
    "dark",
    "high-contrast",
  ]);
  assert.deepEqual(
    document.fixtures.slice(0, 5).map((item) => item.plot_spec.layers.map((layer) => layer.kind)),
    Array.from({ length: 5 }, () => ["line", "point", "text"]),
  );
  assert.deepEqual(
    document.fixtures.slice(5).map((item) => item.plot_spec.layers.map((layer) => layer.kind)),
    Array.from({ length: 5 }, () => ["line", "point", "text", "surface"]),
  );
  for (const fixture of document.fixtures) {
    assert.equal(fixture.frontend, "sage");
    assert.equal(fixture.classification, "translated");
    assert.deepEqual(fixture.validation_codes, []);
    assert.ok(fixture.alt_text.length >= 40);
    assert.equal(fixture.plotly.config.responsive, true);
    assert.equal(fixture.plotly.layout.autosize, true);
  }
});

test("gallery classifications are honest about frontend and DOM boundaries", () => {
  const fixtures = read("fixtures.json");
  assert.deepEqual(
    fixtures.placeholders.map((item) => [item.frontend, item.classification]),
    [
      ["wolfram", "pending-integration"],
      ["matlab", "pending-integration"],
    ],
  );
  const expectations = read("visual-expectations.json");
  assert.match(expectations.policy.browser_dom_boundary, /does not attach/);
  assert.equal(expectations.policy.pixel_hashes, "forbidden");
  const evidence = read("render-evidence.json");
  assert.equal(evidence.pixel_hashes_recorded, false);
  for (const fixture of evidence.responsive) {
    for (const viewport of fixture.measurements) {
      assert.equal(viewport.plotly_dom_accessible_name, null);
      assert.equal(viewport.semantic_alt_text_present, true);
      assert.equal(viewport.overflow_x, 0);
      assert.equal(viewport.overflow_y, 0);
    }
  }
});

test("checked static evidence records structure without raster blobs", () => {
  const evidence = read("render-evidence.json");
  assert.equal(evidence.static_exports.length, 2);
  const [two, three] = evidence.static_exports;
  assert.equal(two.svg.root_element, "svg");
  assert.equal(two.svg.view_box, "0 0 800 600");
  assert.ok(two.svg.path_count >= 4);
  assert.equal(three.svg.root_element, "svg");
  assert.ok(three.svg.image_count >= 1);
  for (const output of evidence.static_exports) {
    assert.equal(output.png.signature_hex, "89504e470d0a1a0a");
    assert.equal(output.png.width, 800);
    assert.equal(output.png.height, 600);
    assert.ok([2, 6].includes(output.png.color_type));
  }
  const checkedFiles = [
    "fixtures.json",
    "visual-expectations.json",
    "performance.json",
    "render-evidence.json",
  ];
  for (const name of checkedFiles) {
    const text = readFileSync(join(gallery, name), "utf8");
    assert.doesNotMatch(text, /data:image\//);
    assert.doesNotMatch(text, /"pixel_hash"\s*:|"sha256"\s*:/i);
  }
});

test("PNG and SVG property readers ignore image content", () => {
  const png = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(png);
  png.writeUInt32BE(321, 16);
  png.writeUInt32BE(123, 20);
  png[24] = 8;
  png[25] = 6;
  assert.deepEqual(generator.pngProperties(png), {
    signature_hex: "89504e470d0a1a0a",
    width: 321,
    height: 123,
    bit_depth: 8,
    color_type: 6,
    byte_length: 33,
  });
  assert.deepEqual(
    generator.svgProperties(
      Buffer.from('<svg width="321" height="123" viewBox="0 0 321 123"><path/><text>x</text><image/></svg>'),
    ),
    {
      root_element: "svg",
      width: "321",
      height: "123",
      view_box: "0 0 321 123",
      path_count: 1,
      text_count: 1,
      image_count: 1,
      byte_length: 87,
    },
  );
});

test(
  "live Chromium satisfies responsive and structural image expectations",
  { skip: !generator.discoverChromium(), timeout: 45_000 },
  async () => {
    await generator.main(["--render"]);
  },
);
