/* Host-neutral packed Arb/Acb analytic batches for Node and WebAssembly. */

#include "analytic_batch_core.h"

#include <limits.h>
#include <stdlib.h>
#include <string.h>

#include <flint/acb.h>
#include <flint/acb_dirichlet.h>
#include <flint/arb.h>
#include <flint/dirichlet.h>
#include <flint/flint.h>
#include <flint/fmpz.h>

typedef struct
{
    const uint8_t *data;
    size_t length;
    size_t offset;
} packet_reader;

typedef struct
{
    uint8_t *data;
    size_t capacity;
    size_t offset;
} packet_writer;

static uint32_t read_u32_le(const uint8_t *source)
{
    return ((uint32_t) source[0]) |
        ((uint32_t) source[1] << 8) |
        ((uint32_t) source[2] << 16) |
        ((uint32_t) source[3] << 24);
}

static int writer_bytes(packet_writer *writer, const void *source, size_t count)
{
    if (count > writer->capacity - writer->offset)
        return 0;
    memcpy(writer->data + writer->offset, source, count);
    writer->offset += count;
    return 1;
}

static int writer_u16(packet_writer *writer, uint16_t value)
{
    uint8_t bytes[2];
    bytes[0] = (uint8_t) value;
    bytes[1] = (uint8_t) (value >> 8);
    return writer_bytes(writer, bytes, sizeof(bytes));
}

static int writer_u32(packet_writer *writer, uint32_t value)
{
    uint8_t bytes[4];
    bytes[0] = (uint8_t) value;
    bytes[1] = (uint8_t) (value >> 8);
    bytes[2] = (uint8_t) (value >> 16);
    bytes[3] = (uint8_t) (value >> 24);
    return writer_bytes(writer, bytes, sizeof(bytes));
}

static int writer_i32(packet_writer *writer, int32_t value)
{
    return writer_u32(writer, (uint32_t) value);
}

static char *reader_string(packet_reader *reader)
{
    uint32_t length;
    char *result;

    if (reader->length - reader->offset < 4)
        return NULL;
    length = read_u32_le(reader->data + reader->offset);
    reader->offset += 4;
    if (length == 0 || length > SAGEJS_ANALYTIC_MAX_COMPONENT_BYTES ||
        length > reader->length - reader->offset)
        return NULL;
    result = (char *) malloc((size_t) length + 1);
    if (result == NULL)
        return NULL;
    memcpy(result, reader->data + reader->offset, length);
    result[length] = '\0';
    reader->offset += length;
    return result;
}

static int reader_acb(packet_reader *reader, acb_t result, slong precision)
{
    char *real_text = reader_string(reader);
    char *imaginary_text;
    int valid;

    if (real_text == NULL)
        return 0;
    imaginary_text = reader_string(reader);
    if (imaginary_text == NULL)
    {
        free(real_text);
        return 0;
    }
    valid = arb_set_str(acb_realref(result), real_text, precision) == 0 &&
        arb_set_str(acb_imagref(result), imaginary_text, precision) == 0;
    free(imaginary_text);
    free(real_text);
    return valid && acb_is_finite(result);
}

static int32_t bounded_accuracy(const arb_t value)
{
    slong accuracy = arb_rel_accuracy_bits(value);
    if (accuracy > INT32_MAX)
        return INT32_MAX;
    if (accuracy < INT32_MIN)
        return INT32_MIN;
    return (int32_t) accuracy;
}

static uint32_t decimal_digits(uint32_t precision)
{
    uint64_t digits = ((uint64_t) precision * UINT64_C(30103)) /
        UINT64_C(100000) + UINT64_C(8);
    return digits > UINT32_MAX ? UINT32_MAX : (uint32_t) digits;
}

static int writer_arb_text(
    packet_writer *writer, const arb_t value, uint32_t digits)
{
    char *text = arb_get_str(value, (slong) digits, ARB_STR_NO_RADIUS);
    size_t length;
    int ok;

    if (text == NULL)
        return 0;
    length = strlen(text);
    ok = length <= UINT32_MAX &&
        writer_u32(writer, (uint32_t) length) &&
        writer_bytes(writer, text, length);
    flint_free(text);
    return ok;
}

static int writer_acb(
    packet_writer *writer, const acb_t value, uint32_t digits)
{
    uint32_t flags = 0;

    if (acb_is_finite(value))
        flags |= SAGEJS_ANALYTIC_VALUE_FINITE;
    if (arb_is_exact(acb_realref(value)))
        flags |= SAGEJS_ANALYTIC_VALUE_REAL_EXACT;
    if (arb_is_exact(acb_imagref(value)))
        flags |= SAGEJS_ANALYTIC_VALUE_IMAG_EXACT;
    if (acb_contains_zero(value))
        flags |= SAGEJS_ANALYTIC_VALUE_CONTAINS_ZERO;
    return writer_i32(writer, bounded_accuracy(acb_realref(value))) &&
        writer_i32(writer, bounded_accuracy(acb_imagref(value))) &&
        writer_u32(writer, flags) &&
        writer_arb_text(writer, acb_realref(value), digits) &&
        writer_arb_text(writer, acb_imagref(value), digits);
}

static int character_from_sage_index(
    dirichlet_char_t character,
    const dirichlet_group_t group,
    ulong index)
{
    slong component;

    if (index >= group->phi_q)
        return 0;
    for (component = 0; component < group->num; component++)
    {
        ulong order = group->P[component].phi.n;
        character->log[component] = index % order;
        index /= order;
    }
    _dirichlet_char_exp(character, group);
    return 1;
}

static void multiply_derivative_factorial(
    acb_t value, uint32_t derivative, slong precision)
{
    fmpz_t factorial;
    if (derivative == 0)
        return;
    fmpz_init(factorial);
    fmpz_fac_ui(factorial, (ulong) derivative);
    acb_mul_fmpz(value, value, factorial, precision);
    fmpz_clear(factorial);
}

static void quadratic_completion_factor(
    acb_t result, const acb_t point, int64_t discriminant, slong precision)
{
    acb_t exponent;
    acb_t base;
    acb_t gamma;

    acb_init(exponent);
    acb_init(base);
    acb_init(gamma);

    acb_mul_2exp_si(exponent, point, -1);
    acb_set_ui(base, (ulong) (discriminant < 0
        ? -discriminant : discriminant));
    acb_pow(result, base, exponent, precision);
    if (discriminant > 0)
    {
        acb_const_pi(base, precision);
        acb_neg(exponent, point);
        acb_pow(base, base, exponent, precision);
        acb_mul(result, result, base, precision);
        acb_mul_2exp_si(exponent, point, -1);
        acb_gamma(gamma, exponent, precision);
        acb_mul(result, result, gamma, precision);
        acb_mul(result, result, gamma, precision);
    }
    else
    {
        acb_const_pi(base, precision);
        acb_mul_2exp_si(base, base, 1);
        acb_neg(exponent, point);
        acb_pow(base, base, exponent, precision);
        acb_mul(result, result, base, precision);
        acb_gamma(gamma, point, precision);
        acb_mul(result, result, gamma, precision);
        acb_mul_2exp_si(result, result, 1);
    }
    acb_clear(gamma);
    acb_clear(base);
    acb_clear(exponent);
}

static sagejs_analytic_status validate_request(
    const sagejs_analytic_request *request, uint32_t *output_count)
{
    uint64_t total;

    if (request == NULL ||
        request->version != SAGEJS_ANALYTIC_PROTOCOL_VERSION ||
        request->point_count == 0 ||
        request->point_count > SAGEJS_ANALYTIC_MAX_POINTS ||
        request->precision_bits < 16 ||
        request->precision_bits > SAGEJS_ANALYTIC_MAX_PRECISION_BITS ||
        request->derivative > SAGEJS_ANALYTIC_MAX_DERIVATIVE ||
        request->first_order > SAGEJS_ANALYTIC_MAX_DERIVATIVE ||
        request->result_count > SAGEJS_ANALYTIC_MAX_DERIVATIVE)
        return SAGEJS_ANALYTIC_INVALID_REQUEST;

    switch (request->operation)
    {
        case SAGEJS_ANALYTIC_RIEMANN_ZETA_VALUES:
        case SAGEJS_ANALYTIC_DIRICHLET_L_VALUES:
        case SAGEJS_ANALYTIC_RIEMANN_XI_VALUES:
        case SAGEJS_ANALYTIC_COMPLEX_GAMMA_VALUES:
        case SAGEJS_ANALYTIC_QUADRATIC_ZETA_VALUES:
        case SAGEJS_ANALYTIC_QUADRATIC_COMPLETION_VALUES:
            *output_count = request->point_count;
            break;
        case SAGEJS_ANALYTIC_RIEMANN_ZETA_JET:
            if (request->point_count != 1 || request->result_count == 0)
                return SAGEJS_ANALYTIC_INVALID_REQUEST;
            total = (uint64_t) request->first_order + request->result_count;
            if (total > UINT64_C(2) * SAGEJS_ANALYTIC_MAX_DERIVATIVE)
                return SAGEJS_ANALYTIC_INVALID_REQUEST;
            *output_count = request->result_count;
            break;
        default:
            return SAGEJS_ANALYTIC_INVALID_REQUEST;
    }
    if ((request->operation == SAGEJS_ANALYTIC_DIRICHLET_L_VALUES ||
         request->operation == SAGEJS_ANALYTIC_QUADRATIC_ZETA_VALUES) &&
        (request->modulus == 0 || request->modulus > UWORD_MAX ||
         request->character_index > UWORD_MAX))
        return SAGEJS_ANALYTIC_UNSUPPORTED_WORD;
    if (request->operation == SAGEJS_ANALYTIC_QUADRATIC_ZETA_VALUES &&
        request->derivative != 0)
        return SAGEJS_ANALYTIC_INVALID_REQUEST;
    if ((request->operation == SAGEJS_ANALYTIC_QUADRATIC_ZETA_VALUES ||
         request->operation == SAGEJS_ANALYTIC_QUADRATIC_COMPLETION_VALUES) &&
        (request->discriminant == 0 || request->discriminant == 1 ||
         request->discriminant == INT64_MIN ||
         (uint64_t) (request->discriminant < 0
             ? -request->discriminant : request->discriminant) > UWORD_MAX))
        return SAGEJS_ANALYTIC_UNSUPPORTED_WORD;
    return SAGEJS_ANALYTIC_OK;
}

sagejs_analytic_status sagejs_analytic_execute(
    const sagejs_analytic_request *request,
    const uint8_t *input,
    size_t input_length,
    uint8_t *output,
    size_t output_capacity,
    size_t *output_length)
{
    sagejs_analytic_status status;
    packet_reader reader;
    packet_writer writer;
    uint32_t result_count;
    uint32_t digits;
    slong precision;
    acb_ptr points = NULL;
    acb_ptr raw_values = NULL;
    acb_ptr results = NULL;
    dirichlet_group_t group;
    dirichlet_char_t character;
    int group_initialized = 0;
    int character_initialized = 0;
    uint32_t index;

    if (output_length == NULL)
        return SAGEJS_ANALYTIC_INVALID_REQUEST;
    *output_length = 0;
    status = validate_request(request, &result_count);
    if (status != SAGEJS_ANALYTIC_OK)
        return status;
    if (input == NULL || output == NULL || output_capacity < 20)
        return SAGEJS_ANALYTIC_INVALID_REQUEST;

    precision = (slong) request->precision_bits;
    reader.data = input;
    reader.length = input_length;
    reader.offset = 0;
    writer.data = output;
    writer.capacity = output_capacity;
    writer.offset = 0;
    digits = decimal_digits(request->precision_bits);

    points = _acb_vec_init((slong) request->point_count);
    if (points == NULL)
        return SAGEJS_ANALYTIC_ALLOCATION_FAILED;
    if (request->operation == SAGEJS_ANALYTIC_QUADRATIC_COMPLETION_VALUES)
    {
        raw_values = _acb_vec_init((slong) request->point_count);
        if (raw_values == NULL)
        {
            status = SAGEJS_ANALYTIC_ALLOCATION_FAILED;
            goto cleanup;
        }
    }
    for (index = 0; index < request->point_count; index++)
    {
        if (!reader_acb(&reader, points + index, precision) ||
            (raw_values != NULL &&
             !reader_acb(&reader, raw_values + index, precision)))
        {
            status = SAGEJS_ANALYTIC_INVALID_INPUT;
            goto cleanup;
        }
    }
    if (reader.offset != reader.length)
    {
        status = SAGEJS_ANALYTIC_INVALID_INPUT;
        goto cleanup;
    }

    results = _acb_vec_init((slong) result_count);
    if (results == NULL)
    {
        status = SAGEJS_ANALYTIC_ALLOCATION_FAILED;
        goto cleanup;
    }

    if (request->operation == SAGEJS_ANALYTIC_DIRICHLET_L_VALUES ||
        request->operation == SAGEJS_ANALYTIC_QUADRATIC_ZETA_VALUES)
    {
        if (!dirichlet_group_init(group, (ulong) request->modulus))
        {
            status = SAGEJS_ANALYTIC_FLINT_FAILED;
            goto cleanup;
        }
        group_initialized = 1;
        dirichlet_char_init(character, group);
        character_initialized = 1;
        if (!character_from_sage_index(
                character, group, (ulong) request->character_index))
        {
            status = SAGEJS_ANALYTIC_INVALID_REQUEST;
            goto cleanup;
        }
    }

    switch (request->operation)
    {
        case SAGEJS_ANALYTIC_RIEMANN_ZETA_VALUES:
            for (index = 0; index < request->point_count; index++)
            {
                if (request->derivative == 0)
                    acb_dirichlet_zeta(
                        results + index, points + index, precision);
                else
                {
                    acb_ptr jet = _acb_vec_init(
                        (slong) request->derivative + 1);
                    acb_dirichlet_zeta_jet(
                        jet, points + index, 0,
                        (slong) request->derivative + 1, precision);
                    acb_set(results + index, jet + request->derivative);
                    multiply_derivative_factorial(
                        results + index, request->derivative, precision);
                    _acb_vec_clear(jet, (slong) request->derivative + 1);
                }
            }
            break;
        case SAGEJS_ANALYTIC_RIEMANN_ZETA_JET:
        {
            uint32_t total = request->first_order + request->result_count;
            acb_ptr jet = _acb_vec_init((slong) total);
            acb_dirichlet_zeta_jet(
                jet, points,
                (request->flags & SAGEJS_ANALYTIC_FLAG_DEFLATE) != 0,
                (slong) total, precision);
            for (index = 0; index < request->result_count; index++)
            {
                uint32_t derivative = request->first_order + index;
                acb_set(results + index, jet + derivative);
                multiply_derivative_factorial(
                    results + index, derivative, precision);
            }
            _acb_vec_clear(jet, (slong) total);
            break;
        }
        case SAGEJS_ANALYTIC_DIRICHLET_L_VALUES:
        case SAGEJS_ANALYTIC_QUADRATIC_ZETA_VALUES:
        {
            acb_ptr jet = _acb_vec_init((slong) request->derivative + 1);
            for (index = 0; index < request->point_count; index++)
            {
                acb_dirichlet_l_jet(
                    jet, points + index, group, character, 0,
                    (slong) request->derivative + 1, precision);
                acb_set(results + index, jet + request->derivative);
                multiply_derivative_factorial(
                    results + index, request->derivative, precision);
                if (request->operation ==
                    SAGEJS_ANALYTIC_QUADRATIC_ZETA_VALUES)
                {
                    acb_t zeta;
                    acb_init(zeta);
                    acb_dirichlet_zeta(zeta, points + index, precision);
                    acb_mul(results + index, results + index, zeta, precision);
                    if ((request->flags & SAGEJS_ANALYTIC_FLAG_COMPLETED) != 0)
                    {
                        acb_t factor;
                        acb_init(factor);
                        quadratic_completion_factor(
                            factor, points + index,
                            request->discriminant, precision);
                        acb_mul(
                            results + index, results + index,
                            factor, precision);
                        acb_clear(factor);
                    }
                    acb_clear(zeta);
                }
            }
            _acb_vec_clear(jet, (slong) request->derivative + 1);
            break;
        }
        case SAGEJS_ANALYTIC_RIEMANN_XI_VALUES:
            for (index = 0; index < request->point_count; index++)
                acb_dirichlet_xi(
                    results + index, points + index, precision);
            break;
        case SAGEJS_ANALYTIC_COMPLEX_GAMMA_VALUES:
            for (index = 0; index < request->point_count; index++)
                acb_gamma(results + index, points + index, precision);
            break;
        case SAGEJS_ANALYTIC_QUADRATIC_COMPLETION_VALUES:
            for (index = 0; index < request->point_count; index++)
            {
                quadratic_completion_factor(
                    results + index, points + index,
                    request->discriminant, precision);
                acb_mul(
                    results + index, results + index,
                    raw_values + index, precision);
            }
            break;
        default:
            status = SAGEJS_ANALYTIC_INVALID_REQUEST;
            goto cleanup;
    }

    if (!writer_bytes(&writer, "SJA1", 4) ||
        !writer_u16(&writer, (uint16_t) SAGEJS_ANALYTIC_PROTOCOL_VERSION) ||
        !writer_u16(&writer, 2) ||
        !writer_u32(&writer, result_count) ||
        !writer_u32(&writer, request->precision_bits) ||
        !writer_u32(&writer, digits))
    {
        status = SAGEJS_ANALYTIC_OUTPUT_TOO_SMALL;
        goto cleanup;
    }
    for (index = 0; index < result_count; index++)
    {
        if (!writer_acb(&writer, results + index, digits))
        {
            status = SAGEJS_ANALYTIC_OUTPUT_TOO_SMALL;
            goto cleanup;
        }
    }
    *output_length = writer.offset;
    status = SAGEJS_ANALYTIC_OK;

cleanup:
    if (character_initialized)
        dirichlet_char_clear(character);
    if (group_initialized)
        dirichlet_group_clear(group);
    if (results != NULL)
        _acb_vec_clear(results, (slong) result_count);
    if (raw_values != NULL)
        _acb_vec_clear(raw_values, (slong) request->point_count);
    if (points != NULL)
        _acb_vec_clear(points, (slong) request->point_count);
    return status;
}

const char *sagejs_analytic_status_message(sagejs_analytic_status status)
{
    switch (status)
    {
        case SAGEJS_ANALYTIC_OK:
            return "success";
        case SAGEJS_ANALYTIC_INVALID_REQUEST:
            return "invalid analytic request";
        case SAGEJS_ANALYTIC_INVALID_INPUT:
            return "invalid packed decimal input";
        case SAGEJS_ANALYTIC_OUTPUT_TOO_SMALL:
            return "analytic output buffer is too small";
        case SAGEJS_ANALYTIC_UNSUPPORTED_WORD:
            return "integer exceeds this target's FLINT word";
        case SAGEJS_ANALYTIC_ALLOCATION_FAILED:
            return "analytic allocation failed";
        case SAGEJS_ANALYTIC_FLINT_FAILED:
            return "FLINT analytic initialization failed";
        default:
            return "unknown analytic status";
    }
}
