#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include <flint/flint.h>
#include <flint/fmpz.h>
#include <flint/fmpz_factor.h>

#define SAGEJS_FACTOR_INPUT_CAPACITY 4096
#define SAGEJS_FACTOR_OUTPUT_CAPACITY 65536

static char factor_input[SAGEJS_FACTOR_INPUT_CAPACITY];
static char factor_output[SAGEJS_FACTOR_OUTPUT_CAPACITY];

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
    factor_input[SAGEJS_FACTOR_INPUT_CAPACITY - 1] = '\0';
    fmpz_init(value);
    fmpz_factor_init(factors);

    if (fmpz_set_str(value, factor_input, 10) != 0)
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
