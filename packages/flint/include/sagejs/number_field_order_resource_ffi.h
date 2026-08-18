#ifndef SAGEJS_NUMBER_FIELD_ORDER_RESOURCE_FFI_H
#define SAGEJS_NUMBER_FIELD_ORDER_RESOURCE_FFI_H

#include <limits.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <flint/flint.h>
#include <flint/fmpq_mat.h>
#include <flint/fmpz.h>
#include <flint/fmpz_mat.h>
#include <flint/fmpz_poly.h>
#include <flint/fmpz_vec.h>

#include "sagejs/exact_polynomial_ffi.h"
#include "sagejs/fmpz_matrix_ffi.h"
#include "sagejs/number_field_order_ffi.h"

#define SAGEJS_NF_ORDER_RESOURCE_ABI_VERSION UINT64_C(1)

/*
 * Host-neutral direct polynomial-to-order boundary.
 *
 * The caller supplies a sealed, monic integral polynomial and a one-column
 * fmpz matrix of certified local-prime hints.  No multiplication table crosses
 * the host boundary: for the word-prime Round-2 path it is constructed from
 * the polynomial entirely inside FLINT storage.  Arbitrary-size primes are
 * accepted without narrowing.  An unramified large prime is discharged using
 * the exact polynomial discriminant; a ramified prime larger than FLINT's
 * nmod word is reported as a strict dynamic-fallback capability result.
 *
 * A successful result owns one deterministic compact transfer.  Its basis is
 * canonical row HNF numerator / positive common denominator, followed by
 * exact equation/order discriminants and the equation-order index.  No FLINT
 * pointer escapes and clear is deterministic and idempotent at the generated
 * owner boundary.
 */

typedef enum
{
    SAGEJS_NF_ORDER_COMPLETE = 0,
    SAGEJS_NF_ORDER_FALLBACK_ARBITRARY_PRIME = 1,
    SAGEJS_NF_ORDER_FALLBACK_NATIVE_FAILURE = 2
} sagejs_number_field_order_status;

typedef struct
{
    unsigned char *data;
    size_t length;
    uint64_t degree;
    uint64_t supplied_prime_count;
    uint64_t resolved_prime_count;
    uint64_t native_prime_count;
    uint64_t unramified_prime_count;
    uint32_t status;
    size_t retained_bytes;
} sagejs_number_field_order_resource_struct;

typedef sagejs_number_field_order_resource_struct
    sagejs_number_field_order_resource_t[1];

static inline void sagejs_number_field_order_resource_reset(
    sagejs_number_field_order_resource_t resource)
{
    resource->data = NULL;
    resource->length = 0;
    resource->degree = 0;
    resource->supplied_prime_count = 0;
    resource->resolved_prime_count = 0;
    resource->native_prime_count = 0;
    resource->unramified_prime_count = 0;
    resource->status = SAGEJS_NF_ORDER_FALLBACK_NATIVE_FAILURE;
    resource->retained_bytes = sizeof(sagejs_number_field_order_resource_struct);
}

static inline void sagejs_number_field_order_resource_clear(
    sagejs_number_field_order_resource_t resource)
{
    free(resource->data);
    sagejs_number_field_order_resource_reset(resource);
}

static inline size_t sagejs_number_field_order_resource_allocated_bytes(
    const sagejs_number_field_order_resource_t resource)
{
    return resource->retained_bytes;
}

static inline uint64_t sagejs_number_field_order_resource_length(
    const sagejs_number_field_order_resource_t resource)
{
    return (uint64_t) resource->length;
}

static inline const unsigned char *sagejs_number_field_order_resource_data(
    const sagejs_number_field_order_resource_t resource)
{
    return resource->data;
}

static inline uint64_t sagejs_number_field_order_resource_status(
    const sagejs_number_field_order_resource_t resource)
{
    return (uint64_t) resource->status;
}

static inline uint64_t sagejs_number_field_order_resource_degree(
    const sagejs_number_field_order_resource_t resource)
{
    return resource->degree;
}

static inline uint64_t sagejs_number_field_order_resource_supplied_primes(
    const sagejs_number_field_order_resource_t resource)
{
    return resource->supplied_prime_count;
}

static inline uint64_t sagejs_number_field_order_resource_resolved_primes(
    const sagejs_number_field_order_resource_t resource)
{
    return resource->resolved_prime_count;
}

static inline uint64_t sagejs_number_field_order_resource_native_primes(
    const sagejs_number_field_order_resource_t resource)
{
    return resource->native_prime_count;
}

static inline uint64_t sagejs_number_field_order_resource_unramified_primes(
    const sagejs_number_field_order_resource_t resource)
{
    return resource->unramified_prime_count;
}

/* Construct the power-basis multiplication table directly from a monic f. */
static inline int sagejs_nf_order_polynomial_multiplication_table(
    sagejs_fmpz_matrix_t table, const sagejs_fmpz_polynomial_t polynomial)
{
    const slong length = fmpz_poly_length(polynomial->value);
    if (!polynomial->sealed || length < 2 ||
        !fmpz_is_one(polynomial->value->coeffs + length - 1))
        return 0;
    const slong degree = length - 1;
    if (degree > WORD_MAX / 2 ||
        (size_t) degree > SIZE_MAX / (size_t) degree ||
        (size_t) degree * (size_t) degree > SIZE_MAX / (size_t) degree ||
        !sagejs_fmpz_matrix_init(
            table, (uint64_t) degree * (uint64_t) degree,
            (uint64_t) degree))
        return 0;

    fmpz_mat_t powers;
    fmpz_mat_init(powers, 2 * degree - 1, degree);
    for (slong exponent = 0; exponent < degree; exponent++)
        fmpz_one(fmpz_mat_entry(powers, exponent, exponent));
    for (slong exponent = degree; exponent < 2 * degree - 1; exponent++)
    {
        const fmpz *leading = fmpz_mat_entry(
            powers, exponent - 1, degree - 1);
        for (slong coordinate = 1; coordinate < degree; coordinate++)
            fmpz_set(fmpz_mat_entry(powers, exponent, coordinate),
                fmpz_mat_entry(powers, exponent - 1, coordinate - 1));
        for (slong coordinate = 0; coordinate < degree; coordinate++)
            fmpz_submul(fmpz_mat_entry(powers, exponent, coordinate),
                leading, polynomial->value->coeffs + coordinate);
    }
    for (slong left = 0; left < degree; left++)
        for (slong right = 0; right < degree; right++)
            for (slong coordinate = 0; coordinate < degree; coordinate++)
                fmpz_set(fmpz_mat_entry(
                    table->value, left * degree + right, coordinate),
                    fmpz_mat_entry(powers, left + right, coordinate));
    fmpz_mat_clear(powers);
    sagejs_fmpz_matrix_recompute_allocated_bytes(table);
    return 1;
}

static inline void sagejs_nf_order_identity_basis(
    fmpz_mat_t numerator, fmpz_t denominator, slong degree)
{
    fmpz_mat_one(numerator);
    fmpz_one(denominator);
    (void) degree;
}

/* Convert the legacy Round-2 result once, after all iterative local work. */
static inline int sagejs_nf_order_basis_from_fmpq(
    fmpz_mat_t numerator, fmpz_t denominator,
    const sagejs_fmpq_matrix_t rational)
{
    const slong rows = fmpq_mat_nrows(rational->value);
    const slong columns = fmpq_mat_ncols(rational->value);
    if (rows < 1 || rows != columns ||
        fmpz_mat_nrows(numerator) != rows ||
        fmpz_mat_ncols(numerator) != columns)
        return 0;
    fmpz_one(denominator);
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
            fmpz_lcm(denominator, denominator,
                fmpq_denref(fmpq_mat_entry(
                    rational->value, row, column)));
    fmpz_t multiplier;
    fmpz_init(multiplier);
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
        {
            const fmpq *entry = fmpq_mat_entry(
                rational->value, row, column);
            fmpz_divexact(multiplier, denominator, fmpq_denref(entry));
            fmpz_mul(fmpz_mat_entry(numerator, row, column),
                fmpq_numref(entry), multiplier);
        }
    fmpz_clear(multiplier);

    /* FLINT's HNF is canonical for the row lattice represented here. */
    fmpz_mat_t hermite;
    fmpz_mat_init(hermite, rows, columns);
    fmpz_mat_hnf(hermite, numerator);
    fmpz_mat_set(numerator, hermite);
    fmpz_mat_clear(hermite);

    fmpz_t content;
    fmpz_init_set(content, denominator);
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
            fmpz_gcd(content, content,
                fmpz_mat_entry(numerator, row, column));
    if (!fmpz_is_one(content))
    {
        fmpz_divexact(denominator, denominator, content);
        for (slong row = 0; row < rows; row++)
            for (slong column = 0; column < columns; column++)
                fmpz_divexact(fmpz_mat_entry(numerator, row, column),
                    fmpz_mat_entry(numerator, row, column), content);
    }
    fmpz_clear(content);
    return fmpz_sgn(denominator) > 0;
}

static inline int sagejs_nf_order_compute_evidence(
    fmpz_t index, fmpz_t order_discriminant,
    const fmpz_t equation_discriminant,
    const fmpz_mat_t numerator, const fmpz_t denominator)
{
    const slong degree = fmpz_mat_nrows(numerator);
    if (degree < 1 || degree != fmpz_mat_ncols(numerator) ||
        fmpz_sgn(denominator) <= 0)
        return 0;
    fmpz_t determinant, denominator_power, square;
    fmpz_init(determinant);
    fmpz_init(denominator_power);
    fmpz_init(square);
    fmpz_mat_det(determinant, numerator);
    fmpz_abs(determinant, determinant);
    fmpz_pow_ui(denominator_power, denominator, (ulong) degree);
    int valid = !fmpz_is_zero(determinant) &&
        fmpz_divisible(denominator_power, determinant);
    if (valid)
    {
        fmpz_divexact(index, denominator_power, determinant);
        fmpz_mul(square, index, index);
        valid = fmpz_divisible(equation_discriminant, square);
        if (valid)
            fmpz_divexact(order_discriminant,
                equation_discriminant, square);
    }
    fmpz_clear(square);
    fmpz_clear(denominator_power);
    fmpz_clear(determinant);
    return valid;
}

static inline int sagejs_nf_order_pack(
    sagejs_number_field_order_resource_t result,
    const fmpz_mat_t numerator, const fmpz_t denominator,
    const fmpz_t index, const fmpz_t equation_discriminant,
    const fmpz_t order_discriminant, const fmpz_t fallback_prime,
    uint32_t status, uint64_t supplied, uint64_t resolved,
    uint64_t native, uint64_t unramified)
{
    const slong degree = fmpz_mat_nrows(numerator);
    if (degree < 1 || degree != fmpz_mat_ncols(numerator))
        return 0;
    if ((uint64_t) degree > UINT64_MAX / (uint64_t) degree)
        return 0;
    size_t length = 64;
    size_t maximum_bytes = 0;
    const fmpz *metadata[] = {
        denominator, index, equation_discriminant,
        order_discriminant, fallback_prime
    };
    for (size_t entry = 0; entry < 5; entry++)
        if (!sagejs_exact_polynomial_serialized_size(
                &length, &maximum_bytes, metadata[entry]))
            return 0;
    for (slong row = 0; row < degree; row++)
        for (slong column = 0; column < degree; column++)
            if (!sagejs_exact_polynomial_serialized_size(
                    &length, &maximum_bytes,
                    fmpz_mat_entry(numerator, row, column)))
                return 0;
    unsigned char *data = (unsigned char *) malloc(length);
    if (data == NULL)
        return 0;
    memcpy(data, "SJNFO\1\0\0", 8);
    sagejs_exact_polynomial_write_u64(data, 8, (uint64_t) degree);
    sagejs_exact_polynomial_write_u64(data, 16, (uint64_t) status);
    sagejs_exact_polynomial_write_u64(data, 24, supplied);
    sagejs_exact_polynomial_write_u64(data, 32, resolved);
    sagejs_exact_polynomial_write_u64(data, 40, native);
    sagejs_exact_polynomial_write_u64(data, 48, unramified);
    sagejs_exact_polynomial_write_u64(
        data, 56, 5 + (uint64_t) degree * (uint64_t) degree);
    const size_t maximum_words =
        (maximum_bytes + sizeof(ulong) - 1) / sizeof(ulong);
    ulong *words = maximum_words == 0 ? NULL :
        (ulong *) calloc(maximum_words, sizeof(ulong));
    if (maximum_words != 0 && words == NULL)
    {
        free(data);
        return 0;
    }
    fmpz_t magnitude;
    fmpz_init(magnitude);
    size_t offset = 64;
    for (size_t entry = 0; entry < 5; entry++)
        sagejs_exact_polynomial_write_fmpz(
            data, &offset, metadata[entry], magnitude, words);
    for (slong row = 0; row < degree; row++)
        for (slong column = 0; column < degree; column++)
            sagejs_exact_polynomial_write_fmpz(data, &offset,
                fmpz_mat_entry(numerator, row, column), magnitude, words);
    fmpz_clear(magnitude);
    free(words);
    if (offset != length)
    {
        free(data);
        return 0;
    }
    result->data = data;
    result->length = length;
    result->degree = (uint64_t) degree;
    result->supplied_prime_count = supplied;
    result->resolved_prime_count = resolved;
    result->native_prime_count = native;
    result->unramified_prime_count = unramified;
    result->status = status;
    result->retained_bytes = sagejs_retained_size_add(
        sizeof(sagejs_number_field_order_resource_struct), length);
    return 1;
}

static inline int
sagejs_number_field_order_from_polynomial_resource_with_terminal_proofs(
    sagejs_number_field_order_resource_t result,
    sagejs_nf_order_terminal_proof **terminal_proofs_result,
    uint64_t *terminal_proof_count_result,
    const sagejs_fmpz_polynomial_t polynomial,
    const sagejs_fmpz_matrix_t prime_hints)
{
    sagejs_number_field_order_resource_reset(result);
    if (terminal_proofs_result != NULL)
        *terminal_proofs_result = NULL;
    if (terminal_proof_count_result != NULL)
        *terminal_proof_count_result = 0;
    if ((terminal_proofs_result == NULL) !=
        (terminal_proof_count_result == NULL))
        return 0;
    const slong length = polynomial->sealed ?
        fmpz_poly_length(polynomial->value) : 0;
    const slong degree = length - 1;
    const slong prime_count = fmpz_mat_nrows(prime_hints->value);
    if (!polynomial->sealed || degree < 1 ||
        !fmpz_is_one(polynomial->value->coeffs + degree) ||
        fmpz_mat_ncols(prime_hints->value) != 1 || prime_count < 0 ||
        (size_t) prime_count > SIZE_MAX / sizeof(uint64_t))
        return 0;

    fmpz_t equation_discriminant, denominator, index;
    fmpz_t order_discriminant, fallback_prime;
    fmpz_init(equation_discriminant);
    fmpz_init(denominator);
    fmpz_init(index);
    fmpz_init(order_discriminant);
    fmpz_init(fallback_prime);
    sagejs_nf_order_terminal_proof *terminal_proofs = NULL;
    uint64_t native_count = 0;
    fmpz_poly_discriminant(equation_discriminant, polynomial->value);
    if (fmpz_is_zero(equation_discriminant))
        goto invalid;

    uint64_t *word_primes = prime_count == 0 ? NULL :
        (uint64_t *) malloc((size_t) prime_count * sizeof(uint64_t));
    if (prime_count != 0 && word_primes == NULL)
        goto invalid;
    uint64_t unramified_count = 0;
    uint32_t status = SAGEJS_NF_ORDER_COMPLETE;
    for (slong row = 0; row < prime_count; row++)
    {
        const fmpz *prime = fmpz_mat_entry(prime_hints->value, row, 0);
        if (fmpz_cmp_ui(prime, 2) < 0 || !fmpz_is_prime(prime))
        {
            free(word_primes);
            goto invalid;
        }
        int duplicate = 0;
        for (slong previous = 0; previous < row; previous++)
            if (fmpz_equal(prime,
                    fmpz_mat_entry(prime_hints->value, previous, 0)))
                duplicate = 1;
        if (duplicate)
            continue;
        if (!fmpz_divisible(equation_discriminant, prime))
        {
            unramified_count++;
            continue;
        }
        if (fmpz_cmp_ui(prime, UWORD_MAX) > 0)
        {
            if (status == SAGEJS_NF_ORDER_COMPLETE)
                fmpz_set(fallback_prime, prime);
            status = SAGEJS_NF_ORDER_FALLBACK_ARBITRARY_PRIME;
            continue;
        }
        const ulong value = fmpz_get_ui(prime);
        word_primes[native_count++] = value;
    }

    fmpz_mat_t numerator;
    fmpz_mat_init(numerator, degree, degree);
    sagejs_nf_order_identity_basis(numerator, denominator, degree);
    if (terminal_proofs_result != NULL && native_count != 0)
        terminal_proofs = (sagejs_nf_order_terminal_proof *) flint_calloc(
            (size_t) native_count, sizeof(sagejs_nf_order_terminal_proof));
    if (status == SAGEJS_NF_ORDER_COMPLETE && native_count != 0)
    {
        sagejs_fmpz_matrix_t multiplication;
        sagejs_fmpq_matrix_t rational_basis;
        if (!sagejs_nf_order_polynomial_multiplication_table(
                multiplication, polynomial))
            status = SAGEJS_NF_ORDER_FALLBACK_NATIVE_FAILURE;
        else
        {
            if (!sagejs_number_field_order_maximal_at_primes_with_terminal_proofs(
                    rational_basis, multiplication,
                    word_primes, native_count, terminal_proofs))
                status = SAGEJS_NF_ORDER_FALLBACK_NATIVE_FAILURE;
            else
            {
                if (!sagejs_nf_order_basis_from_fmpq(
                        numerator, denominator, rational_basis))
                    status = SAGEJS_NF_ORDER_FALLBACK_NATIVE_FAILURE;
                sagejs_fmpq_matrix_clear(rational_basis);
            }
            sagejs_fmpz_matrix_clear(multiplication);
        }
    }
    if (status != SAGEJS_NF_ORDER_COMPLETE)
        sagejs_nf_order_identity_basis(numerator, denominator, degree);
    if (!sagejs_nf_order_compute_evidence(index, order_discriminant,
            equation_discriminant, numerator, denominator))
    {
        fmpz_mat_clear(numerator);
        free(word_primes);
        goto invalid;
    }
    const uint64_t resolved = status == SAGEJS_NF_ORDER_COMPLETE ?
        (uint64_t) prime_count : unramified_count;
    const int packed = sagejs_nf_order_pack(result, numerator, denominator,
        index, equation_discriminant, order_discriminant, fallback_prime,
        status, (uint64_t) prime_count, resolved,
        status == SAGEJS_NF_ORDER_COMPLETE ? native_count : 0,
        unramified_count);
    if (packed && status == SAGEJS_NF_ORDER_COMPLETE &&
        terminal_proofs_result != NULL)
    {
        *terminal_proofs_result = terminal_proofs;
        *terminal_proof_count_result = native_count;
        terminal_proofs = NULL;
    }
    if (terminal_proofs != NULL)
    {
        for (uint64_t proof = 0; proof < native_count; proof++)
            sagejs_nf_order_terminal_proof_clear(terminal_proofs + proof);
        flint_free(terminal_proofs);
    }
    fmpz_mat_clear(numerator);
    free(word_primes);
    fmpz_clear(fallback_prime);
    fmpz_clear(order_discriminant);
    fmpz_clear(index);
    fmpz_clear(denominator);
    fmpz_clear(equation_discriminant);
    return packed;

invalid:
    if (terminal_proofs != NULL)
    {
        /* `native_count` slots are zero-initialized before any worker runs. */
        for (uint64_t proof = 0; proof < native_count; proof++)
            sagejs_nf_order_terminal_proof_clear(terminal_proofs + proof);
        flint_free(terminal_proofs);
    }
    fmpz_clear(fallback_prime);
    fmpz_clear(order_discriminant);
    fmpz_clear(index);
    fmpz_clear(denominator);
    fmpz_clear(equation_discriminant);
    return 0;
}

static inline int sagejs_number_field_order_from_polynomial_resource(
    sagejs_number_field_order_resource_t result,
    const sagejs_fmpz_polynomial_t polynomial,
    const sagejs_fmpz_matrix_t prime_hints)
{
    return
        sagejs_number_field_order_from_polynomial_resource_with_terminal_proofs(
            result, NULL, NULL, polynomial, prime_hints);
}

#endif
