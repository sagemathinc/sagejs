"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");
const {
  testExportCapabilities,
} = require("./graphics-export-capabilities.cjs");

function pythonString(value) {
  return JSON.stringify(value);
}

async function main() {
  const exportCapabilities = testExportCapabilities();
  const directory = mkdtempSync(join(tmpdir(), "sagejs-graphics-export-"));
  const session = await createSage();
  try {
    const jsonFilename = join(directory, "prime.json");
    const htmlFilename = join(directory, "prime.html");
    const arrayFilename = join(directory, "array.json");
    const surfaceFilename = join(directory, "surface.json");
    const plotly = await session.evaluate(
      [
        "g = plot(prime_pi, 1, 100)",
        `g.save(${pythonString(jsonFilename)})`,
        `g.save(${pythonString(htmlFilename)})`,
        "g.plotly()['data'][0]['type']",
      ].join("\n"),
    );
    assert.equal(plotly.repr, "'scatter'");

    const figure = JSON.parse(readFileSync(jsonFilename, "utf8"));
    assert.equal(figure.data.length, 1);
    assert.equal(figure.data[0].type, "scatter");
    assert.equal(figure.data[0].x.length, figure.data[0].y.length);
    assert.match(readFileSync(htmlFilename, "utf8"), /Plotly\.newPlot/);

    await session.evaluate(
      [
        "a = graphics_array([plot(x, (x, 0, 1)), point((0, 1))])",
        `a.save(${pythonString(arrayFilename)})`,
        "u, v = var('u v')",
        "s = plot3d(u^2-v^2, (u,-1,1), (v,-1,1), plot_points=(3,3))",
        `s.save(${pythonString(surfaceFilename)})`,
      ].join("\n"),
    );
    assert.equal(
      JSON.parse(readFileSync(arrayFilename, "utf8")).layout.grid.columns,
      2,
    );
    assert.equal(
      JSON.parse(readFileSync(surfaceFilename, "utf8")).data[0].type,
      "surface",
    );

    if (exportCapabilities.formats.png.available) {
      const pngFilenames = [0, 1, 2].map((index) =>
        join(directory, `prime-${index}.png`),
      );
      await session.evaluate(
        pngFilenames
          .map(
            (filename) =>
              `g.save(${pythonString(filename)}, width=320, height=240)`,
          )
          .join("\n"),
      );
      const images = pngFilenames.map((filename) => readFileSync(filename));
      const png = images[0];
      assert.deepEqual(
        [...png.subarray(0, 8)],
        [137, 80, 78, 71, 13, 10, 26, 10],
      );
      assert.deepEqual(images[1], png);
      assert.deepEqual(images[2], png);
    }
    assert.equal(existsSync(jsonFilename), true);
  } finally {
    await session.close();
    rmSync(directory, { recursive: true, force: true });
  }

  console.log("Graphics file export tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
