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

#define SAGEJS_NF_ANALYSIS_RESOURCE_ABI_VERSION UINT64_C(2)
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

typedef struct
{
    ulong prime;
    slong radical_dimension;
    nmod_mat_struct radical[1];
    slong *selectors;
} sagejs_nf_analysis_fixed_point_witness;

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

static inline void sagejs_nf_analysis_clear_multiplication(
    fmpz_mat_t *multiplication, slong degree)
{
    if (multiplication == NULL) return;
    for (slong index = 0; index < degree; index++)
        fmpz_mat_clear(multiplication[index]);
    flint_free(multiplication);
}

/* Rebase the power-basis table onto the emitted canonical HNF basis. */
static inline int sagejs_nf_analysis_hnf_multiplication(
    fmpz_mat_t **result, fmpz **identity_result,
    const sagejs_fmpz_matrix_t source, const fmpz_mat_t numerator,
    const fmpz_t denominator)
{
    const slong degree = fmpz_mat_nrows(numerator);
    if (degree < 1 || degree != fmpz_mat_ncols(numerator) ||
        fmpz_mat_nrows(source->value) != degree * degree ||
        fmpz_mat_ncols(source->value) != degree || fmpz_sgn(denominator) <= 0)
        return 0;
    fmpq_mat_t change, inverse, transpose, inverse_transpose;
    fmpq_mat_t combined, temporary;
    fmpq_t scalar, product;
    fmpq_mat_init(change, degree, degree);
    fmpq_mat_init(inverse, degree, degree);
    fmpq_mat_init(transpose, degree, degree);
    fmpq_mat_init(inverse_transpose, degree, degree);
    fmpq_mat_init(combined, degree, degree);
    fmpq_mat_init(temporary, degree, degree);
    fmpq_init(scalar);
    fmpq_init(product);
    for (slong row = 0; row < degree; row++)
        for (slong column = 0; column < degree; column++)
        {
            fmpz_set(fmpq_numref(fmpq_mat_entry(change, row, column)),
                fmpz_mat_entry(numerator, row, column));
            fmpz_set(fmpq_denref(fmpq_mat_entry(change, row, column)),
                denominator);
            fmpq_canonicalise(fmpq_mat_entry(change, row, column));
        }
    if (!fmpq_mat_inv(inverse, change)) goto fail;
    fmpq_mat_transpose(transpose, change);
    fmpq_mat_transpose(inverse_transpose, inverse);

    fmpz_mat_t *multiplication = (fmpz_mat_t *) flint_malloc(
        (size_t) degree * sizeof(fmpz_mat_t));
    for (slong basis = 0; basis < degree; basis++)
    {
        fmpz_mat_init(multiplication[basis], degree, degree);
        fmpq_mat_zero(combined);
        for (slong old_basis = 0; old_basis < degree; old_basis++)
            for (slong row = 0; row < degree; row++)
                for (slong column = 0; column < degree; column++)
                {
                    fmpq_set_fmpz(product, fmpz_mat_entry(source->value,
                        old_basis * degree + column, row));
                    fmpq_mul(product, product,
                        fmpq_mat_entry(change, basis, old_basis));
                    fmpq_add(fmpq_mat_entry(combined, row, column),
                        fmpq_mat_entry(combined, row, column), product);
                }
        fmpq_mat_mul(temporary, combined, transpose);
        fmpq_mat_mul(combined, inverse_transpose, temporary);
        for (slong row = 0; row < degree; row++)
            for (slong column = 0; column < degree; column++)
            {
                const fmpq *entry = fmpq_mat_entry(combined, row, column);
                if (!fmpz_is_one(fmpq_denref(entry)))
                {
                    for (slong prior = 0; prior <= basis; prior++)
                        fmpz_mat_clear(multiplication[prior]);
                    flint_free(multiplication);
                    goto fail;
                }
                fmpz_set(fmpz_mat_entry(multiplication[basis], row, column),
                    fmpq_numref(entry));
            }
    }
    fmpz *identity = _fmpz_vec_init(degree);
    for (slong column = 0; column < degree; column++)
    {
        fmpq_set(scalar, fmpq_mat_entry(inverse, 0, column));
        if (!fmpz_is_one(fmpq_denref(scalar)))
        {
            _fmpz_vec_clear(identity, degree);
            sagejs_nf_analysis_clear_multiplication(multiplication, degree);
            goto fail;
        }
        fmpz_set(identity + column, fmpq_numref(scalar));
    }
    *result = multiplication;
    *identity_result = identity;
    fmpq_clear(product); fmpq_clear(scalar);
    fmpq_mat_clear(temporary); fmpq_mat_clear(combined);
    fmpq_mat_clear(inverse_transpose); fmpq_mat_clear(transpose);
    fmpq_mat_clear(inverse); fmpq_mat_clear(change);
    return 1;

fail:
    fmpq_clear(product); fmpq_clear(scalar);
    fmpq_mat_clear(temporary); fmpq_mat_clear(combined);
    fmpq_mat_clear(inverse_transpose); fmpq_mat_clear(transpose);
    fmpq_mat_clear(inverse); fmpq_mat_clear(change);
    return 0;
}

static inline int sagejs_nf_analysis_multiplier_equations(
    nmod_mat_t equations, const fmpz_mat_t *multiplication,
    const nmod_mat_t radical, slong radical_dimension,
    slong degree, ulong prime)
{
    fmpz_mat_t lattice, inverse;
    fmpz_t denominator, sum, coordinate_value;
    fmpz_mat_init(lattice, degree, degree);
    fmpz_mat_init(inverse, degree, degree);
    fmpz_init(denominator);
    fmpz_init(sum);
    fmpz_init(coordinate_value);
    sagejs_nf_build_lattice(
        lattice, radical, radical_dimension, degree, prime);
    if (!fmpz_mat_inv(inverse, denominator, lattice)) goto fail;
    fmpz *product = _fmpz_vec_init(degree);
    for (slong ideal_row = 0; ideal_row < degree; ideal_row++)
        for (slong basis = 0; basis < degree; basis++)
        {
            for (slong coordinate = 0; coordinate < degree; coordinate++)
            {
                fmpz_zero(product + coordinate);
                for (slong source_index = 0; source_index < degree;
                     source_index++)
                    fmpz_addmul(product + coordinate,
                        fmpz_mat_entry(lattice, ideal_row, source_index),
                        fmpz_mat_entry(
                            multiplication[basis], coordinate, source_index));
            }
            for (slong coordinate = 0; coordinate < degree; coordinate++)
            {
                fmpz_zero(sum);
                for (slong source_index = 0; source_index < degree;
                     source_index++)
                    fmpz_addmul(sum, product + source_index,
                        fmpz_mat_entry(inverse, source_index, coordinate));
                if (!fmpz_divisible(sum, denominator))
                {
                    _fmpz_vec_clear(product, degree);
                    goto fail;
                }
                fmpz_divexact(coordinate_value, sum, denominator);
                nmod_mat_entry(equations,
                    ideal_row * degree + coordinate, basis) =
                    fmpz_fdiv_ui(coordinate_value, prime);
            }
        }
    _fmpz_vec_clear(product, degree);
    fmpz_clear(coordinate_value); fmpz_clear(sum); fmpz_clear(denominator);
    fmpz_mat_clear(inverse); fmpz_mat_clear(lattice);
    return 1;

fail:
    fmpz_clear(coordinate_value); fmpz_clear(sum); fmpz_clear(denominator);
    fmpz_mat_clear(inverse); fmpz_mat_clear(lattice);
    return 0;
}

/* Select the lexicographically earliest independent equation rows. */
static inline int sagejs_nf_analysis_select_rows(
    slong *selectors, const nmod_mat_t equations, slong degree, ulong prime)
{
    ulong *basis = (ulong *) flint_calloc(
        (size_t) degree * (size_t) degree, sizeof(ulong));
    slong *pivots = (slong *) flint_malloc((size_t) degree * sizeof(slong));
    ulong *candidate = (ulong *) flint_malloc((size_t) degree * sizeof(ulong));
    const ulong inverse = n_preinvert_limb(prime);
    slong rank = 0;
    for (slong row = 0; row < degree * degree && rank < degree; row++)
    {
        for (slong column = 0; column < degree; column++)
            candidate[column] = nmod_mat_entry(equations, row, column);
        for (slong known = 0; known < rank; known++)
        {
            const ulong scalar = candidate[pivots[known]];
            if (scalar == 0) continue;
            for (slong column = pivots[known]; column < degree; column++)
            {
                const ulong term = sagejs_nf_mulmod(
                    scalar, basis[known * degree + column], prime, inverse);
                candidate[column] = n_submod(candidate[column], term, prime);
            }
        }
        slong pivot = 0;
        while (pivot < degree && candidate[pivot] == 0) pivot++;
        if (pivot == degree) continue;
        const ulong reciprocal = n_invmod(candidate[pivot], prime);
        for (slong column = pivot; column < degree; column++)
            basis[rank * degree + column] = sagejs_nf_mulmod(
                candidate[column], reciprocal, prime, inverse);
        pivots[rank] = pivot;
        selectors[rank] = row;
        rank++;
    }
    flint_free(candidate);
    flint_free(pivots);
    flint_free(basis);
    return rank == degree;
}

static inline void sagejs_nf_analysis_clear_witnesses(
    sagejs_nf_analysis_fixed_point_witness *witnesses,
    uint64_t initialized_count)
{
    if (witnesses == NULL) return;
    for (uint64_t index = 0; index < initialized_count; index++)
    {
        flint_free(witnesses[index].selectors);
        nmod_mat_clear(witnesses[index].radical);
    }
    flint_free(witnesses);
}

static inline int sagejs_nf_analysis_build_witnesses(
    sagejs_nf_analysis_fixed_point_witness **result,
    const sagejs_fmpz_matrix_t power_table, const fmpz_mat_t numerator,
    const fmpz_t denominator, const uint64_t *primes, uint64_t prime_count)
{
    *result = NULL;
    if (prime_count == 0) return 1;
    const slong degree = fmpz_mat_nrows(numerator);
    fmpz_mat_t *multiplication = NULL;
    fmpz *identity = NULL;
    if (!sagejs_nf_analysis_hnf_multiplication(
            &multiplication, &identity, power_table, numerator, denominator))
        return 0;
    sagejs_nf_analysis_fixed_point_witness *witnesses =
        (sagejs_nf_analysis_fixed_point_witness *) flint_calloc(
            (size_t) prime_count,
            sizeof(sagejs_nf_analysis_fixed_point_witness));
    uint64_t initialized = 0;
    int success = 1;
    const size_t table_size =
        (size_t) degree * (size_t) degree * (size_t) degree;
    ulong *table = (ulong *) flint_malloc(table_size * sizeof(ulong));
    for (uint64_t witness_index = 0;
         witness_index < prime_count && success; witness_index++)
    {
        const ulong prime = (ulong) primes[witness_index];
        const ulong inverse = n_preinvert_limb(prime);
        for (slong i = 0; i < degree; i++)
            for (slong j = 0; j < degree; j++)
                for (slong k = 0; k < degree; k++)
                    table[(i * degree + j) * degree + k] = fmpz_fdiv_ui(
                        fmpz_mat_entry(multiplication[i], k, j), prime);
        witnesses[witness_index].prime = prime;
        nmod_mat_init(witnesses[witness_index].radical,
            degree, degree, prime);
        witnesses[witness_index].selectors = (slong *) flint_malloc(
            (size_t) degree * sizeof(slong));
        initialized++;
        sagejs_nf_p_radical(witnesses[witness_index].radical,
            &witnesses[witness_index].radical_dimension,
            table, identity, degree, prime, inverse);
        nmod_mat_t equations;
        nmod_mat_init(equations, degree * degree, degree, prime);
        success = sagejs_nf_analysis_multiplier_equations(equations,
            multiplication, witnesses[witness_index].radical,
            witnesses[witness_index].radical_dimension, degree, prime) &&
            sagejs_nf_analysis_select_rows(
                witnesses[witness_index].selectors, equations, degree, prime);
        nmod_mat_clear(equations);
    }
    flint_free(table);
    _fmpz_vec_clear(identity, degree);
    sagejs_nf_analysis_clear_multiplication(multiplication, degree);
    if (!success)
    {
        sagejs_nf_analysis_clear_witnesses(witnesses, initialized);
        return 0;
    }
    *result = witnesses;
    return 1;
}

static inline int sagejs_nf_analysis_pack(
    sagejs_number_field_analysis_resource_t result,
    const sagejs_fmpz_polynomial_t polynomial, const fmpz_t scale,
    const fmpz_t equation_discriminant, const fmpz_mat_t components,
    slong component_count, const fmpz_mat_t numerator,
    const fmpz_t denominator, const fmpz_t index,
    const fmpz_t order_discriminant, uint32_t status,
    uint64_t trial_bound, uint64_t resolved_components,
    uint64_t native_primes,
    const sagejs_nf_analysis_fixed_point_witness *witnesses,
    uint64_t witness_count)
{
    const slong degree = fmpz_mat_nrows(numerator);
    if (degree < 1 || degree != fmpz_mat_ncols(numerator) ||
        component_count < 0 || component_count > fmpz_mat_nrows(components) ||
        fmpz_mat_ncols(components) != 3)
        return 0;
    const uint64_t degree_u64 = (uint64_t) degree;
    const uint64_t component_u64 = (uint64_t) component_count;
    if (witness_count != native_primes ||
        (witness_count != 0 && witnesses == NULL))
        return 0;
    if (degree_u64 > UINT64_MAX / degree_u64)
        return 0;
    const uint64_t square_entries = degree_u64 * degree_u64;
    if (degree_u64 > UINT64_MAX - UINT64_C(6) ||
        square_entries > UINT64_MAX - (UINT64_C(6) + degree_u64))
        return 0;
    const uint64_t fixed_entries = UINT64_C(6) + degree_u64 + square_entries;
    if (component_u64 > (UINT64_MAX - fixed_entries) / UINT64_C(3))
        return 0;
    uint64_t entry_count = fixed_entries + UINT64_C(3) * component_u64;
    for (uint64_t witness_index = 0; witness_index < witness_count;
         witness_index++)
    {
        const slong radical_dimension =
            witnesses[witness_index].radical_dimension;
        if (radical_dimension < 0 || radical_dimension > degree)
            return 0;
        const uint64_t radical_entries =
            (uint64_t) radical_dimension * degree_u64;
        if (entry_count > UINT64_MAX - UINT64_C(2) - degree_u64 ||
            radical_entries >
                UINT64_MAX - entry_count - UINT64_C(2) - degree_u64)
            return 0;
        entry_count += UINT64_C(2) + radical_entries + degree_u64;
    }
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
    fmpz_t packed_value;
    fmpz_init(packed_value);
    for (uint64_t witness_index = 0; witness_index < witness_count;
         witness_index++)
    {
        fmpz_set_ui(packed_value, witnesses[witness_index].prime);
        if (!sagejs_exact_polynomial_serialized_size(
                &length, &maximum_bytes, packed_value))
            goto pack_size_fail;
        fmpz_set_si(packed_value, witnesses[witness_index].radical_dimension);
        if (!sagejs_exact_polynomial_serialized_size(
                &length, &maximum_bytes, packed_value))
            goto pack_size_fail;
        for (slong row = 0;
             row < witnesses[witness_index].radical_dimension; row++)
            for (slong column = 0; column < degree; column++)
            {
                fmpz_set_ui(packed_value, nmod_mat_entry(
                    witnesses[witness_index].radical, row, column));
                if (!sagejs_exact_polynomial_serialized_size(
                        &length, &maximum_bytes, packed_value))
                    goto pack_size_fail;
            }
        for (slong selector = 0; selector < degree; selector++)
        {
            fmpz_set_si(
                packed_value, witnesses[witness_index].selectors[selector]);
            if (!sagejs_exact_polynomial_serialized_size(
                    &length, &maximum_bytes, packed_value))
                goto pack_size_fail;
        }
    }
    for (slong row = 0; row < degree; row++)
        for (slong column = 0; column < degree; column++)
            if (!sagejs_exact_polynomial_serialized_size(
                    &length, &maximum_bytes,
                    fmpz_mat_entry(numerator, row, column)))
                goto pack_size_fail;

    unsigned char *data = (unsigned char *) malloc(length);
    if (data == NULL)
        goto pack_size_fail;
    memcpy(data, "SJNFA\2\0\0", 8);
    sagejs_exact_polynomial_write_u64(data, 8, degree_u64);
    sagejs_exact_polynomial_write_u64(data, 16, (uint64_t) status);
    sagejs_exact_polynomial_write_u64(data, 24, trial_bound);
    sagejs_exact_polynomial_write_u64(data, 32, component_u64);
    sagejs_exact_polynomial_write_u64(data, 40, resolved_components);
    sagejs_exact_polynomial_write_u64(data, 48, native_primes);
    sagejs_exact_polynomial_write_u64(data, 56, entry_count);
    sagejs_exact_polynomial_write_u64(
        data, 64, SAGEJS_NF_ANALYSIS_RESOURCE_ABI_VERSION);
    sagejs_exact_polynomial_write_u64(data, 72, witness_count);

    const size_t maximum_words =
        (maximum_bytes + sizeof(ulong) - 1) / sizeof(ulong);
    ulong *words = maximum_words == 0 ? NULL :
        (ulong *) calloc(maximum_words, sizeof(ulong));
    if (maximum_words != 0 && words == NULL)
    {
        free(data);
        goto pack_size_fail;
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
    for (uint64_t witness_index = 0; witness_index < witness_count;
         witness_index++)
    {
        fmpz_set_ui(packed_value, witnesses[witness_index].prime);
        sagejs_exact_polynomial_write_fmpz(
            data, &offset, packed_value, magnitude, words);
        fmpz_set_si(packed_value, witnesses[witness_index].radical_dimension);
        sagejs_exact_polynomial_write_fmpz(
            data, &offset, packed_value, magnitude, words);
        for (slong row = 0;
             row < witnesses[witness_index].radical_dimension; row++)
            for (slong column = 0; column < degree; column++)
            {
                fmpz_set_ui(packed_value, nmod_mat_entry(
                    witnesses[witness_index].radical, row, column));
                sagejs_exact_polynomial_write_fmpz(
                    data, &offset, packed_value, magnitude, words);
            }
        for (slong selector = 0; selector < degree; selector++)
        {
            fmpz_set_si(
                packed_value, witnesses[witness_index].selectors[selector]);
            sagejs_exact_polynomial_write_fmpz(
                data, &offset, packed_value, magnitude, words);
        }
    }
    for (slong row = 0; row < degree; row++)
        for (slong column = 0; column < degree; column++)
            sagejs_exact_polynomial_write_fmpz(data, &offset,
                fmpz_mat_entry(numerator, row, column), magnitude, words);
    fmpz_clear(magnitude);
    fmpz_clear(packed_value);
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

pack_size_fail:
    fmpz_clear(packed_value);
    return 0;
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
    sagejs_fmpz_matrix_t power_table;
    int power_table_ready = 0;
    fmpz_mat_init(numerator, degree, degree);
    sagejs_nf_order_identity_basis(numerator, denominator, degree);
    if (native_prime_count != 0)
    {
        sagejs_fmpq_matrix_t rational_basis;
        if (!sagejs_nf_order_polynomial_multiplication_table(
                power_table, polynomial))
            status = SAGEJS_NF_ANALYSIS_FALLBACK_NATIVE_FAILURE;
        else
        {
            power_table_ready = 1;
            if (!sagejs_number_field_order_maximal_at_primes(rational_basis,
                    power_table, word_primes, native_prime_count))
                status = SAGEJS_NF_ANALYSIS_FALLBACK_NATIVE_FAILURE;
            else
            {
                if (!sagejs_nf_order_basis_from_fmpq(
                        numerator, denominator, rational_basis))
                    status = SAGEJS_NF_ANALYSIS_FALLBACK_NATIVE_FAILURE;
                sagejs_fmpq_matrix_clear(rational_basis);
            }
        }
    }
    sagejs_nf_analysis_fixed_point_witness *witnesses = NULL;
    uint64_t witness_count = 0;
    if (status != SAGEJS_NF_ANALYSIS_FALLBACK_NATIVE_FAILURE &&
        native_prime_count != 0)
    {
        if (!power_table_ready || !sagejs_nf_analysis_build_witnesses(
                &witnesses, power_table, numerator, denominator,
                word_primes, native_prime_count))
            status = SAGEJS_NF_ANALYSIS_FALLBACK_NATIVE_FAILURE;
        else
            witness_count = native_prime_count;
    }
    if (status == SAGEJS_NF_ANALYSIS_FALLBACK_NATIVE_FAILURE)
    {
        sagejs_nf_analysis_clear_witnesses(witnesses, witness_count);
        witnesses = NULL;
        witness_count = 0;
        sagejs_nf_order_identity_basis(numerator, denominator, degree);
    }
    if (!sagejs_nf_order_compute_evidence(index, order_discriminant,
            equation_discriminant, numerator, denominator))
    {
        fmpz_mat_clear(numerator);
        if (power_table_ready) sagejs_fmpz_matrix_clear(power_table);
        sagejs_nf_analysis_clear_witnesses(witnesses, witness_count);
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
        packed_resolved, packed_native, witnesses, witness_count);
    sagejs_nf_analysis_clear_witnesses(witnesses, witness_count);
    if (power_table_ready) sagejs_fmpz_matrix_clear(power_table);
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
