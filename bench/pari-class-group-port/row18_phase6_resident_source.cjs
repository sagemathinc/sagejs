"use strict";

// Construct the ordinary, typed Python source for row 18's private aggregate
// root.  Signature extraction happens once while preparing the compiled
// artifact, never in the resident mathematical transaction.  The emitted root
// has a completely explicit ABI and contains no Python object graph, copying,
// reflection, allocation, filesystem access, or subprocess boundary.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const INITIAL_SOURCE = path.join(__dirname, "resident_generated_class_attempt.py");
const RETRY_SOURCE = path.join(__dirname, "prepared_class_group_resumable.py");

function signature(sourcePath, functionName) {
  const text = fs.readFileSync(sourcePath, "utf8");
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing signature for ${functionName}`);
  return match[1].trim().split("\n").map(line => {
    const parts = line.trim().replace(/,$/, "").split(": ");
    assert.equal(parts.length, 2, `untyped parameter in ${functionName}`);
    return Object.freeze({ name: parts[0], kind: parts[1] });
  });
}

const literal = Object.freeze({
  scale: "4.1887902047863905", track_small: "1", admission_mode: "2",
  admission_factor_product: "prep_base_state[6]", nrelid: "4",
  track_fact: "1", jid0: "0", e0: "0", extra_count: "-1",
  search_count: "factor_count", construct_primes: "0", outer_ru: "0",
  log_precision: "precision", initial_additional: "10",
  hnf_k0: "subfactor_count", pass_limit: "3", automorphism_count: "1",
  relation_prime_count: "relation_prime_count",
  checking_prime_count: "checking_prime_count",
});

// The initial graph intentionally owns zero-capacity placeholders for owners
// which do not exist until retry construction.  The old Python bridge replaced
// those lists.  A resident ABI cannot resize them, so give the retry distinct
// bounded storage while retaining the initial owners unchanged.
const RETRY_STORAGE = new Set([
  "subfactor", "packet_primes", "packet_inert", "packet_generators",
  "admission_group_e", "admission_group_f", "admission_group_inert",
  "relation_primes", "ramification", "relation", "search_ideals",
  "packet_ids", "packet_norms", "admission_group_tau", "packet_ideals",
  "initial_primes", "initial_offsets", "initial_counts", "initial_complete",
  "outer_minidx", "outer_present", "outer_live", "outer_perm",
  "outer_multiplier", "outer_state", "power_metadata",
]);

function emitSource() {
  const initial = signature(INITIAL_SOURCE,
    "pari_resident_generated_class_attempt");
  const retry = signature(RETRY_SOURCE, "pari_prepared_class_group_resumable");
  const initialKinds = new Map(initial.map(value => [value.name, value.kind]));
  const extraBuffers = retry.filter(value => !initialKinds.has(value.name) &&
    value.kind.endsWith("Buffer"));
  for (const value of retry) {
    if (initialKinds.has(value.name))
      assert.equal(initialKinds.get(value.name), value.kind,
        `type mismatch for shared owner ${value.name}`);
    else if (!value.kind.endsWith("Buffer"))
      assert(Object.hasOwn(literal, value.name),
        `missing row-18 scalar transition ${value.name}`);
  }
  const retryStorage = retry.filter(value => RETRY_STORAGE.has(value.name)).map(
    value => Object.freeze({ name: `retry_${value.name}`, kind: value.kind,
      retryName: value.name }));
  const abi = [...initial, ...extraBuffers, ...retryStorage];
  const parameters = abi.map(value => `    ${value.name}: ${value.kind},`).join("\n");
  const initialCall = initial.map(value => `        ${value.name},`).join("\n");
  const retryCall = retry.map(value => `        ${literal[value.name] ||
    (RETRY_STORAGE.has(value.name) ? `retry_${value.name}` : value.name)},`).join("\n");
  const source = `\
from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, native
from .resident_generated_class_attempt import pari_resident_generated_class_attempt
from .prepared_class_group_resumable import pari_prepared_class_group_resumable


@native
def pari_row18_phase6_resident_root(
${parameters}
) -> int:
    initial_action = pari_resident_generated_class_attempt(
${initialCall}
    )
    if initial_action != 5:
        return -1801

    factor_count = prep_base_state[2]
    relation_prime_count = prep_base_state[3]
    checking_prime_count = prep_base_state[4]
    subfactor_count = prep_sub_state[0]
    i = 0
    while i < subfactor_count:
        retry_subfactor[i] = search_ideals[i]
        i += 1
    i = 0
    while i < factor_count:
        retry_admission_group_e[i] = admission_group_e[i]
        retry_admission_group_f[i] = admission_group_f[i]
        retry_admission_group_inert[i] = admission_group_inert[i]
        retry_relation_primes[i] = relation_primes[i]
        retry_ramification[i] = ramification[i]
        retry_relation[i] = relation[i]
        retry_search_ideals[i] = search_ideals[i]
        retry_packet_ids[i] = packet_ids[i]
        retry_packet_norms[i] = packet_norms[i]
        selected_index = prep_selected_indices[i]
        retry_packet_primes[i] = prep_kummer_catalog_primes[selected_index]
        retry_packet_inert[i] = prep_kummer_catalog_inert[selected_index]
        coordinate = 0
        while coordinate < n:
            retry_packet_generators[i * n + coordinate] = prep_kummer_catalog_generators[selected_index * n + coordinate]
            coordinate += 1
        coordinate = 0
        while coordinate < 9:
            retry_admission_group_tau[i * 9 + coordinate] = admission_group_tau[i * 9 + coordinate]
            retry_packet_ideals[i * 9 + coordinate] = packet_ideals[i * 9 + coordinate]
            coordinate += 1
        retry_outer_minidx[i] = i + 1
        retry_outer_present[i] = 0
        retry_outer_live[i] = 0
        retry_outer_perm[i] = 0
        retry_outer_multiplier[i] = 0
        i += 1
    i = 0
    while i < relation_prime_count:
        retry_initial_primes[i] = initial_primes[i]
        retry_initial_offsets[i] = initial_offsets[i]
        retry_initial_counts[i] = initial_counts[i]
        retry_initial_complete[i] = initial_complete[i]
        i += 1
    i = 0
    while i < 19:
        retry_outer_state[i] = 0
        i += 1
    log_completed[0] = 0
    i = 0
    while i < 4:
        schedule[i] = 0
        i += 1
    i = 0
    while i < 5:
        retry_power_metadata[i] = 0
        i += 1

    return pari_prepared_class_group_resumable(
${retryCall}
    )
`;
  return Object.freeze({ abi, extraBuffers, initial, retry, retryStorage, source });
}

module.exports = { INITIAL_SOURCE, RETRY_SOURCE, emitSource, signature };
