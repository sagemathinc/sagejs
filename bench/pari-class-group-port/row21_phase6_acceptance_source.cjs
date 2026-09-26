"use strict";

const fs = require("node:fs");
const path = require("node:path");
const connected = require("./row21_phase6_connected_source.cjs");

const HERE = __dirname;
const INPUT = connected.OUTPUT;
const OUTPUT = path.join(HERE, "row21_phase6_acceptance_root_generated.py");
const EXPORT = "pari_row21_phase6_acceptance_root";
const CATALOG_FILE = path.join(HERE, "row21_analytic_catalog.py");
const CATALOG = "pari_row21_analytic_degree_catalog";
const ANALYTIC_FILE = path.join(HERE, "row14_post806_terminal.py");
const ANALYTIC = "pari_row14_analytic_inverse_hr";
const ACCEPT_FILE = path.join(HERE, "post_hnf_acceptance.py");
const ACCEPT = "pari_post_hnf_acceptance";

const catalogMap = Object.freeze({ polynomial: "fb_polynomial",
  table: "fb_basis_table" });
const analyticMap = Object.freeze({ discriminant: "fb_discriminant",
  real_places: "3", complex_places: "1", primes: "t_primes",
  offsets: "t_pattern_offsets", counts: "t_pattern_counts",
  degrees: "t_pattern_degrees", multiplicities: "t_pattern_multiplicities",
  state: "t_analytic_state" });
const acceptMap = Object.freeze({ factor_count: "24", h_rows: "0",
  b_columns: "24", c_columns: "32", places: "4", degree: "5",
  c: "h_hnf_result_c", inverse_hr: "t_inverse_hr" });

function generate() {
  connected.materialize();
  const base = connected.signature(INPUT, connected.EXPORT);
  const catalog = connected.signature(CATALOG_FILE, CATALOG);
  const analytic = connected.signature(ANALYTIC_FILE, ANALYTIC);
  const accept = connected.signature(ACCEPT_FILE, ACCEPT);
  const parameters = [
    ...base.map(({ name, kind }) => `    ${name}: ${kind},`),
    ...catalog.filter(({ name }) => !Object.hasOwn(catalogMap, name))
      .map(({ name, kind }) => `    t_${name}: ${kind},`),
    ...analytic.filter(({ name }) => !Object.hasOwn(analyticMap, name) &&
      !catalog.some(row => row.name === name && !Object.hasOwn(catalogMap, name)))
      .map(({ name, kind }) => `    t_${name}: ${kind},`),
    "    t_analytic_state: Int64Buffer,",
    ...accept.filter(({ name }) => !Object.hasOwn(acceptMap, name))
      .map(({ name, kind }) => `    t_accept_${name}: ${kind},`),
    "    terminal_state: IntegerBuffer,",
  ].join("\n");
  const baseCall = base.map(({ name }) => `        ${name},`).join("\n");
  const catalogCall = catalog.map(({ name }) =>
    `        ${catalogMap[name] || `t_${name}`},`).join("\n");
  const analyticCall = analytic.map(({ name }) =>
    `        ${analyticMap[name] || `t_${name}`},`).join("\n");
  const acceptCall = accept.map(({ name }) =>
    `        ${acceptMap[name] || `t_accept_${name}`},`).join("\n");
  return `"""Generated resident row-21 prepared input through acceptance root.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Generated mechanically by row21_phase6_acceptance_source.cjs.
"""

from sagejs.native import IntegerBuffer, native
from .post_hnf_acceptance import pari_post_hnf_acceptance
from .row14_post806_terminal import pari_row14_analytic_inverse_hr
from .row21_analytic_catalog import pari_row21_analytic_degree_catalog
from .row21_phase6_connected_hnf_root_generated import (
    pari_row21_phase6_connected_hnf_root,
)


@native
def ${EXPORT}(
${parameters}
) -> int:
    if len(terminal_state) < 5:
        raise ValueError("short row21 acceptance resident state")
    for i in range(5):
        terminal_state[i] = 0
    terminal_state[0] = -1
    status = pari_row21_phase6_connected_hnf_root(
${baseCall}
    )
    terminal_state[1] = status
    if status != 0:
        terminal_state[0] = status
        return status
    status = pari_row21_analytic_degree_catalog(
${catalogCall}
    )
    terminal_state[2] = status
    if status != 0:
        terminal_state[0] = status
        return status
    status = pari_row14_analytic_inverse_hr(
${analyticCall}
    )
    terminal_state[3] = status
    if status != 0:
        terminal_state[0] = status
        return status
    status = pari_post_hnf_acceptance(
${acceptCall}
    )
    terminal_state[0] = status
    terminal_state[4] = t_accept_acceptance_state[0]
    return status


__all__ = ["${EXPORT}"]
`;
}

function materialize() {
  const value = generate();
  if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, "utf8") !== value)
    fs.writeFileSync(OUTPUT, value);
  return OUTPUT;
}

module.exports = { ACCEPT, ACCEPT_FILE, ANALYTIC, ANALYTIC_FILE, CATALOG,
  CATALOG_FILE, EXPORT, INPUT, OUTPUT, generate, materialize };
if (require.main === module) process.stdout.write(`${materialize()}\n`);
