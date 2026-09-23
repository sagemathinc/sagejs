"use strict";

// Mechanical source composer for the row-21 prepared-input through exact-unit
// cut. The generated Python is the inspectable mathematical source; this file
// only maintains its large private storage ABI.

const fs = require("node:fs");
const path = require("node:path");
const acceptance = require("./row21_phase6_acceptance_source.cjs");
const signature = require("./row21_phase6_connected_source.cjs").signature;

const HERE = __dirname;
const OUTPUT = path.join(HERE, "row21_phase6_unit_root_generated.py");
const EXPORT = "pari_row21_phase6_unit_root";
const LATTICE_FILE = path.join(HERE, "row21_rank3_unit_lattice.py");
const LOG_FILE = path.join(HERE, "log_matrix_transform.py");
const GETFU_FILE = path.join(HERE, "row21_rank3_getfu.py");

const functions = Object.freeze({
  integer: [LATTICE_FILE, "pari_unit_integer_lattice_rank_three"],
  real: [LATTICE_FILE, "pari_unit_real_lattice_rank_three"],
  compose: [LATTICE_FILE, "pari_unit_compose_rank_three"],
  clean: [LATTICE_FILE, "pari_cleanarchunit_31_quintic"],
  prepare: [LATTICE_FILE, "pari_prepare_getfu_31_quintic"],
  transform: [LOG_FILE, "pari_log_matrix_transform"],
  getfu: [GETFU_FILE, "pari_getfu_rank3_mixed_quintic"],
});

function call(rows, map, prefix) {
  return rows.map(({ name }) => `        ${map[name] || `${prefix}_${name}`},`).join("\n");
}
function parameters(rows, map, prefix) {
  return rows.filter(({ name }) => !Object.hasOwn(map, name))
    .map(({ name, kind }) => `    ${prefix}_${name}: ${kind},`);
}

function generate() {
  acceptance.materialize();
  const base = signature(acceptance.OUTPUT, acceptance.EXPORT);
  const sig = Object.fromEntries(Object.entries(functions).map(([key, [file, name]]) =>
    [key, signature(file, name)]));
  const integerMap = { original: "t_accept_relations", columns: "8",
    u1: "u_u1", state: "u_integer_state" };
  const realMap = { matrix_triples: "u_first_triples", rows: "4",
    u2: "u_u2", state: "u_real_state" };
  const cleanMap = { source: "u_unit_logs", expected_regulator: "t_accept_regulator",
    precision: "192", output: "u_cleaned", state: "u_clean_state" };
  const getfuRealMap = { matrix_triples: "u_getfu_triples", rows: "4",
    u2: "u_getfu_u2", state: "u_getfu_real_state" };
  const getfuMap = { arch_real: "u_final_arch_real", arch_imag: "u_final_arch_imag",
    clean_real: "u_final_clean_real", clean_imag: "u_final_clean_imag",
    factor: "u_factor", embedding_real: "u_embedding_real",
    embedding_imag: "u_embedding_imag", multiplication_basis: "fb_basis_table",
    precision: "192", output_units: "u_output_units",
    output_logs_real: "u_output_logs_real", output_logs_imag: "u_output_logs_imag",
    state: "u_getfu_state", pivots: "u_getfu_pivots" };
  const extras = [
    ...parameters(sig.integer, integerMap, "u_integer"),
    "    u_u1: IntegerBuffer,", "    u_integer_state: IntegerBuffer,",
    "    u_first_logs: IntegerBuffer,", "    u_first_triples: IntegerBuffer,",
    ...parameters(sig.real, realMap, "u_real"),
    "    u_u2: IntegerBuffer,", "    u_real_state: IntegerBuffer,",
    "    u_unit_transform: IntegerBuffer,", "    u_unit_logs: IntegerBuffer,",
    ...parameters(sig.clean, cleanMap, "u_clean"),
    "    u_cleaned: IntegerBuffer,", "    u_clean_state: IntegerBuffer,",
    "    u_identity: IntegerBuffer,",
    "    u_first_matep: IntegerBuffer,", "    u_first_arch: IntegerBuffer,",
    "    u_first_factored_clean: IntegerBuffer,",
    "    u_first_arch_real: IntegerBuffer,", "    u_first_arch_imag: IntegerBuffer,",
    "    u_first_clean_real: IntegerBuffer,", "    u_first_clean_imag: IntegerBuffer,",
    "    u_getfu_triples: IntegerBuffer,",
    ...parameters(sig.real, getfuRealMap, "u_getfu_real"),
    "    u_getfu_u2: IntegerBuffer,", "    u_getfu_real_state: IntegerBuffer,",
    "    u_factor: IntegerBuffer,",
    "    u_final_matep: IntegerBuffer,", "    u_final_arch: IntegerBuffer,",
    "    u_final_factored_clean: IntegerBuffer,",
    "    u_final_arch_real: IntegerBuffer,", "    u_final_arch_imag: IntegerBuffer,",
    "    u_final_clean_real: IntegerBuffer,", "    u_final_clean_imag: IntegerBuffer,",
    "    u_embedding_real: IntegerBuffer,", "    u_embedding_imag: IntegerBuffer,",
    ...parameters(sig.getfu, getfuMap, "u_getfu"),
    "    u_output_units: IntegerBuffer,", "    u_output_logs_real: IntegerBuffer,",
    "    u_output_logs_imag: IntegerBuffer,", "    u_getfu_state: Int64Buffer,",
    "    u_getfu_pivots: Int64Buffer,", "    u_inverse_multiplication: IntegerBuffer,",
    "    u_output_inverses: IntegerBuffer,", "    unit_terminal_state: Int64Buffer,",
    "    u_norm_matrix: IntegerBuffer,", "    u_norm_work: IntegerBuffer,",
    "    u_output_norms: IntegerBuffer,", "    u_output_real_signs: Int64Buffer,",
  ];
  const prepareFirst = {
    clean: "u_cleaned", factor: "u_identity", matep: "u_first_matep",
    arch: "u_first_arch", factored_clean: "u_first_factored_clean",
    arch_real: "u_first_arch_real", arch_imag: "u_first_arch_imag",
    clean_real: "u_first_clean_real", clean_imag: "u_first_clean_imag",
  };
  const prepareFinal = {
    clean: "u_cleaned", factor: "u_factor", matep: "u_final_matep",
    arch: "u_final_arch", factored_clean: "u_final_factored_clean",
    arch_real: "u_final_arch_real", arch_imag: "u_final_arch_imag",
    clean_real: "u_final_clean_real", clean_imag: "u_final_clean_imag",
  };
  return `"""Generated resident row-21 prepared input through exact units.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Generated mechanically by row21_phase6_unit_source.cjs.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, integer_buffer_view, native

from .log_matrix_transform import pari_log_matrix_transform
from .row20_successful_c6 import pari_getfu_quintic_unit_inverse
from .row21_native_supported_ideal_maps import _row21_bareiss_determinant
from .row21_phase6_acceptance_root_generated import pari_row21_phase6_acceptance_root
from .row21_rank3_getfu import pari_getfu_rank3_mixed_quintic
from .row21_rank3_unit_lattice import (
    pari_cleanarchunit_31_quintic,
    pari_prepare_getfu_31_quintic,
    pari_unit_compose_rank_three,
    pari_unit_integer_lattice_rank_three,
    pari_unit_real_lattice_rank_three,
)


@native
def ${EXPORT}(
${base.map(({ name, kind }) => `    ${name}: ${kind},`).join("\n")}
${extras.join("\n")}
) -> int:
    if len(unit_terminal_state) < 14:
        raise ValueError("short row21 unit resident state")
    for index in range(14):
        unit_terminal_state[index] = 0
    unit_terminal_state[0] = -1
    status = pari_row21_phase6_acceptance_root(
${base.map(({ name }) => `        ${name},`).join("\n")}
    )
    unit_terminal_state[1] = status
    if status != 0:
        unit_terminal_state[0] = status
        return status
    status = pari_unit_integer_lattice_rank_three(
${call(sig.integer, integerMap, "u_integer")}
    )
    unit_terminal_state[2] = status
    if status != 0:
        unit_terminal_state[0] = status
        return status
    status = pari_log_matrix_transform(
        h_hnf_result_c,
        u_u1,
        4,
        8,
        3,
        False,
        u_first_logs,
    )
    unit_terminal_state[3] = status
    if status != 0:
        unit_terminal_state[0] = status
        return status
    for row in range(4):
        for column in range(3):
            source = 7 * (column * 4 + row) + 1
            target = 3 * (row * 3 + column)
            u_first_triples[target] = u_first_logs[source]
            u_first_triples[target + 1] = u_first_logs[source + 1]
            u_first_triples[target + 2] = u_first_logs[source + 2]
    status = pari_unit_real_lattice_rank_three(
${call(sig.real, realMap, "u_real")}
    )
    unit_terminal_state[4] = status
    if status != 0:
        unit_terminal_state[0] = status
        return status
    status = pari_unit_compose_rank_three(u_u1, 8, u_u2, u_unit_transform)
    unit_terminal_state[5] = status
    if status != 0:
        unit_terminal_state[0] = status
        return status
    status = pari_log_matrix_transform(
        h_hnf_result_c,
        u_unit_transform,
        4,
        8,
        3,
        False,
        u_unit_logs,
    )
    unit_terminal_state[6] = status
    if status != 0:
        unit_terminal_state[0] = status
        return status
    status = pari_cleanarchunit_31_quintic(
${call(sig.clean, cleanMap, "u_clean")}
    )
    unit_terminal_state[7] = status
    if status != 0:
        unit_terminal_state[0] = status
        return status
    for column in range(3):
        for row in range(3):
            if row == column:
                u_identity[column * 3 + row] = 1
            else:
                u_identity[column * 3 + row] = 0
    status = pari_prepare_getfu_31_quintic(
${call(sig.prepare, prepareFirst, "unused")}
    )
    unit_terminal_state[8] = status
    if status != 0:
        unit_terminal_state[0] = status
        return status
    for row in range(4):
        for column in range(3):
            source = 7 * (column * 4 + row) + 1
            target = 3 * (row * 3 + column)
            u_getfu_triples[target] = u_first_matep[source]
            u_getfu_triples[target + 1] = u_first_matep[source + 1]
            u_getfu_triples[target + 2] = u_first_matep[source + 2]
    status = pari_unit_real_lattice_rank_three(
${call(sig.real, getfuRealMap, "u_getfu_real")}
    )
    unit_terminal_state[9] = status
    if status != 0:
        unit_terminal_state[0] = status
        return status
    for index in range(9):
        u_factor[index] = u_getfu_u2[3 * (index % 3) + index // 3]
    status = pari_prepare_getfu_31_quintic(
${call(sig.prepare, prepareFinal, "unused")}
    )
    unit_terminal_state[10] = status
    if status != 0:
        unit_terminal_state[0] = status
        return status
    for column in range(5):
        for row in range(4):
            source = 5 * row + column
            target = 3 * (4 * column + row)
            u_embedding_real[target] = fb_matrix_m[source]
            u_embedding_real[target + 1] = fb_matrix_p[source]
            u_embedding_real[target + 2] = fb_matrix_e[source]
            if row < 3:
                u_embedding_imag[target] = 0
                u_embedding_imag[target + 1] = -1
                u_embedding_imag[target + 2] = 0
            else:
                u_embedding_imag[target] = fb_matrix_m[20 + column]
                u_embedding_imag[target + 1] = fb_matrix_p[20 + column]
                u_embedding_imag[target + 2] = fb_matrix_e[20 + column]
    status = pari_getfu_rank3_mixed_quintic(
${call(sig.getfu, getfuMap, "u_getfu")}
    )
    unit_terminal_state[11] = status
    if status != 0:
        unit_terminal_state[0] = status
        return status
    for column in range(3):
        status = pari_getfu_quintic_unit_inverse(
            u_output_units,
            5 * column,
            fb_basis_table,
            u_inverse_multiplication,
            integer_buffer_view(u_output_inverses, 5 * column, 5),
        )
        if status != 1:
            unit_terminal_state[0] = status
            return 12
        for index in range(25):
            value = 0
            for basis in range(5):
                value += (
                    u_output_units[5 * column + basis]
                    * fb_basis_table[25 * basis + index]
                )
            u_norm_matrix[index] = value
        u_output_norms[column] = _row21_bareiss_determinant(u_norm_matrix, u_norm_work)
        for row in range(3):
            least = 0
            for basis in range(5):
                at = 5 * row + basis
                exponent = 0
                if fb_matrix_p[at] != -1:
                    exponent = fb_matrix_e[at] + 1 - fb_matrix_p[at]
                if basis == 0 or exponent < least:
                    least = exponent
            numerator = 0
            for basis in range(5):
                at = 5 * row + basis
                exponent = 0
                if fb_matrix_p[at] != -1:
                    exponent = fb_matrix_e[at] + 1 - fb_matrix_p[at]
                numerator += u_output_units[5 * column + basis] * fb_matrix_m[at] << (
                    exponent - least
                )
            if numerator == 0:
                raise ValueError("zero exact row21 unit real embedding")
            if numerator < 0:
                u_output_real_signs[3 * column + row] = -1
            else:
                u_output_real_signs[3 * column + row] = 1
    unit_terminal_state[12] = 1
    unit_terminal_state[13] = u_getfu_state[7]
    unit_terminal_state[0] = 0
    return 0


__all__ = ["${EXPORT}"]
`;
}

function materialize() {
  const value = generate();
  if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, "utf8") !== value)
    fs.writeFileSync(OUTPUT, value);
  return OUTPUT;
}

module.exports = { EXPORT, OUTPUT, functions, generate, materialize };
if (require.main === module) process.stdout.write(`${materialize()}\n`);
