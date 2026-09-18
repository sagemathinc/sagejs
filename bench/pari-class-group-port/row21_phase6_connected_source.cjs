"use strict";

// Mechanical source composer for the row-21 factor -> connected-HNF cut.  The
// generated file remains ordinary inspectable Python; this helper only avoids
// hand-maintaining a 200-argument storage ABI twice.

const fs = require("node:fs");
const path = require("node:path");

const HERE = __dirname;
const FACTOR = path.join(HERE, "row21_phase6_factor_base_root.py");
const CONNECTED = path.join(HERE, "connected_relation_hnf.py");
const OUTPUT = path.join(HERE, "row21_phase6_connected_hnf_root_generated.py");
const FACTOR_EXPORT = "pari_row21_phase6_factor_base_root";
const CONNECTED_EXPORT = "pari_connected_relation_hnf";
const EXPORT = "pari_row21_phase6_connected_hnf_root";

function signature(filename, name) {
  const source = fs.readFileSync(filename, "utf8");
  const match = source.match(new RegExp(
    `def ${name}\\(([\\s\\S]*?)\\n\\) -> int:`));
  if (!match) throw new Error(`missing ${name} signature`);
  return match[1].trim().split("\n").map(line => {
    const [parameter, kind] = line.trim().replace(/,$/, "").split(": ");
    return { name: parameter, kind };
  });
}

const direct = Object.freeze({
  admission_matrix_m: "fb_matrix_m",
  admission_matrix_p: "fb_matrix_p",
  admission_matrix_e: "fb_matrix_e",
  admission_factor_product: "fb_base_state[6]",
  admission_prime_offsets: "fb_prime_offsets",
  admission_prime_counts: "fb_prime_counts",
  basis_table: "fb_basis_table",
  packet_ideals: "fb_selected_ideals",
  packet_norms: "fb_selected_norms",
  initial_primes: "integer_buffer_view(fb_selected_primes, 0, fb_base_state[4])",
  initial_offsets: "fb_group_offsets",
  initial_counts: "fb_group_sizes",
  initial_complete: "fb_group_complete",
});

function generate() {
  const factor = signature(FACTOR, FACTOR_EXPORT);
  const connected = signature(CONNECTED, CONNECTED_EXPORT);
  const factorParameters = factor.map(({ name, kind }) =>
    `    fb_${name}: ${kind},`).join("\n");
  const connectedParameters = connected
    .filter(({ name }) => !Object.hasOwn(direct, name))
    .map(({ name, kind }) => `    h_${name}: ${kind},`).join("\n");
  const factorCall = factor.map(({ name }) => `        fb_${name},`).join("\n");
  const connectedCall = connected.map(({ name }) =>
    `        ${direct[name] || `h_${name}`},`).join("\n");
  return `"""Generated resident row-21 factor-base through connected HNF root.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Generated mechanically by row21_phase6_connected_source.cjs.
"""

from sagejs.native import IntegerBuffer, integer_buffer_view, native

from .connected_relation_hnf import pari_connected_relation_hnf
from .row21_phase6_factor_base_root import pari_row21_phase6_factor_base_root


@native
def ${EXPORT}(
${factorParameters}
${connectedParameters}
    connected_state: IntegerBuffer,
) -> int:
    if len(connected_state) < 5:
        raise ValueError("short row21 connected resident state")
    for i in range(5):
        connected_state[i] = 0
    connected_state[0] = -1
    status = pari_row21_phase6_factor_base_root(
${factorCall}
    )
    connected_state[1] = status
    if status != 0:
        connected_state[0] = status
        return status

    stride = 33
    rows = fb_resident_state[2]
    groups = fb_resident_state[3]
    subcount = fb_subfactor_state[0]
    for i in range(rows):
        h_admission_group_e[i] = fb_selected_descriptors[i * stride + 1]
        h_admission_group_f[i] = fb_selected_descriptors[i * stride + 2]
        h_relation_primes[i] = fb_selected_descriptors[i * stride]
        h_ramification[i] = fb_selected_descriptors[i * stride + 1]
        h_packet_primes[i] = fb_selected_descriptors[i * stride]
        inert = 1
        for j in range(5):
            generator = fb_selected_descriptors[i * stride + 3 + j]
            h_packet_generators[i * 5 + j] = generator
            if generator != 0:
                inert = 0
        h_admission_group_inert[i] = inert
        h_packet_inert[i] = inert
        h_search_ideals[i] = fb_permutation[i]
        h_packet_ids[i] = i + 1
        h_outer_perm[i] = fb_permutation[i]
        h_hnf_perm[i] = fb_permutation[i]
    for i in range(rows):
        for row in range(5):
            for column in range(5):
                h_admission_group_tau[i * 25 + row * 5 + column] = (
                    fb_selected_descriptors[i * stride + 8 + column * 5 + row]
                )
    for i in range(subcount):
        h_subfactor[i] = fb_permutation[i]

    status = pari_connected_relation_hnf(
${connectedCall}
    )
    connected_state[0] = status
    connected_state[2] = h_chain_state[0]
    connected_state[3] = h_hnf_state[1]
    connected_state[4] = h_relation_state[0]
    return status


__all__ = ["${EXPORT}"]
`;
}

function materialize() {
  const source = generate();
  if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, "utf8") !== source)
    fs.writeFileSync(OUTPUT, source);
  return OUTPUT;
}

module.exports = { CONNECTED, EXPORT, FACTOR, OUTPUT, generate, materialize,
  signature };

if (require.main === module) process.stdout.write(`${materialize()}\n`);
