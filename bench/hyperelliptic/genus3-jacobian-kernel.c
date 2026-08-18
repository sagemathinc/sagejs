#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#include <sagejs/hyperelliptic/genus3_jacobian.h>

static sagejs_g3j_integer integer_u64(uint64_t value)
{
    sagejs_g3j_integer result;
    uint8_t reverse[SAGEJS_G3J_INTEGER_BYTES];
    memset(&result, 0, sizeof(result));
    while (value != 0)
    {
        reverse[result.length++] = (uint8_t) (value & 255);
        value >>= 8;
    }
    for (uint8_t index = 0; index < result.length; index += 1)
        result.bytes[index] = reverse[result.length - index - 1];
    return result;
}

static double seconds(clock_t start, clock_t stop)
{
    return (double) (stop - start) / CLOCKS_PER_SEC;
}

int main(void)
{
    static const uint64_t f[8] = {1, 10, 0, 0, 0, 0, 0, 1};
    static const uint64_t h[4] = {0, 0, 1, 0};
    static const sagejs_g3j_divisor divisor = {
        1, {0, 1, 0, 0}, {1, 0, 0}
    };
    sagejs_g3j_integer base = integer_u64(1);
    sagejs_g3j_integer stride = integer_u64(1);
    sagejs_g3j_integer candidates[1000];
    uint8_t outcomes[1000];
    sagejs_g3j_diagnostics filter_diagnostics;
    sagejs_g3j_certificate certificate;
    clock_t start, stop;
    int32_t status;

    for (uint64_t index = 0; index < 1000; index += 1)
        candidates[index] = integer_u64(1000 + index);
    start = clock();
    status = sagejs_g3j_filter_orders(
        11, f, h, &divisor, 1, candidates, 1000,
        UINT64_C(1000000), NULL, outcomes, &filter_diagnostics);
    stop = clock();
    if (status != SAGEJS_G3J_OK)
        return 1;
    printf(
        "{\"case\":\"1000-explicit-orders\",\"seconds\":%.9f,"
        "\"group_operations\":%llu,\"scalar_bits\":%llu}\n",
        seconds(start, stop),
        (unsigned long long) filter_diagnostics.group_operations,
        (unsigned long long) filter_diagnostics.scalar_bits);

    start = clock();
    status = sagejs_g3j_search_progression(
        11, f, h, &divisor, &base, &stride, UINT64_C(1000000000),
        40000, UINT64_C(200000), NULL, &certificate);
    stop = clock();
    if (status != SAGEJS_G3J_OK)
        return 1;
    printf(
        "{\"case\":\"bsgs-billion-step-progression\",\"seconds\":%.9f,"
        "\"group_operations\":%llu,\"baby_steps\":%llu,"
        "\"giant_steps\":%llu}\n",
        seconds(start, stop),
        (unsigned long long) certificate.diagnostics.group_operations,
        (unsigned long long) certificate.diagnostics.baby_steps,
        (unsigned long long) certificate.diagnostics.giant_steps);
    return 0;
}
