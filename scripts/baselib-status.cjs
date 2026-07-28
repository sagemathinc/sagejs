"use strict";

const { readFileSync, readdirSync } = require("node:fs");
const { basename, join } = require("node:path");

const root = join(__dirname, "..");
const baselib = join(root, "src", "baselib");
const pyrightConfig = JSON.parse(
  readFileSync(join(root, "pyrightconfig.json"), "utf8"),
);
const strictFiles = new Set(
  pyrightConfig.include.map((path) => basename(path)),
);
const verbatimExpression =
  /\bv(?:'''[\s\S]*?'''|"""[\s\S]*?"""|'[^']*'|"[^"]*")/g;

const rows = readdirSync(baselib)
  .filter((name) => name.endsWith(".py"))
  .sort()
  .map((name) => {
    const source = readFileSync(join(baselib, name), "utf8");
    const lines = source.split("\n").length - 1;
    const escapes = [...source.matchAll(verbatimExpression)];
    const escapedLines = escapes.reduce(
      (total, match) => total + match[0].split("\n").length,
      0,
    );
    const globals = (source.match(/^#\s*globals:/gm) || []).length;
    return {
      name,
      lines,
      strict: strictFiles.has(name),
      escapes: escapes.length,
      escapedLines,
      globals,
    };
  });

console.log(
  "module".padEnd(25),
  "strict".padEnd(7),
  "lines".padStart(6),
  "escapes".padStart(8),
  "escaped lines".padStart(14),
  "globals".padStart(8),
);
console.log("-".repeat(72));
for (const row of rows) {
  console.log(
    row.name.padEnd(25),
    (row.strict ? "yes" : "no").padEnd(7),
    String(row.lines).padStart(6),
    String(row.escapes).padStart(8),
    String(row.escapedLines).padStart(14),
    String(row.globals).padStart(8),
  );
}

const strictCount = rows.filter((row) => row.strict).length;
const escapedLines = rows.reduce(
  (total, row) => total + row.escapedLines,
  0,
);
const globals = rows.reduce((total, row) => total + row.globals, 0);
console.log(
  `\n${strictCount}/${rows.length} top-level modules are strict; ` +
    `${escapedLines} source lines remain inside verbatim escapes; ` +
    `${globals} implicit-global declarations remain.`,
);
