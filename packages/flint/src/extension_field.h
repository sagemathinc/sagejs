#ifndef SAGEJS_EXTENSION_FIELD_H
#define SAGEJS_EXTENSION_FIELD_H

#include <node_api.h>

#include <flint/fq_nmod.h>
#include <flint/fq_nmod_mpoly.h>

typedef struct sagejs_fq_context_value sagejs_fq_context_value;

sagejs_fq_context_value *sagejs_fq_unwrap_context(
    napi_env env, napi_value object);
void sagejs_fq_retain_context(sagejs_fq_context_value *context);
void sagejs_fq_release_context(sagejs_fq_context_value *context);
fq_nmod_ctx_struct *sagejs_fq_nmod_context(
    napi_env env, sagejs_fq_context_value *context);
int sagejs_fq_nmod_mpoly_set_constant(
    napi_env env,
    napi_value value,
    sagejs_fq_context_value *context,
    fq_nmod_mpoly_t polynomial,
    const fq_nmod_mpoly_ctx_t polynomial_context);

napi_value sagejs_fq_context(napi_env env, napi_callback_info info);
napi_value sagejs_fq_context_with_modulus(
    napi_env env, napi_callback_info info);
napi_value sagejs_fq_context_modulus(napi_env env, napi_callback_info info);
napi_value sagejs_fq_from_bigint(napi_env env, napi_callback_info info);
napi_value sagejs_fq_gen(napi_env env, napi_callback_info info);
napi_value sagejs_fq_add(napi_env env, napi_callback_info info);
napi_value sagejs_fq_sub(napi_env env, napi_callback_info info);
napi_value sagejs_fq_mul(napi_env env, napi_callback_info info);
napi_value sagejs_fq_div(napi_env env, napi_callback_info info);
napi_value sagejs_fq_neg(napi_env env, napi_callback_info info);
napi_value sagejs_fq_pow(napi_env env, napi_callback_info info);
napi_value sagejs_fq_equal(napi_env env, napi_callback_info info);
napi_value sagejs_fq_is_zero(napi_env env, napi_callback_info info);
napi_value sagejs_fq_is_one(napi_env env, napi_callback_info info);
napi_value sagejs_fq_to_string(napi_env env, napi_callback_info info);
napi_value sagejs_fq_poly_constant(napi_env env, napi_callback_info info);
napi_value sagejs_fq_poly_gen(napi_env env, napi_callback_info info);
napi_value sagejs_fq_poly_add(napi_env env, napi_callback_info info);
napi_value sagejs_fq_poly_sub(napi_env env, napi_callback_info info);
napi_value sagejs_fq_poly_mul(napi_env env, napi_callback_info info);
napi_value sagejs_fq_poly_neg(napi_env env, napi_callback_info info);
napi_value sagejs_fq_poly_pow(napi_env env, napi_callback_info info);
napi_value sagejs_fq_poly_equal(napi_env env, napi_callback_info info);
napi_value sagejs_fq_poly_divexact(napi_env env, napi_callback_info info);
napi_value sagejs_fq_poly_gcd(napi_env env, napi_callback_info info);
napi_value sagejs_fq_poly_is_irreducible(
    napi_env env, napi_callback_info info);
napi_value sagejs_fq_poly_to_string(napi_env env, napi_callback_info info);
napi_value sagejs_fq_poly_coefficients(
    napi_env env, napi_callback_info info);
napi_value sagejs_fq_poly_factor(napi_env env, napi_callback_info info);
napi_value sagejs_fq_poly_roots(napi_env env, napi_callback_info info);
napi_value sagejs_fq_matrix(napi_env env, napi_callback_info info);
napi_value sagejs_fq_matrix_add(napi_env env, napi_callback_info info);
napi_value sagejs_fq_matrix_sub(napi_env env, napi_callback_info info);
napi_value sagejs_fq_matrix_mul(napi_env env, napi_callback_info info);
napi_value sagejs_fq_matrix_neg(napi_env env, napi_callback_info info);
napi_value sagejs_fq_matrix_scalar_mul(
    napi_env env, napi_callback_info info);
napi_value sagejs_fq_matrix_transpose(
    napi_env env, napi_callback_info info);
napi_value sagejs_fq_matrix_equal(napi_env env, napi_callback_info info);
napi_value sagejs_fq_matrix_entry(napi_env env, napi_callback_info info);
napi_value sagejs_fq_matrix_det(napi_env env, napi_callback_info info);
napi_value sagejs_fq_matrix_rank(napi_env env, napi_callback_info info);
napi_value sagejs_fq_matrix_rref(napi_env env, napi_callback_info info);
napi_value sagejs_fq_matrix_right_kernel(
    napi_env env, napi_callback_info info);
napi_value sagejs_fq_matrix_solve(napi_env env, napi_callback_info info);
napi_value sagejs_fq_matrix_inverse(napi_env env, napi_callback_info info);
napi_value sagejs_fq_matrix_charpoly(
    napi_env env, napi_callback_info info);

#endif
