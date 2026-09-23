"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const COMPONENTS = [
  ["factor", "row20_phase6_factor_base_root.py",
    "pari_row20_phase6_factor_base_root"],
  ["hnf", "row20_connected_relation_hnf.py", "pari_connected_relation_hnf"],
  ["catalog", "row21_analytic_catalog.py", "pari_row21_analytic_degree_catalog"],
  ["analytic", "row14_post806_terminal.py", "pari_row14_analytic_inverse_hr"],
  ["acceptance", "post_hnf_acceptance.py", "pari_post_hnf_acceptance"],
  ["unit", "row20_phase6_resident_unit_root.py",
    "pari_row20_phase6_resident_unit_root"],
];

function signature(filename, name) {
  const source = fs.readFileSync(path.join(__dirname, filename), "utf8");
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\) -> int:`));
  assert(match, `missing aggregate component signature ${name}`);
  return match[1].trim().split("\n").map(line => {
    const [argument, kind] = line.trim().replace(/,$/, "").split(": ");
    assert(argument && kind, `invalid ${name} argument: ${line}`);
    return [argument, kind];
  });
}

function generate() {
  const lines = [
    '"""Generated private row-20 aggregate resident root."""',
    "",
    "from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, native",
  ];
  for (const [, filename, name] of COMPONENTS)
    lines.push(`from .${filename.replace(/\.py$/, "")} import ${name}`);
  lines.push("", "", "@native", "def pari_row20_phase6_aggregate_root(");
  for (const [prefix, filename, name] of COMPONENTS)
    for (const [argument, kind] of signature(filename, name))
      lines.push(`    ${prefix}_${argument}: ${kind},`);
  lines.push(") -> int:", '    """Run the retained row-20 graph through one native ABI entry."""');
  let code = 10;
  for (const [prefix, filename, name] of COMPONENTS) {
    const args = signature(filename, name).map(([argument]) =>
      `${prefix}_${argument}`).join(",\n        ");
    lines.push(`    status = ${name}(`, `        ${args},`, "    )",
      "    if status != 0:", `        return ${code} + status`);
    code += 10;
  }
  lines.push("    return 0", "", "", "__all__ = [\"pari_row20_phase6_aggregate_root\"]", "");
  return lines.join("\n");
}

if (require.main === module) process.stdout.write(generate());
module.exports = { COMPONENTS, generate, signature };
