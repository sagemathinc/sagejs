#ifndef SAGEJS_MATRIX_H
#define SAGEJS_MATRIX_H

#include <node_api.h>
#include <flint/flint.h>
#include <flint/fmpq_mat.h>
#include <flint/gr_mat.h>

napi_value sagejs_zz_matrix_from_slong_entries(
    napi_env env,
    slong rows,
    slong cols,
    const slong *entries);
napi_value sagejs_qq_matrix_from_fmpq_mat(
    napi_env env,
    const fmpq_mat_t entries);
napi_value sagejs_qqbar_matrix_from_gr_mat(
    napi_env env,
    const gr_mat_t entries,
    const gr_ctx_t context);
napi_value sagejs_qqbar_matrix_from_cyclotomic_gr_mat(
    napi_env env,
    const gr_mat_t entries,
    const gr_ctx_t context,
    ulong order,
    size_t degree,
    const fmpq *coordinates);
napi_value sagejs_qq_matrix_from_qqbar_gr_mat(
    napi_env env,
    const gr_mat_t entries,
    const gr_ctx_t context);

napi_value sagejs_zz_matrix(napi_env env, napi_callback_info info);
napi_value sagejs_qq_matrix(napi_env env, napi_callback_info info);
napi_value sagejs_nmod_matrix(napi_env env, napi_callback_info info);
napi_value sagejs_zmod_matrix(napi_env env, napi_callback_info info);
napi_value sagejs_nmod_matrix_packed(
    napi_env env, napi_callback_info info);
napi_value sagejs_zmod_matrix_packed(
    napi_env env, napi_callback_info info);
napi_value sagejs_matrix_export_packed(
    napi_env env, napi_callback_info info);
napi_value sagejs_zz_matrix_packed(
    napi_env env, napi_callback_info info);
napi_value sagejs_zz_matrix_export_packed(
    napi_env env, napi_callback_info info);
napi_value sagejs_qq_matrix_packed(
    napi_env env, napi_callback_info info);
napi_value sagejs_qq_matrix_export_packed(
    napi_env env, napi_callback_info info);
napi_value sagejs_nmod_matrix_random(
    napi_env env, napi_callback_info info);
napi_value sagejs_zmod_matrix_random(
    napi_env env, napi_callback_info info);
napi_value sagejs_acb_matrix(napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_matrix(napi_env env, napi_callback_info info);
napi_value sagejs_zz_matrix_to_qq(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_add(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_sub(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_mul(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_mul_blas(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_sparse_left_mul(
    napi_env env, napi_callback_info info);
napi_value sagejs_matrix_augment(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_stack(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_select_rows(
    napi_env env, napi_callback_info info);
napi_value sagejs_matrix_select_columns(
    napi_env env, napi_callback_info info);
napi_value sagejs_matrix_pivots(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_neg(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_scalar_mul(napi_env env, napi_callback_info info);
napi_value sagejs_acb_matrix_scalar_mul(
    napi_env env, napi_callback_info info);
napi_value sagejs_qqbar_matrix_scalar_mul(
    napi_env env, napi_callback_info info);
napi_value sagejs_matrix_transpose(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_equal(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_entry(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_det(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_rank(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_rref(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_hermite(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_howell(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_hermite_transform(
    napi_env env, napi_callback_info info);
napi_value sagejs_matrix_smith(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_right_kernel(napi_env env, napi_callback_info info);
napi_value sagejs_cyclotomic_matrix_right_kernel(
    napi_env env, napi_callback_info info);
napi_value sagejs_cyclotomic_matrix_poly_evaluate(
    napi_env env, napi_callback_info info);
napi_value sagejs_matrix_charpoly(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_solve(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_inverse(napi_env env, napi_callback_info info);
napi_value sagejs_matrix_approx_eigensystem(
    napi_env env, napi_callback_info info);
napi_value sagejs_matrix_exact_eigenvalues(
    napi_env env, napi_callback_info info);

#endif
