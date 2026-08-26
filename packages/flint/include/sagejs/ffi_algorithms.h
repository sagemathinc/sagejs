#ifndef SAGEJS_FLINT_FFI_ALGORITHMS_H
#define SAGEJS_FLINT_FFI_ALGORITHMS_H

#include <stdint.h>

#include <flint/arb.h>
#include <flint/arf.h>
#include <flint/nmod_poly.h>
#include <flint/nmod_mat.h>
#include <flint/fmpq.h>
#include <flint/fmpq_mat.h>
#include <flint/fmpq_poly.h>
#include <flint/fmpz_lll.h>
#include <flint/fmpz_mat.h>
#include <flint/fmpz_poly.h>
#include <flint/fmpz_poly_factor.h>
#include <flint/nmod_poly_factor.h>
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

static inline int sagejs_flint_fmpz_poly_mul_packed(
    fmpz_mat_t output,
    const fmpz_mat_t left,
    const fmpz_mat_t right)
{
    fmpz_poly_t left_poly, right_poly, product;
    const slong output_length = fmpz_mat_ncols(output);
    const slong left_length = fmpz_mat_ncols(left);
    const slong right_length = fmpz_mat_ncols(right);
    const slong expected = left_length == 0 || right_length == 0
        ? 0 : left_length + right_length - 1;
    if (fmpz_mat_nrows(output) != 1 || fmpz_mat_nrows(left) != 1 ||
        fmpz_mat_nrows(right) != 1 || output_length != expected)
        return 0;
    fmpz_poly_init(left_poly);
    fmpz_poly_init(right_poly);
    fmpz_poly_init(product);
    for (slong index = 0; index < left_length; index++)
        fmpz_poly_set_coeff_fmpz(
            left_poly, index, fmpz_mat_entry(left, 0, index));
    for (slong index = 0; index < right_length; index++)
        fmpz_poly_set_coeff_fmpz(
            right_poly, index, fmpz_mat_entry(right, 0, index));
    fmpz_poly_mul(product, left_poly, right_poly);
    for (slong index = 0; index < output_length; index++)
        fmpz_poly_get_coeff_fmpz(
            fmpz_mat_entry(output, 0, index), product, index);
    fmpz_poly_clear(product);
    fmpz_poly_clear(right_poly);
    fmpz_poly_clear(left_poly);
    return 1;
}

static inline int sagejs_flint_fmpq_poly_set_parts(
    fmpq_poly_t output,
    const fmpz_mat_t numerators,
    const fmpz_mat_t denominators)
{
    fmpq_t coefficient;
    const slong length = fmpz_mat_ncols(numerators);
    if (fmpz_mat_nrows(numerators) != 1 ||
        fmpz_mat_nrows(denominators) != 1 ||
        fmpz_mat_ncols(denominators) != length)
        return 0;
    fmpq_init(coefficient);
    for (slong index = 0; index < length; index++)
    {
        if (fmpz_is_zero(fmpz_mat_entry(denominators, 0, index)))
        {
            fmpq_clear(coefficient);
            return 0;
        }
        fmpq_set_fmpz_frac(
            coefficient,
            fmpz_mat_entry(numerators, 0, index),
            fmpz_mat_entry(denominators, 0, index));
        fmpq_canonicalise(coefficient);
        fmpq_poly_set_coeff_fmpq(output, index, coefficient);
    }
    fmpq_clear(coefficient);
    return 1;
}

static inline int sagejs_flint_fmpq_poly_get_parts(
    fmpz_mat_t numerators,
    fmpz_mat_t denominators,
    const fmpq_poly_t source)
{
    fmpq_t coefficient;
    const slong length = fmpz_mat_ncols(numerators);
    if (fmpz_mat_nrows(numerators) != 1 ||
        fmpz_mat_nrows(denominators) != 1 ||
        fmpz_mat_ncols(denominators) != length)
        return 0;
    fmpq_init(coefficient);
    for (slong index = 0; index < length; index++)
    {
        fmpq_poly_get_coeff_fmpq(coefficient, source, index);
        fmpz_set(fmpz_mat_entry(numerators, 0, index), fmpq_numref(coefficient));
        fmpz_set(
            fmpz_mat_entry(denominators, 0, index), fmpq_denref(coefficient));
    }
    fmpq_clear(coefficient);
    return 1;
}

static inline int sagejs_flint_fmpq_poly_mul_packed(
    fmpz_mat_t output_numerators,
    fmpz_mat_t output_denominators,
    const fmpz_mat_t left_numerators,
    const fmpz_mat_t left_denominators,
    const fmpz_mat_t right_numerators,
    const fmpz_mat_t right_denominators)
{
    int success = 0;
    fmpq_poly_t left, right, product;
    const slong left_length = fmpz_mat_ncols(left_numerators);
    const slong right_length = fmpz_mat_ncols(right_numerators);
    const slong output_length = fmpz_mat_ncols(output_numerators);
    const slong expected = left_length == 0 || right_length == 0
        ? 0 : left_length + right_length - 1;
    if (fmpz_mat_nrows(output_numerators) != 1 ||
        fmpz_mat_nrows(output_denominators) != 1 ||
        fmpz_mat_ncols(output_denominators) != output_length ||
        output_length != expected)
        return 0;
    fmpq_poly_init(left);
    fmpq_poly_init(right);
    fmpq_poly_init(product);
    if (sagejs_flint_fmpq_poly_set_parts(
            left, left_numerators, left_denominators) &&
        sagejs_flint_fmpq_poly_set_parts(
            right, right_numerators, right_denominators))
    {
        fmpq_poly_mul(product, left, right);
        success = sagejs_flint_fmpq_poly_get_parts(
            output_numerators, output_denominators, product);
    }
    fmpq_poly_clear(product);
    fmpq_poly_clear(right);
    fmpq_poly_clear(left);
    return success;
}

static inline void sagejs_flint_nmod_poly_set_packed(
    nmod_poly_t output,
    const uint64_t *source,
    uint64_t length,
    uint64_t modulus)
{
    for (uint64_t index = 0; index < length; index++)
        nmod_poly_set_coeff_ui(
            output, (slong) index, (ulong) (source[index] % modulus));
}

static inline void sagejs_flint_nmod_poly_get_packed(
    uint64_t *output,
    uint64_t capacity,
    const nmod_poly_t source)
{
    const slong length = nmod_poly_length(source);
    for (uint64_t index = 0; index < capacity; index++)
        output[index] = index < (uint64_t) length
            ? (uint64_t) nmod_poly_get_coeff_ui(source, (slong) index) : 0;
}

static inline int sagejs_flint_nmod_poly_binary_packed(
    uint64_t *output,
    const uint64_t *left,
    const uint64_t *right,
    uint64_t output_length,
    uint64_t left_length,
    uint64_t right_length,
    uint64_t modulus,
    int subtract)
{
    nmod_poly_t left_poly, right_poly, result;
    const uint64_t expected = left_length > right_length
        ? left_length : right_length;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        output_length != expected ||
        output_length > (uint64_t) WORD_MAX)
        return 0;
    nmod_poly_init(left_poly, (ulong) modulus);
    nmod_poly_init(right_poly, (ulong) modulus);
    nmod_poly_init(result, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        left_poly, left, left_length, modulus);
    sagejs_flint_nmod_poly_set_packed(
        right_poly, right, right_length, modulus);
    if (subtract)
        nmod_poly_sub(result, left_poly, right_poly);
    else
        nmod_poly_add(result, left_poly, right_poly);
    sagejs_flint_nmod_poly_get_packed(output, output_length, result);
    nmod_poly_clear(result);
    nmod_poly_clear(right_poly);
    nmod_poly_clear(left_poly);
    return 1;
}

static inline int sagejs_flint_nmod_poly_add_packed(
    uint64_t *output,
    const uint64_t *left,
    const uint64_t *right,
    uint64_t output_length,
    uint64_t left_length,
    uint64_t right_length,
    uint64_t modulus)
{
    return sagejs_flint_nmod_poly_binary_packed(
        output, left, right, output_length, left_length, right_length,
        modulus, 0);
}

static inline int sagejs_flint_nmod_poly_sub_packed(
    uint64_t *output,
    const uint64_t *left,
    const uint64_t *right,
    uint64_t output_length,
    uint64_t left_length,
    uint64_t right_length,
    uint64_t modulus)
{
    return sagejs_flint_nmod_poly_binary_packed(
        output, left, right, output_length, left_length, right_length,
        modulus, 1);
}

static inline int sagejs_flint_nmod_poly_neg_packed(
    uint64_t *output,
    const uint64_t *source,
    uint64_t output_length,
    uint64_t source_length,
    uint64_t modulus)
{
    nmod_poly_t source_poly, result;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        output_length != source_length ||
        output_length > (uint64_t) WORD_MAX)
        return 0;
    nmod_poly_init(source_poly, (ulong) modulus);
    nmod_poly_init(result, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        source_poly, source, source_length, modulus);
    nmod_poly_neg(result, source_poly);
    sagejs_flint_nmod_poly_get_packed(output, output_length, result);
    nmod_poly_clear(result);
    nmod_poly_clear(source_poly);
    return 1;
}

static inline int sagejs_flint_nmod_poly_equal_packed(
    const uint64_t *left,
    const uint64_t *right,
    uint64_t left_length,
    uint64_t right_length,
    uint64_t modulus)
{
    int equal;
    nmod_poly_t left_poly, right_poly;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        left_length > (uint64_t) WORD_MAX ||
        right_length > (uint64_t) WORD_MAX)
        return 0;
    nmod_poly_init(left_poly, (ulong) modulus);
    nmod_poly_init(right_poly, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        left_poly, left, left_length, modulus);
    sagejs_flint_nmod_poly_set_packed(
        right_poly, right, right_length, modulus);
    equal = nmod_poly_equal(left_poly, right_poly);
    nmod_poly_clear(right_poly);
    nmod_poly_clear(left_poly);
    return equal;
}

static inline int sagejs_flint_nmod_poly_derivative_packed(
    uint64_t *output,
    const uint64_t *source,
    uint64_t output_length,
    uint64_t source_length,
    uint64_t modulus)
{
    nmod_poly_t source_poly, result;
    const uint64_t expected = source_length == 0 ? 0 : source_length - 1;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        output_length != expected ||
        source_length > (uint64_t) WORD_MAX)
        return 0;
    nmod_poly_init(source_poly, (ulong) modulus);
    nmod_poly_init(result, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        source_poly, source, source_length, modulus);
    nmod_poly_derivative(result, source_poly);
    sagejs_flint_nmod_poly_get_packed(output, output_length, result);
    nmod_poly_clear(result);
    nmod_poly_clear(source_poly);
    return 1;
}

static inline int sagejs_flint_nmod_poly_evaluate_packed(
    uint64_t *output,
    const uint64_t *source,
    uint64_t output_length,
    uint64_t source_length,
    uint64_t argument,
    uint64_t modulus)
{
    nmod_poly_t source_poly;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        output_length != 1 || source_length > (uint64_t) WORD_MAX)
        return 0;
    nmod_poly_init(source_poly, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        source_poly, source, source_length, modulus);
    output[0] = (uint64_t) nmod_poly_evaluate_nmod(
        source_poly, (ulong) (argument % modulus));
    nmod_poly_clear(source_poly);
    return 1;
}

static inline int sagejs_flint_nmod_poly_compose_packed(
    uint64_t *output,
    const uint64_t *outer,
    const uint64_t *inner,
    uint64_t output_length,
    uint64_t outer_length,
    uint64_t inner_length,
    uint64_t modulus)
{
    nmod_poly_t outer_poly, inner_poly, result;
    uint64_t expected;
    if (outer_length == 0)
        expected = 0;
    else if (outer_length == 1 || inner_length <= 1)
        expected = 1;
    else
    {
        if (outer_length - 1 >
            (UINT64_MAX - 1) / (inner_length - 1))
            return 0;
        expected = (outer_length - 1) * (inner_length - 1) + 1;
    }
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        outer_length > (uint64_t) WORD_MAX ||
        inner_length > (uint64_t) WORD_MAX ||
        output_length != expected || output_length > (uint64_t) WORD_MAX)
        return 0;
    nmod_poly_init(outer_poly, (ulong) modulus);
    nmod_poly_init(inner_poly, (ulong) modulus);
    nmod_poly_init(result, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        outer_poly, outer, outer_length, modulus);
    sagejs_flint_nmod_poly_set_packed(
        inner_poly, inner, inner_length, modulus);
    nmod_poly_compose(result, outer_poly, inner_poly);
    sagejs_flint_nmod_poly_get_packed(output, output_length, result);
    nmod_poly_clear(result);
    nmod_poly_clear(inner_poly);
    nmod_poly_clear(outer_poly);
    return 1;
}

static inline int sagejs_flint_nmod_poly_reverse_packed(
    uint64_t *output,
    const uint64_t *source,
    uint64_t output_length,
    uint64_t source_length,
    uint64_t reverse_length,
    uint64_t modulus)
{
    nmod_poly_t source_poly, result;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        source_length > (uint64_t) WORD_MAX ||
        reverse_length > (uint64_t) WORD_MAX ||
        output_length != reverse_length)
        return 0;
    nmod_poly_init(source_poly, (ulong) modulus);
    nmod_poly_init(result, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        source_poly, source, source_length, modulus);
    nmod_poly_reverse(result, source_poly, (slong) reverse_length);
    sagejs_flint_nmod_poly_get_packed(output, output_length, result);
    nmod_poly_clear(result);
    nmod_poly_clear(source_poly);
    return 1;
}

static inline int sagejs_flint_nmod_poly_shift_left_packed(
    uint64_t *output,
    const uint64_t *source,
    uint64_t output_length,
    uint64_t source_length,
    uint64_t amount,
    uint64_t modulus)
{
    nmod_poly_t source_poly, result;
    const uint64_t expected = source_length == 0 ? 0 : source_length + amount;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        source_length > (uint64_t) WORD_MAX || amount > (uint64_t) WORD_MAX ||
        (source_length != 0 && expected < source_length) ||
        output_length != expected || output_length > (uint64_t) WORD_MAX)
        return 0;
    nmod_poly_init(source_poly, (ulong) modulus);
    nmod_poly_init(result, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        source_poly, source, source_length, modulus);
    nmod_poly_shift_left(result, source_poly, (slong) amount);
    sagejs_flint_nmod_poly_get_packed(output, output_length, result);
    nmod_poly_clear(result);
    nmod_poly_clear(source_poly);
    return 1;
}

static inline int sagejs_flint_nmod_poly_shift_right_packed(
    uint64_t *output,
    const uint64_t *source,
    uint64_t output_length,
    uint64_t source_length,
    uint64_t amount,
    uint64_t modulus)
{
    nmod_poly_t source_poly, result;
    const uint64_t expected = amount >= source_length
        ? 0 : source_length - amount;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        source_length > (uint64_t) WORD_MAX || amount > (uint64_t) WORD_MAX ||
        output_length != expected)
        return 0;
    nmod_poly_init(source_poly, (ulong) modulus);
    nmod_poly_init(result, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        source_poly, source, source_length, modulus);
    nmod_poly_shift_right(result, source_poly, (slong) amount);
    sagejs_flint_nmod_poly_get_packed(output, output_length, result);
    nmod_poly_clear(result);
    nmod_poly_clear(source_poly);
    return 1;
}

static inline int sagejs_flint_nmod_poly_truncate_packed(
    uint64_t *output,
    const uint64_t *source,
    uint64_t output_length,
    uint64_t source_length,
    uint64_t stop,
    uint64_t modulus)
{
    nmod_poly_t source_poly;
    const uint64_t expected = stop < source_length ? stop : source_length;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        source_length > (uint64_t) WORD_MAX || stop > (uint64_t) WORD_MAX ||
        output_length != expected)
        return 0;
    nmod_poly_init(source_poly, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        source_poly, source, source_length, modulus);
    nmod_poly_truncate(source_poly, (slong) stop);
    sagejs_flint_nmod_poly_get_packed(output, output_length, source_poly);
    nmod_poly_clear(source_poly);
    return 1;
}

static inline int sagejs_flint_nmod_poly_integral_packed(
    uint64_t *output,
    const uint64_t *source,
    uint64_t output_length,
    uint64_t source_length,
    uint64_t modulus)
{
    nmod_poly_t source_poly, result;
    const uint64_t expected = source_length == 0 ? 0 : source_length + 1;
    /* FLINT's integral requires every 1, ..., degree + 1 to be invertible.
     * Longer positive-characteristic antiderivatives remain a same-source
     * typed-Python responsibility because zero exceptional coefficients can
     * make them mathematically valid even when this dense operation is not. */
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        source_length >= modulus || source_length > (uint64_t) WORD_MAX ||
        output_length != expected || output_length > (uint64_t) WORD_MAX)
        return 0;
    nmod_poly_init(source_poly, (ulong) modulus);
    nmod_poly_init(result, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        source_poly, source, source_length, modulus);
    nmod_poly_integral(result, source_poly);
    sagejs_flint_nmod_poly_get_packed(output, output_length, result);
    nmod_poly_clear(result);
    nmod_poly_clear(source_poly);
    return 1;
}

static inline int sagejs_flint_nmod_poly_resultant_packed(
    uint64_t *output,
    const uint64_t *left,
    const uint64_t *right,
    uint64_t output_length,
    uint64_t left_length,
    uint64_t right_length,
    uint64_t modulus)
{
    nmod_poly_t left_poly, right_poly;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        output_length != 1 || left_length > (uint64_t) WORD_MAX ||
        right_length > (uint64_t) WORD_MAX)
        return 0;
    nmod_poly_init(left_poly, (ulong) modulus);
    nmod_poly_init(right_poly, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        left_poly, left, left_length, modulus);
    sagejs_flint_nmod_poly_set_packed(
        right_poly, right, right_length, modulus);
    output[0] = (uint64_t) nmod_poly_resultant(left_poly, right_poly);
    nmod_poly_clear(right_poly);
    nmod_poly_clear(left_poly);
    return 1;
}

static inline int sagejs_flint_nmod_poly_discriminant_packed(
    uint64_t *output,
    const uint64_t *source,
    uint64_t output_length,
    uint64_t source_length,
    uint64_t modulus)
{
    nmod_poly_t source_poly;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        output_length != 1 || source_length > (uint64_t) WORD_MAX)
        return 0;
    nmod_poly_init(source_poly, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        source_poly, source, source_length, modulus);
    output[0] = (uint64_t) nmod_poly_discriminant(source_poly);
    nmod_poly_clear(source_poly);
    return 1;
}

static inline int sagejs_flint_nmod_poly_xgcd_packed(
    uint64_t *gcd_output,
    uint64_t *left_coefficient_output,
    uint64_t *right_coefficient_output,
    const uint64_t *left,
    const uint64_t *right,
    uint64_t output_length,
    uint64_t left_length,
    uint64_t right_length,
    uint64_t modulus)
{
    nmod_poly_t left_poly, right_poly, gcd, left_coefficient,
        right_coefficient;
    const uint64_t required = left_length > right_length
        ? left_length : right_length;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        output_length < required || output_length > (uint64_t) WORD_MAX)
        return 0;
    nmod_poly_init(left_poly, (ulong) modulus);
    nmod_poly_init(right_poly, (ulong) modulus);
    nmod_poly_init(gcd, (ulong) modulus);
    nmod_poly_init(left_coefficient, (ulong) modulus);
    nmod_poly_init(right_coefficient, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        left_poly, left, left_length, modulus);
    sagejs_flint_nmod_poly_set_packed(
        right_poly, right, right_length, modulus);
    nmod_poly_xgcd(
        gcd, left_coefficient, right_coefficient, left_poly, right_poly);
    sagejs_flint_nmod_poly_get_packed(
        gcd_output, output_length, gcd);
    sagejs_flint_nmod_poly_get_packed(
        left_coefficient_output, output_length, left_coefficient);
    sagejs_flint_nmod_poly_get_packed(
        right_coefficient_output, output_length, right_coefficient);
    nmod_poly_clear(right_coefficient);
    nmod_poly_clear(left_coefficient);
    nmod_poly_clear(gcd);
    nmod_poly_clear(right_poly);
    nmod_poly_clear(left_poly);
    return 1;
}

static inline void sagejs_flint_fmpz_poly_set_packed(
    fmpz_poly_t output,
    const fmpz_mat_t source)
{
    const slong length = fmpz_mat_ncols(source);
    for (slong index = 0; index < length; index++)
        fmpz_poly_set_coeff_fmpz(
            output, index, fmpz_mat_entry(source, 0, index));
}

static inline void sagejs_flint_fmpz_poly_get_packed(
    fmpz_mat_t output,
    const fmpz_poly_t source)
{
    const slong capacity = fmpz_mat_ncols(output);
    const slong length = fmpz_poly_length(source);
    for (slong index = 0; index < capacity; index++)
    {
        if (index < length)
            fmpz_poly_get_coeff_fmpz(
                fmpz_mat_entry(output, 0, index), source, index);
        else
            fmpz_zero(fmpz_mat_entry(output, 0, index));
    }
}

static inline int sagejs_flint_nmod_poly_divexact_packed(
    uint64_t *output,
    uint64_t *left,
    uint64_t *right,
    uint64_t output_length,
    uint64_t left_length,
    uint64_t right_length,
    uint64_t modulus)
{
    int divides;
    nmod_poly_t left_poly, right_poly, quotient;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        left_length > (uint64_t) WORD_MAX ||
        right_length > (uint64_t) WORD_MAX ||
        output_length != left_length || right_length == 0)
        return 0;
    nmod_poly_init(left_poly, (ulong) modulus);
    nmod_poly_init(right_poly, (ulong) modulus);
    nmod_poly_init(quotient, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        left_poly, left, left_length, modulus);
    sagejs_flint_nmod_poly_set_packed(
        right_poly, right, right_length, modulus);
    divides = nmod_poly_divides(quotient, left_poly, right_poly);
    if (divides)
        sagejs_flint_nmod_poly_get_packed(output, output_length, quotient);
    nmod_poly_clear(quotient);
    nmod_poly_clear(right_poly);
    nmod_poly_clear(left_poly);
    return divides;
}

static inline int sagejs_flint_nmod_poly_divrem_packed(
    uint64_t *quotient_output,
    uint64_t *remainder_output,
    const uint64_t *left,
    const uint64_t *right,
    uint64_t quotient_length,
    uint64_t remainder_length,
    uint64_t left_length,
    uint64_t right_length,
    uint64_t modulus)
{
    uint64_t expected_quotient_length, expected_remainder_length;
    nmod_poly_t left_poly, right_poly, quotient, remainder;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        left_length > (uint64_t) WORD_MAX ||
        right_length > (uint64_t) WORD_MAX || right_length == 0)
        return 0;
    expected_quotient_length = left_length >= right_length
        ? left_length - right_length + 1 : 0;
    expected_remainder_length = left_length < right_length
        ? left_length : right_length - 1;
    if (quotient_length != expected_quotient_length ||
        remainder_length != expected_remainder_length)
        return 0;
    nmod_poly_init(left_poly, (ulong) modulus);
    nmod_poly_init(right_poly, (ulong) modulus);
    nmod_poly_init(quotient, (ulong) modulus);
    nmod_poly_init(remainder, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        left_poly, left, left_length, modulus);
    sagejs_flint_nmod_poly_set_packed(
        right_poly, right, right_length, modulus);
    if (nmod_poly_is_zero(right_poly))
    {
        nmod_poly_clear(remainder);
        nmod_poly_clear(quotient);
        nmod_poly_clear(right_poly);
        nmod_poly_clear(left_poly);
        return 0;
    }
    nmod_poly_divrem(quotient, remainder, left_poly, right_poly);
    if ((uint64_t) nmod_poly_length(quotient) > quotient_length ||
        (uint64_t) nmod_poly_length(remainder) > remainder_length)
    {
        nmod_poly_clear(remainder);
        nmod_poly_clear(quotient);
        nmod_poly_clear(right_poly);
        nmod_poly_clear(left_poly);
        return 0;
    }
    sagejs_flint_nmod_poly_get_packed(
        quotient_output, quotient_length, quotient);
    sagejs_flint_nmod_poly_get_packed(
        remainder_output, remainder_length, remainder);
    nmod_poly_clear(remainder);
    nmod_poly_clear(quotient);
    nmod_poly_clear(right_poly);
    nmod_poly_clear(left_poly);
    return 1;
}

static inline int sagejs_flint_fmpz_poly_divexact_packed(
    fmpz_mat_t output,
    const fmpz_mat_t left,
    const fmpz_mat_t right)
{
    int divides;
    fmpz_poly_t left_poly, right_poly, quotient;
    if (fmpz_mat_nrows(output) != 1 || fmpz_mat_nrows(left) != 1 ||
        fmpz_mat_nrows(right) != 1 ||
        fmpz_mat_ncols(output) != fmpz_mat_ncols(left) ||
        fmpz_mat_ncols(right) == 0)
        return 0;
    fmpz_poly_init(left_poly);
    fmpz_poly_init(right_poly);
    fmpz_poly_init(quotient);
    sagejs_flint_fmpz_poly_set_packed(left_poly, left);
    sagejs_flint_fmpz_poly_set_packed(right_poly, right);
    divides = fmpz_poly_divides(quotient, left_poly, right_poly);
    if (divides)
        sagejs_flint_fmpz_poly_get_packed(output, quotient);
    fmpz_poly_clear(quotient);
    fmpz_poly_clear(right_poly);
    fmpz_poly_clear(left_poly);
    return divides;
}

static inline int sagejs_flint_fmpq_poly_divexact_packed(
    fmpz_mat_t output_numerators,
    fmpz_mat_t output_denominators,
    const fmpz_mat_t left_numerators,
    const fmpz_mat_t left_denominators,
    const fmpz_mat_t right_numerators,
    const fmpz_mat_t right_denominators)
{
    int divides = 0;
    fmpq_poly_t left, right, quotient;
    const slong output_length = fmpz_mat_ncols(output_numerators);
    if (fmpz_mat_nrows(output_numerators) != 1 ||
        fmpz_mat_nrows(output_denominators) != 1 ||
        fmpz_mat_ncols(output_denominators) != output_length ||
        output_length != fmpz_mat_ncols(left_numerators) ||
        fmpz_mat_ncols(right_numerators) == 0)
        return 0;
    fmpq_poly_init(left);
    fmpq_poly_init(right);
    fmpq_poly_init(quotient);
    if (sagejs_flint_fmpq_poly_set_parts(
            left, left_numerators, left_denominators) &&
        sagejs_flint_fmpq_poly_set_parts(
            right, right_numerators, right_denominators))
    {
        divides = fmpq_poly_divides(quotient, left, right);
        if (divides)
            divides = sagejs_flint_fmpq_poly_get_parts(
                output_numerators, output_denominators, quotient);
    }
    fmpq_poly_clear(quotient);
    fmpq_poly_clear(right);
    fmpq_poly_clear(left);
    return divides;
}

static inline int sagejs_flint_nmod_poly_gcd_packed(
    uint64_t *output,
    uint64_t *left,
    uint64_t *right,
    uint64_t output_length,
    uint64_t left_length,
    uint64_t right_length,
    uint64_t modulus)
{
    nmod_poly_t left_poly, right_poly, gcd;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        output_length < left_length || output_length < right_length ||
        output_length > (uint64_t) WORD_MAX)
        return 0;
    nmod_poly_init(left_poly, (ulong) modulus);
    nmod_poly_init(right_poly, (ulong) modulus);
    nmod_poly_init(gcd, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        left_poly, left, left_length, modulus);
    sagejs_flint_nmod_poly_set_packed(
        right_poly, right, right_length, modulus);
    nmod_poly_gcd(gcd, left_poly, right_poly);
    sagejs_flint_nmod_poly_get_packed(output, output_length, gcd);
    nmod_poly_clear(gcd);
    nmod_poly_clear(right_poly);
    nmod_poly_clear(left_poly);
    return 1;
}

static inline int sagejs_flint_nmod_poly_is_irreducible_packed(
    uint64_t *source,
    uint64_t source_length,
    uint64_t modulus)
{
    int result;
    nmod_poly_t polynomial;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        source_length > (uint64_t) WORD_MAX)
        return 0;
    nmod_poly_init(polynomial, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        polynomial, source, source_length, modulus);
    result = nmod_poly_is_irreducible(polynomial);
    nmod_poly_clear(polynomial);
    return result;
}

/* Factorization outputs use a compact caller-owned encoding.  The coefficient
 * buffer stores every factor consecutively; offsets delimit those factors;
 * exponents and factor_count carry the remaining metadata. */
static inline int sagejs_flint_nmod_poly_factor_packed(
    uint64_t *factor_coefficients,
    uint64_t *offsets,
    uint64_t *exponents,
    uint64_t *factor_count,
    uint64_t *unit_output,
    uint64_t *source,
    uint64_t factor_coefficients_length,
    uint64_t offsets_length,
    uint64_t exponents_length,
    uint64_t factor_count_length,
    uint64_t unit_length,
    uint64_t source_length,
    uint64_t modulus)
{
    uint64_t cursor = 0;
    ulong unit;
    nmod_poly_t polynomial;
    nmod_poly_factor_t factors;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        source_length == 0 || source_length > (uint64_t) WORD_MAX ||
        factor_count_length != 1 || unit_length != 1 ||
        offsets_length != source_length ||
        exponents_length + 1 != source_length)
        return 0;
    nmod_poly_init(polynomial, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        polynomial, source, source_length, modulus);
    if (nmod_poly_is_zero(polynomial))
    {
        nmod_poly_clear(polynomial);
        return 0;
    }
    nmod_poly_factor_init(factors);
    unit = nmod_poly_factor(factors, polynomial);
    if ((uint64_t) factors->num > exponents_length)
        goto fail;
    offsets[0] = 0;
    for (slong factor_index = 0; factor_index < factors->num; factor_index++)
    {
        const slong length = nmod_poly_length(factors->p + factor_index);
        if (length < 0 || (uint64_t) length > factor_coefficients_length - cursor)
            goto fail;
        for (slong index = 0; index < length; index++)
            factor_coefficients[cursor + (uint64_t) index] =
                (uint64_t) nmod_poly_get_coeff_ui(
                    factors->p + factor_index, index);
        cursor += (uint64_t) length;
        offsets[factor_index + 1] = cursor;
        exponents[factor_index] = (uint64_t) factors->exp[factor_index];
    }
    factor_count[0] = (uint64_t) factors->num;
    unit_output[0] = (uint64_t) unit;
    nmod_poly_factor_clear(factors);
    nmod_poly_clear(polynomial);
    return 1;
fail:
    nmod_poly_factor_clear(factors);
    nmod_poly_clear(polynomial);
    return 0;
}

static inline int sagejs_flint_nmod_poly_roots_packed(
    uint64_t *root_values,
    uint64_t *multiplicities,
    uint64_t *root_count,
    uint64_t *source,
    uint64_t root_values_length,
    uint64_t multiplicities_length,
    uint64_t root_count_length,
    uint64_t source_length,
    uint64_t modulus)
{
    nmod_poly_t polynomial;
    nmod_poly_factor_t roots;
    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        source_length == 0 || source_length > (uint64_t) WORD_MAX ||
        root_values_length + 1 != source_length ||
        multiplicities_length != root_values_length ||
        root_count_length != 1)
        return 0;
    nmod_poly_init(polynomial, (ulong) modulus);
    sagejs_flint_nmod_poly_set_packed(
        polynomial, source, source_length, modulus);
    if (nmod_poly_is_zero(polynomial))
    {
        nmod_poly_clear(polynomial);
        return 0;
    }
    nmod_poly_factor_init(roots);
    nmod_poly_roots(roots, polynomial, 1);
    if ((uint64_t) roots->num > root_values_length)
        goto fail_roots;
    for (slong index = 0; index < roots->num; index++)
    {
        const ulong constant = nmod_poly_get_coeff_ui(roots->p + index, 0);
        root_values[index] = constant == 0 ? 0 : modulus - constant;
        multiplicities[index] = (uint64_t) roots->exp[index];
    }
    root_count[0] = (uint64_t) roots->num;
    nmod_poly_factor_clear(roots);
    nmod_poly_clear(polynomial);
    return 1;
fail_roots:
    nmod_poly_factor_clear(roots);
    nmod_poly_clear(polynomial);
    return 0;
}

static inline int sagejs_flint_fmpz_poly_factor_parts_packed(
    fmpz_mat_t factor_coefficients,
    uint64_t *offsets,
    uint64_t *exponents,
    uint64_t *factor_count,
    fmpz_mat_t unit_numerator,
    fmpz_mat_t unit_denominator,
    const fmpz_poly_t numerator,
    const fmpz_t denominator)
{
    slong cursor = 0;
    fmpz_poly_factor_t factors;
    const slong coefficient_capacity = fmpz_mat_ncols(factor_coefficients);
    const uint64_t offsets_length = (uint64_t) fmpz_poly_length(numerator);
    if (fmpz_poly_is_zero(numerator) ||
        fmpz_mat_nrows(factor_coefficients) != 1 ||
        fmpz_mat_nrows(unit_numerator) != 1 ||
        fmpz_mat_ncols(unit_numerator) != 1 ||
        fmpz_mat_nrows(unit_denominator) != 1 ||
        fmpz_mat_ncols(unit_denominator) != 1)
        return 0;
    fmpz_poly_factor_init(factors);
    fmpz_poly_factor(factors, numerator);
    if ((uint64_t) factors->num + 1 > offsets_length)
        goto fail_fmpz_factor;
    offsets[0] = 0;
    for (slong factor_index = 0; factor_index < factors->num; factor_index++)
    {
        const slong length = fmpz_poly_length(factors->p + factor_index);
        if (length > coefficient_capacity - cursor)
            goto fail_fmpz_factor;
        for (slong index = 0; index < length; index++)
            fmpz_poly_get_coeff_fmpz(
                fmpz_mat_entry(factor_coefficients, 0, cursor + index),
                factors->p + factor_index,
                index);
        cursor += length;
        offsets[factor_index + 1] = (uint64_t) cursor;
        exponents[factor_index] = (uint64_t) factors->exp[factor_index];
    }
    factor_count[0] = (uint64_t) factors->num;
    fmpz_set(fmpz_mat_entry(unit_numerator, 0, 0), &factors->c);
    fmpz_set(fmpz_mat_entry(unit_denominator, 0, 0), denominator);
    fmpz_poly_factor_clear(factors);
    return 1;
fail_fmpz_factor:
    fmpz_poly_factor_clear(factors);
    return 0;
}

static inline int sagejs_flint_fmpz_poly_factor_packed(
    fmpz_mat_t factor_coefficients,
    uint64_t *offsets,
    uint64_t *exponents,
    uint64_t *factor_count,
    fmpz_mat_t unit_numerator,
    fmpz_mat_t unit_denominator,
    const fmpz_mat_t source)
{
    int success;
    fmpz_t denominator;
    fmpz_poly_t polynomial;
    if (fmpz_mat_nrows(source) != 1)
        return 0;
    fmpz_init(denominator);
    fmpz_one(denominator);
    fmpz_poly_init(polynomial);
    sagejs_flint_fmpz_poly_set_packed(polynomial, source);
    success = sagejs_flint_fmpz_poly_factor_parts_packed(
        factor_coefficients, offsets, exponents, factor_count,
        unit_numerator, unit_denominator, polynomial, denominator);
    fmpz_poly_clear(polynomial);
    fmpz_clear(denominator);
    return success;
}

static inline int sagejs_flint_fmpq_poly_factor_packed(
    fmpz_mat_t factor_coefficients,
    uint64_t *offsets,
    uint64_t *exponents,
    uint64_t *factor_count,
    fmpz_mat_t unit_numerator,
    fmpz_mat_t unit_denominator,
    const fmpz_mat_t source_numerators,
    const fmpz_mat_t source_denominators)
{
    int success = 0;
    fmpz_t denominator;
    fmpz_poly_t numerator;
    fmpq_poly_t polynomial;
    fmpz_init(denominator);
    fmpz_poly_init(numerator);
    fmpq_poly_init(polynomial);
    if (sagejs_flint_fmpq_poly_set_parts(
            polynomial, source_numerators, source_denominators))
    {
        fmpq_poly_get_numerator(numerator, polynomial);
        fmpq_poly_get_denominator(denominator, polynomial);
        success = sagejs_flint_fmpz_poly_factor_parts_packed(
            factor_coefficients, offsets, exponents, factor_count,
            unit_numerator, unit_denominator, numerator, denominator);
    }
    fmpq_poly_clear(polynomial);
    fmpz_poly_clear(numerator);
    fmpz_clear(denominator);
    return success;
}

/* Host-neutral characteristic polynomial adapter.  Both buffers have a
 * stable row-major/scalar ABI; no FLINT object or host runtime handle crosses
 * this boundary. */
static inline int sagejs_flint_nmod_mat_charpoly_packed(
    uint64_t *output,
    uint64_t *source,
    uint64_t output_length,
    uint64_t source_length,
    uint64_t size,
    uint64_t modulus)
{
    nmod_mat_t matrix;
    nmod_poly_t polynomial;

    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        size > (uint64_t) WORD_MAX ||
        (size != 0 && size > UINT64_MAX / size) ||
        source_length != size * size ||
        size == UINT64_MAX || output_length != size + 1)
        return 0;
    nmod_mat_init(matrix, (slong) size, (slong) size, (ulong) modulus);
    nmod_poly_init(polynomial, (ulong) modulus);
    for (uint64_t row = 0; row < size; row++)
        for (uint64_t column = 0; column < size; column++)
            nmod_mat_entry(matrix, (slong) row, (slong) column) =
                (ulong) (source[row * size + column] % modulus);
    nmod_mat_charpoly(polynomial, matrix);
    for (uint64_t index = 0; index < output_length; index++)
        output[index] = (uint64_t) nmod_poly_get_coeff_ui(
            polynomial, (slong) index);
    nmod_poly_clear(polynomial);
    nmod_mat_clear(matrix);
    return 1;
}

static inline int sagejs_flint_nmod_mat_minpoly_packed(
    uint64_t *output,
    uint64_t *source,
    uint64_t output_length,
    uint64_t source_length,
    uint64_t size,
    uint64_t modulus)
{
    nmod_mat_t matrix;
    nmod_poly_t polynomial;

    if (modulus < 2 || !n_is_prime((ulong) modulus) ||
        size > (uint64_t) WORD_MAX ||
        (size != 0 && size > UINT64_MAX / size) ||
        source_length != size * size ||
        size == UINT64_MAX || output_length != size + 1)
        return 0;
    nmod_mat_init(matrix, (slong) size, (slong) size, (ulong) modulus);
    nmod_poly_init(polynomial, (ulong) modulus);
    for (uint64_t row = 0; row < size; row++)
        for (uint64_t column = 0; column < size; column++)
            nmod_mat_entry(matrix, (slong) row, (slong) column) =
                (ulong) (source[row * size + column] % modulus);
    nmod_mat_minpoly(polynomial, matrix);
    for (uint64_t index = 0; index < output_length; index++)
        output[index] = index < (uint64_t) nmod_poly_length(polynomial)
            ? (uint64_t) nmod_poly_get_coeff_ui(polynomial, (slong) index)
            : 0;
    nmod_poly_clear(polynomial);
    nmod_mat_clear(matrix);
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

/* Host-neutral exact-matrix operations.  The generated declaration adapter
 * owns initialization, conversion, transactional copy-back, and cleanup of
 * every fmpz_mat_t.  These small wrappers express only algebraic shape rules
 * that are absent from the raw FLINT signatures. */
static inline int sagejs_flint_fmpz_mat_mul(
    fmpz_mat_t output, const fmpz_mat_t left, const fmpz_mat_t right)
{
    if (fmpz_mat_nrows(output) != fmpz_mat_nrows(left) ||
        fmpz_mat_ncols(left) != fmpz_mat_nrows(right) ||
        fmpz_mat_ncols(output) != fmpz_mat_ncols(right))
        return 0;
    fmpz_mat_mul(output, left, right);
    return 1;
}

static inline int sagejs_flint_fmpz_mat_det(
    fmpz_mat_t output, const fmpz_mat_t source)
{
    if (fmpz_mat_nrows(output) != 1 || fmpz_mat_ncols(output) != 1 ||
        fmpz_mat_nrows(source) != fmpz_mat_ncols(source))
        return 0;
    fmpz_mat_det(fmpz_mat_entry(output, 0, 0), source);
    return 1;
}

static inline int sagejs_flint_fmpz_mat_charpoly(
    fmpz_mat_t output, const fmpz_mat_t source)
{
    fmpz_poly_t polynomial;
    const slong size = fmpz_mat_nrows(source);
    if (fmpz_mat_ncols(source) != size ||
        fmpz_mat_nrows(output) != 1 ||
        fmpz_mat_ncols(output) != size + 1)
        return 0;
    fmpz_poly_init(polynomial);
    fmpz_mat_charpoly(polynomial, source);
    for (slong index = 0; index <= size; index++)
        fmpz_poly_get_coeff_fmpz(
            fmpz_mat_entry(output, 0, index), polynomial, index);
    fmpz_poly_clear(polynomial);
    return 1;
}

static inline int sagejs_flint_fmpz_mat_hnf(
    fmpz_mat_t output, const fmpz_mat_t source)
{
    if (fmpz_mat_nrows(output) != fmpz_mat_nrows(source) ||
        fmpz_mat_ncols(output) != fmpz_mat_ncols(source))
        return 0;
    fmpz_mat_hnf(output, source);
    return 1;
}

static inline int sagejs_flint_fmpz_mat_hnf_modular_eldiv(
    fmpz_mat_t output, const fmpz_mat_t source,
    const fmpz_mat_t elementary_divisor)
{
    if (fmpz_mat_nrows(output) != fmpz_mat_nrows(source) ||
        fmpz_mat_ncols(output) != fmpz_mat_ncols(source) ||
        fmpz_mat_nrows(elementary_divisor) != 1 ||
        fmpz_mat_ncols(elementary_divisor) != 1 ||
        fmpz_sgn(fmpz_mat_entry(elementary_divisor, 0, 0)) <= 0)
        return 0;
    fmpz_mat_set(output, source);
    fmpz_mat_hnf_modular_eldiv(
        output, fmpz_mat_entry(elementary_divisor, 0, 0));
    return 1;
}

static inline int sagejs_flint_fmpz_mat_hnf_transform(
    fmpz_mat_t output, fmpz_mat_t transform, const fmpz_mat_t source)
{
    const slong rows = fmpz_mat_nrows(source);
    if (fmpz_mat_nrows(output) != rows ||
        fmpz_mat_ncols(output) != fmpz_mat_ncols(source) ||
        fmpz_mat_nrows(transform) != rows ||
        fmpz_mat_ncols(transform) != rows)
        return 0;
    fmpz_mat_hnf_transform(output, transform, source);
    return 1;
}

static inline int sagejs_flint_fmpz_mat_lll_transform(
    fmpz_mat_t output, fmpz_mat_t transform, const fmpz_mat_t source)
{
    const slong rows = fmpz_mat_nrows(source);
    const slong columns = fmpz_mat_ncols(source);
    fmpz_lll_t context;
    if (rows <= 0 || columns <= 0 || rows > columns ||
        fmpz_mat_nrows(output) != rows ||
        fmpz_mat_ncols(output) != columns ||
        fmpz_mat_nrows(transform) != rows ||
        fmpz_mat_ncols(transform) != rows)
        return 0;
    fmpz_mat_set(output, source);
    fmpz_mat_one(transform);
    fmpz_lll_context_init(context, 0.75, 0.5, Z_BASIS, EXACT);
    fmpz_lll(output, transform, context);
    return 1;
}

static inline int sagejs_flint_fmpz_mat_snf_transform(
    fmpz_mat_t output,
    fmpz_mat_t left_transform,
    fmpz_mat_t right_transform,
    const fmpz_mat_t source)
{
    const slong rows = fmpz_mat_nrows(source);
    const slong columns = fmpz_mat_ncols(source);
    if (fmpz_mat_nrows(output) != rows ||
        fmpz_mat_ncols(output) != columns ||
        fmpz_mat_nrows(left_transform) != rows ||
        fmpz_mat_ncols(left_transform) != rows ||
        fmpz_mat_nrows(right_transform) != columns ||
        fmpz_mat_ncols(right_transform) != columns)
        return 0;
    fmpz_mat_snf_transform(
        output, left_transform, right_transform, source);
    return 1;
}

static inline slong sagejs_flint_fmpz_mat_right_kernel(
    fmpz_mat_t output, const fmpz_mat_t source)
{
    const slong rows = fmpz_mat_nrows(source);
    const slong columns = fmpz_mat_ncols(source);
    const slong rank = fmpz_mat_rank(source);
    const slong nullity = columns - rank;
    fmpz_mat_t transpose;
    fmpz_mat_t hermite;
    fmpz_mat_t transform;
    fmpz_mat_t basis;
    if (fmpz_mat_nrows(output) != columns ||
        fmpz_mat_ncols(output) != columns)
        return -1;
    fmpz_mat_init(transpose, columns, rows);
    fmpz_mat_init(hermite, columns, rows);
    fmpz_mat_init(transform, columns, columns);
    fmpz_mat_init(basis, nullity, columns);
    fmpz_mat_transpose(transpose, source);
    fmpz_mat_hnf_transform(hermite, transform, transpose);
    for (slong row = 0; row < nullity; row++)
        for (slong column = 0; column < columns; column++)
            fmpz_set(
                fmpz_mat_entry(basis, row, column),
                fmpz_mat_entry(transform, rank + row, column));
    fmpz_mat_zero(output);
    if (nullity != 0)
    {
        fmpz_mat_t answer;
        fmpz_mat_init(answer, nullity, columns);
        fmpz_mat_hnf(answer, basis);
        for (slong row = 0; row < nullity; row++)
            for (slong column = 0; column < columns; column++)
                fmpz_set(
                    fmpz_mat_entry(output, row, column),
                    fmpz_mat_entry(answer, row, column));
        fmpz_mat_clear(answer);
    }
    fmpz_mat_clear(basis);
    fmpz_mat_clear(transform);
    fmpz_mat_clear(hermite);
    fmpz_mat_clear(transpose);
    return nullity;
}

/* Host-neutral rational matrices use two packed exact-integer matrices.
 * The generated declaration adapter owns those buffers and the temporary
 * fmpz_mat_t values.  These helpers alone construct lexical fmpq_mat_t
 * values, so public mathematical objects never own a FLINT or Node-API
 * handle. */
static inline int sagejs_flint_fmpq_mat_set_parts(
    fmpq_mat_t output,
    const fmpz_mat_t numerators,
    const fmpz_mat_t denominators)
{
    const slong rows = fmpq_mat_nrows(output);
    const slong columns = fmpq_mat_ncols(output);
    if (fmpz_mat_nrows(numerators) != rows ||
        fmpz_mat_ncols(numerators) != columns ||
        fmpz_mat_nrows(denominators) != rows ||
        fmpz_mat_ncols(denominators) != columns)
        return 0;
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
        {
            const fmpz *denominator =
                fmpz_mat_entry(denominators, row, column);
            if (fmpz_is_zero(denominator))
                return 0;
            fmpq_set_fmpz_frac(
                fmpq_mat_entry(output, row, column),
                fmpz_mat_entry(numerators, row, column),
                denominator);
            fmpq_canonicalise(fmpq_mat_entry(output, row, column));
        }
    return 1;
}

static inline int sagejs_flint_fmpq_mat_get_parts(
    fmpz_mat_t numerators,
    fmpz_mat_t denominators,
    const fmpq_mat_t source)
{
    const slong rows = fmpq_mat_nrows(source);
    const slong columns = fmpq_mat_ncols(source);
    if (fmpz_mat_nrows(numerators) != rows ||
        fmpz_mat_ncols(numerators) != columns ||
        fmpz_mat_nrows(denominators) != rows ||
        fmpz_mat_ncols(denominators) != columns)
        return 0;
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
        {
            const fmpq *entry = fmpq_mat_entry(source, row, column);
            fmpz_set(fmpz_mat_entry(numerators, row, column),
                fmpq_numref(entry));
            fmpz_set(fmpz_mat_entry(denominators, row, column),
                fmpq_denref(entry));
        }
    return 1;
}

static inline int sagejs_flint_fmpq_mat_mul_parts(
    fmpz_mat_t output_numerators,
    fmpz_mat_t output_denominators,
    const fmpz_mat_t left_numerators,
    const fmpz_mat_t left_denominators,
    const fmpz_mat_t right_numerators,
    const fmpz_mat_t right_denominators)
{
    int success = 0;
    fmpq_mat_t left, right, output;
    fmpq_mat_init(left, fmpz_mat_nrows(left_numerators),
        fmpz_mat_ncols(left_numerators));
    fmpq_mat_init(right, fmpz_mat_nrows(right_numerators),
        fmpz_mat_ncols(right_numerators));
    fmpq_mat_init(output, fmpz_mat_nrows(output_numerators),
        fmpz_mat_ncols(output_numerators));
    if (!sagejs_flint_fmpq_mat_set_parts(
            left, left_numerators, left_denominators) ||
        !sagejs_flint_fmpq_mat_set_parts(
            right, right_numerators, right_denominators) ||
        fmpq_mat_nrows(output) != fmpq_mat_nrows(left) ||
        fmpq_mat_ncols(left) != fmpq_mat_nrows(right) ||
        fmpq_mat_ncols(output) != fmpq_mat_ncols(right))
        goto cleanup;
    fmpq_mat_mul(output, left, right);
    success = sagejs_flint_fmpq_mat_get_parts(
        output_numerators, output_denominators, output);
cleanup:
    fmpq_mat_clear(output);
    fmpq_mat_clear(right);
    fmpq_mat_clear(left);
    return success;
}

static inline int sagejs_flint_fmpq_mat_rank_parts(
    fmpz_mat_t output_rank,
    const fmpz_mat_t numerators,
    const fmpz_mat_t denominators)
{
    slong rank = -1;
    fmpq_mat_t source, reduced;
    if (fmpz_mat_nrows(output_rank) != 1 ||
        fmpz_mat_ncols(output_rank) != 1)
        return 0;
    fmpq_mat_init(source, fmpz_mat_nrows(numerators),
        fmpz_mat_ncols(numerators));
    fmpq_mat_init(reduced, fmpz_mat_nrows(numerators),
        fmpz_mat_ncols(numerators));
    if (sagejs_flint_fmpq_mat_set_parts(
            source, numerators, denominators))
        rank = fmpq_mat_rref(reduced, source);
    fmpq_mat_clear(reduced);
    fmpq_mat_clear(source);
    if (rank < 0)
        return 0;
    fmpz_set_si(fmpz_mat_entry(output_rank, 0, 0), rank);
    return 1;
}

static inline int sagejs_flint_fmpq_mat_rref_parts(
    fmpz_mat_t output_rank,
    fmpz_mat_t output_numerators,
    fmpz_mat_t output_denominators,
    const fmpz_mat_t source_numerators,
    const fmpz_mat_t source_denominators)
{
    slong rank = -1;
    fmpq_mat_t source, output;
    if (fmpz_mat_nrows(output_rank) != 1 ||
        fmpz_mat_ncols(output_rank) != 1)
        return 0;
    fmpq_mat_init(source, fmpz_mat_nrows(source_numerators),
        fmpz_mat_ncols(source_numerators));
    fmpq_mat_init(output, fmpz_mat_nrows(output_numerators),
        fmpz_mat_ncols(output_numerators));
    if (sagejs_flint_fmpq_mat_set_parts(
            source, source_numerators, source_denominators) &&
        fmpq_mat_nrows(output) == fmpq_mat_nrows(source) &&
        fmpq_mat_ncols(output) == fmpq_mat_ncols(source))
    {
        rank = fmpq_mat_rref(output, source);
        if (!sagejs_flint_fmpq_mat_get_parts(
                output_numerators, output_denominators, output))
            rank = -1;
    }
    fmpq_mat_clear(output);
    fmpq_mat_clear(source);
    if (rank < 0)
        return 0;
    fmpz_set_si(fmpz_mat_entry(output_rank, 0, 0), rank);
    return 1;
}

static inline int sagejs_flint_fmpq_mat_inv_parts(
    fmpz_mat_t output_numerators,
    fmpz_mat_t output_denominators,
    const fmpz_mat_t source_numerators,
    const fmpz_mat_t source_denominators)
{
    int success = 0;
    fmpq_mat_t source, output;
    fmpq_mat_init(source, fmpz_mat_nrows(source_numerators),
        fmpz_mat_ncols(source_numerators));
    fmpq_mat_init(output, fmpz_mat_nrows(output_numerators),
        fmpz_mat_ncols(output_numerators));
    if (sagejs_flint_fmpq_mat_set_parts(
            source, source_numerators, source_denominators) &&
        fmpq_mat_nrows(source) == fmpq_mat_ncols(source) &&
        fmpq_mat_nrows(output) == fmpq_mat_nrows(source) &&
        fmpq_mat_ncols(output) == fmpq_mat_ncols(source) &&
        fmpq_mat_inv(output, source))
        success = sagejs_flint_fmpq_mat_get_parts(
            output_numerators, output_denominators, output);
    fmpq_mat_clear(output);
    fmpq_mat_clear(source);
    return success;
}

static inline int sagejs_flint_fmpq_mat_solve_parts(
    fmpz_mat_t output_numerators,
    fmpz_mat_t output_denominators,
    const fmpz_mat_t left_numerators,
    const fmpz_mat_t left_denominators,
    const fmpz_mat_t right_numerators,
    const fmpz_mat_t right_denominators)
{
    int success = 0;
    fmpq_mat_t left, right, output;
    fmpq_mat_init(left, fmpz_mat_nrows(left_numerators),
        fmpz_mat_ncols(left_numerators));
    fmpq_mat_init(right, fmpz_mat_nrows(right_numerators),
        fmpz_mat_ncols(right_numerators));
    fmpq_mat_init(output, fmpz_mat_nrows(output_numerators),
        fmpz_mat_ncols(output_numerators));
    if (sagejs_flint_fmpq_mat_set_parts(
            left, left_numerators, left_denominators) &&
        sagejs_flint_fmpq_mat_set_parts(
            right, right_numerators, right_denominators) &&
        fmpq_mat_nrows(left) == fmpq_mat_ncols(left) &&
        fmpq_mat_nrows(right) == fmpq_mat_nrows(left) &&
        fmpq_mat_nrows(output) == fmpq_mat_ncols(left) &&
        fmpq_mat_ncols(output) == fmpq_mat_ncols(right) &&
        fmpq_mat_solve(output, left, right))
        success = sagejs_flint_fmpq_mat_get_parts(
            output_numerators, output_denominators, output);
    fmpq_mat_clear(output);
    fmpq_mat_clear(right);
    fmpq_mat_clear(left);
    return success;
}

static inline int sagejs_flint_fmpq_mat_det_parts(
    fmpz_mat_t output_numerators,
    fmpz_mat_t output_denominators,
    const fmpz_mat_t source_numerators,
    const fmpz_mat_t source_denominators)
{
    int success = 0;
    fmpq_mat_t source;
    fmpq_t determinant;
    if (fmpz_mat_nrows(output_numerators) != 1 ||
        fmpz_mat_ncols(output_numerators) != 1 ||
        fmpz_mat_nrows(output_denominators) != 1 ||
        fmpz_mat_ncols(output_denominators) != 1)
        return 0;
    fmpq_mat_init(source, fmpz_mat_nrows(source_numerators),
        fmpz_mat_ncols(source_numerators));
    fmpq_init(determinant);
    if (sagejs_flint_fmpq_mat_set_parts(
            source, source_numerators, source_denominators) &&
        fmpq_mat_nrows(source) == fmpq_mat_ncols(source))
    {
        fmpq_mat_det(determinant, source);
        fmpz_set(fmpz_mat_entry(output_numerators, 0, 0),
            fmpq_numref(determinant));
        fmpz_set(fmpz_mat_entry(output_denominators, 0, 0),
            fmpq_denref(determinant));
        success = 1;
    }
    fmpq_clear(determinant);
    fmpq_mat_clear(source);
    return success;
}

static inline int sagejs_flint_fmpq_mat_charpoly_parts(
    fmpz_mat_t output_numerators,
    fmpz_mat_t output_denominators,
    const fmpz_mat_t source_numerators,
    const fmpz_mat_t source_denominators)
{
    int success = 0;
    const slong size = fmpz_mat_nrows(source_numerators);
    fmpq_mat_t source;
    fmpq_poly_t polynomial;
    fmpq_t coefficient;
    if (fmpz_mat_ncols(source_numerators) != size ||
        fmpz_mat_nrows(output_numerators) != 1 ||
        fmpz_mat_ncols(output_numerators) != size + 1 ||
        fmpz_mat_nrows(output_denominators) != 1 ||
        fmpz_mat_ncols(output_denominators) != size + 1)
        return 0;
    fmpq_mat_init(source, size, size);
    fmpq_poly_init(polynomial);
    fmpq_init(coefficient);
    if (sagejs_flint_fmpq_mat_set_parts(
            source, source_numerators, source_denominators))
    {
        fmpq_mat_charpoly(polynomial, source);
        for (slong index = 0; index <= size; index++)
        {
            fmpq_poly_get_coeff_fmpq(coefficient, polynomial, index);
            fmpz_set(fmpz_mat_entry(output_numerators, 0, index),
                fmpq_numref(coefficient));
            fmpz_set(fmpz_mat_entry(output_denominators, 0, index),
                fmpq_denref(coefficient));
        }
        success = 1;
    }
    fmpq_clear(coefficient);
    fmpq_poly_clear(polynomial);
    fmpq_mat_clear(source);
    return success;
}

/* Batch rigorous log(n) and sqrt(n) endpoint construction through Arb.
 *
 * Both matrices are caller-owned packed IntegerBuffers adapted by the
 * declaration-generated FFI.  Each input row is a positive machine-word
 * integer.  Four output rows at scale 2^precision are written in the order
 * log lower, log upper, square-root lower, square-root upper.  No Arb object
 * or pointer crosses the host-neutral boundary.
 */
static inline int sagejs_flint_integer_log_sqrt_balls_packed(
    fmpz_mat_t output,
    const fmpz_mat_t source,
    uint64_t precision)
{
    const slong count = fmpz_mat_nrows(source);
    const uint64_t maximum_precision = UINT64_C(4096);
    arb_t logarithm, square_root;
    arf_t lower, upper;

    if (fmpz_mat_ncols(source) != 1 ||
        fmpz_mat_ncols(output) != 1 ||
        count < 0 || count > 1000000 ||
        fmpz_mat_nrows(output) != 4 * count ||
        precision < 16 || precision > maximum_precision ||
        precision > (uint64_t) (WORD_MAX - 32))
        return 0;

    arb_init(logarithm);
    arb_init(square_root);
    arf_init(lower);
    arf_init(upper);
    for (slong index = 0; index < count; index++)
    {
        const fmpz *value = fmpz_mat_entry(source, index, 0);
        const slong offset = 4 * index;
        if (fmpz_sgn(value) <= 0 || !fmpz_abs_fits_ui(value))
            goto failure;

        arb_log_ui(logarithm, fmpz_get_ui(value), (slong) precision + 32);
        arb_get_interval_arf(
            lower, upper, logarithm, (slong) precision + 32);
        arf_mul_2exp_si(lower, lower, (slong) precision);
        arf_mul_2exp_si(upper, upper, (slong) precision);
        arf_get_fmpz(
            fmpz_mat_entry(output, offset, 0), lower, ARF_RND_FLOOR);
        arf_get_fmpz(
            fmpz_mat_entry(output, offset + 1, 0), upper, ARF_RND_CEIL);

        arb_sqrt_ui(square_root, fmpz_get_ui(value), (slong) precision + 32);
        arb_get_interval_arf(
            lower, upper, square_root, (slong) precision + 32);
        arf_mul_2exp_si(lower, lower, (slong) precision);
        arf_mul_2exp_si(upper, upper, (slong) precision);
        arf_get_fmpz(
            fmpz_mat_entry(output, offset + 2, 0), lower, ARF_RND_FLOOR);
        arf_get_fmpz(
            fmpz_mat_entry(output, offset + 3, 0), upper, ARF_RND_CEIL);
    }
    arf_clear(upper);
    arf_clear(lower);
    arb_clear(square_root);
    arb_clear(logarithm);
    return 1;

failure:
    arf_clear(upper);
    arf_clear(lower);
    arb_clear(square_root);
    arb_clear(logarithm);
    return 0;
}

#ifdef __cplusplus
}
#endif

#endif
