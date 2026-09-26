"use strict";

// Complete host-allocation contract for pari_resident_generated_class_attempt.
// No rule may use a fixture array length.  Every group resolves from an
// admitted dimension, a source constant, a catalog/resource ceiling, or an
// explicit predeclared budget.

module.exports = Object.freeze({
  schema: "sagejs.pari-class-group/resident-candidate-owner-manifest-v1",
  entry: "pari_resident_generated_class_attempt",
  dimensions: Object.freeze({
    degree: 3,
    precision_bits: 192,
    real_places: 3,
    catalog_prime_ceiling: 10007,
    runtime_prime_ceiling: 65537,
    factor_base_budget: 66,
    relation_row_budget: 780,
    hnf_dimension_budget: 139,
    acceptance_entry_budget: 4096,
    cup_entry_budget: 160000,
  }),
  length_rules: Object.freeze({
    scalar: { derivation: "source_constant", expression: "scalar", length: null },
    length_0: { derivation: "source_constant", expression: "disabled owner", length: 0 },
    length_1: { derivation: "source_constant", expression: "singleton", length: 1 },
    length_2: { derivation: "source_constant", expression: "two-slot state", length: 2 },
    length_3: { derivation: "prepared_nf_dimension", expression: "degree", length: 3 },
    length_4: { derivation: "prepared_nf_dimension", expression: "degree + 1", length: 4 },
    length_5: { derivation: "source_constant", expression: "five-slot state", length: 5 },
    length_6: { derivation: "source_constant", expression: "six-slot state", length: 6 },
    length_7: { derivation: "source_constant", expression: "seven-slot diagnostic", length: 7 },
    length_8: { derivation: "source_constant", expression: "eight-slot state", length: 8 },
    length_9: { derivation: "prepared_nf_dimension", expression: "degree^2", length: 9 },
    length_12: { derivation: "prepared_nf_dimension", expression: "degree*(degree+1)", length: 12 },
    length_16: { derivation: "predeclared_budget", expression: "factor slots", length: 16 },
    length_18: { derivation: "prepared_nf_dimension", expression: "2*degree^2", length: 18 },
    length_21: { derivation: "source_constant", expression: "7*degree log record", length: 21 },
    length_25: { derivation: "source_constant", expression: "resultant trace", length: 25 },
    length_27: { derivation: "prepared_nf_dimension", expression: "degree^3", length: 27 },
    length_30: { derivation: "prepared_nf_dimension", expression: "degree*(degree^2+1)", length: 30 },
    length_31: { derivation: "source_constant", expression: "analytic table", length: 31 },
    length_32: { derivation: "predeclared_budget", expression: "local stack", length: 32 },
    length_36: { derivation: "prepared_nf_dimension", expression: "4*degree^2", length: 36 },
    length_48: { derivation: "prepared_nf_dimension", expression: "degree*(4+degree+degree^2)", length: 48 },
    length_64: { derivation: "predeclared_budget", expression: "exact work vector", length: 64 },
    length_66: { derivation: "resource_ceiling", expression: "factor_base_budget", length: 66 },
    length_128: { derivation: "predeclared_budget", expression: "exact stack", length: 128 },
    length_334: { derivation: "resource_ceiling", expression: "admission group slots", length: 334 },
    length_393: { derivation: "resource_ceiling", expression: "degree catalog workspace", length: 393 },
    length_594: { derivation: "resource_ceiling", expression: "degree^2*factor_base_budget", length: 594 },
    length_780: { derivation: "resource_ceiling", expression: "relation_row_budget", length: 780 },
    length_1024: { derivation: "predeclared_budget", expression: "analytic exact work", length: 1024 },
    length_1230: { derivation: "catalog_ceiling", expression: "pi(catalog_prime_ceiling)", length: 1230 },
    length_1231: { derivation: "catalog_ceiling", expression: "pi(catalog_prime_ceiling)+1", length: 1231 },
    length_1232: { derivation: "catalog_ceiling", expression: "pi(catalog_prime_ceiling)+2", length: 1232 },
    length_2340: { derivation: "resource_ceiling", expression: "degree*relation_row_budget", length: 2340 },
    length_3690: { derivation: "catalog_ceiling", expression: "degree*pi(catalog_prime_ceiling)", length: 3690 },
    catalog_slots: { derivation: "catalog_ceiling", expression: "degree*pi(catalog_prime_ceiling)", length: 3690 },
    length_4096: { derivation: "predeclared_budget", expression: "acceptance_entry_budget", length: 4096 },
    length_4356: { derivation: "resource_ceiling", expression: "factor_base_budget^2", length: 4356 },
    length_6543: { derivation: "catalog_ceiling", expression: "pi(runtime_prime_ceiling)", length: 6543 },
    length_10008: { derivation: "catalog_ceiling", expression: "catalog_prime_ceiling+1", length: 10008 },
    length_11070: { derivation: "catalog_ceiling", expression: "degree^2*pi(catalog_prime_ceiling)", length: 11070 },
    sub_stack: { derivation: "catalog_ceiling", expression: "3*degree*pi(catalog_prime_ceiling)+3", length: 11073 },
    length_16380: { derivation: "resource_ceiling", expression: "7*degree*relation_row_budget", length: 16380 },
    length_16994: { derivation: "predeclared_budget", expression: "Kummer factor workspace", length: 16994 },
    length_19321: { derivation: "resource_ceiling", expression: "hnf_dimension_budget^2", length: 19321 },
    length_33210: { derivation: "catalog_ceiling", expression: "degree^3*pi(catalog_prime_ceiling)", length: 33210 },
    length_51480: { derivation: "resource_ceiling", expression: "factor_base_budget*relation_row_budget", length: 51480 },
    length_160000: { derivation: "predeclared_budget", expression: "cup_entry_budget", length: 160000 },
  }),
  capacity_rules: Object.freeze({
    scalar: { storage: "scalar" },
    int64: { storage: "Int64Buffer", bytes_per_entry: 8 },
    float64: { storage: "Float64Buffer", bytes_per_entry: 8 },
    prepared_input_exact: {
      storage: "IntegerBuffer",
      authority: "compiled externalWrites omission",
      words: "maximum prepared input magnitude, one-word floor",
    },
    mutable_p192: {
      storage: "IntegerBuffer",
      authority: "compiled externalWrites membership",
      words: 16,
      derivation: "nextPow2(ceil(4*precision_bits/64))",
    },
  }),
  owner_groups: Object.freeze([
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_27",
    "owners": [
      "matrix",
      "reduction",
      "vectors"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_9",
    "owners": [
      "ideal",
      "betas",
      "norms",
      "column",
      "admission_ideal",
      "admission_tau",
      "admission_primitive",
      "admission_columns",
      "preparation_original",
      "preparation_basis",
      "preparation_transform",
      "preparation_flatter_input",
      "preparation_current",
      "preparation_flatter_transform",
      "preparation_total_work",
      "preparation_step_t",
      "preparation_step_s",
      "preparation_product",
      "preparation_next_basis",
      "preparation_gram",
      "preparation_mu_exponents",
      "preparation_r_exponents",
      "hnf_matrix",
      "hnf_work",
      "power_ideal",
      "power_multiplication",
      "product_primitive",
      "prep_kummer_tau_output",
      "prep_kummer_generators"
    ]
  },
  {
    "kind": "int",
    "capacity": "scalar",
    "length_rule": "scalar",
    "owners": [
      "n",
      "precision",
      "admission_real_count",
      "admission_factorlimit",
      "admission_prime_limit",
      "analytic_discriminant",
      "analytic_roots_of_unity",
      "prep_index",
      "prep_zkden"
    ]
  },
  {
    "kind": "Float64Buffer",
    "capacity": "float64",
    "length_rule": "length_16",
    "owners": [
      "float_q"
    ]
  },
  {
    "kind": "Float64Buffer",
    "capacity": "float64",
    "length_rule": "length_4",
    "owners": [
      "float_v",
      "y",
      "z"
    ]
  },
  {
    "kind": "Float64Buffer",
    "capacity": "float64",
    "length_rule": "length_1",
    "owners": [
      "bound",
      "preparation_temporary",
      "analytic_log_discriminant",
      "analytic_tail",
      "analytic_log_inverse_residue",
      "prep_sub_configuration"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_3",
    "owners": [
      "cache",
      "element",
      "admission_embedding_m",
      "admission_embedding_p",
      "admission_embedding_e",
      "admission_x",
      "admission_y",
      "admission_spare",
      "admission_values",
      "admission_temporary",
      "diagnostic",
      "preparation_rank_diagnostic",
      "preparation_y",
      "preparation_exponents",
      "preparation_s_exponents",
      "preparation_alpha",
      "preparation_column_exponents",
      "hnf_generator",
      "hnf_pivots",
      "power_alpha",
      "power_primitive",
      "power_temporary",
      "power_diagnostic",
      "power_moduli",
      "log_coordinates",
      "log_cache",
      "log_pi_cache",
      "accept_inverse_hr",
      "analytic_inverse_residue",
      "analytic_exp_cache",
      "analytic_pi_cache",
      "prep_factor_degrees",
      "prep_factor_exponents",
      "prep_group_degrees",
      "prep_group_counts",
      "prep_local_state",
      "prep_sub_state",
      "prep_kummer_diagnostic",
      "prep_kummer_u",
      "prep_kummer_t",
      "prep_kummer_primitive",
      "prep_kummer_column",
      "prep_kummer_u_output",
      "prep_kummer_residue_degrees",
      "prep_kummer_order",
      "prep_kummer_decomposition_state"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_64",
    "owners": [
      "a",
      "b",
      "p",
      "q",
      "log_a",
      "log_b",
      "log_p",
      "log_q"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_128",
    "owners": [
      "stack",
      "admission_indices",
      "admission_exponents",
      "log_stack",
      "analytic_stack"
    ]
  },
  {
    "kind": "Int64Buffer",
    "capacity": "int64",
    "length_rule": "length_4",
    "owners": [
      "x",
      "inc",
      "cursor_output",
      "counters",
      "progress",
      "schedule",
      "chain_state",
      "accept_multiple_state",
      "accept_reconstruction_state",
      "attempt_state"
    ]
  },
  {
    "kind": "Int64Buffer",
    "capacity": "int64",
    "length_rule": "length_5",
    "owners": [
      "state"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "prepared_input_exact",
    "length_rule": "length_9",
    "owners": [
      "admission_matrix_m",
      "admission_matrix_p",
      "admission_matrix_e",
      "admission_products",
      "preparation_rounded_embedding",
      "prep_invzk",
      "prep_zk"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "prepared_input_exact",
    "length_rule": "length_6543",
    "owners": [
      "admission_primes"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_16",
    "owners": [
      "admission_rational_factors",
      "admission_rational_exponents"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_334",
    "owners": [
      "admission_prime_offsets",
      "admission_prime_counts"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_594",
    "owners": [
      "admission_group_tau",
      "packet_ideals"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "catalog_slots",
    "owners": [
      "admission_group_e",
      "admission_group_f",
      "admission_group_inert",
      "relation_primes",
      "ramification",
      "relation",
      "search_ideals",
      "packet_ids",
      "packet_norms",
      "initial_primes",
      "initial_offsets",
      "initial_counts",
      "initial_complete",
      "class_invariants",
      "prep_bad",
      "prep_sub_order",
      "prep_sub_scratch",
      "prep_sub_chosen",
      "prep_sub_rejected"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_32",
    "owners": [
      "admission_stack",
      "hnf_cup_frames"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "prepared_input_exact",
    "length_rule": "length_0",
    "owners": [
      "subfactor",
      "extra",
      "packet_primes",
      "packet_generators",
      "packet_inert",
      "outer_minidx",
      "outer_perm"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_6",
    "owners": [
      "relation_state",
      "prep_kummer_rational"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_4356",
    "owners": [
      "relation_basis"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_51480",
    "owners": [
      "relation_records"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_780",
    "owners": [
      "relation_hashes"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_2340",
    "owners": [
      "relation_metadata",
      "generators"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_66",
    "owners": [
      "relation_scratch",
      "prep_kummer_random_state"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "prepared_input_exact",
    "length_rule": "length_27",
    "owners": [
      "preparation_embedding",
      "basis_table"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_2",
    "owners": [
      "preparation_flags",
      "prep_kummer_sort_diagnostic"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_5",
    "owners": [
      "preparation_selection"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_4",
    "owners": [
      "preparation_stages",
      "preparation_t1",
      "preparation_t2",
      "preparation_t3",
      "preparation_integers",
      "preparation_rounded",
      "power_metadata",
      "prep_degree_state",
      "prep_base_norms",
      "prep_kummer_factor",
      "prep_kummer_state"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_7",
    "owners": [
      "preparation_diagnostic",
      "prep_base_state"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_12",
    "owners": [
      "preparation_r1",
      "preparation_r2",
      "preparation_r3",
      "preparation_inverse",
      "preparation_first",
      "preparation_second",
      "preparation_final",
      "power_triangular",
      "prep_kummer_resultant_work",
      "prep_kummer_descriptor_state"
    ]
  },
  {
    "kind": "Float64Buffer",
    "capacity": "float64",
    "length_rule": "length_9",
    "owners": [
      "preparation_mu",
      "preparation_r",
      "preparation_approximate",
      "preparation_float_gram"
    ]
  },
  {
    "kind": "Float64Buffer",
    "capacity": "float64",
    "length_rule": "length_3",
    "owners": [
      "preparation_s",
      "preparation_float_scratch",
      "prep_base_configuration"
    ]
  },
  {
    "kind": "Int64Buffer",
    "capacity": "int64",
    "length_rule": "length_1",
    "owners": [
      "preparation_state"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_30",
    "owners": [
      "power_work"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_18",
    "owners": [
      "product_matrix"
    ]
  },
  {
    "kind": "Int64Buffer",
    "capacity": "int64",
    "length_rule": "length_0",
    "owners": [
      "outer_state"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_0",
    "owners": [
      "outer_present",
      "outer_live",
      "outer_multiplier"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_1",
    "owners": [
      "log_completed",
      "class_number",
      "prep_kummer_minpoly_diagnostic"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_16380",
    "owners": [
      "log_embeddings"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_21",
    "owners": [
      "log_column"
    ]
  },
  {
    "kind": "Int64Buffer",
    "capacity": "int64",
    "length_rule": "length_51480",
    "owners": [
      "hnf_original"
    ]
  },
  {
    "kind": "Int64Buffer",
    "capacity": "int64",
    "length_rule": "catalog_slots",
    "owners": [
      "hnf_perm"
    ]
  },
  {
    "kind": "Int64Buffer",
    "capacity": "int64",
    "length_rule": "length_19321",
    "owners": [
      "hnf_mat",
      "hnf_vmax",
      "hnf_found",
      "hnf_sparse_state",
      "hnf_cleanup_state",
      "hnf_perm_work",
      "hnf_assembly_state",
      "hnf_hnf_state",
      "hnf_diagonal",
      "hnf_final_state",
      "hnf_state"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_19321",
    "owners": [
      "hnf_dense",
      "hnf_transform",
      "hnf_bottom",
      "hnf_updated_dense",
      "hnf_extra",
      "hnf_rank_matrix",
      "hnf_occupied",
      "hnf_rank_pivots",
      "hnf_best",
      "hnf_profile",
      "hnf_rank_state",
      "hnf_matbnew",
      "hnf_dep",
      "hnf_b",
      "hnf_transformed_logs",
      "hnf_full_h",
      "hnf_hnf_transform",
      "hnf_lam",
      "hnf_d",
      "hnf_full_dep",
      "hnf_work_b",
      "hnf_work_c",
      "hnf_result_h",
      "hnf_result_dep",
      "hnf_result_b",
      "hnf_result_c"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_4096",
    "owners": [
      "accept_logs",
      "accept_class_number",
      "accept_zeta_factor",
      "accept_prepared",
      "accept_rank_work",
      "accept_integer_input",
      "accept_integer_work",
      "accept_integer_occupied",
      "accept_integer_pivots",
      "accept_integer_best",
      "accept_integer_state",
      "accept_basis",
      "accept_minor",
      "accept_det_work",
      "accept_det_result",
      "accept_inverse_work",
      "accept_inverse_rhs",
      "accept_inverse",
      "accept_product",
      "accept_inverse_slice",
      "accept_multiple",
      "accept_coordinates",
      "accept_rational_work",
      "accept_lattice",
      "accept_hnf_work",
      "accept_hnf_column",
      "accept_hnf_output",
      "accept_regulator",
      "accept_relations",
      "accept_denominator",
      "smith_work",
      "smith_column",
      "smith_invariants",
      "smith_class_number"
    ]
  },
  {
    "kind": "Int64Buffer",
    "capacity": "int64",
    "length_rule": "length_3",
    "owners": [
      "accept_post_hnf_state",
      "accept_acceptance_state"
    ]
  },
  {
    "kind": "Int64Buffer",
    "capacity": "int64",
    "length_rule": "length_4096",
    "owners": [
      "accept_selected",
      "accept_prep_state",
      "accept_rank_occupied",
      "accept_rank_pivots",
      "accept_rank_state",
      "accept_det_pivots",
      "accept_det_state",
      "accept_inverse_pivots",
      "accept_inverse_state",
      "accept_hnf_state",
      "accept_hnf_row_pivots",
      "accept_hnf_heights"
    ]
  },
  {
    "kind": "Int64Buffer",
    "capacity": "int64",
    "length_rule": "length_6",
    "owners": [
      "smith_state"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_160000",
    "owners": [
      "hnf_cup_arena"
    ]
  },
  {
    "kind": "Int64Buffer",
    "capacity": "int64",
    "length_rule": "length_8",
    "owners": [
      "hnf_cup_solve_state",
      "hnf_cup_state"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "prepared_input_exact",
    "length_rule": "length_1230",
    "owners": [
      "analytic_primes"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_1230",
    "owners": [
      "analytic_offsets",
      "analytic_counts",
      "prep_full_offsets",
      "prep_full_counts",
      "prep_selected_primes",
      "prep_kummer_requested_counts"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_3690",
    "owners": [
      "analytic_degrees",
      "analytic_multiplicities",
      "prep_full_degrees",
      "prep_selected_indices",
      "prep_kummer_catalog_primes",
      "prep_kummer_catalog_e",
      "prep_kummer_catalog_f",
      "prep_kummer_catalog_inert"
    ]
  },
  {
    "kind": "Float64Buffer",
    "capacity": "float64",
    "length_rule": "length_7",
    "owners": [
      "analytic_coefficients"
    ]
  },
  {
    "kind": "Float64Buffer",
    "capacity": "float64",
    "length_rule": "length_31",
    "owners": [
      "analytic_table"
    ]
  },
  {
    "kind": "Float64Buffer",
    "capacity": "float64",
    "length_rule": "length_1230",
    "owners": [
      "analytic_logarithms"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_1024",
    "owners": [
      "analytic_a",
      "analytic_b",
      "analytic_p",
      "analytic_q"
    ]
  },
  {
    "kind": "Int64Buffer",
    "capacity": "int64",
    "length_rule": "length_2",
    "owners": [
      "analytic_state"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "prepared_input_exact",
    "length_rule": "length_4",
    "owners": [
      "prep_polynomial"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "prepared_input_exact",
    "length_rule": "length_3",
    "owners": [
      "prep_zk_degrees"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_393",
    "owners": [
      "prep_degree_workspace"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_10008",
    "owners": [
      "prep_prime_offsets",
      "prep_prime_counts",
      "prep_complete_groups"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "sub_stack",
    "owners": [
      "prep_sub_stack"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_8",
    "owners": [
      "prep_state"
    ]
  },
  {
    "kind": "Float64Buffer",
    "capacity": "float64",
    "length_rule": "length_1232",
    "owners": [
      "prep_base_constants_logs"
    ]
  },
  {
    "kind": "Float64Buffer",
    "capacity": "float64",
    "length_rule": "length_2",
    "owners": [
      "prep_base_sums"
    ]
  },
  {
    "kind": "Float64Buffer",
    "capacity": "float64",
    "length_rule": "length_1231",
    "owners": [
      "prep_base_factor_logs"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_16994",
    "owners": [
      "prep_kummer_factorwork"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_36",
    "owners": [
      "prep_kummer_polywork"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_25",
    "owners": [
      "prep_kummer_resultant_trace"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_48",
    "owners": [
      "prep_kummer_unsorted",
      "prep_kummer_decomposition_output"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_11070",
    "owners": [
      "prep_kummer_catalog_generators"
    ]
  },
  {
    "kind": "IntegerBuffer",
    "capacity": "mutable_p192",
    "length_rule": "length_33210",
    "owners": [
      "prep_kummer_catalog_tau"
    ]
  }
]),
});

