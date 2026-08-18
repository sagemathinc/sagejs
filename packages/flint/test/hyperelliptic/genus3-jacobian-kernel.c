#include <stdint.h>
#include <stdatomic.h>
#include <stdio.h>
#include <string.h>

#include <sagejs/hyperelliptic/genus3_jacobian.h>

static int fail(const char *message)
{
    fprintf(stderr, "genus-3 Jacobian kernel test failed: %s\n", message);
    return 1;
}

static sagejs_g3j_integer integer_u64(uint64_t value)
{
    sagejs_g3j_integer result;
    uint8_t reversed[SAGEJS_G3J_INTEGER_BYTES];
    memset(&result, 0, sizeof(result));
    while (value != 0)
    {
        reversed[result.length++] = (uint8_t) (value & 255);
        value >>= 8;
    }
    for (uint8_t index = 0; index < result.length; index += 1)
        result.bytes[index] = reversed[result.length - index - 1];
    return result;
}

static uint64_t integer_get_u64(const sagejs_g3j_integer *value)
{
    uint64_t result = 0;
    for (uint8_t index = 0; index < value->length; index += 1)
        result = (result << 8) | value->bytes[index];
    return result;
}

static sagejs_g3j_integer integer_maximum(void)
{
    sagejs_g3j_integer result;
    result.length = SAGEJS_G3J_INTEGER_BYTES;
    memset(result.bytes, 255, sizeof(result.bytes));
    return result;
}

static int divisor_equal(
    const sagejs_g3j_divisor *left,
    const sagejs_g3j_divisor *right)
{
    return memcmp(left, right, sizeof(*left)) == 0;
}

int main(void)
{
    static const uint64_t zero_h[4] = {0, 0, 0, 0};
    static const uint64_t f5[8] = {1, 1, 0, 0, 0, 0, 0, 1};
    static const uint64_t f3[8] = {1, 2, 0, 0, 0, 0, 0, 1};
    static const uint64_t f11[8] = {1, 10, 0, 0, 0, 0, 0, 1};
    static const uint64_t h11[4] = {0, 0, 1, 0};
    static const sagejs_g3j_divisor point = {
        1, {0, 1, 0, 0}, {1, 0, 0}
    };
    static const sagejs_g3j_divisor twice5 = {
        2, {0, 0, 1, 0}, {1, 3, 0}
    };
    static const sagejs_g3j_divisor twice11 = {
        2, {0, 0, 1, 0}, {1, 5, 0}
    };
    static const sagejs_g3j_divisor identity = {
        0, {1, 0, 0, 0}, {0, 0, 0}
    };
    sagejs_g3j_divisor output;
    sagejs_g3j_integer scalar = integer_u64(2);
    sagejs_g3j_diagnostics diagnostics;
    sagejs_g3j_integer candidates[3] = {
        integer_u64(93), integer_u64(94), integer_u64(95)
    };
    uint8_t outcomes[3];
    sagejs_g3j_certificate certificate;
    _Atomic uint32_t cancel = 0;
    int32_t status;

    if (sagejs_g3j_validate(5, f5, zero_h, &point) != SAGEJS_G3J_OK)
        return fail("valid point divisor rejected");
    if (sagejs_g3j_scalar_multiply(
            5, f5, zero_h, &point, &scalar, 100, NULL,
            &output, &diagnostics) != SAGEJS_G3J_OK ||
        !divisor_equal(&output, &twice5))
        return fail("genus-3 doubling vector over F_5");
    if (sagejs_g3j_scalar_multiply(
            11, f11, h11, &point, &scalar, 100, NULL,
            &output, &diagnostics) != SAGEJS_G3J_OK ||
        !divisor_equal(&output, &twice11))
        return fail("generalized-model doubling vector over F_11");

    scalar = integer_u64(94);
    status = sagejs_g3j_scalar_multiply(
            3, f3, zero_h, &point, &scalar, 100, NULL,
            &output, &diagnostics);
    if (status != SAGEJS_G3J_OK || !divisor_equal(&output, &identity))
    {
        fprintf(stderr, "94D udeg=%u u=%llu,%llu,%llu,%llu v=%llu,%llu,%llu ops=%llu\n",
            output.u_degree,
            (unsigned long long)output.u[0],(unsigned long long)output.u[1],
            (unsigned long long)output.u[2],(unsigned long long)output.u[3],
            (unsigned long long)output.v[0],(unsigned long long)output.v[1],
            (unsigned long long)output.v[2],
            (unsigned long long)diagnostics.group_operations);
        fprintf(stderr, "status=%d (%s)\n", status, sagejs_g3j_status_name(status));
        return fail("known order does not annihilate divisor");
    }
    if (sagejs_g3j_filter_orders(
            3, f3, zero_h, &point, 1, candidates, 3, 1000, NULL,
            outcomes, &diagnostics) != SAGEJS_G3J_OK ||
        outcomes[0] != 0 || outcomes[1] != 1 || outcomes[2] != 0)
        return fail("explicit candidate filtering");

    {
        sagejs_g3j_integer base = integer_u64(90);
        sagejs_g3j_integer stride = integer_u64(1);
        status = sagejs_g3j_search_progression(
            3, f3, zero_h, &point, &base, &stride, 10,
            16, 10000, NULL, &certificate);
        if (status != SAGEJS_G3J_OK ||
            integer_get_u64(&certificate.annihilating_multiple) != 94 ||
            integer_get_u64(&certificate.element_order) != 94 ||
            certificate.factor_count != 2 ||
            integer_get_u64(&certificate.factor_primes[0]) != 2 ||
            certificate.factor_exponents[0] != 1 ||
            integer_get_u64(&certificate.factor_primes[1]) != 47 ||
            certificate.factor_exponents[1] != 1)
            return fail("BSGS order certificate");
    }
    {
        sagejs_g3j_integer base = integer_u64(1500);
        sagejs_g3j_integer stride = integer_u64(1);
        status = sagejs_g3j_search_progression(
            11, f11, h11, &point, &base, &stride, 50,
            16, 10000, NULL, &certificate);
        if (status != SAGEJS_G3J_OK ||
            integer_get_u64(&certificate.annihilating_multiple) != 1528 ||
            integer_get_u64(&certificate.element_order) != 764)
            return fail("generalized-model BSGS order certificate");
    }

    scalar = integer_u64(94);
    if (sagejs_g3j_scalar_multiply(
            3, f3, zero_h, &point, &scalar, 1, NULL,
            &output, &diagnostics) != SAGEJS_G3J_RESOURCE_LIMIT)
        return fail("operation budget");
    cancel = 1;
    if (sagejs_g3j_scalar_multiply(
            3, f3, zero_h, &point, &scalar, 100, &cancel,
            &output, &diagnostics) != SAGEJS_G3J_CANCELLED)
        return fail("cancellation");
    {
        sagejs_g3j_integer base = integer_maximum();
        sagejs_g3j_integer stride = integer_u64(1);
        if (sagejs_g3j_search_progression(
                3, f3, zero_h, &point, &base, &stride, 2,
                2, 100, NULL, &certificate) !=
            SAGEJS_G3J_INVALID_ARGUMENT)
            return fail("progression overflow validation");
    }

    printf("genus-3 Jacobian packed kernel passed\n");
    return 0;
}
