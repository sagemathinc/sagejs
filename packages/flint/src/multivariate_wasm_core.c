#include "multivariate_wasm_core.h"

#include <limits.h>
#include <stddef.h>
#include <stdint.h>

#include <gmp.h>
#include <flint/flint.h>
#include <flint/fmpz.h>
#include <flint/fmpz_mpoly.h>
#include <flint/mpoly_types.h>

typedef struct {
    const uint8_t *bytes;
    size_t length;
    size_t offset;
} sagejs_mpoly_reader;

static int sagejs_checked_add(size_t *value, size_t increment)
{
    if (*value > SIZE_MAX - increment)
        return 0;
    *value += increment;
    return 1;
}

static int sagejs_read_u32(sagejs_mpoly_reader *reader, uint32_t *value)
{
    const uint8_t *source;
    if (reader->offset > reader->length ||
        reader->length - reader->offset < 4)
        return 0;
    source = reader->bytes + reader->offset;
    *value = (uint32_t) source[0] |
        ((uint32_t) source[1] << 8) |
        ((uint32_t) source[2] << 16) |
        ((uint32_t) source[3] << 24);
    reader->offset += 4;
    return 1;
}

static void sagejs_write_u32(uint8_t *output, size_t offset, uint32_t value)
{
    output[offset] = (uint8_t) value;
    output[offset + 1] = (uint8_t) (value >> 8);
    output[offset + 2] = (uint8_t) (value >> 16);
    output[offset + 3] = (uint8_t) (value >> 24);
}

static int sagejs_decode_polynomial(
    sagejs_mpoly_reader *reader,
    fmpz_mpoly_t polynomial,
    uint32_t term_count,
    uint32_t variable_count,
    uint32_t eliminated_variable,
    const fmpz_mpoly_ctx_t context)
{
    uint32_t term_index;
    uint32_t words[SAGEJS_MPOLY_MAX_COEFFICIENT_WORDS];
    ulong exponents[3];
    fmpz_t coefficient;
    mpz_t magnitude;

    fmpz_init(coefficient);
    mpz_init(magnitude);
    for (term_index = 0; term_index < term_count; term_index++)
    {
        uint32_t sign, word_count, word_index, variable_index;
        uint32_t parameter_degree = 0;
        if (!sagejs_read_u32(reader, &sign) ||
            !sagejs_read_u32(reader, &word_count) ||
            (sign != 1 && sign != 2) || word_count == 0)
            goto malformed;
        if (word_count > SAGEJS_MPOLY_MAX_COEFFICIENT_WORDS)
            goto unsupported;
        for (word_index = 0; word_index < word_count; word_index++)
            if (!sagejs_read_u32(reader, &words[word_index]))
                goto malformed;
        if (words[word_count - 1] == 0)
            goto malformed;
        mpz_import(
            magnitude, word_count, -1, sizeof(uint32_t), -1, 0, words);
        if (sign == 2)
            mpz_neg(magnitude, magnitude);
        fmpz_set_mpz(coefficient, magnitude);
        for (variable_index = 0; variable_index < variable_count;
             variable_index++)
        {
            uint32_t exponent;
            if (!sagejs_read_u32(reader, &exponent))
                goto malformed;
            if (variable_index == eliminated_variable)
            {
                if (exponent > SAGEJS_MPOLY_MAX_ELIMINATION_DEGREE)
                    goto unsupported;
            }
            else
            {
                if (exponent > SAGEJS_MPOLY_MAX_PARAMETER_DEGREE ||
                    parameter_degree >
                    SAGEJS_MPOLY_MAX_PARAMETER_DEGREE - exponent)
                    goto unsupported;
                parameter_degree += exponent;
            }
            exponents[variable_index] = (ulong) exponent;
        }
        fmpz_mpoly_push_term_fmpz_ui(
            polynomial, coefficient, exponents, context);
    }
    fmpz_clear(coefficient);
    mpz_clear(magnitude);
    fmpz_mpoly_sort_terms(polynomial, context);
    fmpz_mpoly_combine_like_terms(polynomial, context);
    if ((uint32_t) fmpz_mpoly_length(polynomial, context) != term_count)
        return SAGEJS_MPOLY_PACKED_MALFORMED;
    return SAGEJS_MPOLY_PACKED_OK;

unsupported:
    fmpz_clear(coefficient);
    mpz_clear(magnitude);
    return SAGEJS_MPOLY_PACKED_UNSUPPORTED;
malformed:
    fmpz_clear(coefficient);
    mpz_clear(magnitude);
    return SAGEJS_MPOLY_PACKED_MALFORMED;
}

static int sagejs_result_size(
    const fmpz_mpoly_t result,
    uint32_t variable_count,
    const fmpz_mpoly_ctx_t context,
    size_t *required)
{
    slong index, length = fmpz_mpoly_length(result, context);
    fmpz_t coefficient;
    size_t size = 24;
    if (length < 0 || (uint64_t) length > UINT32_MAX)
        return SAGEJS_MPOLY_PACKED_RESULT_LIMIT;
    fmpz_init(coefficient);
    for (index = 0; index < length; index++)
    {
        flint_bitcnt_t bits;
        size_t words;
        fmpz_mpoly_get_term_coeff_fmpz(
            coefficient, result, index, context);
        bits = fmpz_bits(coefficient);
        if (bits == 0)
        {
            fmpz_clear(coefficient);
            return SAGEJS_MPOLY_PACKED_FLINT_FAILURE;
        }
        words = ((size_t) bits + 31) / 32;
        if (words > UINT32_MAX ||
            !sagejs_checked_add(&size, 8) ||
            words > (SIZE_MAX - size) / 4 ||
            !sagejs_checked_add(&size, words * 4) ||
            !sagejs_checked_add(&size, (size_t) variable_count * 4) ||
            size > SAGEJS_MPOLY_MAX_OUTPUT_BYTES)
        {
            fmpz_clear(coefficient);
            return SAGEJS_MPOLY_PACKED_RESULT_LIMIT;
        }
    }
    fmpz_clear(coefficient);
    *required = size;
    return SAGEJS_MPOLY_PACKED_OK;
}

static int sagejs_encode_result(
    uint8_t *output,
    size_t output_capacity,
    const fmpz_mpoly_t result,
    uint32_t variable_count,
    uint32_t ordering,
    const fmpz_mpoly_ctx_t context,
    size_t required)
{
    slong index, length = fmpz_mpoly_length(result, context);
    size_t offset = 24;
    fmpz_t coefficient;
    mpz_t magnitude;
    ulong exponents[3];

    if (output == NULL || output_capacity < required)
        return SAGEJS_MPOLY_PACKED_OUTPUT_TOO_SMALL;
    sagejs_write_u32(output, 0, SAGEJS_MPOLY_PACKED_OUTPUT_MAGIC);
    sagejs_write_u32(output, 4, SAGEJS_MPOLY_PACKED_VERSION);
    sagejs_write_u32(output, 8, SAGEJS_MPOLY_PACKED_RESULTANT);
    sagejs_write_u32(output, 12, variable_count);
    sagejs_write_u32(output, 16, ordering);
    sagejs_write_u32(output, 20, (uint32_t) length);
    fmpz_init(coefficient);
    mpz_init(magnitude);
    for (index = 0; index < length; index++)
    {
        size_t written = 0;
        uint32_t variable_index;
        fmpz_mpoly_get_term_coeff_fmpz(
            coefficient, result, index, context);
        fmpz_get_mpz(magnitude, coefficient);
        sagejs_write_u32(output, offset, mpz_sgn(magnitude) < 0 ? 2 : 1);
        mpz_abs(magnitude, magnitude);
        {
            size_t words = (mpz_sizeinbase(magnitude, 2) + 31) / 32;
            sagejs_write_u32(output, offset + 4, (uint32_t) words);
            offset += 8;
            mpz_export(
                output + offset, &written, -1, sizeof(uint32_t), -1, 0,
                magnitude);
            if (written != words)
            {
                fmpz_clear(coefficient);
                mpz_clear(magnitude);
                return SAGEJS_MPOLY_PACKED_FLINT_FAILURE;
            }
            offset += words * 4;
        }
        fmpz_mpoly_get_term_exp_ui(exponents, result, index, context);
        for (variable_index = 0; variable_index < variable_count;
             variable_index++)
        {
            if (exponents[variable_index] > UINT32_MAX)
            {
                fmpz_clear(coefficient);
                mpz_clear(magnitude);
                return SAGEJS_MPOLY_PACKED_RESULT_LIMIT;
            }
            sagejs_write_u32(
                output, offset, (uint32_t) exponents[variable_index]);
            offset += 4;
        }
    }
    fmpz_clear(coefficient);
    mpz_clear(magnitude);
    return offset == required
        ? SAGEJS_MPOLY_PACKED_OK
        : SAGEJS_MPOLY_PACKED_FLINT_FAILURE;
}

int sagejs_fmpz_mpoly_resultant_packed(
    const uint8_t *input,
    size_t input_length,
    uint8_t *output,
    size_t output_capacity,
    size_t *output_length)
{
    sagejs_mpoly_reader reader;
    uint32_t magic, version, operation, variable_count, ordering;
    uint32_t eliminated_variable, left_terms, right_terms;
    ordering_t flint_order;
    fmpz_mpoly_ctx_t context;
    fmpz_mpoly_t left, right, result;
    size_t required = 0;
    int status;

    if (output_length == NULL)
        return SAGEJS_MPOLY_PACKED_MALFORMED;
    *output_length = 0;
    if (input == NULL || input_length < 32)
        return SAGEJS_MPOLY_PACKED_MALFORMED;
    if (input_length > SAGEJS_MPOLY_MAX_INPUT_BYTES)
        return SAGEJS_MPOLY_PACKED_UNSUPPORTED;
    reader.bytes = input;
    reader.length = input_length;
    reader.offset = 0;
    if (!sagejs_read_u32(&reader, &magic) ||
        !sagejs_read_u32(&reader, &version) ||
        !sagejs_read_u32(&reader, &operation) ||
        !sagejs_read_u32(&reader, &variable_count) ||
        !sagejs_read_u32(&reader, &ordering) ||
        !sagejs_read_u32(&reader, &eliminated_variable) ||
        !sagejs_read_u32(&reader, &left_terms) ||
        !sagejs_read_u32(&reader, &right_terms))
        return SAGEJS_MPOLY_PACKED_MALFORMED;
    if (magic != SAGEJS_MPOLY_PACKED_INPUT_MAGIC ||
        version != SAGEJS_MPOLY_PACKED_VERSION ||
        operation != SAGEJS_MPOLY_PACKED_RESULTANT)
        return SAGEJS_MPOLY_PACKED_MALFORMED;
    if (variable_count < 2 || variable_count > 3 ||
        eliminated_variable >= variable_count ||
        left_terms > SAGEJS_MPOLY_MAX_TERMS ||
        right_terms > SAGEJS_MPOLY_MAX_TERMS)
        return SAGEJS_MPOLY_PACKED_UNSUPPORTED;
    if (ordering == SAGEJS_MPOLY_PACKED_LEX)
        flint_order = ORD_LEX;
    else if (ordering == SAGEJS_MPOLY_PACKED_DEGLEX)
        flint_order = ORD_DEGLEX;
    else if (ordering == SAGEJS_MPOLY_PACKED_DEGREVLEX)
        flint_order = ORD_DEGREVLEX;
    else
        return SAGEJS_MPOLY_PACKED_UNSUPPORTED;

    fmpz_mpoly_ctx_init(context, (slong) variable_count, flint_order);
    fmpz_mpoly_init(left, context);
    fmpz_mpoly_init(right, context);
    fmpz_mpoly_init(result, context);
    status = sagejs_decode_polynomial(
        &reader, left, left_terms, variable_count, eliminated_variable,
        context);
    if (status == SAGEJS_MPOLY_PACKED_OK)
        status = sagejs_decode_polynomial(
            &reader, right, right_terms, variable_count,
            eliminated_variable, context);
    if (status == SAGEJS_MPOLY_PACKED_OK && reader.offset != reader.length)
        status = SAGEJS_MPOLY_PACKED_MALFORMED;
    if (status == SAGEJS_MPOLY_PACKED_OK &&
        !fmpz_mpoly_resultant(
            result, left, right, (slong) eliminated_variable, context))
        status = SAGEJS_MPOLY_PACKED_FLINT_FAILURE;
    if (status == SAGEJS_MPOLY_PACKED_OK)
        status = sagejs_result_size(
            result, variable_count, context, &required);
    if (status == SAGEJS_MPOLY_PACKED_OK)
    {
        *output_length = required;
        status = sagejs_encode_result(
            output, output_capacity, result, variable_count, ordering,
            context, required);
    }
    fmpz_mpoly_clear(left, context);
    fmpz_mpoly_clear(right, context);
    fmpz_mpoly_clear(result, context);
    fmpz_mpoly_ctx_clear(context);
    return status;
}
