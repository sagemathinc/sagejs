"use strict";

// Mechanical source composer for the complete row-21 prepared-input native
// aggregate.  The exact-unit root already owns the complete private call graph;
// this outer root names and records the whole prepared-input transaction without
// introducing a host cut or a second native invocation.

const fs = require("node:fs");
const path = require("node:path");
const unit = require("./row21_phase6_unit_source.cjs");
const signature = require("./row21_phase6_connected_source.cjs").signature;

const HERE = __dirname;
const OUTPUT = path.join(HERE, "row21_phase6_prepared_aggregate_root.generated.py");
const EXPORT = "pari_row21_phase6_prepared_aggregate_root";

function generate() {
  unit.materialize();
  const parameters = signature(unit.OUTPUT, unit.EXPORT);
  return `"""Generated complete row-21 prepared-input class-and-unit aggregate.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Generated mechanically by row21_phase6_prepared_aggregate_source.cjs.

The public boundary is the authenticated prepared number-field packet.  Every
factor-base, relation, HNF, analytic, acceptance, and exact-unit owner is an
explicit caller-owned arena argument.  There is exactly one native entry.
"""

from sagejs.native import Int64Buffer, ${parameters.some(row => row.kind === "IntegerBuffer") ? "IntegerBuffer, " : ""}${parameters.some(row => row.kind === "Float64Buffer") ? "Float64Buffer, " : ""}native

from .row21_phase6_unit_root_generated import pari_row21_phase6_unit_root


@native
def ${EXPORT}(
${parameters.map(({ name, kind }) => `    ${name}: ${kind},`).join("\n")}
    aggregate_state: Int64Buffer,
) -> int:
    """Run the complete prepared-input class-and-unit transaction once."""
    if len(aggregate_state) < 6:
        raise ValueError("short row21 prepared aggregate state")
    for index in range(6):
        aggregate_state[index] = 0
    aggregate_state[0] = -1
    status = pari_row21_phase6_unit_root(
${parameters.map(({ name }) => `        ${name},`).join("\n")}
    )
    aggregate_state[0] = status
    aggregate_state[1] = unit_terminal_state[1]
    aggregate_state[2] = connected_state[3]
    aggregate_state[3] = t_accept_acceptance_state[0]
    aggregate_state[4] = unit_terminal_state[12]
    aggregate_state[5] = unit_terminal_state[13]
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

module.exports = { EXPORT, OUTPUT, generate, materialize };
if (require.main === module) process.stdout.write(`${materialize()}\n`);
