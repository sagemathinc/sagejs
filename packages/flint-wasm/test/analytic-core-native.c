#include <assert.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "analytic_batch_core.h"

uint32_t sagejs_analytic_input_capacity(void);
uint32_t sagejs_analytic_output_capacity(void);
uint32_t sagejs_analytic_max_input_capacity(void);
uint32_t sagejs_analytic_max_output_capacity(void);
uint32_t sagejs_analytic_reserve(uint32_t, uint32_t);
void sagejs_analytic_release(void);

static uint32_t u32(const uint8_t *value)
{
    return ((uint32_t) value[0]) | ((uint32_t) value[1] << 8) |
        ((uint32_t) value[2] << 16) | ((uint32_t) value[3] << 24);
}

static void append_component(
    uint8_t *packet, size_t *length, const char *text)
{
    size_t count = strlen(text);
    assert(count <= UINT32_MAX);
    packet[*length] = (uint8_t) count;
    packet[*length + 1] = (uint8_t) (count >> 8);
    packet[*length + 2] = (uint8_t) (count >> 16);
    packet[*length + 3] = (uint8_t) (count >> 24);
    memcpy(packet + *length + 4, text, count);
    *length += 4 + count;
}

static double first_real(const uint8_t *packet, size_t length)
{
    uint32_t text_length;
    char buffer[256];
    assert(length >= 36);
    assert(memcmp(packet, "SJA1", 4) == 0);
    assert(packet[4] == 1 && packet[6] == 2);
    text_length = u32(packet + 32);
    assert(text_length < sizeof(buffer));
    assert(36 + text_length <= length);
    memcpy(buffer, packet + 36, text_length);
    buffer[text_length] = '\0';
    return strtod(buffer, NULL);
}

static double execute_one(
    uint32_t operation,
    const char *real,
    const char *imaginary,
    uint64_t modulus,
    uint64_t character_index,
    int64_t discriminant,
    uint32_t flags,
    const char *raw_real,
    const char *raw_imaginary)
{
    uint8_t input[1024];
    uint8_t output[8192];
    size_t input_length = 0;
    size_t output_length = 0;
    sagejs_analytic_request request = {
        SAGEJS_ANALYTIC_PROTOCOL_VERSION,
        operation,
        1,
        160,
        0,
        0,
        0,
        flags,
        modulus,
        character_index,
        discriminant
    };
    sagejs_analytic_status status;

    append_component(input, &input_length, real);
    append_component(input, &input_length, imaginary);
    if (raw_real != NULL)
    {
        append_component(input, &input_length, raw_real);
        append_component(input, &input_length, raw_imaginary);
    }
    status = sagejs_analytic_execute(
        &request,
        input,
        input_length,
        output,
        sizeof(output),
        &output_length);
    if (status != SAGEJS_ANALYTIC_OK)
    {
        fprintf(stderr, "analytic status %d: %s\n",
            status, sagejs_analytic_status_message(status));
        abort();
    }
    return first_real(output, output_length);
}

int main(void)
{
    assert(sagejs_analytic_input_capacity() == 0);
    assert(sagejs_analytic_output_capacity() == 0);
    assert(sagejs_analytic_reserve(4096, 8192) == SAGEJS_ANALYTIC_OK);
    assert(sagejs_analytic_input_capacity() == 4096);
    assert(sagejs_analytic_output_capacity() == 8192);
    assert(sagejs_analytic_reserve(1024, 4096) == SAGEJS_ANALYTIC_OK);
    assert(sagejs_analytic_input_capacity() == 4096);
    assert(sagejs_analytic_output_capacity() == 8192);
    assert(sagejs_analytic_reserve(
        sagejs_analytic_max_input_capacity() + 1,
        8192) == SAGEJS_ANALYTIC_INVALID_REQUEST);
    assert(sagejs_analytic_reserve(
        4096,
        sagejs_analytic_max_output_capacity() + 1) ==
        SAGEJS_ANALYTIC_INVALID_REQUEST);

    double zeta_two = execute_one(
        SAGEJS_ANALYTIC_RIEMANN_ZETA_VALUES,
        "2", "0", 0, 0, 0, 0, NULL, NULL);
    double gamma_half = execute_one(
        SAGEJS_ANALYTIC_COMPLEX_GAMMA_VALUES,
        "0.5", "0", 0, 0, 0, 0, NULL, NULL);
    double l_two = execute_one(
        SAGEJS_ANALYTIC_DIRICHLET_L_VALUES,
        "2", "0", 5, 2, 0, 0, NULL, NULL);
    double quadratic = execute_one(
        SAGEJS_ANALYTIC_QUADRATIC_ZETA_VALUES,
        "2", "0", 5, 2, 5, 0, NULL, NULL);
    double completion = execute_one(
        SAGEJS_ANALYTIC_QUADRATIC_COMPLETION_VALUES,
        "2", "0", 0, 0, 5, 0, "1", "0");

    assert(fabs(zeta_two - 1.6449340668482264365) < 1e-14);
    assert(fabs(gamma_half - 1.7724538509055160273) < 1e-14);
    assert(fabs(l_two - 0.70621140325974096993) < 1e-14);
    assert(fabs(quadratic - zeta_two * l_two) < 1e-14);
    assert(fabs(completion - 5.0 / (M_PI * M_PI)) < 1e-14);

    /* The shared core rejects trailing bytes rather than ignoring a host bug. */
    {
        uint8_t input[32];
        uint8_t output[256];
        size_t input_length = 0;
        size_t output_length = 0;
        sagejs_analytic_request request = {
            SAGEJS_ANALYTIC_PROTOCOL_VERSION,
            SAGEJS_ANALYTIC_RIEMANN_ZETA_VALUES,
            1, 53, 0, 0, 0, 0, 0, 0, 0
        };
        append_component(input, &input_length, "2");
        append_component(input, &input_length, "0");
        input[input_length++] = 0;
        assert(sagejs_analytic_execute(
            &request, input, input_length, output, sizeof(output),
            &output_length) == SAGEJS_ANALYTIC_INVALID_INPUT);
    }
    sagejs_analytic_release();
    assert(sagejs_analytic_input_capacity() == 0);
    assert(sagejs_analytic_output_capacity() == 0);
    puts("analytic packed core passed");
    return 0;
}
