#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include <flint/flint.h>
#include <flint/fmpz.h>
#include <flint/fmpz_factor.h>
#include <flint/fmpz_mat.h>
#include <flint/fmpz_poly.h>
#include <flint/fmpq.h>
#include <flint/fmpq_mat.h>
#include <flint/fmpq_poly.h>

#include "charpoly.h"

#define SAGEJS_FACTOR_INPUT_CAPACITY 4096
#define SAGEJS_FACTOR_OUTPUT_CAPACITY 65536

static char factor_input[SAGEJS_FACTOR_INPUT_CAPACITY];
static char factor_output[SAGEJS_FACTOR_OUTPUT_CAPACITY];
static fmpz_mat_t integer_matrix;
static fmpz_poly_t integer_charpoly;
static int integer_matrix_initialized;
static int integer_charpoly_initialized;
static fmpq_mat_t rational_matrix;
static fmpq_poly_t rational_charpoly;
static int rational_matrix_initialized;
static int rational_charpoly_initialized;

static int append_text(size_t *position, const char *text)
{
    size_t length = strlen(text);

    if (*position + length >= SAGEJS_FACTOR_OUTPUT_CAPACITY)
        return 0;
    memcpy(factor_output + *position, text, length);
    *position += length;
    factor_output[*position] = '\0';
    return 1;
}

static int append_unsigned(size_t *position, ulong value)
{
    char text[32];
    size_t length = 0;

    do
    {
        text[length++] = (char) ('0' + value % 10);
        value /= 10;
    }
    while (value != 0);
    while (length > 0)
    {
        char digit[2];
        digit[0] = text[--length];
        digit[1] = '\0';
        if (!append_text(position, digit))
            return 0;
    }
    return 1;
}

static int append_factor(
    size_t *position,
    const fmpz_t prime,
    ulong exponent,
    int separated)
{
    char *prime_text;

    if (separated && !append_text(position, ","))
        return 0;
    if (!append_text(position, "[\""))
        return 0;
    prime_text = fmpz_get_str(NULL, 10, prime);
    if (prime_text == NULL)
        return 0;
    if (!append_text(position, prime_text))
    {
        flint_free(prime_text);
        return 0;
    }
    flint_free(prime_text);
    return append_text(position, "\",") &&
        append_unsigned(position, exponent) &&
        append_text(position, "]");
}

__attribute__((visibility("default")))
uintptr_t sagejs_factor_input(void)
{
    return (uintptr_t) factor_input;
}

__attribute__((visibility("default")))
size_t sagejs_factor_input_capacity(void)
{
    return SAGEJS_FACTOR_INPUT_CAPACITY;
}

__attribute__((visibility("default")))
uintptr_t sagejs_factor_output(void)
{
    return (uintptr_t) factor_output;
}

__attribute__((visibility("default")))
size_t sagejs_factor_output_capacity(void)
{
    return SAGEJS_FACTOR_OUTPUT_CAPACITY;
}

static int read_integer(fmpz_t value)
{
    factor_input[SAGEJS_FACTOR_INPUT_CAPACITY - 1] = '\0';
    return fmpz_set_str(value, factor_input, 10) == 0;
}

static int write_integer(const fmpz_t value)
{
    char *text;
    size_t position = 0;
    int success;

    factor_output[0] = '\0';
    text = fmpz_get_str(NULL, 10, value);
    if (text == NULL)
        return 0;
    success = append_text(&position, text);
    flint_free(text);
    return success;
}

static int write_rational(const fmpq_t value)
{
    char *text;
    size_t position = 0;
    int success;

    factor_output[0] = '\0';
    text = fmpq_get_str(NULL, 10, value);
    if (text == NULL)
        return 0;
    success = append_text(&position, text);
    flint_free(text);
    return success;
}

static void clear_integer_charpoly(void)
{
    if (integer_charpoly_initialized)
        fmpz_poly_clear(integer_charpoly);
    if (integer_matrix_initialized)
        fmpz_mat_clear(integer_matrix);
    integer_charpoly_initialized = 0;
    integer_matrix_initialized = 0;
}

/*
 * Exact integer matrix characteristic polynomials for the portable matrix
 * backend. Entries cross the boundary through the existing decimal input
 * buffer, so this supports arbitrary-size integers without a limb ABI.
 */
__attribute__((visibility("default")))
int sagejs_integer_charpoly_begin(uint32_t rows, uint32_t columns)
{
    clear_integer_charpoly();
    if (rows != columns || rows > INT32_MAX)
        return 0;
    fmpz_mat_init(integer_matrix, (slong) rows, (slong) columns);
    integer_matrix_initialized = 1;
    return 1;
}

__attribute__((visibility("default")))
int sagejs_integer_charpoly_set(uint32_t index)
{
    size_t count;
    fmpz_t value;

    if (!integer_matrix_initialized)
        return 0;
    count = (size_t) integer_matrix->r * (size_t) integer_matrix->c;
    if ((size_t) index >= count)
        return 0;
    fmpz_init(value);
    if (!read_integer(value))
    {
        fmpz_clear(value);
        return 0;
    }
    fmpz_set(integer_matrix->entries + index, value);
    fmpz_clear(value);
    return 1;
}

__attribute__((visibility("default")))
int sagejs_integer_charpoly_compute(void)
{
    if (!integer_matrix_initialized)
        return 0;
    if (integer_charpoly_initialized)
        fmpz_poly_clear(integer_charpoly);
    fmpz_poly_init(integer_charpoly);
    integer_charpoly_initialized = 1;
    sagejs_fmpz_mat_charpoly(integer_charpoly, integer_matrix);
    return 1;
}

__attribute__((visibility("default")))
int sagejs_integer_charpoly_coefficient(uint32_t index)
{
    fmpz_t value;
    int status;

    if (!integer_charpoly_initialized ||
        (slong) index >= fmpz_poly_length(integer_charpoly))
        return 0;
    fmpz_init(value);
    fmpz_poly_get_coeff_fmpz(value, integer_charpoly, (slong) index);
    status = write_integer(value);
    fmpz_clear(value);
    return status ? 1 : 0;
}

__attribute__((visibility("default")))
void sagejs_integer_charpoly_clear(void)
{
    clear_integer_charpoly();
}

static void clear_rational_charpoly(void)
{
    if (rational_charpoly_initialized)
        fmpq_poly_clear(rational_charpoly);
    if (rational_matrix_initialized)
        fmpq_mat_clear(rational_matrix);
    rational_charpoly_initialized = 0;
    rational_matrix_initialized = 0;
}

/*
 * Exact rational matrix characteristic polynomials. Rational entries use
 * FLINT's canonical decimal numerator/denominator syntax in the shared input
 * buffer, keeping the host boundary independent of FLINT's limb layout.
 */
__attribute__((visibility("default")))
int sagejs_rational_charpoly_begin(uint32_t rows, uint32_t columns)
{
    clear_rational_charpoly();
    if (rows != columns || rows > INT32_MAX)
        return 0;
    fmpq_mat_init(rational_matrix, (slong) rows, (slong) columns);
    rational_matrix_initialized = 1;
    return 1;
}

__attribute__((visibility("default")))
int sagejs_rational_charpoly_set(uint32_t index)
{
    size_t count;
    fmpq *entry;

    if (!rational_matrix_initialized)
        return 0;
    count = (size_t) rational_matrix->r * (size_t) rational_matrix->c;
    if ((size_t) index >= count)
        return 0;
    factor_input[SAGEJS_FACTOR_INPUT_CAPACITY - 1] = '\0';
    entry = rational_matrix->entries + index;
    if (fmpq_set_str(entry, factor_input, 10) != 0)
        return 0;
    fmpq_canonicalise(entry);
    return 1;
}

__attribute__((visibility("default")))
int sagejs_rational_charpoly_compute(void)
{
    if (!rational_matrix_initialized)
        return 0;
    if (rational_charpoly_initialized)
        fmpq_poly_clear(rational_charpoly);
    fmpq_poly_init(rational_charpoly);
    rational_charpoly_initialized = 1;
    fmpq_mat_charpoly(rational_charpoly, rational_matrix);
    return 1;
}

__attribute__((visibility("default")))
int sagejs_rational_charpoly_coefficient(uint32_t index)
{
    fmpq_t value;
    int status;

    if (!rational_charpoly_initialized ||
        (slong) index >= fmpq_poly_length(rational_charpoly))
        return 0;
    fmpq_init(value);
    fmpq_poly_get_coeff_fmpq(value, rational_charpoly, (slong) index);
    status = write_rational(value);
    fmpq_clear(value);
    return status ? 1 : 0;
}

__attribute__((visibility("default")))
void sagejs_rational_charpoly_clear(void)
{
    clear_rational_charpoly();
}

/*
 * Return 1 when the input is prime, 0 when composite, and -1 for invalid
 * decimal input.
 */
__attribute__((visibility("default")))
int sagejs_is_prime(void)
{
    fmpz_t value;
    int result;

    fmpz_init(value);
    if (!read_integer(value))
    {
        fmpz_clear(value);
        return -1;
    }
    result = fmpz_cmp_ui(value, 2) >= 0 && fmpz_is_prime(value);
    fmpz_clear(value);
    return result;
}

/*
 * Write the first proven prime strictly greater than the input to the shared
 * output buffer. Return 0 on success, 1 for invalid input, and 2 when the
 * output buffer is too small.
 */
__attribute__((visibility("default")))
int sagejs_next_prime(void)
{
    fmpz_t value;
    fmpz_t answer;
    int status = 0;

    fmpz_init(value);
    fmpz_init(answer);
    if (!read_integer(value))
    {
        status = 1;
        goto cleanup;
    }
    fmpz_nextprime(answer, value, 1);
    if (!write_integer(answer))
        status = 2;

cleanup:
    fmpz_clear(value);
    fmpz_clear(answer);
    return status;
}

/*
 * Factor the NUL-terminated decimal integer in factor_input.
 *
 * The output is JSON with the same shape as the native add-on's factor()
 * result. Primes are decimal strings because JSON cannot represent BigInt:
 *
 *     {"sign":1,"factors":[["2",1],["1013",1]]}
 *
 * Return zero on success, 1 for invalid input, 2 when the fixed output buffer
 * is too small, and 3 for zero (which has no prime factorization). The
 * JavaScript boundary owns UTF-8 conversion and copies the result out of
 * linear memory immediately.
 */
__attribute__((visibility("default")))
int sagejs_factor(void)
{
    fmpz_t value;
    fmpz_factor_t factors;
    size_t position = 0;
    slong index;
    int separated = 0;
    int status = 0;

    factor_output[0] = '\0';
    fmpz_init(value);
    fmpz_factor_init(factors);

    if (!read_integer(value))
    {
        status = 1;
        goto cleanup;
    }
    if (fmpz_is_zero(value))
    {
        status = 3;
        goto cleanup;
    }

    fmpz_factor(factors, value);
    if (!append_text(
        &position,
        factors->sign < 0
            ? "{\"sign\":-1,\"factors\":["
            : "{\"sign\":1,\"factors\":["))
    {
        status = 2;
        goto cleanup;
    }
    for (index = 0; index < factors->num; index++)
    {
        if (!append_factor(
            &position,
            factors->p + index,
            factors->exp[index],
            separated))
        {
            status = 2;
            goto cleanup;
        }
        separated = 1;
    }
    if (!append_text(&position, "]}"))
        status = 2;

cleanup:
    fmpz_factor_clear(factors);
    fmpz_clear(value);
    return status;
}
