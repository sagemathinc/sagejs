#include "groebner_wasm_core.h"

#include <limits.h>
#include <stdint.h>
#include <stdlib.h>

#include <gmp.h>
#include <flint/ulong_extras.h>

#include "msolve_core.h"

typedef struct
{
    const uint8_t *bytes;
    size_t length;
    size_t offset;
} sagejs_groebner_reader;

static int read_u32(sagejs_groebner_reader *reader, uint32_t *value)
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

static void write_u32(uint8_t *output, size_t offset, uint32_t value)
{
    output[offset] = (uint8_t) value;
    output[offset + 1] = (uint8_t) (value >> 8);
    output[offset + 2] = (uint8_t) (value >> 16);
    output[offset + 3] = (uint8_t) (value >> 24);
}

static int read_magnitude(
    sagejs_groebner_reader *reader, mpz_t value, int signed_value)
{
    uint32_t sign = 1, words, index;
    uint32_t *storage;
    if ((signed_value && !read_u32(reader, &sign)) ||
        !read_u32(reader, &words) || (sign != 1 && sign != 2) || words == 0 ||
        words > (reader->length - reader->offset) / 4)
        return 0;
    storage = malloc((size_t) words * sizeof(*storage));
    if (storage == NULL)
        return -1;
    for (index = 0; index < words; index++)
        if (!read_u32(reader, &storage[index]))
        {
            free(storage);
            return 0;
        }
    if (storage[words - 1] == 0)
    {
        free(storage);
        return 0;
    }
    mpz_import(value, words, -1, sizeof(uint32_t), -1, 0, storage);
    free(storage);
    if (signed_value && sign == 2)
        mpz_neg(value, value);
    return 1;
}

static size_t mpz_words(const mpz_t value)
{
    return (mpz_sizeinbase(value, 2) + 31) / 32;
}

int sagejs_msolve_f4_packed(
    const uint8_t *input,
    size_t input_length,
    uint8_t *output,
    size_t output_capacity,
    size_t *output_length)
{
    sagejs_groebner_reader reader;
    sagejs_msolve_f4_result result;
    uint32_t magic, version, operation, variables, ordering;
    uint32_t characteristic, generators, terms;
    int32_t *lengths = NULL, *exponents = NULL, *coefficients = NULL;
    size_t exponent_count, required, offset;
    uint32_t index;
    uint64_t counted_terms = 0;
    sagejs_msolve_status status;

    if (output_length == NULL)
        return SAGEJS_GROEBNER_PACKED_MALFORMED;
    *output_length = 0;
    if (input == NULL || input_length < 32)
        return SAGEJS_GROEBNER_PACKED_MALFORMED;
    reader.bytes = input;
    reader.length = input_length;
    reader.offset = 0;
    if (!read_u32(&reader, &magic) || !read_u32(&reader, &version) ||
        !read_u32(&reader, &operation) || !read_u32(&reader, &variables) ||
        !read_u32(&reader, &ordering) ||
        !read_u32(&reader, &characteristic) ||
        !read_u32(&reader, &generators) || !read_u32(&reader, &terms))
        return SAGEJS_GROEBNER_PACKED_MALFORMED;
    if (magic != SAGEJS_GROEBNER_PACKED_INPUT_MAGIC ||
        version != SAGEJS_GROEBNER_PACKED_VERSION ||
        operation != SAGEJS_GROEBNER_PACKED_F4 || ordering != 2)
        return SAGEJS_GROEBNER_PACKED_MALFORMED;
    if (variables == 0 || variables > SAGEJS_MSOLVE_MAX_VARIABLES ||
        generators == 0 || generators > SAGEJS_MSOLVE_MAX_GENERATORS ||
        terms == 0 || terms > SAGEJS_MSOLVE_MAX_INPUT_TERMS ||
        characteristic < 2 || characteristic >= (UINT32_C(1) << 31) ||
        !n_is_prime((ulong) characteristic))
        return SAGEJS_GROEBNER_PACKED_UNSUPPORTED;
    if ((uint64_t) variables * (uint64_t) terms >
            SAGEJS_MSOLVE_MAX_EXPONENT_ENTRIES ||
        (size_t) variables > SIZE_MAX / (size_t) terms)
        return SAGEJS_GROEBNER_PACKED_UNSUPPORTED;
    exponent_count = (size_t) variables * (size_t) terms;
    if (exponent_count > SIZE_MAX / sizeof(*exponents))
        return SAGEJS_GROEBNER_PACKED_UNSUPPORTED;
    lengths = malloc((size_t) generators * sizeof(*lengths));
    exponents = malloc(exponent_count * sizeof(*exponents));
    coefficients = malloc((size_t) terms * sizeof(*coefficients));
    if (lengths == NULL || exponents == NULL || coefficients == NULL)
        goto result_limit;
    for (index = 0; index < generators; index++)
    {
        uint32_t length;
        if (!read_u32(&reader, &length) || length == 0 ||
            length > INT32_MAX || counted_terms > UINT32_MAX - length)
            goto malformed;
        lengths[index] = (int32_t) length;
        counted_terms += length;
    }
    if (counted_terms != terms)
        goto malformed;
    for (index = 0; index < terms; index++)
    {
        uint32_t coefficient, variable;
        if (!read_u32(&reader, &coefficient) ||
            coefficient >= characteristic)
            goto malformed;
        coefficients[index] = (int32_t) coefficient;
        for (variable = 0; variable < variables; variable++)
        {
            uint32_t exponent;
            if (!read_u32(&reader, &exponent) || exponent > INT32_MAX)
                goto malformed;
            exponents[(size_t) index * variables + variable] =
                (int32_t) exponent;
        }
    }
    if (reader.offset != reader.length)
        goto malformed;

    status = sagejs_msolve_f4(&result, lengths, exponents, coefficients,
        characteristic, (int32_t) variables, (int32_t) generators);
    free(lengths); lengths = NULL;
    free(exponents); exponents = NULL;
    free(coefficients); coefficients = NULL;
    if (status != SAGEJS_MSOLVE_OK)
        return status == SAGEJS_MSOLVE_INVALID ||
                status == SAGEJS_MSOLVE_OVERFLOW
            ? SAGEJS_GROEBNER_PACKED_UNSUPPORTED
            : SAGEJS_GROEBNER_PACKED_ENGINE_FAILURE;
    if (result.length < 0 || result.terms < 0 ||
        (uint64_t) result.length > UINT32_MAX ||
        (uint64_t) result.terms > UINT32_MAX)
        goto invalid_result;
    required = 32;
    if ((size_t) result.length > (SIZE_MAX - required) / 4)
        goto oversized_result;
    required += (size_t) result.length * 4;
    if ((size_t) variables + 1 > SIZE_MAX / 4 ||
        (size_t) result.terms >
            (SIZE_MAX - required) / ((size_t) variables + 1) / 4)
        goto oversized_result;
    required += (size_t) result.terms * ((size_t) variables + 1) * 4;
    if (required > output_capacity || output == NULL)
        goto oversized_result;

    write_u32(output, 0, SAGEJS_GROEBNER_PACKED_OUTPUT_MAGIC);
    write_u32(output, 4, SAGEJS_GROEBNER_PACKED_VERSION);
    write_u32(output, 8, SAGEJS_GROEBNER_PACKED_F4);
    write_u32(output, 12, variables);
    write_u32(output, 16, ordering);
    write_u32(output, 20, characteristic);
    write_u32(output, 24, (uint32_t) result.length);
    write_u32(output, 28, (uint32_t) result.terms);
    offset = 32;
    counted_terms = 0;
    for (index = 0; index < (uint32_t) result.length; index++)
    {
        if (result.lengths[index] <= 0 ||
            counted_terms > (uint64_t) result.terms -
                (uint32_t) result.lengths[index])
            goto invalid_result;
        write_u32(output, offset, (uint32_t) result.lengths[index]);
        offset += 4;
        counted_terms += (uint32_t) result.lengths[index];
    }
    if (counted_terms != (uint64_t) result.terms)
        goto invalid_result;
    for (index = 0; index < (uint32_t) result.terms; index++)
    {
        uint32_t variable;
        int64_t coefficient = result.coefficients[index];
        coefficient %= (int64_t) characteristic;
        if (coefficient < 0)
            coefficient += characteristic;
        write_u32(output, offset, (uint32_t) coefficient);
        offset += 4;
        for (variable = 0; variable < variables; variable++)
        {
            int32_t exponent =
                result.exponents[(size_t) index * variables + variable];
            if (exponent < 0)
                goto invalid_result;
            write_u32(output, offset, (uint32_t) exponent);
            offset += 4;
        }
    }
    sagejs_msolve_f4_result_clear(&result, characteristic);
    *output_length = required;
    return offset == required
        ? SAGEJS_GROEBNER_PACKED_OK
        : SAGEJS_GROEBNER_PACKED_ENGINE_FAILURE;

invalid_result:
    sagejs_msolve_f4_result_clear(&result, characteristic);
    return SAGEJS_GROEBNER_PACKED_ENGINE_FAILURE;
oversized_result:
    sagejs_msolve_f4_result_clear(&result, characteristic);
    return SAGEJS_GROEBNER_PACKED_RESULT_LIMIT;
malformed:
    free(lengths);
    free(exponents);
    free(coefficients);
    return SAGEJS_GROEBNER_PACKED_MALFORMED;
result_limit:
    free(lengths);
    free(exponents);
    free(coefficients);
    return SAGEJS_GROEBNER_PACKED_RESULT_LIMIT;
}

int sagejs_msolve_qq_packed(
    const uint8_t *input,
    size_t input_length,
    uint8_t *output,
    size_t output_capacity,
    size_t *output_length)
{
    sagejs_groebner_reader reader;
    sagejs_msolve_qq_result result;
    uint32_t magic, version, operation, variables, ordering;
    uint32_t characteristic, generators, terms;
    int32_t *lengths = NULL, *exponents = NULL;
    mpz_t *coefficients = NULL;
    mpz_t **coefficient_pointers = NULL;
    size_t exponent_count, required, offset, initialized = 0;
    uint32_t index;
    uint64_t counted_terms = 0;
    sagejs_msolve_status status;

    if (output_length == NULL)
        return SAGEJS_GROEBNER_PACKED_MALFORMED;
    *output_length = 0;
    if (input == NULL || input_length < 32)
        return SAGEJS_GROEBNER_PACKED_MALFORMED;
    reader.bytes = input;
    reader.length = input_length;
    reader.offset = 0;
    if (!read_u32(&reader, &magic) || !read_u32(&reader, &version) ||
        !read_u32(&reader, &operation) || !read_u32(&reader, &variables) ||
        !read_u32(&reader, &ordering) ||
        !read_u32(&reader, &characteristic) ||
        !read_u32(&reader, &generators) || !read_u32(&reader, &terms))
        return SAGEJS_GROEBNER_PACKED_MALFORMED;
    if (magic != SAGEJS_GROEBNER_PACKED_INPUT_MAGIC ||
        version != SAGEJS_GROEBNER_PACKED_VERSION ||
        operation != SAGEJS_GROEBNER_PACKED_QQ || ordering != 2 ||
        characteristic != 0)
        return SAGEJS_GROEBNER_PACKED_MALFORMED;
    if (variables == 0 || variables > SAGEJS_MSOLVE_MAX_VARIABLES ||
        generators == 0 || generators > SAGEJS_MSOLVE_MAX_GENERATORS ||
        terms == 0 || terms > SAGEJS_MSOLVE_MAX_INPUT_TERMS)
        return SAGEJS_GROEBNER_PACKED_UNSUPPORTED;
    if ((uint64_t) variables * (uint64_t) terms >
            SAGEJS_MSOLVE_MAX_EXPONENT_ENTRIES ||
        (size_t) variables > SIZE_MAX / (size_t) terms)
        return SAGEJS_GROEBNER_PACKED_UNSUPPORTED;
    exponent_count = (size_t) variables * (size_t) terms;
    if (exponent_count > SIZE_MAX / sizeof(*exponents) ||
        (size_t) terms > SIZE_MAX / 2 / sizeof(*coefficients) ||
        (size_t) terms > SIZE_MAX / 2 / sizeof(*coefficient_pointers))
        return SAGEJS_GROEBNER_PACKED_UNSUPPORTED;
    lengths = malloc((size_t) generators * sizeof(*lengths));
    exponents = malloc(exponent_count * sizeof(*exponents));
    coefficients = malloc((size_t) terms * 2 * sizeof(*coefficients));
    coefficient_pointers = malloc(
        (size_t) terms * 2 * sizeof(*coefficient_pointers));
    if (lengths == NULL || exponents == NULL || coefficients == NULL ||
        coefficient_pointers == NULL)
        goto result_limit;
    for (index = 0; index < generators; index++)
    {
        uint32_t length;
        if (!read_u32(&reader, &length) || length == 0 ||
            length > INT32_MAX || counted_terms > UINT32_MAX - length)
            goto malformed;
        lengths[index] = (int32_t) length;
        counted_terms += length;
    }
    if (counted_terms != terms)
        goto malformed;
    for (index = 0; index < terms; index++)
    {
        uint32_t variable;
        int decoded;
        mpz_init(coefficients[2 * index]);
        mpz_init(coefficients[2 * index + 1]);
        initialized += 2;
        decoded = read_magnitude(&reader, coefficients[2 * index], 1);
        if (decoded < 0)
            goto result_limit;
        if (decoded == 0)
            goto malformed;
        decoded = read_magnitude(&reader, coefficients[2 * index + 1], 0);
        if (decoded < 0)
            goto result_limit;
        if (decoded == 0 || mpz_sgn(coefficients[2 * index]) == 0 ||
            mpz_sgn(coefficients[2 * index + 1]) <= 0)
            goto malformed;
        coefficient_pointers[2 * index] = &coefficients[2 * index];
        coefficient_pointers[2 * index + 1] = &coefficients[2 * index + 1];
        for (variable = 0; variable < variables; variable++)
        {
            uint32_t exponent;
            if (!read_u32(&reader, &exponent) || exponent > INT32_MAX)
                goto malformed;
            exponents[(size_t) index * variables + variable] =
                (int32_t) exponent;
        }
    }
    if (reader.offset != reader.length)
        goto malformed;
    status = sagejs_msolve_qq(&result, lengths, exponents,
        coefficient_pointers, (int32_t) variables, (int32_t) generators);
    while (initialized > 0)
        mpz_clear(coefficients[--initialized]);
    free(lengths); lengths = NULL;
    free(exponents); exponents = NULL;
    free(coefficients); coefficients = NULL;
    free(coefficient_pointers); coefficient_pointers = NULL;
    if (status != SAGEJS_MSOLVE_OK)
        return status == SAGEJS_MSOLVE_INVALID ||
                status == SAGEJS_MSOLVE_OVERFLOW
            ? SAGEJS_GROEBNER_PACKED_UNSUPPORTED
            : SAGEJS_GROEBNER_PACKED_ENGINE_FAILURE;
    if (result.length < 0 || result.terms < 0 ||
        (uint64_t) result.length > UINT32_MAX ||
        (uint64_t) result.terms > UINT32_MAX)
        goto invalid_result;
    required = 32;
    if ((size_t) result.length > (SIZE_MAX - required) / 4)
        goto oversized_result;
    required += (size_t) result.length * 4;
    for (index = 0; index < (uint32_t) result.terms; index++)
    {
        size_t words = mpz_words(((mpz_t *) result.coefficients)[index]);
        if (words == 0 || words > UINT32_MAX ||
            required > SIZE_MAX - 8 - (size_t) variables * 4 ||
            words > (SIZE_MAX - required - 8 - (size_t) variables * 4) / 4)
            goto oversized_result;
        required += 8 + words * 4 + (size_t) variables * 4;
    }
    if (output == NULL || required > output_capacity)
        goto oversized_result;
    write_u32(output, 0, SAGEJS_GROEBNER_PACKED_OUTPUT_MAGIC);
    write_u32(output, 4, SAGEJS_GROEBNER_PACKED_VERSION);
    write_u32(output, 8, SAGEJS_GROEBNER_PACKED_QQ);
    write_u32(output, 12, variables);
    write_u32(output, 16, ordering);
    write_u32(output, 20, 0);
    write_u32(output, 24, (uint32_t) result.length);
    write_u32(output, 28, (uint32_t) result.terms);
    offset = 32;
    counted_terms = 0;
    for (index = 0; index < (uint32_t) result.length; index++)
    {
        if (result.lengths[index] <= 0 ||
            counted_terms > (uint64_t) result.terms -
                (uint32_t) result.lengths[index])
            goto invalid_result;
        write_u32(output, offset, (uint32_t) result.lengths[index]);
        offset += 4;
        counted_terms += (uint32_t) result.lengths[index];
    }
    if (counted_terms != (uint64_t) result.terms)
        goto invalid_result;
    for (index = 0; index < (uint32_t) result.terms; index++)
    {
        mpz_t magnitude;
        size_t written = 0, words;
        uint32_t variable;
        mpz_init_set(magnitude, ((mpz_t *) result.coefficients)[index]);
        write_u32(output, offset, mpz_sgn(magnitude) < 0 ? 2 : 1);
        mpz_abs(magnitude, magnitude);
        words = mpz_words(magnitude);
        write_u32(output, offset + 4, (uint32_t) words);
        offset += 8;
        mpz_export(output + offset, &written, -1, sizeof(uint32_t), -1, 0,
            magnitude);
        mpz_clear(magnitude);
        if (written != words)
            goto invalid_result;
        offset += words * 4;
        for (variable = 0; variable < variables; variable++)
        {
            int32_t exponent =
                result.exponents[(size_t) index * variables + variable];
            if (exponent < 0)
                goto invalid_result;
            write_u32(output, offset, (uint32_t) exponent);
            offset += 4;
        }
    }
    sagejs_msolve_qq_result_clear(&result);
    *output_length = required;
    return offset == required
        ? SAGEJS_GROEBNER_PACKED_OK
        : SAGEJS_GROEBNER_PACKED_ENGINE_FAILURE;

invalid_result:
    sagejs_msolve_qq_result_clear(&result);
    return SAGEJS_GROEBNER_PACKED_ENGINE_FAILURE;
oversized_result:
    sagejs_msolve_qq_result_clear(&result);
    return SAGEJS_GROEBNER_PACKED_RESULT_LIMIT;
malformed:
    while (initialized > 0)
        mpz_clear(coefficients[--initialized]);
    free(lengths);
    free(exponents);
    free(coefficients);
    free(coefficient_pointers);
    return SAGEJS_GROEBNER_PACKED_MALFORMED;
result_limit:
    while (initialized > 0)
        mpz_clear(coefficients[--initialized]);
    free(lengths);
    free(exponents);
    free(coefficients);
    free(coefficient_pointers);
    return SAGEJS_GROEBNER_PACKED_RESULT_LIMIT;
}
