"""Generated checked host adapters for flint.

This file is derived from the CPython-parseable declaration source.  Do not
edit it directly; run `sagejs ffi generate flint`.
The native compiler lowers these actual typed bodies into one host adapter
whose core calls the declared foreign symbols without a host callback.
"""

from __future__ import annotations

from sagejs.ffi.flint import (
    DirichletGroup,
    ExactPolynomialFactorization,
    FlintByteRegion,
    FmpqMatrix,
    FmpqPolynomial,
    FmpqPolynomialDivisionResult,
    FmpqPolynomialXgcdResult,
    FmpqValue,
    FmpzMatrix,
    FmpzModPolynomial,
    FmpzModPolynomialDivisionResult,
    FmpzModPolynomialFactorization,
    FmpzModPolynomialRoots,
    FmpzModPolynomialXgcdResult,
    FmpzPolynomial,
    FmpzPolynomialDivisionResult,
    FmpzPolynomialXgcdResult,
    FqContext,
    FqElement,
    FqPolynomial,
    NmodMatrix,
    fmpz_polynomial as _ffi_fmpz_polynomial,
    fmpz_polynomial_set_coefficient as _ffi_fmpz_polynomial_set_coefficient,
    fmpz_polynomial_seal as _ffi_fmpz_polynomial_seal,
    fmpz_polynomial_length as _ffi_fmpz_polynomial_length,
    fmpz_polynomial_equal as _ffi_fmpz_polynomial_equal,
    fmpz_polynomial_coefficient as _ffi_fmpz_polynomial_coefficient,
    fmpz_polynomial_add as _ffi_fmpz_polynomial_add,
    fmpz_polynomial_sub as _ffi_fmpz_polynomial_sub,
    fmpz_polynomial_neg as _ffi_fmpz_polynomial_neg,
    fmpz_polynomial_scalar_floor_div as _ffi_fmpz_polynomial_scalar_floor_div,
    fmpz_polynomial_truncate as _ffi_fmpz_polynomial_truncate,
    fmpz_polynomial_compose as _ffi_fmpz_polynomial_compose,
    fmpz_polynomial_reverse as _ffi_fmpz_polynomial_reverse,
    fmpz_polynomial_shift_left as _ffi_fmpz_polynomial_shift_left,
    fmpz_polynomial_shift_right as _ffi_fmpz_polynomial_shift_right,
    fmpz_polynomial_integral as _ffi_fmpz_polynomial_integral,
    fmpz_polynomial_resultant as _ffi_fmpz_polynomial_resultant,
    fmpz_polynomial_discriminant as _ffi_fmpz_polynomial_discriminant,
    fmpz_polynomial_derivative as _ffi_fmpz_polynomial_derivative,
    fmpz_polynomial_mul as _ffi_fmpz_polynomial_mul,
    fmpz_polynomial_gcd as _ffi_fmpz_polynomial_gcd,
    fmpz_polynomial_xgcd_resource as _ffi_fmpz_polynomial_xgcd_resource,
    fmpz_polynomial_xgcd_result_gcd as _ffi_fmpz_polynomial_xgcd_result_gcd,
    fmpz_polynomial_xgcd_result_left_coefficient as _ffi_fmpz_polynomial_xgcd_result_left_coefficient,
    fmpz_polynomial_xgcd_result_right_coefficient as _ffi_fmpz_polynomial_xgcd_result_right_coefficient,
    fmpz_polynomial_factor_resource as _ffi_fmpz_polynomial_factor_resource,
    fmpz_polynomial_divexact as _ffi_fmpz_polynomial_divexact,
    fmpz_polynomial_quo_rem_resource as _ffi_fmpz_polynomial_quo_rem_resource,
    fmpz_polynomial_division_result_quotient as _ffi_fmpz_polynomial_division_result_quotient,
    fmpz_polynomial_division_result_remainder as _ffi_fmpz_polynomial_division_result_remainder,
    fmpz_polynomial_pow as _ffi_fmpz_polynomial_pow,
    fmpz_polynomial_cyclotomic as _ffi_fmpz_polynomial_cyclotomic,
    fmpz_polynomial_evaluate as _ffi_fmpz_polynomial_evaluate,
    fmpz_polynomial_evaluate_rational as _ffi_fmpz_polynomial_evaluate_rational,
    fmpz_polynomial_serialize as _ffi_fmpz_polynomial_serialize,
    fmpz_polynomial_format as _ffi_fmpz_polynomial_format,
    fmpz_polynomial_deserialize as _ffi_fmpz_polynomial_deserialize,
    fmpq_polynomial as _ffi_fmpq_polynomial,
    fmpq_polynomial_set_coefficient as _ffi_fmpq_polynomial_set_coefficient,
    fmpq_polynomial_seal as _ffi_fmpq_polynomial_seal,
    fmpq_polynomial_length as _ffi_fmpq_polynomial_length,
    fmpq_polynomial_equal as _ffi_fmpq_polynomial_equal,
    fmpq_polynomial_coefficient_numerator as _ffi_fmpq_polynomial_coefficient_numerator,
    fmpq_polynomial_coefficient_denominator as _ffi_fmpq_polynomial_coefficient_denominator,
    fmpq_polynomial_add as _ffi_fmpq_polynomial_add,
    fmpq_polynomial_sub as _ffi_fmpq_polynomial_sub,
    fmpq_polynomial_neg as _ffi_fmpq_polynomial_neg,
    fmpq_polynomial_scalar_div as _ffi_fmpq_polynomial_scalar_div,
    fmpq_polynomial_truncate as _ffi_fmpq_polynomial_truncate,
    fmpq_polynomial_compose as _ffi_fmpq_polynomial_compose,
    fmpq_polynomial_reverse as _ffi_fmpq_polynomial_reverse,
    fmpq_polynomial_shift_left as _ffi_fmpq_polynomial_shift_left,
    fmpq_polynomial_shift_right as _ffi_fmpq_polynomial_shift_right,
    fmpq_polynomial_integral as _ffi_fmpq_polynomial_integral,
    fmpq_polynomial_resultant as _ffi_fmpq_polynomial_resultant,
    fmpq_polynomial_discriminant as _ffi_fmpq_polynomial_discriminant,
    fmpq_polynomial_derivative as _ffi_fmpq_polynomial_derivative,
    fmpq_polynomial_mul as _ffi_fmpq_polynomial_mul,
    fmpq_polynomial_gcd as _ffi_fmpq_polynomial_gcd,
    fmpq_polynomial_xgcd_resource as _ffi_fmpq_polynomial_xgcd_resource,
    fmpq_polynomial_xgcd_result_gcd as _ffi_fmpq_polynomial_xgcd_result_gcd,
    fmpq_polynomial_xgcd_result_left_coefficient as _ffi_fmpq_polynomial_xgcd_result_left_coefficient,
    fmpq_polynomial_xgcd_result_right_coefficient as _ffi_fmpq_polynomial_xgcd_result_right_coefficient,
    fmpq_polynomial_factor_resource as _ffi_fmpq_polynomial_factor_resource,
    exact_polynomial_factorization_count as _ffi_exact_polynomial_factorization_count,
    exact_polynomial_factorization_exponent as _ffi_exact_polynomial_factorization_exponent,
    exact_polynomial_factorization_unit_numerator as _ffi_exact_polynomial_factorization_unit_numerator,
    exact_polynomial_factorization_unit_denominator as _ffi_exact_polynomial_factorization_unit_denominator,
    exact_polynomial_factorization_fmpz_factor as _ffi_exact_polynomial_factorization_fmpz_factor,
    exact_polynomial_factorization_fmpq_factor as _ffi_exact_polynomial_factorization_fmpq_factor,
    fmpq_polynomial_divexact as _ffi_fmpq_polynomial_divexact,
    fmpq_polynomial_quo_rem_resource as _ffi_fmpq_polynomial_quo_rem_resource,
    fmpq_polynomial_division_result_quotient as _ffi_fmpq_polynomial_division_result_quotient,
    fmpq_polynomial_division_result_remainder as _ffi_fmpq_polynomial_division_result_remainder,
    fmpq_polynomial_pow as _ffi_fmpq_polynomial_pow,
    fmpq_polynomial_evaluate as _ffi_fmpq_polynomial_evaluate,
    fmpq_polynomial_serialize as _ffi_fmpq_polynomial_serialize,
    fmpq_polynomial_format as _ffi_fmpq_polynomial_format,
    fmpq_polynomial_deserialize as _ffi_fmpq_polynomial_deserialize,
    fmpz_matrix as _ffi_fmpz_matrix,
    fmpz_matrix_nrows as _ffi_fmpz_matrix_nrows,
    fmpz_matrix_ncols as _ffi_fmpz_matrix_ncols,
    fmpz_matrix_set_entry as _ffi_fmpz_matrix_set_entry,
    fmpz_matrix_entry as _ffi_fmpz_matrix_entry,
    fmpz_matrix_export_mod_ui as _ffi_fmpz_matrix_export_mod_ui,
    fmpz_matrix_copy as _ffi_fmpz_matrix_copy,
    fmpz_matrix_neg as _ffi_fmpz_matrix_neg,
    fmpz_matrix_scalar_mul as _ffi_fmpz_matrix_scalar_mul,
    fmpz_matrix_equal as _ffi_fmpz_matrix_equal,
    fmpz_matrix_is_zero as _ffi_fmpz_matrix_is_zero,
    fmpz_matrix_is_one as _ffi_fmpz_matrix_is_one,
    fmpz_matrix_add as _ffi_fmpz_matrix_add,
    fmpz_matrix_sub as _ffi_fmpz_matrix_sub,
    fmpz_matrix_transpose as _ffi_fmpz_matrix_transpose,
    fmpz_matrix_mul as _ffi_fmpz_matrix_mul,
    fmpz_matrix_mul_vector as _ffi_fmpz_matrix_mul_vector,
    fmpz_vector_mul_matrix as _ffi_fmpz_vector_mul_matrix,
    fmpz_matrix_pow as _ffi_fmpz_matrix_pow,
    fmpz_matrix_rank as _ffi_fmpz_matrix_rank,
    fmpz_matrix_rank_mod_46337 as _ffi_fmpz_matrix_rank_mod_46337,
    fmpz_matrix_det as _ffi_fmpz_matrix_det,
    fmpz_matrix_trace as _ffi_fmpz_matrix_trace,
    fmpz_matrix_hnf as _ffi_fmpz_matrix_hnf,
    fmpz_matrix_snf as _ffi_fmpz_matrix_snf,
    fmpz_matrix_hnf_transform as _ffi_fmpz_matrix_hnf_transform,
    fmpz_matrix_snf_transform as _ffi_fmpz_matrix_snf_transform,
    fmpz_matrix_right_kernel as _ffi_fmpz_matrix_right_kernel,
    fmpz_matrix_charpoly as _ffi_fmpz_matrix_charpoly,
    fmpz_matrix_minpoly as _ffi_fmpz_matrix_minpoly,
    fmpq_matrix_from_fmpz as _ffi_fmpq_matrix_from_fmpz,
    fmpz_matrix_from_fmpq_integral as _ffi_fmpz_matrix_from_fmpq_integral,
    fmpz_matrix_submatrix as _ffi_fmpz_matrix_submatrix,
    fmpz_matrix_select_rows as _ffi_fmpz_matrix_select_rows,
    fmpz_matrix_select_columns as _ffi_fmpz_matrix_select_columns,
    fmpz_matrix_swap_rows as _ffi_fmpz_matrix_swap_rows,
    fmpz_matrix_swap_columns as _ffi_fmpz_matrix_swap_columns,
    fmpz_matrix_set_block as _ffi_fmpz_matrix_set_block,
    fmpz_matrix_stack as _ffi_fmpz_matrix_stack,
    fmpz_matrix_augment as _ffi_fmpz_matrix_augment,
    fmpz_matrix_nonzero_count as _ffi_fmpz_matrix_nonzero_count,
    fmpz_matrix_format as _ffi_fmpz_matrix_format,
    fmpz_matrix_serialize as _ffi_fmpz_matrix_serialize,
    fmpz_matrix_serialize_sequence as _ffi_fmpz_matrix_serialize_sequence,
    flint_byte_region as _ffi_flint_byte_region,
    flint_byte_region_set as _ffi_flint_byte_region_set,
    fmpz_matrix_deserialize as _ffi_fmpz_matrix_deserialize,
    fmpz_matrix_deserialize_entries as _ffi_fmpz_matrix_deserialize_entries,
    fmpq_matrix as _ffi_fmpq_matrix,
    fmpq_matrix_randbits as _ffi_fmpq_matrix_randbits,
    fmpq_matrix_nrows as _ffi_fmpq_matrix_nrows,
    fmpq_matrix_ncols as _ffi_fmpq_matrix_ncols,
    fmpq_matrix_set_entry as _ffi_fmpq_matrix_set_entry,
    fmpq_matrix_add_scaled_entry as _ffi_fmpq_matrix_add_scaled_entry,
    fmpq_matrix_entry_numerator as _ffi_fmpq_matrix_entry_numerator,
    fmpq_matrix_entry_denominator as _ffi_fmpq_matrix_entry_denominator,
    fmpq_matrix_entry_is_zero as _ffi_fmpq_matrix_entry_is_zero,
    fmpq_matrix_copy as _ffi_fmpq_matrix_copy,
    fmpq_matrix_neg as _ffi_fmpq_matrix_neg,
    fmpq_matrix_scalar_mul as _ffi_fmpq_matrix_scalar_mul,
    fmpq_matrix_equal as _ffi_fmpq_matrix_equal,
    fmpq_matrix_is_zero as _ffi_fmpq_matrix_is_zero,
    fmpq_matrix_is_one as _ffi_fmpq_matrix_is_one,
    fmpq_matrix_add as _ffi_fmpq_matrix_add,
    fmpq_matrix_sub as _ffi_fmpq_matrix_sub,
    fmpq_matrix_transpose as _ffi_fmpq_matrix_transpose,
    fmpq_matrix_mul as _ffi_fmpq_matrix_mul,
    fmpq_matrix_mul_vector as _ffi_fmpq_matrix_mul_vector,
    fmpq_vector_mul_matrix as _ffi_fmpq_vector_mul_matrix,
    fmpq_matrix_inv as _ffi_fmpq_matrix_inv,
    fmpq_matrix_solve as _ffi_fmpq_matrix_solve,
    fmpq_matrix_rref as _ffi_fmpq_matrix_rref,
    fmpq_matrix_right_kernel as _ffi_fmpq_matrix_right_kernel,
    fmpq_matrix_charpoly as _ffi_fmpq_matrix_charpoly,
    fmpq_matrix_minpoly as _ffi_fmpq_matrix_minpoly,
    fmpq_matrix_rank as _ffi_fmpq_matrix_rank,
    fmpq_matrix_det as _ffi_fmpq_matrix_det,
    fmpq_matrix_trace as _ffi_fmpq_matrix_trace,
    fmpq_matrix_submatrix as _ffi_fmpq_matrix_submatrix,
    fmpq_matrix_select_rows as _ffi_fmpq_matrix_select_rows,
    fmpq_matrix_select_columns as _ffi_fmpq_matrix_select_columns,
    fmpq_matrix_swap_rows as _ffi_fmpq_matrix_swap_rows,
    fmpq_matrix_swap_columns as _ffi_fmpq_matrix_swap_columns,
    fmpq_matrix_set_block as _ffi_fmpq_matrix_set_block,
    fmpq_matrix_stack as _ffi_fmpq_matrix_stack,
    fmpq_matrix_augment as _ffi_fmpq_matrix_augment,
    fmpq_matrix_nonzero_count as _ffi_fmpq_matrix_nonzero_count,
    fmpq_value_numerator as _ffi_fmpq_value_numerator,
    fmpq_value_denominator as _ffi_fmpq_value_denominator,
    fmpq_matrix_format as _ffi_fmpq_matrix_format,
    fmpq_matrix_serialize as _ffi_fmpq_matrix_serialize,
    fmpq_matrix_serialize_sequence as _ffi_fmpq_matrix_serialize_sequence,
    fmpq_matrix_deserialize as _ffi_fmpq_matrix_deserialize,
    flint_byte_region_length as _ffi_flint_byte_region_length,
    flint_byte_region_get as _ffi_flint_byte_region_get,
    dirichlet_group as _ffi_dirichlet_group,
    dirichlet_group_size as _ffi_dirichlet_group_size,
    dirichlet_group_num_primitive as _ffi_dirichlet_group_num_primitive,
    n_is_prime as _ffi_n_is_prime,
    fmpz_gcd as _ffi_fmpz_gcd,
    fmpz_mat_rank as _ffi_fmpz_mat_rank,
    fmpz_mat_mul as _ffi_fmpz_mat_mul,
    fmpz_mat_det as _ffi_fmpz_mat_det,
    fmpz_mat_charpoly as _ffi_fmpz_mat_charpoly,
    fmpz_mat_hnf as _ffi_fmpz_mat_hnf,
    fmpz_mat_hnf_transform as _ffi_fmpz_mat_hnf_transform,
    fmpz_mat_snf_transform as _ffi_fmpz_mat_snf_transform,
    fmpz_mat_right_kernel as _ffi_fmpz_mat_right_kernel,
    fmpq_mat_rank as _ffi_fmpq_mat_rank,
    fmpq_mat_mul as _ffi_fmpq_mat_mul,
    fmpq_mat_rref as _ffi_fmpq_mat_rref,
    fmpq_mat_inv as _ffi_fmpq_mat_inv,
    fmpq_mat_solve as _ffi_fmpq_mat_solve,
    fmpq_mat_det as _ffi_fmpq_mat_det,
    fmpq_mat_charpoly as _ffi_fmpq_mat_charpoly,
    nmod_matrix_from_entries as _ffi_nmod_matrix_from_entries,
    nmod_matrix_random as _ffi_nmod_matrix_random,
    nmod_matrix_nrows as _ffi_nmod_matrix_nrows,
    nmod_matrix_ncols as _ffi_nmod_matrix_ncols,
    nmod_matrix_modulus as _ffi_nmod_matrix_modulus,
    nmod_matrix_entry as _ffi_nmod_matrix_entry,
    nmod_matrix_set_entry as _ffi_nmod_matrix_set_entry,
    nmod_matrix_copy as _ffi_nmod_matrix_copy,
    nmod_matrix_equal as _ffi_nmod_matrix_equal,
    nmod_matrix_is_zero as _ffi_nmod_matrix_is_zero,
    nmod_matrix_is_one as _ffi_nmod_matrix_is_one,
    nmod_matrix_nonzero_count as _ffi_nmod_matrix_nonzero_count,
    nmod_matrix_add as _ffi_nmod_matrix_add,
    nmod_matrix_sub as _ffi_nmod_matrix_sub,
    nmod_matrix_neg as _ffi_nmod_matrix_neg,
    nmod_matrix_scalar_mul as _ffi_nmod_matrix_scalar_mul,
    nmod_matrix_transpose as _ffi_nmod_matrix_transpose,
    nmod_matrix_mul as _ffi_nmod_matrix_mul,
    nmod_matrix_inv as _ffi_nmod_matrix_inv,
    nmod_matrix_solve as _ffi_nmod_matrix_solve,
    nmod_matrix_rank as _ffi_nmod_matrix_rank,
    nmod_matrix_rref as _ffi_nmod_matrix_rref,
    nmod_matrix_right_kernel as _ffi_nmod_matrix_right_kernel,
    nmod_matrix_det as _ffi_nmod_matrix_det,
    nmod_matrix_trace as _ffi_nmod_matrix_trace,
    nmod_matrix_swap_rows as _ffi_nmod_matrix_swap_rows,
    nmod_matrix_swap_columns as _ffi_nmod_matrix_swap_columns,
    nmod_matrix_format as _ffi_nmod_matrix_format,
    nmod_matrix_serialize as _ffi_nmod_matrix_serialize,
    nmod_matrix_charpoly as _ffi_nmod_matrix_charpoly,
    nmod_matrix_minpoly as _ffi_nmod_matrix_minpoly,
    nmod_mat_rank as _ffi_nmod_mat_rank,
    nmod_mat_det as _ffi_nmod_mat_det,
    nmod_mat_charpoly as _ffi_nmod_mat_charpoly,
    nmod_mat_minpoly as _ffi_nmod_mat_minpoly,
    nmod_mat_inv as _ffi_nmod_mat_inv,
    nmod_mat_rref as _ffi_nmod_mat_rref,
    nmod_mat_mul as _ffi_nmod_mat_mul,
    nmod_mat_right_kernel as _ffi_nmod_mat_right_kernel,
    nmod_mat_solve as _ffi_nmod_mat_solve,
    fmpz_poly_mul as _ffi_fmpz_poly_mul,
    fmpq_poly_mul as _ffi_fmpq_poly_mul,
    nmod_poly_add as _ffi_nmod_poly_add,
    nmod_poly_sub as _ffi_nmod_poly_sub,
    nmod_poly_neg as _ffi_nmod_poly_neg,
    nmod_poly_equal as _ffi_nmod_poly_equal,
    nmod_poly_derivative as _ffi_nmod_poly_derivative,
    nmod_poly_evaluate as _ffi_nmod_poly_evaluate,
    nmod_poly_compose as _ffi_nmod_poly_compose,
    nmod_poly_reverse as _ffi_nmod_poly_reverse,
    nmod_poly_shift_left as _ffi_nmod_poly_shift_left,
    nmod_poly_shift_right as _ffi_nmod_poly_shift_right,
    nmod_poly_truncate as _ffi_nmod_poly_truncate,
    nmod_poly_integral as _ffi_nmod_poly_integral,
    nmod_poly_resultant as _ffi_nmod_poly_resultant,
    nmod_poly_discriminant as _ffi_nmod_poly_discriminant,
    nmod_poly_mul as _ffi_nmod_poly_mul,
    nmod_poly_divexact as _ffi_nmod_poly_divexact,
    nmod_poly_divrem as _ffi_nmod_poly_divrem,
    fmpz_poly_divexact as _ffi_fmpz_poly_divexact,
    fmpq_poly_divexact as _ffi_fmpq_poly_divexact,
    nmod_poly_gcd as _ffi_nmod_poly_gcd,
    nmod_poly_xgcd as _ffi_nmod_poly_xgcd,
    nmod_poly_is_irreducible as _ffi_nmod_poly_is_irreducible,
    nmod_poly_factor as _ffi_nmod_poly_factor,
    nmod_poly_roots as _ffi_nmod_poly_roots,
    fmpz_poly_factor as _ffi_fmpz_poly_factor,
    fmpq_poly_factor as _ffi_fmpq_poly_factor,
    fq_context as _ffi_fq_context,
    fq_context_characteristic as _ffi_fq_context_characteristic,
    fq_context_degree as _ffi_fq_context_degree,
    fq_element as _ffi_fq_element,
    fq_element_copy as _ffi_fq_element_copy,
    fq_element_extension_degree as _ffi_fq_element_extension_degree,
    fq_element_coordinate as _ffi_fq_element_coordinate,
    fq_element_equal as _ffi_fq_element_equal,
    fq_element_add as _ffi_fq_element_add,
    fq_element_sub as _ffi_fq_element_sub,
    fq_element_mul as _ffi_fq_element_mul,
    fq_polynomial as _ffi_fq_polynomial,
    fq_polynomial_copy as _ffi_fq_polynomial_copy,
    fq_polynomial_length as _ffi_fq_polynomial_length,
    fq_polynomial_extension_degree as _ffi_fq_polynomial_extension_degree,
    fq_polynomial_coordinate as _ffi_fq_polynomial_coordinate,
    fq_polynomial_equal as _ffi_fq_polynomial_equal,
    fq_polynomial_add as _ffi_fq_polynomial_add,
    fq_polynomial_sub as _ffi_fq_polynomial_sub,
    fq_polynomial_mul as _ffi_fq_polynomial_mul,
    fq_polynomial_neg as _ffi_fq_polynomial_neg,
    fq_polynomial_pow as _ffi_fq_polynomial_pow,
    fq_polynomial_coordinate_bytes as _ffi_fq_polynomial_coordinate_bytes,
    fmpz_mod_polynomial as _ffi_fmpz_mod_polynomial,
    fmpz_mod_polynomial_set_coefficient as _ffi_fmpz_mod_polynomial_set_coefficient,
    fmpz_mod_polynomial_seal as _ffi_fmpz_mod_polynomial_seal,
    fmpz_mod_polynomial_modulus as _ffi_fmpz_mod_polynomial_modulus,
    fmpz_mod_polynomial_is_zero as _ffi_fmpz_mod_polynomial_is_zero,
    fmpz_mod_polynomial_length as _ffi_fmpz_mod_polynomial_length,
    fmpz_mod_polynomial_entry_count as _ffi_fmpz_mod_polynomial_entry_count,
    fmpz_mod_polynomial_coefficient as _ffi_fmpz_mod_polynomial_coefficient,
    fmpz_mod_polynomial_copy as _ffi_fmpz_mod_polynomial_copy,
    fmpz_mod_polynomial_equal as _ffi_fmpz_mod_polynomial_equal,
    fmpz_mod_polynomial_add as _ffi_fmpz_mod_polynomial_add,
    fmpz_mod_polynomial_sub as _ffi_fmpz_mod_polynomial_sub,
    fmpz_mod_polynomial_mul as _ffi_fmpz_mod_polynomial_mul,
    fmpz_mod_polynomial_neg as _ffi_fmpz_mod_polynomial_neg,
    fmpz_mod_polynomial_pow as _ffi_fmpz_mod_polynomial_pow,
    fmpz_mod_polynomial_derivative as _ffi_fmpz_mod_polynomial_derivative,
    fmpz_mod_polynomial_evaluate as _ffi_fmpz_mod_polynomial_evaluate,
    fmpz_mod_polynomial_gcd as _ffi_fmpz_mod_polynomial_gcd,
    fmpz_mod_polynomial_divrem_resource as _ffi_fmpz_mod_polynomial_divrem_resource,
    fmpz_mod_polynomial_division_result_quotient as _ffi_fmpz_mod_polynomial_division_result_quotient,
    fmpz_mod_polynomial_division_result_remainder as _ffi_fmpz_mod_polynomial_division_result_remainder,
    fmpz_mod_polynomial_xgcd_resource as _ffi_fmpz_mod_polynomial_xgcd_resource,
    fmpz_mod_polynomial_xgcd_result_gcd as _ffi_fmpz_mod_polynomial_xgcd_result_gcd,
    fmpz_mod_polynomial_xgcd_result_left_coefficient as _ffi_fmpz_mod_polynomial_xgcd_result_left_coefficient,
    fmpz_mod_polynomial_xgcd_result_right_coefficient as _ffi_fmpz_mod_polynomial_xgcd_result_right_coefficient,
    fmpz_mod_polynomial_factor_resource as _ffi_fmpz_mod_polynomial_factor_resource,
    fmpz_mod_polynomial_roots_resource as _ffi_fmpz_mod_polynomial_roots_resource,
    fmpz_mod_polynomial_format as _ffi_fmpz_mod_polynomial_format,
    fmpz_mod_polynomial_serialize as _ffi_fmpz_mod_polynomial_serialize,
    fmpz_mod_polynomial_deserialize as _ffi_fmpz_mod_polynomial_deserialize,
)
from sagejs.native import Integer, IntegerBuffer, UInt64Buffer, native, uint64


@native
def ffiFmpzPolynomialCreate(
    length: uint64,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial(
        length,
    )


@native
def ffiFmpzPolynomialSetCoefficient(
    polynomial: FmpzPolynomial,
    index: uint64,
    coefficient: Integer,
) -> bool:
    return _ffi_fmpz_polynomial_set_coefficient(
        polynomial,
        index,
        coefficient,
    )


@native
def ffiFmpzPolynomialSeal(
    polynomial: FmpzPolynomial,
) -> bool:
    return _ffi_fmpz_polynomial_seal(
        polynomial,
    )


@native
def ffiFmpzPolynomialLength(
    polynomial: FmpzPolynomial,
) -> Integer:
    return _ffi_fmpz_polynomial_length(
        polynomial,
    )


@native
def ffiFmpzPolynomialEqual(
    left: FmpzPolynomial,
    right: FmpzPolynomial,
) -> Integer:
    return _ffi_fmpz_polynomial_equal(
        left,
        right,
    )


@native
def ffiFmpzPolynomialCoefficient(
    polynomial: FmpzPolynomial,
    index: uint64,
) -> Integer:
    return _ffi_fmpz_polynomial_coefficient(
        polynomial,
        index,
    )


@native
def ffiFmpzPolynomialAdd(
    left: FmpzPolynomial,
    right: FmpzPolynomial,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_add(
        left,
        right,
    )


@native
def ffiFmpzPolynomialSub(
    left: FmpzPolynomial,
    right: FmpzPolynomial,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_sub(
        left,
        right,
    )


@native
def ffiFmpzPolynomialNeg(
    source: FmpzPolynomial,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_neg(
        source,
    )


@native
def ffiFmpzPolynomialScalarFloorDiv(
    source: FmpzPolynomial,
    divisor: Integer,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_scalar_floor_div(
        source,
        divisor,
    )


@native
def ffiFmpzPolynomialTruncate(
    source: FmpzPolynomial,
    stop: uint64,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_truncate(
        source,
        stop,
    )


@native
def ffiFmpzPolynomialCompose(
    outer: FmpzPolynomial,
    inner: FmpzPolynomial,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_compose(
        outer,
        inner,
    )


@native
def ffiFmpzPolynomialReverse(
    source: FmpzPolynomial,
    length: uint64,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_reverse(
        source,
        length,
    )


@native
def ffiFmpzPolynomialShiftLeft(
    source: FmpzPolynomial,
    amount: uint64,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_shift_left(
        source,
        amount,
    )


@native
def ffiFmpzPolynomialShiftRight(
    source: FmpzPolynomial,
    amount: uint64,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_shift_right(
        source,
        amount,
    )


@native
def ffiFmpzPolynomialIntegral(
    source: FmpzPolynomial,
) -> FmpqPolynomial:
    return _ffi_fmpz_polynomial_integral(
        source,
    )


@native
def ffiFmpzPolynomialResultant(
    left: FmpzPolynomial,
    right: FmpzPolynomial,
) -> Integer:
    return _ffi_fmpz_polynomial_resultant(
        left,
        right,
    )


@native
def ffiFmpzPolynomialDiscriminant(
    source: FmpzPolynomial,
) -> Integer:
    return _ffi_fmpz_polynomial_discriminant(
        source,
    )


@native
def ffiFmpzPolynomialDerivative(
    source: FmpzPolynomial,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_derivative(
        source,
    )


@native
def ffiFmpzPolynomialMul(
    left: FmpzPolynomial,
    right: FmpzPolynomial,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_mul(
        left,
        right,
    )


@native
def ffiFmpzPolynomialGcd(
    left: FmpzPolynomial,
    right: FmpzPolynomial,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_gcd(
        left,
        right,
    )


@native
def ffiFmpzPolynomialXgcdResource(
    left: FmpzPolynomial,
    right: FmpzPolynomial,
) -> FmpzPolynomialXgcdResult:
    return _ffi_fmpz_polynomial_xgcd_resource(
        left,
        right,
    )


@native
def ffiFmpzPolynomialXgcdResultGcd(
    xgcd: FmpzPolynomialXgcdResult,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_xgcd_result_gcd(
        xgcd,
    )


@native
def ffiFmpzPolynomialXgcdResultLeftCoefficient(
    xgcd: FmpzPolynomialXgcdResult,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_xgcd_result_left_coefficient(
        xgcd,
    )


@native
def ffiFmpzPolynomialXgcdResultRightCoefficient(
    xgcd: FmpzPolynomialXgcdResult,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_xgcd_result_right_coefficient(
        xgcd,
    )


@native
def ffiFmpzPolynomialFactorResource(
    source: FmpzPolynomial,
) -> ExactPolynomialFactorization:
    return _ffi_fmpz_polynomial_factor_resource(
        source,
    )


@native
def ffiFmpzPolynomialDivExact(
    dividend: FmpzPolynomial,
    divisor: FmpzPolynomial,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_divexact(
        dividend,
        divisor,
    )


@native
def ffiFmpzPolynomialQuoRemResource(
    dividend: FmpzPolynomial,
    divisor: FmpzPolynomial,
) -> FmpzPolynomialDivisionResult:
    return _ffi_fmpz_polynomial_quo_rem_resource(
        dividend,
        divisor,
    )


@native
def ffiFmpzPolynomialDivisionResultQuotient(
    division: FmpzPolynomialDivisionResult,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_division_result_quotient(
        division,
    )


@native
def ffiFmpzPolynomialDivisionResultRemainder(
    division: FmpzPolynomialDivisionResult,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_division_result_remainder(
        division,
    )


@native
def ffiFmpzPolynomialPow(
    source: FmpzPolynomial,
    exponent: uint64,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_pow(
        source,
        exponent,
    )


@native
def ffiFmpzPolynomialCyclotomic(
    order: uint64,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_cyclotomic(
        order,
    )


@native
def ffiFmpzPolynomialEvaluate(
    source: FmpzPolynomial,
    argument: Integer,
) -> Integer:
    return _ffi_fmpz_polynomial_evaluate(
        source,
        argument,
    )


@native
def ffiFmpzPolynomialEvaluateRational(
    source: FmpzPolynomial,
    numerator: Integer,
    denominator: Integer,
) -> FmpqValue:
    return _ffi_fmpz_polynomial_evaluate_rational(
        source,
        numerator,
        denominator,
    )


@native
def ffiFmpzPolynomialSerialize(
    source: FmpzPolynomial,
) -> FlintByteRegion:
    return _ffi_fmpz_polynomial_serialize(
        source,
    )


@native
def ffiFmpzPolynomialFormat(
    source: FmpzPolynomial,
) -> FlintByteRegion:
    return _ffi_fmpz_polynomial_format(
        source,
    )


@native
def ffiFmpzPolynomialDeserialize(
    payload: Integer,
    byte_length: uint64,
) -> FmpzPolynomial:
    return _ffi_fmpz_polynomial_deserialize(
        payload,
        byte_length,
    )


@native
def ffiFmpqPolynomialCreate(
    length: uint64,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial(
        length,
    )


@native
def ffiFmpqPolynomialSetCoefficient(
    polynomial: FmpqPolynomial,
    index: uint64,
    numerator: Integer,
    denominator: Integer,
) -> bool:
    return _ffi_fmpq_polynomial_set_coefficient(
        polynomial,
        index,
        numerator,
        denominator,
    )


@native
def ffiFmpqPolynomialSeal(
    polynomial: FmpqPolynomial,
) -> bool:
    return _ffi_fmpq_polynomial_seal(
        polynomial,
    )


@native
def ffiFmpqPolynomialLength(
    polynomial: FmpqPolynomial,
) -> Integer:
    return _ffi_fmpq_polynomial_length(
        polynomial,
    )


@native
def ffiFmpqPolynomialEqual(
    left: FmpqPolynomial,
    right: FmpqPolynomial,
) -> Integer:
    return _ffi_fmpq_polynomial_equal(
        left,
        right,
    )


@native
def ffiFmpqPolynomialCoefficientNumerator(
    polynomial: FmpqPolynomial,
    index: uint64,
) -> Integer:
    return _ffi_fmpq_polynomial_coefficient_numerator(
        polynomial,
        index,
    )


@native
def ffiFmpqPolynomialCoefficientDenominator(
    polynomial: FmpqPolynomial,
    index: uint64,
) -> Integer:
    return _ffi_fmpq_polynomial_coefficient_denominator(
        polynomial,
        index,
    )


@native
def ffiFmpqPolynomialAdd(
    left: FmpqPolynomial,
    right: FmpqPolynomial,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_add(
        left,
        right,
    )


@native
def ffiFmpqPolynomialSub(
    left: FmpqPolynomial,
    right: FmpqPolynomial,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_sub(
        left,
        right,
    )


@native
def ffiFmpqPolynomialNeg(
    source: FmpqPolynomial,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_neg(
        source,
    )


@native
def ffiFmpqPolynomialScalarDiv(
    source: FmpqPolynomial,
    numerator: Integer,
    denominator: Integer,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_scalar_div(
        source,
        numerator,
        denominator,
    )


@native
def ffiFmpqPolynomialTruncate(
    source: FmpqPolynomial,
    stop: uint64,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_truncate(
        source,
        stop,
    )


@native
def ffiFmpqPolynomialCompose(
    outer: FmpqPolynomial,
    inner: FmpqPolynomial,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_compose(
        outer,
        inner,
    )


@native
def ffiFmpqPolynomialReverse(
    source: FmpqPolynomial,
    length: uint64,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_reverse(
        source,
        length,
    )


@native
def ffiFmpqPolynomialShiftLeft(
    source: FmpqPolynomial,
    amount: uint64,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_shift_left(
        source,
        amount,
    )


@native
def ffiFmpqPolynomialShiftRight(
    source: FmpqPolynomial,
    amount: uint64,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_shift_right(
        source,
        amount,
    )


@native
def ffiFmpqPolynomialIntegral(
    source: FmpqPolynomial,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_integral(
        source,
    )


@native
def ffiFmpqPolynomialResultant(
    left: FmpqPolynomial,
    right: FmpqPolynomial,
) -> FmpqValue:
    return _ffi_fmpq_polynomial_resultant(
        left,
        right,
    )


@native
def ffiFmpqPolynomialDiscriminant(
    source: FmpqPolynomial,
) -> FmpqValue:
    return _ffi_fmpq_polynomial_discriminant(
        source,
    )


@native
def ffiFmpqPolynomialDerivative(
    source: FmpqPolynomial,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_derivative(
        source,
    )


@native
def ffiFmpqPolynomialMul(
    left: FmpqPolynomial,
    right: FmpqPolynomial,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_mul(
        left,
        right,
    )


@native
def ffiFmpqPolynomialGcd(
    left: FmpqPolynomial,
    right: FmpqPolynomial,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_gcd(
        left,
        right,
    )


@native
def ffiFmpqPolynomialXgcdResource(
    left: FmpqPolynomial,
    right: FmpqPolynomial,
) -> FmpqPolynomialXgcdResult:
    return _ffi_fmpq_polynomial_xgcd_resource(
        left,
        right,
    )


@native
def ffiFmpqPolynomialXgcdResultGcd(
    xgcd: FmpqPolynomialXgcdResult,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_xgcd_result_gcd(
        xgcd,
    )


@native
def ffiFmpqPolynomialXgcdResultLeftCoefficient(
    xgcd: FmpqPolynomialXgcdResult,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_xgcd_result_left_coefficient(
        xgcd,
    )


@native
def ffiFmpqPolynomialXgcdResultRightCoefficient(
    xgcd: FmpqPolynomialXgcdResult,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_xgcd_result_right_coefficient(
        xgcd,
    )


@native
def ffiFmpqPolynomialFactorResource(
    source: FmpqPolynomial,
) -> ExactPolynomialFactorization:
    return _ffi_fmpq_polynomial_factor_resource(
        source,
    )


@native
def ffiExactPolynomialFactorizationCount(
    factorization: ExactPolynomialFactorization,
) -> Integer:
    return _ffi_exact_polynomial_factorization_count(
        factorization,
    )


@native
def ffiExactPolynomialFactorizationExponent(
    factorization: ExactPolynomialFactorization,
    index: uint64,
) -> Integer:
    return _ffi_exact_polynomial_factorization_exponent(
        factorization,
        index,
    )


@native
def ffiExactPolynomialFactorizationUnitNumerator(
    factorization: ExactPolynomialFactorization,
) -> Integer:
    return _ffi_exact_polynomial_factorization_unit_numerator(
        factorization,
    )


@native
def ffiExactPolynomialFactorizationUnitDenominator(
    factorization: ExactPolynomialFactorization,
) -> Integer:
    return _ffi_exact_polynomial_factorization_unit_denominator(
        factorization,
    )


@native
def ffiExactPolynomialFactorizationFmpzFactor(
    factorization: ExactPolynomialFactorization,
    index: uint64,
) -> FmpzPolynomial:
    return _ffi_exact_polynomial_factorization_fmpz_factor(
        factorization,
        index,
    )


@native
def ffiExactPolynomialFactorizationFmpqFactor(
    factorization: ExactPolynomialFactorization,
    index: uint64,
) -> FmpqPolynomial:
    return _ffi_exact_polynomial_factorization_fmpq_factor(
        factorization,
        index,
    )


@native
def ffiFmpqPolynomialDivExact(
    dividend: FmpqPolynomial,
    divisor: FmpqPolynomial,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_divexact(
        dividend,
        divisor,
    )


@native
def ffiFmpqPolynomialQuoRemResource(
    dividend: FmpqPolynomial,
    divisor: FmpqPolynomial,
) -> FmpqPolynomialDivisionResult:
    return _ffi_fmpq_polynomial_quo_rem_resource(
        dividend,
        divisor,
    )


@native
def ffiFmpqPolynomialDivisionResultQuotient(
    division: FmpqPolynomialDivisionResult,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_division_result_quotient(
        division,
    )


@native
def ffiFmpqPolynomialDivisionResultRemainder(
    division: FmpqPolynomialDivisionResult,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_division_result_remainder(
        division,
    )


@native
def ffiFmpqPolynomialPow(
    source: FmpqPolynomial,
    exponent: uint64,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_pow(
        source,
        exponent,
    )


@native
def ffiFmpqPolynomialEvaluate(
    source: FmpqPolynomial,
    numerator: Integer,
    denominator: Integer,
) -> FmpqValue:
    return _ffi_fmpq_polynomial_evaluate(
        source,
        numerator,
        denominator,
    )


@native
def ffiFmpqPolynomialSerialize(
    source: FmpqPolynomial,
) -> FlintByteRegion:
    return _ffi_fmpq_polynomial_serialize(
        source,
    )


@native
def ffiFmpqPolynomialFormat(
    source: FmpqPolynomial,
) -> FlintByteRegion:
    return _ffi_fmpq_polynomial_format(
        source,
    )


@native
def ffiFmpqPolynomialDeserialize(
    payload: Integer,
    byte_length: uint64,
) -> FmpqPolynomial:
    return _ffi_fmpq_polynomial_deserialize(
        payload,
        byte_length,
    )


@native
def ffiFmpzMatrixCreate(
    rows: uint64,
    columns: uint64,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix(
        rows,
        columns,
    )


@native
def ffiFmpzMatrixNrows(
    matrix: FmpzMatrix,
) -> uint64:
    return _ffi_fmpz_matrix_nrows(
        matrix,
    )


@native
def ffiFmpzMatrixNcols(
    matrix: FmpzMatrix,
) -> uint64:
    return _ffi_fmpz_matrix_ncols(
        matrix,
    )


@native
def ffiFmpzMatrixSetEntry(
    matrix: FmpzMatrix,
    row: uint64,
    column: uint64,
    entry: Integer,
) -> bool:
    return _ffi_fmpz_matrix_set_entry(
        matrix,
        row,
        column,
        entry,
    )


@native
def ffiFmpzMatrixEntry(
    matrix: FmpzMatrix,
    row: uint64,
    column: uint64,
) -> Integer:
    return _ffi_fmpz_matrix_entry(
        matrix,
        row,
        column,
    )


@native
def ffiFmpzMatrixExportModUi(
    source: FmpzMatrix,
    modulus: uint64,
    width: uint64,
) -> FlintByteRegion:
    return _ffi_fmpz_matrix_export_mod_ui(
        source,
        modulus,
        width,
    )


@native
def ffiFmpzMatrixCopy(
    source: FmpzMatrix,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_copy(
        source,
    )


@native
def ffiFmpzMatrixNeg(
    source: FmpzMatrix,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_neg(
        source,
    )


@native
def ffiFmpzMatrixScalarMul(
    source: FmpzMatrix,
    scalar: Integer,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_scalar_mul(
        source,
        scalar,
    )


@native
def ffiFmpzMatrixEqual(
    left: FmpzMatrix,
    right: FmpzMatrix,
) -> bool:
    return _ffi_fmpz_matrix_equal(
        left,
        right,
    )


@native
def ffiFmpzMatrixIsZero(
    matrix: FmpzMatrix,
) -> bool:
    return _ffi_fmpz_matrix_is_zero(
        matrix,
    )


@native
def ffiFmpzMatrixIsOne(
    matrix: FmpzMatrix,
) -> bool:
    return _ffi_fmpz_matrix_is_one(
        matrix,
    )


@native
def ffiFmpzMatrixAdd(
    left: FmpzMatrix,
    right: FmpzMatrix,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_add(
        left,
        right,
    )


@native
def ffiFmpzMatrixSub(
    left: FmpzMatrix,
    right: FmpzMatrix,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_sub(
        left,
        right,
    )


@native
def ffiFmpzMatrixTranspose(
    source: FmpzMatrix,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_transpose(
        source,
    )


@native
def ffiFmpzMatrixMul(
    left: FmpzMatrix,
    right: FmpzMatrix,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_mul(
        left,
        right,
    )


@native
def ffiFmpzMatrixMulVector(
    matrix: FmpzMatrix,
    vector: FlintByteRegion,
) -> FlintByteRegion:
    return _ffi_fmpz_matrix_mul_vector(
        matrix,
        vector,
    )


@native
def ffiFmpzVectorMulMatrix(
    vector: FlintByteRegion,
    matrix: FmpzMatrix,
) -> FlintByteRegion:
    return _ffi_fmpz_vector_mul_matrix(
        vector,
        matrix,
    )


@native
def ffiFmpzMatrixPow(
    source: FmpzMatrix,
    exponent: uint64,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_pow(
        source,
        exponent,
    )


@native
def ffiFmpzMatrixRank(
    matrix: FmpzMatrix,
) -> uint64:
    return _ffi_fmpz_matrix_rank(
        matrix,
    )


@native
def ffiFmpzMatrixRankMod46337(
    matrix: FmpzMatrix,
) -> uint64:
    return _ffi_fmpz_matrix_rank_mod_46337(
        matrix,
    )


@native
def ffiFmpzMatrixDet(
    source: FmpzMatrix,
) -> Integer:
    return _ffi_fmpz_matrix_det(
        source,
    )


@native
def ffiFmpzMatrixTrace(
    source: FmpzMatrix,
) -> Integer:
    return _ffi_fmpz_matrix_trace(
        source,
    )


@native
def ffiFmpzMatrixHnf(
    source: FmpzMatrix,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_hnf(
        source,
    )


@native
def ffiFmpzMatrixSnf(
    source: FmpzMatrix,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_snf(
        source,
    )


@native
def ffiFmpzMatrixHnfTransform(
    hermite: FmpzMatrix,
    transform: FmpzMatrix,
    source: FmpzMatrix,
) -> bool:
    return _ffi_fmpz_matrix_hnf_transform(
        hermite,
        transform,
        source,
    )


@native
def ffiFmpzMatrixSnfTransform(
    smith: FmpzMatrix,
    left_transform: FmpzMatrix,
    right_transform: FmpzMatrix,
    source: FmpzMatrix,
) -> bool:
    return _ffi_fmpz_matrix_snf_transform(
        smith,
        left_transform,
        right_transform,
        source,
    )


@native
def ffiFmpzMatrixRightKernel(
    source: FmpzMatrix,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_right_kernel(
        source,
    )


@native
def ffiFmpzMatrixCharpoly(
    source: FmpzMatrix,
) -> FmpzPolynomial:
    return _ffi_fmpz_matrix_charpoly(
        source,
    )


@native
def ffiFmpzMatrixMinpoly(
    source: FmpzMatrix,
) -> FmpzPolynomial:
    return _ffi_fmpz_matrix_minpoly(
        source,
    )


@native
def ffiFmpqMatrixFromFmpz(
    source: FmpzMatrix,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_from_fmpz(
        source,
    )


@native
def ffiFmpzMatrixFromFmpqIntegral(
    source: FmpqMatrix,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_from_fmpq_integral(
        source,
    )


@native
def ffiFmpzMatrixSubmatrix(
    source: FmpzMatrix,
    row_start: uint64,
    row_stop: uint64,
    column_start: uint64,
    column_stop: uint64,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_submatrix(
        source,
        row_start,
        row_stop,
        column_start,
        column_stop,
    )


@native
def ffiFmpzMatrixSelectRows(
    source: FmpzMatrix,
    indices: UInt64Buffer,
    count: uint64,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_select_rows(
        source,
        indices,
        count,
    )


@native
def ffiFmpzMatrixSelectColumns(
    source: FmpzMatrix,
    indices: UInt64Buffer,
    count: uint64,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_select_columns(
        source,
        indices,
        count,
    )


@native
def ffiFmpzMatrixSwapRows(
    matrix: FmpzMatrix,
    first: uint64,
    second: uint64,
) -> bool:
    return _ffi_fmpz_matrix_swap_rows(
        matrix,
        first,
        second,
    )


@native
def ffiFmpzMatrixSwapColumns(
    matrix: FmpzMatrix,
    first: uint64,
    second: uint64,
) -> bool:
    return _ffi_fmpz_matrix_swap_columns(
        matrix,
        first,
        second,
    )


@native
def ffiFmpzMatrixSetBlock(
    target: FmpzMatrix,
    target_row: uint64,
    target_column: uint64,
    source: FmpzMatrix,
) -> bool:
    return _ffi_fmpz_matrix_set_block(
        target,
        target_row,
        target_column,
        source,
    )


@native
def ffiFmpzMatrixStack(
    top: FmpzMatrix,
    bottom: FmpzMatrix,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_stack(
        top,
        bottom,
    )


@native
def ffiFmpzMatrixAugment(
    left: FmpzMatrix,
    right: FmpzMatrix,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_augment(
        left,
        right,
    )


@native
def ffiFmpzMatrixNonzeroCount(
    source: FmpzMatrix,
) -> uint64:
    return _ffi_fmpz_matrix_nonzero_count(
        source,
    )


@native
def ffiFmpzMatrixFormat(
    source: FmpzMatrix,
) -> FlintByteRegion:
    return _ffi_fmpz_matrix_format(
        source,
    )


@native
def ffiFmpzMatrixSerialize(
    source: FmpzMatrix,
) -> FlintByteRegion:
    return _ffi_fmpz_matrix_serialize(
        source,
    )


@native
def ffiFmpzMatrixSerializeSequence(
    source: FmpzMatrix,
    start: uint64,
    stride: uint64,
    count: uint64,
) -> FlintByteRegion:
    return _ffi_fmpz_matrix_serialize_sequence(
        source,
        start,
        stride,
        count,
    )


@native
def ffiFlintByteRegionCreate(
    length: uint64,
) -> FlintByteRegion:
    return _ffi_flint_byte_region(
        length,
    )


@native
def ffiFlintByteRegionSet(
    region: FlintByteRegion,
    index: uint64,
    value: uint64,
) -> bool:
    return _ffi_flint_byte_region_set(
        region,
        index,
        value,
    )


@native
def ffiFmpzMatrixDeserialize(
    source: FlintByteRegion,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_deserialize(
        source,
    )


@native
def ffiFmpzMatrixDeserializeEntries(
    source: FlintByteRegion,
    rows: uint64,
    columns: uint64,
) -> FmpzMatrix:
    return _ffi_fmpz_matrix_deserialize_entries(
        source,
        rows,
        columns,
    )


@native
def ffiFmpqMatrixCreate(
    rows: uint64,
    columns: uint64,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix(
        rows,
        columns,
    )


@native
def ffiFmpqMatrixRandbits(
    rows: uint64,
    columns: uint64,
    bits: uint64,
    seed1: uint64,
    seed2: uint64,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_randbits(
        rows,
        columns,
        bits,
        seed1,
        seed2,
    )


@native
def ffiFmpqMatrixNrows(
    matrix: FmpqMatrix,
) -> uint64:
    return _ffi_fmpq_matrix_nrows(
        matrix,
    )


@native
def ffiFmpqMatrixNcols(
    matrix: FmpqMatrix,
) -> uint64:
    return _ffi_fmpq_matrix_ncols(
        matrix,
    )


@native
def ffiFmpqMatrixSetEntry(
    matrix: FmpqMatrix,
    row: uint64,
    column: uint64,
    numerator: Integer,
    denominator: Integer,
) -> bool:
    return _ffi_fmpq_matrix_set_entry(
        matrix,
        row,
        column,
        numerator,
        denominator,
    )


@native
def ffiFmpqMatrixAddScaledEntry(
    matrix: FmpqMatrix,
    row: uint64,
    column: uint64,
    numerator: Integer,
    denominator: Integer,
    scale: Integer,
) -> bool:
    return _ffi_fmpq_matrix_add_scaled_entry(
        matrix,
        row,
        column,
        numerator,
        denominator,
        scale,
    )


@native
def ffiFmpqMatrixEntryNumerator(
    matrix: FmpqMatrix,
    row: uint64,
    column: uint64,
) -> Integer:
    return _ffi_fmpq_matrix_entry_numerator(
        matrix,
        row,
        column,
    )


@native
def ffiFmpqMatrixEntryDenominator(
    matrix: FmpqMatrix,
    row: uint64,
    column: uint64,
) -> Integer:
    return _ffi_fmpq_matrix_entry_denominator(
        matrix,
        row,
        column,
    )


@native
def ffiFmpqMatrixEntryIsZero(
    matrix: FmpqMatrix,
    row: uint64,
    column: uint64,
) -> bool:
    return _ffi_fmpq_matrix_entry_is_zero(
        matrix,
        row,
        column,
    )


@native
def ffiFmpqMatrixCopy(
    source: FmpqMatrix,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_copy(
        source,
    )


@native
def ffiFmpqMatrixNeg(
    source: FmpqMatrix,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_neg(
        source,
    )


@native
def ffiFmpqMatrixScalarMul(
    source: FmpqMatrix,
    numerator: Integer,
    denominator: Integer,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_scalar_mul(
        source,
        numerator,
        denominator,
    )


@native
def ffiFmpqMatrixEqual(
    left: FmpqMatrix,
    right: FmpqMatrix,
) -> bool:
    return _ffi_fmpq_matrix_equal(
        left,
        right,
    )


@native
def ffiFmpqMatrixIsZero(
    matrix: FmpqMatrix,
) -> bool:
    return _ffi_fmpq_matrix_is_zero(
        matrix,
    )


@native
def ffiFmpqMatrixIsOne(
    matrix: FmpqMatrix,
) -> bool:
    return _ffi_fmpq_matrix_is_one(
        matrix,
    )


@native
def ffiFmpqMatrixAdd(
    left: FmpqMatrix,
    right: FmpqMatrix,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_add(
        left,
        right,
    )


@native
def ffiFmpqMatrixSub(
    left: FmpqMatrix,
    right: FmpqMatrix,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_sub(
        left,
        right,
    )


@native
def ffiFmpqMatrixTranspose(
    source: FmpqMatrix,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_transpose(
        source,
    )


@native
def ffiFmpqMatrixMul(
    left: FmpqMatrix,
    right: FmpqMatrix,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_mul(
        left,
        right,
    )


@native
def ffiFmpqMatrixMulVector(
    matrix: FmpqMatrix,
    vector: FlintByteRegion,
) -> FlintByteRegion:
    return _ffi_fmpq_matrix_mul_vector(
        matrix,
        vector,
    )


@native
def ffiFmpqVectorMulMatrix(
    vector: FlintByteRegion,
    matrix: FmpqMatrix,
) -> FlintByteRegion:
    return _ffi_fmpq_vector_mul_matrix(
        vector,
        matrix,
    )


@native
def ffiFmpqMatrixInv(
    source: FmpqMatrix,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_inv(
        source,
    )


@native
def ffiFmpqMatrixSolve(
    left: FmpqMatrix,
    right: FmpqMatrix,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_solve(
        left,
        right,
    )


@native
def ffiFmpqMatrixRref(
    source: FmpqMatrix,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_rref(
        source,
    )


@native
def ffiFmpqMatrixRightKernel(
    source: FmpqMatrix,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_right_kernel(
        source,
    )


@native
def ffiFmpqMatrixCharpoly(
    source: FmpqMatrix,
) -> FmpqPolynomial:
    return _ffi_fmpq_matrix_charpoly(
        source,
    )


@native
def ffiFmpqMatrixMinpoly(
    source: FmpqMatrix,
) -> FmpqPolynomial:
    return _ffi_fmpq_matrix_minpoly(
        source,
    )


@native
def ffiFmpqMatrixRank(
    matrix: FmpqMatrix,
) -> uint64:
    return _ffi_fmpq_matrix_rank(
        matrix,
    )


@native
def ffiFmpqMatrixDet(
    source: FmpqMatrix,
) -> FmpqValue:
    return _ffi_fmpq_matrix_det(
        source,
    )


@native
def ffiFmpqMatrixTrace(
    source: FmpqMatrix,
) -> FmpqValue:
    return _ffi_fmpq_matrix_trace(
        source,
    )


@native
def ffiFmpqMatrixSubmatrix(
    source: FmpqMatrix,
    row_start: uint64,
    row_stop: uint64,
    column_start: uint64,
    column_stop: uint64,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_submatrix(
        source,
        row_start,
        row_stop,
        column_start,
        column_stop,
    )


@native
def ffiFmpqMatrixSelectRows(
    source: FmpqMatrix,
    indices: UInt64Buffer,
    count: uint64,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_select_rows(
        source,
        indices,
        count,
    )


@native
def ffiFmpqMatrixSelectColumns(
    source: FmpqMatrix,
    indices: UInt64Buffer,
    count: uint64,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_select_columns(
        source,
        indices,
        count,
    )


@native
def ffiFmpqMatrixSwapRows(
    matrix: FmpqMatrix,
    first: uint64,
    second: uint64,
) -> bool:
    return _ffi_fmpq_matrix_swap_rows(
        matrix,
        first,
        second,
    )


@native
def ffiFmpqMatrixSwapColumns(
    matrix: FmpqMatrix,
    first: uint64,
    second: uint64,
) -> bool:
    return _ffi_fmpq_matrix_swap_columns(
        matrix,
        first,
        second,
    )


@native
def ffiFmpqMatrixSetBlock(
    target: FmpqMatrix,
    target_row: uint64,
    target_column: uint64,
    source: FmpqMatrix,
) -> bool:
    return _ffi_fmpq_matrix_set_block(
        target,
        target_row,
        target_column,
        source,
    )


@native
def ffiFmpqMatrixStack(
    top: FmpqMatrix,
    bottom: FmpqMatrix,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_stack(
        top,
        bottom,
    )


@native
def ffiFmpqMatrixAugment(
    left: FmpqMatrix,
    right: FmpqMatrix,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_augment(
        left,
        right,
    )


@native
def ffiFmpqMatrixNonzeroCount(
    source: FmpqMatrix,
) -> uint64:
    return _ffi_fmpq_matrix_nonzero_count(
        source,
    )


@native
def ffiFmpqValueNumerator(
    value: FmpqValue,
) -> Integer:
    return _ffi_fmpq_value_numerator(
        value,
    )


@native
def ffiFmpqValueDenominator(
    value: FmpqValue,
) -> Integer:
    return _ffi_fmpq_value_denominator(
        value,
    )


@native
def ffiFmpqMatrixFormat(
    source: FmpqMatrix,
) -> FlintByteRegion:
    return _ffi_fmpq_matrix_format(
        source,
    )


@native
def ffiFmpqMatrixSerialize(
    source: FmpqMatrix,
) -> FlintByteRegion:
    return _ffi_fmpq_matrix_serialize(
        source,
    )


@native
def ffiFmpqMatrixSerializeSequence(
    source: FmpqMatrix,
    start: uint64,
    stride: uint64,
    count: uint64,
) -> FlintByteRegion:
    return _ffi_fmpq_matrix_serialize_sequence(
        source,
        start,
        stride,
        count,
    )


@native
def ffiFmpqMatrixDeserialize(
    source: FlintByteRegion,
    rows: uint64,
    columns: uint64,
) -> FmpqMatrix:
    return _ffi_fmpq_matrix_deserialize(
        source,
        rows,
        columns,
    )


@native
def ffiFlintByteRegionLength(
    region: FlintByteRegion,
) -> uint64:
    return _ffi_flint_byte_region_length(
        region,
    )


@native
def ffiFlintByteRegionGet(
    region: FlintByteRegion,
    index: uint64,
) -> uint64:
    return _ffi_flint_byte_region_get(
        region,
        index,
    )


@native
def ffiDirichletGroupCreate(
    modulus: uint64,
) -> DirichletGroup:
    return _ffi_dirichlet_group(
        modulus,
    )


@native
def ffiDirichletGroupSize(
    group: DirichletGroup,
) -> uint64:
    return _ffi_dirichlet_group_size(
        group,
    )


@native
def ffiDirichletGroupNumPrimitive(
    group: DirichletGroup,
) -> uint64:
    return _ffi_dirichlet_group_num_primitive(
        group,
    )


@native
def wordIsPrime(
    value: uint64,
) -> bool:
    return _ffi_n_is_prime(
        value,
    )


@native
def gcd(
    left: Integer,
    right: Integer,
) -> Integer:
    return _ffi_fmpz_gcd(
        left,
        right,
    )


@native
def ffiFmpzMatRank(
    entries: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> uint64:
    return _ffi_fmpz_mat_rank(
        entries,
        rows,
        columns,
    )


@native
def ffiFmpzMatMul(
    output: IntegerBuffer,
    left: IntegerBuffer,
    right: IntegerBuffer,
    left_rows: uint64,
    inner: uint64,
    right_columns: uint64,
) -> bool:
    return _ffi_fmpz_mat_mul(
        output,
        left,
        right,
        left_rows,
        inner,
        right_columns,
    )


@native
def ffiFmpzMatDet(
    output: IntegerBuffer,
    source: IntegerBuffer,
    size: uint64,
    one: uint64,
) -> bool:
    return _ffi_fmpz_mat_det(
        output,
        source,
        size,
        one,
    )


@native
def ffiFmpzMatCharpoly(
    output: IntegerBuffer,
    source: IntegerBuffer,
    output_length: uint64,
    size: uint64,
    one: uint64,
) -> bool:
    return _ffi_fmpz_mat_charpoly(
        output,
        source,
        output_length,
        size,
        one,
    )


@native
def ffiFmpzMatHnf(
    output: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    return _ffi_fmpz_mat_hnf(
        output,
        source,
        rows,
        columns,
    )


@native
def ffiFmpzMatHnfTransform(
    output: IntegerBuffer,
    transform: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    return _ffi_fmpz_mat_hnf_transform(
        output,
        transform,
        source,
        rows,
        columns,
    )


@native
def ffiFmpzMatSnfTransform(
    output: IntegerBuffer,
    left_transform: IntegerBuffer,
    right_transform: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    return _ffi_fmpz_mat_snf_transform(
        output,
        left_transform,
        right_transform,
        source,
        rows,
        columns,
    )


@native
def ffiFmpzMatRightKernel(
    output: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> uint64:
    return _ffi_fmpz_mat_right_kernel(
        output,
        source,
        rows,
        columns,
    )


@native
def ffiFmpqMatRank(
    rank: IntegerBuffer,
    numerators: IntegerBuffer,
    denominators: IntegerBuffer,
    rows: uint64,
    columns: uint64,
    one: uint64,
) -> bool:
    return _ffi_fmpq_mat_rank(
        rank,
        numerators,
        denominators,
        rows,
        columns,
        one,
    )


@native
def ffiFmpqMatMul(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
    left_rows: uint64,
    inner: uint64,
    right_columns: uint64,
) -> bool:
    return _ffi_fmpq_mat_mul(
        output_numerators,
        output_denominators,
        left_numerators,
        left_denominators,
        right_numerators,
        right_denominators,
        left_rows,
        inner,
        right_columns,
    )


@native
def ffiFmpqMatRref(
    rank: IntegerBuffer,
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    rows: uint64,
    columns: uint64,
    one: uint64,
) -> bool:
    return _ffi_fmpq_mat_rref(
        rank,
        output_numerators,
        output_denominators,
        source_numerators,
        source_denominators,
        rows,
        columns,
        one,
    )


@native
def ffiFmpqMatInv(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    size: uint64,
) -> bool:
    return _ffi_fmpq_mat_inv(
        output_numerators,
        output_denominators,
        source_numerators,
        source_denominators,
        size,
    )


@native
def ffiFmpqMatSolve(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
    size: uint64,
    right_columns: uint64,
) -> bool:
    return _ffi_fmpq_mat_solve(
        output_numerators,
        output_denominators,
        left_numerators,
        left_denominators,
        right_numerators,
        right_denominators,
        size,
        right_columns,
    )


@native
def ffiFmpqMatDet(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    size: uint64,
    one: uint64,
) -> bool:
    return _ffi_fmpq_mat_det(
        output_numerators,
        output_denominators,
        source_numerators,
        source_denominators,
        size,
        one,
    )


@native
def ffiFmpqMatCharpoly(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    coefficient_count: uint64,
    size: uint64,
    one: uint64,
) -> bool:
    return _ffi_fmpq_mat_charpoly(
        output_numerators,
        output_denominators,
        source_numerators,
        source_denominators,
        coefficient_count,
        size,
        one,
    )


@native
def ffiNmodMatrixFromEntries(
    entries: UInt64Buffer,
    entry_count: uint64,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> NmodMatrix:
    return _ffi_nmod_matrix_from_entries(
        entries,
        entry_count,
        rows,
        columns,
        modulus,
    )


@native
def ffiNmodMatrixRandom(
    rows: uint64,
    columns: uint64,
    modulus: uint64,
    seed1: uint64,
    seed2: uint64,
) -> NmodMatrix:
    return _ffi_nmod_matrix_random(
        rows,
        columns,
        modulus,
        seed1,
        seed2,
    )


@native
def ffiNmodMatrixNrows(
    matrix: NmodMatrix,
) -> uint64:
    return _ffi_nmod_matrix_nrows(
        matrix,
    )


@native
def ffiNmodMatrixNcols(
    matrix: NmodMatrix,
) -> uint64:
    return _ffi_nmod_matrix_ncols(
        matrix,
    )


@native
def ffiNmodMatrixModulus(
    matrix: NmodMatrix,
) -> uint64:
    return _ffi_nmod_matrix_modulus(
        matrix,
    )


@native
def ffiNmodMatrixEntry(
    matrix: NmodMatrix,
    row: uint64,
    column: uint64,
) -> uint64:
    return _ffi_nmod_matrix_entry(
        matrix,
        row,
        column,
    )


@native
def ffiNmodMatrixSetEntry(
    matrix: NmodMatrix,
    row: uint64,
    column: uint64,
    value: uint64,
) -> bool:
    return _ffi_nmod_matrix_set_entry(
        matrix,
        row,
        column,
        value,
    )


@native
def ffiNmodMatrixCopy(
    source: NmodMatrix,
) -> NmodMatrix:
    return _ffi_nmod_matrix_copy(
        source,
    )


@native
def ffiNmodMatrixEqual(
    left: NmodMatrix,
    right: NmodMatrix,
) -> bool:
    return _ffi_nmod_matrix_equal(
        left,
        right,
    )


@native
def ffiNmodMatrixIsZero(
    matrix: NmodMatrix,
) -> bool:
    return _ffi_nmod_matrix_is_zero(
        matrix,
    )


@native
def ffiNmodMatrixIsOne(
    matrix: NmodMatrix,
) -> bool:
    return _ffi_nmod_matrix_is_one(
        matrix,
    )


@native
def ffiNmodMatrixNonzeroCount(
    matrix: NmodMatrix,
) -> uint64:
    return _ffi_nmod_matrix_nonzero_count(
        matrix,
    )


@native
def ffiNmodMatrixAdd(
    left: NmodMatrix,
    right: NmodMatrix,
) -> NmodMatrix:
    return _ffi_nmod_matrix_add(
        left,
        right,
    )


@native
def ffiNmodMatrixSub(
    left: NmodMatrix,
    right: NmodMatrix,
) -> NmodMatrix:
    return _ffi_nmod_matrix_sub(
        left,
        right,
    )


@native
def ffiNmodMatrixNeg(
    source: NmodMatrix,
) -> NmodMatrix:
    return _ffi_nmod_matrix_neg(
        source,
    )


@native
def ffiNmodMatrixScalarMul(
    source: NmodMatrix,
    scalar: uint64,
) -> NmodMatrix:
    return _ffi_nmod_matrix_scalar_mul(
        source,
        scalar,
    )


@native
def ffiNmodMatrixTranspose(
    source: NmodMatrix,
) -> NmodMatrix:
    return _ffi_nmod_matrix_transpose(
        source,
    )


@native
def ffiNmodMatrixMul(
    left: NmodMatrix,
    right: NmodMatrix,
) -> NmodMatrix:
    return _ffi_nmod_matrix_mul(
        left,
        right,
    )


@native
def ffiNmodMatrixInv(
    source: NmodMatrix,
) -> NmodMatrix:
    return _ffi_nmod_matrix_inv(
        source,
    )


@native
def ffiNmodMatrixSolve(
    left: NmodMatrix,
    right: NmodMatrix,
) -> NmodMatrix:
    return _ffi_nmod_matrix_solve(
        left,
        right,
    )


@native
def ffiNmodMatrixRank(
    matrix: NmodMatrix,
) -> uint64:
    return _ffi_nmod_matrix_rank(
        matrix,
    )


@native
def ffiNmodMatrixRref(
    source: NmodMatrix,
) -> NmodMatrix:
    return _ffi_nmod_matrix_rref(
        source,
    )


@native
def ffiNmodMatrixRightKernel(
    source: NmodMatrix,
) -> NmodMatrix:
    return _ffi_nmod_matrix_right_kernel(
        source,
    )


@native
def ffiNmodMatrixDet(
    source: NmodMatrix,
) -> uint64:
    return _ffi_nmod_matrix_det(
        source,
    )


@native
def ffiNmodMatrixTrace(
    source: NmodMatrix,
) -> uint64:
    return _ffi_nmod_matrix_trace(
        source,
    )


@native
def ffiNmodMatrixSwapRows(
    matrix: NmodMatrix,
    first: uint64,
    second: uint64,
) -> bool:
    return _ffi_nmod_matrix_swap_rows(
        matrix,
        first,
        second,
    )


@native
def ffiNmodMatrixSwapColumns(
    matrix: NmodMatrix,
    first: uint64,
    second: uint64,
) -> bool:
    return _ffi_nmod_matrix_swap_columns(
        matrix,
        first,
        second,
    )


@native
def ffiNmodMatrixFormat(
    source: NmodMatrix,
) -> FlintByteRegion:
    return _ffi_nmod_matrix_format(
        source,
    )


@native
def ffiNmodMatrixSerialize(
    source: NmodMatrix,
    width: uint64,
) -> FlintByteRegion:
    return _ffi_nmod_matrix_serialize(
        source,
        width,
    )


@native
def ffiNmodMatrixCharpoly(
    source: NmodMatrix,
) -> FlintByteRegion:
    return _ffi_nmod_matrix_charpoly(
        source,
    )


@native
def ffiNmodMatrixMinpoly(
    source: NmodMatrix,
) -> FlintByteRegion:
    return _ffi_nmod_matrix_minpoly(
        source,
    )


@native
def ffiNmodMatRank(
    entries: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> uint64:
    return _ffi_nmod_mat_rank(
        entries,
        rows,
        columns,
        modulus,
    )


@native
def ffiNmodMatDet(
    source: UInt64Buffer,
    size: uint64,
    modulus: uint64,
) -> uint64:
    return _ffi_nmod_mat_det(
        source,
        size,
        modulus,
    )


@native
def ffiNmodMatCharpoly(
    output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    size: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_mat_charpoly(
        output,
        source,
        output_length,
        source_length,
        size,
        modulus,
    )


@native
def ffiNmodMatMinpoly(
    output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    size: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_mat_minpoly(
        output,
        source,
        output_length,
        source_length,
        size,
        modulus,
    )


@native
def ffiNmodMatInv(
    output: UInt64Buffer,
    source: UInt64Buffer,
    size: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_mat_inv(
        output,
        source,
        size,
        modulus,
    )


@native
def ffiNmodMatRref(
    output: UInt64Buffer,
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> uint64:
    return _ffi_nmod_mat_rref(
        output,
        source,
        rows,
        columns,
        modulus,
    )


@native
def ffiNmodMatMul(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    left_rows: uint64,
    inner: uint64,
    right_columns: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_mat_mul(
        output,
        left,
        right,
        left_rows,
        inner,
        right_columns,
        modulus,
    )


@native
def ffiNmodMatRightKernel(
    output: UInt64Buffer,
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> uint64:
    return _ffi_nmod_mat_right_kernel(
        output,
        source,
        rows,
        columns,
        modulus,
    )


@native
def ffiNmodMatSolve(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    size: uint64,
    right_columns: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_mat_solve(
        output,
        left,
        right,
        size,
        right_columns,
        modulus,
    )


@native
def ffiFmpzPolyMul(
    output: IntegerBuffer,
    left: IntegerBuffer,
    right: IntegerBuffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    one: uint64,
) -> bool:
    return _ffi_fmpz_poly_mul(
        output,
        left,
        right,
        output_length,
        left_length,
        right_length,
        one,
    )


@native
def ffiFmpqPolyMul(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    one: uint64,
) -> bool:
    return _ffi_fmpq_poly_mul(
        output_numerators,
        output_denominators,
        left_numerators,
        left_denominators,
        right_numerators,
        right_denominators,
        output_length,
        left_length,
        right_length,
        one,
    )


@native
def ffiNmodPolyAdd(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_add(
        output,
        left,
        right,
        output_length,
        left_length,
        right_length,
        modulus,
    )


@native
def ffiNmodPolySub(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_sub(
        output,
        left,
        right,
        output_length,
        left_length,
        right_length,
        modulus,
    )


@native
def ffiNmodPolyNeg(
    output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_neg(
        output,
        source,
        output_length,
        source_length,
        modulus,
    )


@native
def ffiNmodPolyEqual(
    left: UInt64Buffer,
    right: UInt64Buffer,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_equal(
        left,
        right,
        left_length,
        right_length,
        modulus,
    )


@native
def ffiNmodPolyDerivative(
    output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_derivative(
        output,
        source,
        output_length,
        source_length,
        modulus,
    )


@native
def ffiNmodPolyEvaluate(
    output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    argument: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_evaluate(
        output,
        source,
        output_length,
        source_length,
        argument,
        modulus,
    )


@native
def ffiNmodPolyCompose(
    output: UInt64Buffer,
    outer: UInt64Buffer,
    inner: UInt64Buffer,
    output_length: uint64,
    outer_length: uint64,
    inner_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_compose(
        output,
        outer,
        inner,
        output_length,
        outer_length,
        inner_length,
        modulus,
    )


@native
def ffiNmodPolyReverse(
    output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    reverse_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_reverse(
        output,
        source,
        output_length,
        source_length,
        reverse_length,
        modulus,
    )


@native
def ffiNmodPolyShiftLeft(
    output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    amount: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_shift_left(
        output,
        source,
        output_length,
        source_length,
        amount,
        modulus,
    )


@native
def ffiNmodPolyShiftRight(
    output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    amount: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_shift_right(
        output,
        source,
        output_length,
        source_length,
        amount,
        modulus,
    )


@native
def ffiNmodPolyTruncate(
    output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    stop: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_truncate(
        output,
        source,
        output_length,
        source_length,
        stop,
        modulus,
    )


@native
def ffiNmodPolyIntegral(
    output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_integral(
        output,
        source,
        output_length,
        source_length,
        modulus,
    )


@native
def ffiNmodPolyResultant(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    one: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_resultant(
        output,
        left,
        right,
        one,
        left_length,
        right_length,
        modulus,
    )


@native
def ffiNmodPolyDiscriminant(
    output: UInt64Buffer,
    source: UInt64Buffer,
    one: uint64,
    source_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_discriminant(
        output,
        source,
        one,
        source_length,
        modulus,
    )


@native
def ffiNmodPolyMul(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_mul(
        output,
        left,
        right,
        output_length,
        left_length,
        right_length,
        modulus,
    )


@native
def ffiNmodPolyDivExact(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_divexact(
        output,
        left,
        right,
        output_length,
        left_length,
        right_length,
        modulus,
    )


@native
def ffiNmodPolyDivRem(
    quotient: UInt64Buffer,
    remainder: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    quotient_length: uint64,
    remainder_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_divrem(
        quotient,
        remainder,
        left,
        right,
        quotient_length,
        remainder_length,
        left_length,
        right_length,
        modulus,
    )


@native
def ffiFmpzPolyDivExact(
    output: IntegerBuffer,
    left: IntegerBuffer,
    right: IntegerBuffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    one: uint64,
) -> bool:
    return _ffi_fmpz_poly_divexact(
        output,
        left,
        right,
        output_length,
        left_length,
        right_length,
        one,
    )


@native
def ffiFmpqPolyDivExact(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    one: uint64,
) -> bool:
    return _ffi_fmpq_poly_divexact(
        output_numerators,
        output_denominators,
        left_numerators,
        left_denominators,
        right_numerators,
        right_denominators,
        output_length,
        left_length,
        right_length,
        one,
    )


@native
def ffiNmodPolyGcd(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_gcd(
        output,
        left,
        right,
        output_length,
        left_length,
        right_length,
        modulus,
    )


@native
def ffiNmodPolyXgcd(
    gcd_output: UInt64Buffer,
    left_coefficient_output: UInt64Buffer,
    right_coefficient_output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_xgcd(
        gcd_output,
        left_coefficient_output,
        right_coefficient_output,
        left,
        right,
        output_length,
        left_length,
        right_length,
        modulus,
    )


@native
def ffiNmodPolyIsIrreducible(
    source: UInt64Buffer,
    source_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_is_irreducible(
        source,
        source_length,
        modulus,
    )


@native
def ffiNmodPolyFactor(
    factor_coefficients: UInt64Buffer,
    offsets: UInt64Buffer,
    exponents: UInt64Buffer,
    factor_count: UInt64Buffer,
    unit_output: UInt64Buffer,
    source: UInt64Buffer,
    factor_coefficients_length: uint64,
    offsets_length: uint64,
    exponents_length: uint64,
    factor_count_length: uint64,
    unit_length: uint64,
    source_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_factor(
        factor_coefficients,
        offsets,
        exponents,
        factor_count,
        unit_output,
        source,
        factor_coefficients_length,
        offsets_length,
        exponents_length,
        factor_count_length,
        unit_length,
        source_length,
        modulus,
    )


@native
def ffiNmodPolyRoots(
    root_values: UInt64Buffer,
    multiplicities: UInt64Buffer,
    root_count: UInt64Buffer,
    source: UInt64Buffer,
    root_values_length: uint64,
    multiplicities_length: uint64,
    root_count_length: uint64,
    source_length: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_nmod_poly_roots(
        root_values,
        multiplicities,
        root_count,
        source,
        root_values_length,
        multiplicities_length,
        root_count_length,
        source_length,
        modulus,
    )


@native
def ffiFmpzPolyFactor(
    factor_coefficients: IntegerBuffer,
    offsets: UInt64Buffer,
    exponents: UInt64Buffer,
    factor_count: UInt64Buffer,
    unit_numerator: IntegerBuffer,
    unit_denominator: IntegerBuffer,
    source: IntegerBuffer,
    factor_coefficients_length: uint64,
    source_length: uint64,
    one: uint64,
) -> bool:
    return _ffi_fmpz_poly_factor(
        factor_coefficients,
        offsets,
        exponents,
        factor_count,
        unit_numerator,
        unit_denominator,
        source,
        factor_coefficients_length,
        source_length,
        one,
    )


@native
def ffiFmpqPolyFactor(
    factor_coefficients: IntegerBuffer,
    offsets: UInt64Buffer,
    exponents: UInt64Buffer,
    factor_count: UInt64Buffer,
    unit_numerator: IntegerBuffer,
    unit_denominator: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    factor_coefficients_length: uint64,
    source_length: uint64,
    one: uint64,
) -> bool:
    return _ffi_fmpq_poly_factor(
        factor_coefficients,
        offsets,
        exponents,
        factor_count,
        unit_numerator,
        unit_denominator,
        source_numerators,
        source_denominators,
        factor_coefficients_length,
        source_length,
        one,
    )


@native
def ffiFqContextCreate(
    modulus: UInt64Buffer,
    modulus_length: uint64,
    characteristic: uint64,
) -> FqContext:
    return _ffi_fq_context(
        modulus,
        modulus_length,
        characteristic,
    )


@native
def ffiFqContextCharacteristic(
    context: FqContext,
) -> uint64:
    return _ffi_fq_context_characteristic(
        context,
    )


@native
def ffiFqContextDegree(
    context: FqContext,
) -> uint64:
    return _ffi_fq_context_degree(
        context,
    )


@native
def ffiFqElementCreate(
    context: FqContext,
    coordinates: UInt64Buffer,
    coordinate_length: uint64,
) -> FqElement:
    return _ffi_fq_element(
        context,
        coordinates,
        coordinate_length,
    )


@native
def ffiFqElementCopy(
    source: FqElement,
) -> FqElement:
    return _ffi_fq_element_copy(
        source,
    )


@native
def ffiFqElementExtensionDegree(
    element: FqElement,
) -> uint64:
    return _ffi_fq_element_extension_degree(
        element,
    )


@native
def ffiFqElementCoordinate(
    element: FqElement,
    basis_index: uint64,
) -> uint64:
    return _ffi_fq_element_coordinate(
        element,
        basis_index,
    )


@native
def ffiFqElementEqual(
    left: FqElement,
    right: FqElement,
) -> bool:
    return _ffi_fq_element_equal(
        left,
        right,
    )


@native
def ffiFqElementAdd(
    left: FqElement,
    right: FqElement,
) -> FqElement:
    return _ffi_fq_element_add(
        left,
        right,
    )


@native
def ffiFqElementSub(
    left: FqElement,
    right: FqElement,
) -> FqElement:
    return _ffi_fq_element_sub(
        left,
        right,
    )


@native
def ffiFqElementMul(
    left: FqElement,
    right: FqElement,
) -> FqElement:
    return _ffi_fq_element_mul(
        left,
        right,
    )


@native
def ffiFqPolynomialCreate(
    context: FqContext,
    coordinates: UInt64Buffer,
    coordinate_length: uint64,
    coefficient_count: uint64,
) -> FqPolynomial:
    return _ffi_fq_polynomial(
        context,
        coordinates,
        coordinate_length,
        coefficient_count,
    )


@native
def ffiFqPolynomialCopy(
    source: FqPolynomial,
) -> FqPolynomial:
    return _ffi_fq_polynomial_copy(
        source,
    )


@native
def ffiFqPolynomialLength(
    polynomial: FqPolynomial,
) -> uint64:
    return _ffi_fq_polynomial_length(
        polynomial,
    )


@native
def ffiFqPolynomialExtensionDegree(
    polynomial: FqPolynomial,
) -> uint64:
    return _ffi_fq_polynomial_extension_degree(
        polynomial,
    )


@native
def ffiFqPolynomialCoordinate(
    polynomial: FqPolynomial,
    coefficient_index: uint64,
    basis_index: uint64,
) -> uint64:
    return _ffi_fq_polynomial_coordinate(
        polynomial,
        coefficient_index,
        basis_index,
    )


@native
def ffiFqPolynomialEqual(
    left: FqPolynomial,
    right: FqPolynomial,
) -> bool:
    return _ffi_fq_polynomial_equal(
        left,
        right,
    )


@native
def ffiFqPolynomialAdd(
    left: FqPolynomial,
    right: FqPolynomial,
) -> FqPolynomial:
    return _ffi_fq_polynomial_add(
        left,
        right,
    )


@native
def ffiFqPolynomialSub(
    left: FqPolynomial,
    right: FqPolynomial,
) -> FqPolynomial:
    return _ffi_fq_polynomial_sub(
        left,
        right,
    )


@native
def ffiFqPolynomialMul(
    left: FqPolynomial,
    right: FqPolynomial,
) -> FqPolynomial:
    return _ffi_fq_polynomial_mul(
        left,
        right,
    )


@native
def ffiFqPolynomialNeg(
    source: FqPolynomial,
) -> FqPolynomial:
    return _ffi_fq_polynomial_neg(
        source,
    )


@native
def ffiFqPolynomialPow(
    source: FqPolynomial,
    exponent: uint64,
) -> FqPolynomial:
    return _ffi_fq_polynomial_pow(
        source,
        exponent,
    )


@native
def ffiFqPolynomialCoordinateBytes(
    polynomial: FqPolynomial,
) -> FlintByteRegion:
    return _ffi_fq_polynomial_coordinate_bytes(
        polynomial,
    )


@native
def ffiFmpzModPolynomialCreate(
    modulus: Integer,
    length: uint64,
) -> FmpzModPolynomial:
    return _ffi_fmpz_mod_polynomial(
        modulus,
        length,
    )


@native
def ffiFmpzModPolynomialSetCoefficient(
    polynomial: FmpzModPolynomial,
    index: uint64,
    coefficient: Integer,
) -> bool:
    return _ffi_fmpz_mod_polynomial_set_coefficient(
        polynomial,
        index,
        coefficient,
    )


@native
def ffiFmpzModPolynomialSeal(
    polynomial: FmpzModPolynomial,
) -> bool:
    return _ffi_fmpz_mod_polynomial_seal(
        polynomial,
    )


@native
def ffiFmpzModPolynomialModulus(
    source: FmpzModPolynomial,
) -> Integer:
    return _ffi_fmpz_mod_polynomial_modulus(
        source,
    )


@native
def ffiFmpzModPolynomialIsZero(
    source: FmpzModPolynomial,
) -> Integer:
    return _ffi_fmpz_mod_polynomial_is_zero(
        source,
    )


@native
def ffiFmpzModPolynomialLength(
    source: FmpzModPolynomial,
) -> Integer:
    return _ffi_fmpz_mod_polynomial_length(
        source,
    )


@native
def ffiFmpzModPolynomialEntryCount(
    source: FmpzModPolynomial,
) -> uint64:
    return _ffi_fmpz_mod_polynomial_entry_count(
        source,
    )


@native
def ffiFmpzModPolynomialCoefficient(
    source: FmpzModPolynomial,
    index: uint64,
) -> Integer:
    return _ffi_fmpz_mod_polynomial_coefficient(
        source,
        index,
    )


@native
def ffiFmpzModPolynomialCopy(
    source: FmpzModPolynomial,
) -> FmpzModPolynomial:
    return _ffi_fmpz_mod_polynomial_copy(
        source,
    )


@native
def ffiFmpzModPolynomialEqual(
    left: FmpzModPolynomial,
    right: FmpzModPolynomial,
) -> Integer:
    return _ffi_fmpz_mod_polynomial_equal(
        left,
        right,
    )


@native
def ffiFmpzModPolynomialAdd(
    left: FmpzModPolynomial,
    right: FmpzModPolynomial,
) -> FmpzModPolynomial:
    return _ffi_fmpz_mod_polynomial_add(
        left,
        right,
    )


@native
def ffiFmpzModPolynomialSub(
    left: FmpzModPolynomial,
    right: FmpzModPolynomial,
) -> FmpzModPolynomial:
    return _ffi_fmpz_mod_polynomial_sub(
        left,
        right,
    )


@native
def ffiFmpzModPolynomialMul(
    left: FmpzModPolynomial,
    right: FmpzModPolynomial,
) -> FmpzModPolynomial:
    return _ffi_fmpz_mod_polynomial_mul(
        left,
        right,
    )


@native
def ffiFmpzModPolynomialNeg(
    source: FmpzModPolynomial,
) -> FmpzModPolynomial:
    return _ffi_fmpz_mod_polynomial_neg(
        source,
    )


@native
def ffiFmpzModPolynomialPow(
    source: FmpzModPolynomial,
    exponent: uint64,
) -> FmpzModPolynomial:
    return _ffi_fmpz_mod_polynomial_pow(
        source,
        exponent,
    )


@native
def ffiFmpzModPolynomialDerivative(
    source: FmpzModPolynomial,
) -> FmpzModPolynomial:
    return _ffi_fmpz_mod_polynomial_derivative(
        source,
    )


@native
def ffiFmpzModPolynomialEvaluate(
    source: FmpzModPolynomial,
    argument: Integer,
) -> Integer:
    return _ffi_fmpz_mod_polynomial_evaluate(
        source,
        argument,
    )


@native
def ffiFmpzModPolynomialGcd(
    left: FmpzModPolynomial,
    right: FmpzModPolynomial,
) -> FmpzModPolynomial:
    return _ffi_fmpz_mod_polynomial_gcd(
        left,
        right,
    )


@native
def ffiFmpzModPolynomialDivremResource(
    dividend: FmpzModPolynomial,
    divisor: FmpzModPolynomial,
) -> FmpzModPolynomialDivisionResult:
    return _ffi_fmpz_mod_polynomial_divrem_resource(
        dividend,
        divisor,
    )


@native
def ffiFmpzModPolynomialDivisionResultQuotient(
    division: FmpzModPolynomialDivisionResult,
) -> FmpzModPolynomial:
    return _ffi_fmpz_mod_polynomial_division_result_quotient(
        division,
    )


@native
def ffiFmpzModPolynomialDivisionResultRemainder(
    division: FmpzModPolynomialDivisionResult,
) -> FmpzModPolynomial:
    return _ffi_fmpz_mod_polynomial_division_result_remainder(
        division,
    )


@native
def ffiFmpzModPolynomialXgcdResource(
    left: FmpzModPolynomial,
    right: FmpzModPolynomial,
) -> FmpzModPolynomialXgcdResult:
    return _ffi_fmpz_mod_polynomial_xgcd_resource(
        left,
        right,
    )


@native
def ffiFmpzModPolynomialXgcdResultGcd(
    xgcd: FmpzModPolynomialXgcdResult,
) -> FmpzModPolynomial:
    return _ffi_fmpz_mod_polynomial_xgcd_result_gcd(
        xgcd,
    )


@native
def ffiFmpzModPolynomialXgcdResultLeftCoefficient(
    xgcd: FmpzModPolynomialXgcdResult,
) -> FmpzModPolynomial:
    return _ffi_fmpz_mod_polynomial_xgcd_result_left_coefficient(
        xgcd,
    )


@native
def ffiFmpzModPolynomialXgcdResultRightCoefficient(
    xgcd: FmpzModPolynomialXgcdResult,
) -> FmpzModPolynomial:
    return _ffi_fmpz_mod_polynomial_xgcd_result_right_coefficient(
        xgcd,
    )


@native
def ffiFmpzModPolynomialFactorResource(
    source: FmpzModPolynomial,
) -> FmpzModPolynomialFactorization:
    return _ffi_fmpz_mod_polynomial_factor_resource(
        source,
    )


@native
def ffiFmpzModPolynomialRootsResource(
    source: FmpzModPolynomial,
) -> FmpzModPolynomialRoots:
    return _ffi_fmpz_mod_polynomial_roots_resource(
        source,
    )


@native
def ffiFmpzModPolynomialFormat(
    source: FmpzModPolynomial,
) -> FlintByteRegion:
    return _ffi_fmpz_mod_polynomial_format(
        source,
    )


@native
def ffiFmpzModPolynomialSerialize(
    source: FmpzModPolynomial,
) -> FlintByteRegion:
    return _ffi_fmpz_mod_polynomial_serialize(
        source,
    )


@native
def ffiFmpzModPolynomialDeserialize(
    source: FlintByteRegion,
) -> FmpzModPolynomial:
    return _ffi_fmpz_mod_polynomial_deserialize(
        source,
    )
