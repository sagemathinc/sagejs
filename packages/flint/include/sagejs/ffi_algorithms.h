#ifndef SAGEJS_FLINT_FFI_ALGORITHMS_H
#define SAGEJS_FLINT_FFI_ALGORITHMS_H

#include <stdint.h>

#include <flint/nmod_poly.h>
#include <flint/nmod_mat.h>
#include <flint/ulong_extras.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Host-neutral packed adapter to FLINT's mature nmod polynomial
 * multiplication.  The declaration validates each slice length; this bridge
 * validates their algebraic relationship before allocating FLINT objects. */
static inline int sagejs_flint_nmod_poly_mul_packed(
    uint64_t *output,
    uint64_t *left,
    uint64_t *right,
    uint64_t output_length,
    uint64_t left_length,
    uint64_t right_length,
    uint64_t modulus)
{
    nmod_poly_t left_poly;
    nmod_poly_t right_poly;
    nmod_poly_t product;
    uint64_t expected = left_length == 0 || right_length == 0
        ? 0 : left_length + right_length - 1;

    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        left_length > (uint64_t) WORD_MAX ||
        right_length > (uint64_t) WORD_MAX ||
        output_length > (uint64_t) WORD_MAX ||
        (left_length != 0 && right_length != 0 &&
         expected < left_length) || output_length != expected)
        return 0;
    nmod_poly_init(left_poly, (ulong) modulus);
    nmod_poly_init(right_poly, (ulong) modulus);
    nmod_poly_init(product, (ulong) modulus);
    for (uint64_t index = 0; index < left_length; index++)
        nmod_poly_set_coeff_ui(left_poly, (slong) index,
            (ulong) (left[index] % modulus));
    for (uint64_t index = 0; index < right_length; index++)
        nmod_poly_set_coeff_ui(right_poly, (slong) index,
            (ulong) (right[index] % modulus));
    nmod_poly_mul(product, left_poly, right_poly);
    for (uint64_t index = 0; index < output_length; index++)
        output[index] = (uint64_t) nmod_poly_get_coeff_ui(
            product, (slong) index);
    nmod_poly_clear(product);
    nmod_poly_clear(right_poly);
    nmod_poly_clear(left_poly);
    return 1;
}

/* Copying adapters keep caller-owned packed storage independent of FLINT's
 * internal matrix representation.  The generated FFI layer initializes and
 * clears every nmod_mat_t and transactionally copies writable outputs back. */
static inline slong sagejs_flint_nmod_mat_rref_copy(
    nmod_mat_t output, const nmod_mat_t source)
{
    nmod_mat_set(output, source);
    return nmod_mat_rref(output);
}

static inline int sagejs_flint_nmod_mat_mul(
    nmod_mat_t output, const nmod_mat_t left, const nmod_mat_t right)
{
    nmod_mat_mul(output, left, right);
    return 1;
}

static inline slong sagejs_flint_nmod_mat_right_kernel(
    nmod_mat_t output, const nmod_mat_t source)
{
    const slong columns = nmod_mat_ncols(source);
    const slong rank = nmod_mat_rank(source);
    const slong nullity = columns - rank;
    nmod_mat_t basis_columns;
    nmod_mat_init(basis_columns, columns, columns, source->mod.n);
    nmod_mat_nullspace(basis_columns, source);
    nmod_mat_zero(output);
    for (slong row = 0; row < nullity; row++)
        for (slong column = 0; column < columns; column++)
            nmod_mat_entry(output, row, column) =
                nmod_mat_entry(basis_columns, column, row);
    nmod_mat_rref(output);
    nmod_mat_clear(basis_columns);
    return nullity;
}

static inline int sagejs_flint_nmod_mat_solve(
    nmod_mat_t output, const nmod_mat_t left, const nmod_mat_t right)
{
    return nmod_mat_solve(output, left, right);
}

#ifdef __cplusplus
}
#endif

#endif
