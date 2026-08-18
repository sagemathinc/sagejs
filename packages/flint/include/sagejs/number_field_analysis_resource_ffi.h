#ifndef SAGEJS_NUMBER_FIELD_ANALYSIS_RESOURCE_FFI_H
#define SAGEJS_NUMBER_FIELD_ANALYSIS_RESOURCE_FFI_H

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <flint/flint.h>
#include <flint/fmpz.h>
#include <flint/fmpz_mat.h>
#include <flint/fmpz_poly.h>
#include <flint/ulong_extras.h>

#include "sagejs/exact_polynomial_ffi.h"
#include "sagejs/number_field_order_resource_ffi.h"

#define SAGEJS_NF_ANALYSIS_RESOURCE_ABI_VERSION UINT64_C(1)
#define SAGEJS_NF_ANALYSIS_MAX_TRIAL_BOUND UINT64_C(65536)

/*
 * One immutable, host-neutral field-analysis result.
 *
 * The input polynomial is already the normalized monic integral equation
 * polynomial; scale records the relation between its generator and the public
 * field generator.  This boundary computes the polynomial discriminant,
 * extracts cheap certified word-prime components, retains one exact lazy
 * residual component, and computes the canonical HNF order at every extracted
 * word prime with square discriminant support.  No field object, host callback,
 * multiplication table, or cached cross-field result participates.
 *
 * The output is one copied byte payload.  It contains the source polynomial
 * and scale as well as the factor and order evidence, permitting an ordinary
 * independent implementation to authenticate the complete certificate.
 */

typedef enum
{
    SAGEJS_NF_ANALYSIS_COMPLETE_CANDIDATE = 0,
    SAGEJS_NF_ANALYSIS_FALLBACK_UNRESOLVED = 1,
    SAGEJS_NF_ANALYSIS_FALLBACK_ARBITRARY_PRIME = 2,
    SAGEJS_NF_ANALYSIS_FALLBACK_NATIVE_FAILURE = 3
} sagejs_number_field_analysis_status;

typedef enum
{
    SAGEJS_NF_ANALYSIS_COMPONENT_PROVEN_WORD_PRIME = 0,
    SAGEJS_NF_ANALYSIS_COMPONENT_UNRESOLVED = 1,
    SAGEJS_NF_ANALYSIS_COMPONENT_ARBITRARY_PRIME = 2
} sagejs_number_field_analysis_component_state;

typedef struct
{
    unsigned char *data;
    size_t length;
    size_t retained_bytes;
} sagejs_number_field_analysis_resource_struct;

typedef sagejs_number_field_analysis_resource_struct
    sagejs_number_field_analysis_resource_t[1];

static inline void sagejs_number_field_analysis_resource_reset(
    sagejs_number_field_analysis_resource_t resource)
{
    resource->data = NULL;
    resource->length = 0;
    resource->retained_bytes =
        sizeof(sagejs_number_field_analysis_resource_struct);
}

static inline void sagejs_number_field_analysis_resource_clear(
    sagejs_number_field_analysis_resource_t resource)
{
    free(resource->data);
    sagejs_number_field_analysis_resource_reset(resource);
}

static inline size_t sagejs_number_field_analysis_resource_allocated_bytes(
    const sagejs_number_field_analysis_resource_t resource)
{
    return resource->retained_bytes;
}

static inline uint64_t sagejs_number_field_analysis_resource_length(
    const sagejs_number_field_analysis_resource_t resource)
{
    return (uint64_t) resource->length;
}

static inline const unsigned char *sagejs_number_field_analysis_resource_data(
    const sagejs_number_field_analysis_resource_t resource)
{
    return resource->data;
}

static inline int sagejs_nf_analysis_pack(
    sagejs_number_field_analysis_resource_t result,
    const sagejs_fmpz_polynomial_t polynomial, const fmpz_t scale,
    const fmpz_t equation_discriminant, const fmpz_mat_t components,
    slong component_count, const fmpz_mat_t numerator,
    const fmpz_t denominator, const fmpz_t index,
    const fmpz_t order_discriminant, uint32_t status,
    uint64_t trial_bound, uint64_t resolved_components,
    uint64_t native_primes)
{
    const slong degree = fmpz_mat_nrows(numerator);
    if (degree < 1 || degree != fmpz_mat_ncols(numerator) ||
        component_count < 0 || component_count > fmpz_mat_nrows(components) ||
        fmpz_mat_ncols(components) != 3)
        return 0;
    const uint64_t degree_u64 = (uint64_t) degree;
    const uint64_t component_u64 = (uint64_t) component_count;
    if (degree_u64 > UINT64_MAX / degree_u64)
        return 0;
    const uint64_t square_entries = degree_u64 * degree_u64;
    if (degree_u64 > UINT64_MAX - UINT64_C(6) ||
        square_entries > UINT64_MAX - (UINT64_C(6) + degree_u64))
        return 0;
    const uint64_t fixed_entries = UINT64_C(6) + degree_u64 + square_entries;
    if (component_u64 > (UINT64_MAX - fixed_entries) / UINT64_C(3))
        return 0;
    const uint64_t entry_count = fixed_entries + UINT64_C(3) * component_u64;
    size_t length = 80;
    size_t maximum_bytes = 0;
    const fmpz *metadata[] = {
        scale, denominator, index, equation_discriminant, order_discriminant
    };
    for (size_t entry = 0; entry < 5; entry++)
        if (!sagejs_exact_polynomial_serialized_size(
                &length, &maximum_bytes, metadata[entry]))
            return 0;
    for (slong coefficient = 0; coefficient <= degree; coefficient++)
        if (!sagejs_exact_polynomial_serialized_size(&length, &maximum_bytes,
                polynomial->value->coeffs + coefficient))
            return 0;
    for (slong row = 0; row < component_count; row++)
        for (slong column = 0; column < 3; column++)
            if (!sagejs_exact_polynomial_serialized_size(
                    &length, &maximum_bytes,
                    fmpz_mat_entry(components, row, column)))
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
    memcpy(data, "SJNFA\1\0\0", 8);
    sagejs_exact_polynomial_write_u64(data, 8, degree_u64);
    sagejs_exact_polynomial_write_u64(data, 16, (uint64_t) status);
    sagejs_exact_polynomial_write_u64(data, 24, trial_bound);
    sagejs_exact_polynomial_write_u64(data, 32, component_u64);
    sagejs_exact_polynomial_write_u64(data, 40, resolved_components);
    sagejs_exact_polynomial_write_u64(data, 48, native_primes);
    sagejs_exact_polynomial_write_u64(data, 56, entry_count);
    sagejs_exact_polynomial_write_u64(
        data, 64, SAGEJS_NF_ANALYSIS_RESOURCE_ABI_VERSION);
    sagejs_exact_polynomial_write_u64(data, 72, UINT64_C(0));

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
    size_t offset = 80;
    for (size_t entry = 0; entry < 5; entry++)
        sagejs_exact_polynomial_write_fmpz(
            data, &offset, metadata[entry], magnitude, words);
    for (slong coefficient = 0; coefficient <= degree; coefficient++)
        sagejs_exact_polynomial_write_fmpz(data, &offset,
            polynomial->value->coeffs + coefficient, magnitude, words);
    for (slong row = 0; row < component_count; row++)
        for (slong column = 0; column < 3; column++)
            sagejs_exact_polynomial_write_fmpz(data, &offset,
                fmpz_mat_entry(components, row, column), magnitude, words);
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
    result->retained_bytes = sagejs_retained_size_add(
        sizeof(sagejs_number_field_analysis_resource_struct), length);
    return 1;
}

static inline int sagejs_number_field_analyze_resource(
    sagejs_number_field_analysis_resource_t result,
    const sagejs_fmpz_polynomial_t polynomial, const fmpz_t scale,
    uint64_t trial_bound)
{
    sagejs_number_field_analysis_resource_reset(result);
    const slong length = polynomial->sealed ?
        fmpz_poly_length(polynomial->value) : 0;
    const slong degree = length - 1;
    if (!polynomial->sealed || degree < 1 ||
        !fmpz_is_one(polynomial->value->coeffs + degree) ||
        fmpz_sgn(scale) <= 0 ||
        trial_bound > SAGEJS_NF_ANALYSIS_MAX_TRIAL_BOUND)
        return 0;

    fmpz_t equation_discriminant, remaining, prime_value;
    fmpz_t denominator, index, order_discriminant;
    fmpz_init(equation_discriminant);
    fmpz_init(remaining);
    fmpz_init(prime_value);
    fmpz_init(denominator);
    fmpz_init(index);
    fmpz_init(order_discriminant);
    fmpz_poly_discriminant(equation_discriminant, polynomial->value);
    if (fmpz_is_zero(equation_discriminant))
        goto invalid;
    fmpz_abs(remaining, equation_discriminant);

    const uint64_t maximum_components = trial_bound / 2 + 2;
    if (maximum_components > (uint64_t) WORD_MAX)
        goto invalid;
    fmpz_mat_t components;
    fmpz_mat_init(components, (slong) maximum_components, 3);
    slong component_count = 0;
    ulong prime = UWORD(2);
    while ((uint64_t) prime <= trial_bound && !fmpz_is_one(remaining))
    {
        fmpz_set_ui(prime_value, prime);
        if (fmpz_divisible(remaining, prime_value))
        {
            const slong exponent =
                fmpz_remove(remaining, remaining, prime_value);
            fmpz_set_ui(
                fmpz_mat_entry(components, component_count, 0), prime);
            fmpz_set_si(
                fmpz_mat_entry(components, component_count, 1), exponent);
            fmpz_set_ui(fmpz_mat_entry(components, component_count, 2),
                SAGEJS_NF_ANALYSIS_COMPONENT_PROVEN_WORD_PRIME);
            component_count++;
        }
        prime = n_nextprime(prime, 1);
    }

    uint32_t status = SAGEJS_NF_ANALYSIS_COMPLETE_CANDIDATE;
    if (!fmpz_is_one(remaining))
    {
        fmpz_set(fmpz_mat_entry(components, component_count, 0), remaining);
        fmpz_one(fmpz_mat_entry(components, component_count, 1));
        if (fmpz_abs_fits_ui(remaining) && n_is_prime(fmpz_get_ui(remaining)))
            fmpz_set_ui(fmpz_mat_entry(components, component_count, 2),
                SAGEJS_NF_ANALYSIS_COMPONENT_PROVEN_WORD_PRIME);
        else if (!fmpz_abs_fits_ui(remaining) && fmpz_is_probabprime(remaining))
        {
            fmpz_set_ui(fmpz_mat_entry(components, component_count, 2),
                SAGEJS_NF_ANALYSIS_COMPONENT_ARBITRARY_PRIME);
            status = SAGEJS_NF_ANALYSIS_FALLBACK_ARBITRARY_PRIME;
        }
        else
        {
            fmpz_set_ui(fmpz_mat_entry(components, component_count, 2),
                SAGEJS_NF_ANALYSIS_COMPONENT_UNRESOLVED);
            status = SAGEJS_NF_ANALYSIS_FALLBACK_UNRESOLVED;
        }
        component_count++;
    }

    uint64_t proven_components = 0;
    uint64_t native_prime_count = 0;
    uint64_t *word_primes = component_count == 0 ? NULL :
        (uint64_t *) calloc((size_t) component_count, sizeof(uint64_t));
    if (component_count != 0 && word_primes == NULL)
    {
        fmpz_mat_clear(components);
        goto invalid;
    }
    for (slong row = 0; row < component_count; row++)
    {
        if (!fmpz_is_zero(fmpz_mat_entry(components, row, 2)))
            continue;
        proven_components++;
        if (fmpz_cmp_ui(fmpz_mat_entry(components, row, 1), 2) >= 0)
            word_primes[native_prime_count++] =
                fmpz_get_ui(fmpz_mat_entry(components, row, 0));
    }

    fmpz_mat_t numerator;
    fmpz_mat_init(numerator, degree, degree);
    sagejs_nf_order_identity_basis(numerator, denominator, degree);
    if (native_prime_count != 0)
    {
        sagejs_fmpz_matrix_t multiplication;
        sagejs_fmpq_matrix_t rational_basis;
        if (!sagejs_nf_order_polynomial_multiplication_table(
                multiplication, polynomial))
            status = SAGEJS_NF_ANALYSIS_FALLBACK_NATIVE_FAILURE;
        else
        {
            if (!sagejs_number_field_order_maximal_at_primes(rational_basis,
                    multiplication, word_primes, native_prime_count))
                status = SAGEJS_NF_ANALYSIS_FALLBACK_NATIVE_FAILURE;
            else
            {
                if (!sagejs_nf_order_basis_from_fmpq(
                        numerator, denominator, rational_basis))
                    status = SAGEJS_NF_ANALYSIS_FALLBACK_NATIVE_FAILURE;
                sagejs_fmpq_matrix_clear(rational_basis);
            }
            sagejs_fmpz_matrix_clear(multiplication);
        }
    }
    if (status == SAGEJS_NF_ANALYSIS_FALLBACK_NATIVE_FAILURE)
        sagejs_nf_order_identity_basis(numerator, denominator, degree);
    if (!sagejs_nf_order_compute_evidence(index, order_discriminant,
            equation_discriminant, numerator, denominator))
    {
        fmpz_mat_clear(numerator);
        free(word_primes);
        fmpz_mat_clear(components);
        goto invalid;
    }
    const uint64_t packed_native =
        status == SAGEJS_NF_ANALYSIS_FALLBACK_NATIVE_FAILURE ?
            UINT64_C(0) : native_prime_count;
    const uint64_t packed_resolved =
        status == SAGEJS_NF_ANALYSIS_FALLBACK_NATIVE_FAILURE ?
            UINT64_C(0) : proven_components;
    const int packed = sagejs_nf_analysis_pack(result, polynomial, scale,
        equation_discriminant, components, component_count, numerator,
        denominator, index, order_discriminant, status, trial_bound,
        packed_resolved, packed_native);
    fmpz_mat_clear(numerator);
    free(word_primes);
    fmpz_mat_clear(components);
    fmpz_clear(order_discriminant);
    fmpz_clear(index);
    fmpz_clear(denominator);
    fmpz_clear(prime_value);
    fmpz_clear(remaining);
    fmpz_clear(equation_discriminant);
    return packed;

invalid:
    fmpz_clear(order_discriminant);
    fmpz_clear(index);
    fmpz_clear(denominator);
    fmpz_clear(prime_value);
    fmpz_clear(remaining);
    fmpz_clear(equation_discriminant);
    return 0;
}

#endif
