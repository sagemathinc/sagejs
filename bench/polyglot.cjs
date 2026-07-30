"use strict";

const { execFileSync } = require("node:child_process");
const { createSage } = require("../dist/tools/kernel.js");

const samples = [
  ["sage", "1 + 1"],
  ["python", "1 + 1"],
  ["magma", "1 + 1;"],
  ["matlab", "1 + 1"],
  ["maple", "1 + 1;"],
  ["wolfram", "1 + 1"],
];

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

(async () => {
  const session = await createSage();
  const rows = [];
  try {
    for (const [language, source] of samples) {
      const firstStart = performance.now();
      await session.evaluate(source, { language });
      const first = performance.now() - firstStart;
      const warm = [];
      for (let iteration = 0; iteration < 9; iteration += 1) {
        const start = performance.now();
        await session.evaluate(source, { language });
        warm.push(performance.now() - start);
      }
      rows.push({
        language,
        firstMs: first.toFixed(2),
        warmMedianMs: median(warm).toFixed(2),
      });
    }
  } finally {
    await session.close();
  }

  let revision = "unknown";
  try {
    revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    // A source archive need not contain Git metadata.
  }
  console.log(`Sage.js ${revision}, ${process.version}, ${process.platform} ${process.arch}`);
  console.log("One shared session; first evaluation and median of 9 warm evaluations");
  console.table(rows);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
