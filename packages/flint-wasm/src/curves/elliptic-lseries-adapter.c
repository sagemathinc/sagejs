#include "elliptic-lseries-adapter.h"

#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <flint/acb.h>
#include <flint/arb.h>
#include <flint/arf.h>
#include <flint/flint.h>
#include <flint/fmpz.h>
#include <flint/mag.h>

#include "sagejs/elliptic_lfunction_ffi.h"

#define SAGEJS_WASM_EC_MAX_POINTS_PER_TILE 10000U
#define SAGEJS_WASM_EC_MAX_COEFFICIENTS 5000001U
#define SAGEJS_WASM_EC_MAX_POINT_TEXT (64U * 1024U * 1024U)
#define SAGEJS_WASM_EC_MAX_COMPONENT_TEXT 8192U
#define SAGEJS_WASM_EC_MAX_DECIMAL_OUTPUT (128U * 1024U * 1024U)
#define SAGEJS_WASM_EC_PLOT_STRIDE 5U

typedef struct
{
    int initialized;
    uint32_t coefficient_count;
    uint32_t point_count;
    uint32_t point_text_bytes;
    uint32_t conductor_text_bytes;
    uint32_t target_bits;
    uint32_t refinement_bits;
    uint32_t work_precision_bits;
    uint32_t output_mode;
    int32_t *coefficients;
    char *point_text;
    uint32_t *point_offsets;
    char *conductor_text;
    char *decimal_bytes;
    uint32_t decimal_byte_count;
    uint32_t decimal_byte_capacity;
    uint32_t *decimal_offsets;
    uint32_t decimal_offset_count;
    uint32_t decimal_field_count;
    double *plot_values;
    uint32_t plot_value_count;
    sagejs_ec_lfunction_diagnostics diagnostics;
} sagejs_wasm_ec_lseries_state;

static sagejs_wasm_ec_lseries_state state;

static int checked_count(size_t count, size_t width)
{
    return width == 0 || count <= SIZE_MAX / width;
}

void sagejs_wasm_ec_lseries_clear(void)
{
    free(state.plot_values);
    free(state.decimal_offsets);
    free(state.decimal_bytes);
    free(state.conductor_text);
    free(state.point_offsets);
    free(state.point_text);
    free(state.coefficients);
    memset(&state, 0, sizeof(state));
}

static int allocate_request_buffers(void)
{
    const size_t offset_count = (size_t) state.point_count * 2U + 1U;
    if (!checked_count(state.coefficient_count, sizeof(int32_t)) ||
        !checked_count(offset_count, sizeof(uint32_t)))
        return 0;
    state.coefficients = calloc(state.coefficient_count, sizeof(int32_t));
    state.point_text = malloc((size_t) state.point_text_bytes + 1U);
    state.point_offsets = calloc(offset_count, sizeof(uint32_t));
    state.conductor_text = malloc((size_t) state.conductor_text_bytes + 1U);
    return state.coefficients != NULL && state.point_text != NULL &&
        state.point_offsets != NULL && state.conductor_text != NULL;
}

__attribute__((visibility("default")))
int32_t sagejs_wasm_ec_lseries_begin(
    uint32_t coefficient_count,
    uint32_t point_count,
    uint32_t point_text_bytes,
    uint32_t conductor_text_bytes,
    uint32_t target_bits,
    uint32_t refinement_bits,
    uint32_t work_precision_bits,
    uint32_t output_mode)
{
    sagejs_wasm_ec_lseries_clear();
    if (coefficient_count < 2U ||
        coefficient_count > SAGEJS_WASM_EC_MAX_COEFFICIENTS ||
        point_count < 1U || point_count > SAGEJS_WASM_EC_MAX_POINTS_PER_TILE ||
        point_text_bytes < point_count * 2U ||
        point_text_bytes > SAGEJS_WASM_EC_MAX_POINT_TEXT ||
        conductor_text_bytes < 1U || conductor_text_bytes > 4096U ||
        target_bits < 16U || target_bits > 4096U ||
        refinement_bits > 256U ||
        work_precision_bits < target_bits + refinement_bits ||
        work_precision_bits > 8192U ||
        output_mode > SAGEJS_WASM_EC_OUTPUT_PLOT ||
        (output_mode == SAGEJS_WASM_EC_OUTPUT_PLOT && refinement_bits == 0U))
        return SAGEJS_WASM_EC_ADAPTER_INVALID_INPUT;
    state.coefficient_count = coefficient_count;
    state.point_count = point_count;
    state.point_text_bytes = point_text_bytes;
    state.conductor_text_bytes = conductor_text_bytes;
    state.target_bits = target_bits;
    state.refinement_bits = refinement_bits;
    state.work_precision_bits = work_precision_bits;
    state.output_mode = output_mode;
    if (!allocate_request_buffers())
    {
        sagejs_wasm_ec_lseries_clear();
        return SAGEJS_WASM_EC_ADAPTER_ALLOCATION_FAILED;
    }
    state.initialized = 1;
    return SAGEJS_WASM_EC_ADAPTER_OK;
}

__attribute__((visibility("default")))
uintptr_t sagejs_wasm_ec_lseries_coefficients(void)
{
    return (uintptr_t) state.coefficients;
}

__attribute__((visibility("default")))
uintptr_t sagejs_wasm_ec_lseries_point_text(void)
{
    return (uintptr_t) state.point_text;
}

__attribute__((visibility("default")))
uintptr_t sagejs_wasm_ec_lseries_point_offsets(void)
{
    return (uintptr_t) state.point_offsets;
}

__attribute__((visibility("default")))
uintptr_t sagejs_wasm_ec_lseries_conductor_text(void)
{
    return (uintptr_t) state.conductor_text;
}

static int parse_component(arb_t output, uint32_t begin, uint32_t end)
{
    if (begin > end || end > state.point_text_bytes ||
        end - begin > SAGEJS_WASM_EC_MAX_COMPONENT_TEXT)
        return 0;
    const size_t length = (size_t) (end - begin);
    char *text = malloc(length + 1U);
    if (text == NULL)
        return 0;
    memcpy(text, state.point_text + begin, length);
    text[length] = '\0';
    const int parsed = arb_set_str(
        output, text, (slong) state.work_precision_bits) == 0 &&
        arb_is_finite(output);
    free(text);
    return parsed;
}

static int parse_points(acb_ptr points)
{
    const uint32_t offset_count = state.point_count * 2U + 1U;
    if (state.point_offsets[0] != 0U ||
        state.point_offsets[offset_count - 1U] != state.point_text_bytes)
        return 0;
    for (uint32_t index = 0; index + 1U < offset_count; ++index)
        if (state.point_offsets[index] > state.point_offsets[index + 1U])
            return 0;
    for (uint32_t index = 0; index < state.point_count; ++index)
    {
        const uint32_t offset = index * 2U;
        if (!parse_component(
                acb_realref(points + index),
                state.point_offsets[offset],
                state.point_offsets[offset + 1U]) ||
            !parse_component(
                acb_imagref(points + index),
                state.point_offsets[offset + 1U],
                state.point_offsets[offset + 2U]))
            return 0;
    }
    return 1;
}

static int ensure_decimal_capacity(uint32_t additional)
{
    if (additional > SAGEJS_WASM_EC_MAX_DECIMAL_OUTPUT -
            state.decimal_byte_count)
        return 0;
    const uint32_t required = state.decimal_byte_count + additional;
    if (required <= state.decimal_byte_capacity)
        return 1;
    uint32_t capacity = state.decimal_byte_capacity == 0U
        ? 4096U : state.decimal_byte_capacity;
    while (capacity < required)
    {
        if (capacity > SAGEJS_WASM_EC_MAX_DECIMAL_OUTPUT / 2U)
        {
            capacity = SAGEJS_WASM_EC_MAX_DECIMAL_OUTPUT;
            break;
        }
        capacity *= 2U;
    }
    char *resized = realloc(state.decimal_bytes, capacity);
    if (resized == NULL)
        return 0;
    state.decimal_bytes = resized;
    state.decimal_byte_capacity = capacity;
    return 1;
}

static int append_arf(const arf_t value, slong digits, uint32_t *field)
{
    char *text = arf_get_str(value, digits);
    if (text == NULL)
        return 0;
    const size_t length = strlen(text);
    if (length > UINT32_MAX || !ensure_decimal_capacity((uint32_t) length))
    {
        flint_free(text);
        return 0;
    }
    memcpy(state.decimal_bytes + state.decimal_byte_count, text, length);
    state.decimal_byte_count += (uint32_t) length;
    state.decimal_offsets[++*field] = state.decimal_byte_count;
    flint_free(text);
    return 1;
}

static int append_mag(const mag_t value, slong digits, uint32_t *field)
{
    arf_t converted;
    arf_init(converted);
    arf_set_mag(converted, value);
    const int result = append_arf(converted, digits, field);
    arf_clear(converted);
    return result;
}

static int append_slong(slong value, uint32_t *field)
{
    char text[64];
    const int written = snprintf(text, sizeof(text), "%ld", (long) value);
    if (written < 0 || (size_t) written >= sizeof(text) ||
        !ensure_decimal_capacity((uint32_t) written))
        return 0;
    memcpy(state.decimal_bytes + state.decimal_byte_count, text, (size_t) written);
    state.decimal_byte_count += (uint32_t) written;
    state.decimal_offsets[++*field] = state.decimal_byte_count;
    return 1;
}

static int append_accuracy(const acb_t value, uint32_t *field)
{
    slong accuracy = acb_rel_accuracy_bits(value);
    if (accuracy > (slong) state.work_precision_bits)
        accuracy = (slong) state.work_precision_bits;
    return append_slong(accuracy, field);
}

static int append_ball(const acb_t value, slong digits, uint32_t *field)
{
    arf_t radius;
    arf_init(radius);
    if (!append_arf(arb_midref(acb_realref(value)), digits, field) ||
        !append_arf(arb_midref(acb_imagref(value)), digits, field))
    {
        arf_clear(radius);
        return 0;
    }
    arf_set_mag(radius, arb_radref(acb_realref(value)));
    if (!append_arf(radius, digits, field))
    {
        arf_clear(radius);
        return 0;
    }
    arf_set_mag(radius, arb_radref(acb_imagref(value)));
    const int result = append_arf(radius, digits, field);
    arf_clear(radius);
    return result;
}

static int pack_decimal_output(
    acb_srcptr completed,
    acb_srcptr raw,
    acb_srcptr coarse_completed,
    acb_srcptr coarse_raw,
    mag_srcptr coefficient_tail,
    mag_srcptr grid_omission,
    mag_srcptr outer_tail,
    mag_srcptr raw_conversion)
{
    state.decimal_field_count = state.refinement_bits == 0U ? 15U : 25U;
    const size_t fields =
        (size_t) state.decimal_field_count * state.point_count;
    if (fields >= UINT32_MAX || !checked_count(fields + 1U, sizeof(uint32_t)))
        return 0;
    state.decimal_offsets = calloc(fields + 1U, sizeof(uint32_t));
    if (state.decimal_offsets == NULL)
        return 0;
    state.decimal_offset_count = (uint32_t) fields + 1U;
    uint32_t field = 0U;
    const slong fine_bits =
        (slong) state.target_bits + (slong) state.refinement_bits;
    const slong digits = (slong) ceil((double) fine_bits * 0.30103) + 12;
    mag_t analytic_error;
    mag_init(analytic_error);
    for (uint32_t index = 0; index < state.point_count; ++index)
    {
        mag_add(analytic_error, coefficient_tail + index, grid_omission + index);
        mag_add(analytic_error, analytic_error, outer_tail + index);
        if (!append_ball(completed + index, digits, &field) ||
            !append_accuracy(completed + index, &field) ||
            !append_ball(raw + index, digits, &field) ||
            !append_accuracy(raw + index, &field) ||
            !append_mag(coefficient_tail + index, digits, &field) ||
            !append_mag(grid_omission + index, digits, &field) ||
            !append_mag(outer_tail + index, digits, &field) ||
            !append_mag(raw_conversion + index, digits, &field) ||
            !append_mag(analytic_error, digits, &field) ||
            (state.refinement_bits != 0U &&
                (!append_ball(coarse_completed + index, digits, &field) ||
                 !append_accuracy(coarse_completed + index, &field) ||
                 !append_ball(coarse_raw + index, digits, &field) ||
                 !append_accuracy(coarse_raw + index, &field))))
        {
            mag_clear(analytic_error);
            return 0;
        }
    }
    mag_clear(analytic_error);
    return field == fields;
}

static int pack_plot_output(
    acb_srcptr coarse_raw,
    acb_srcptr fine_raw,
    mag_srcptr coefficient_tail,
    mag_srcptr grid_omission,
    mag_srcptr outer_tail)
{
    const size_t count =
        (size_t) state.point_count * SAGEJS_WASM_EC_PLOT_STRIDE;
    if (count > UINT32_MAX || !checked_count(count, sizeof(double)))
        return 0;
    state.plot_values = calloc(count, sizeof(double));
    if (state.plot_values == NULL)
        return 0;
    state.plot_value_count = (uint32_t) count;
    mag_t analytic_error;
    mag_init(analytic_error);
    for (uint32_t index = 0; index < state.point_count; ++index)
    {
        const size_t offset =
            (size_t) index * SAGEJS_WASM_EC_PLOT_STRIDE;
        state.plot_values[offset] = arf_get_d(
            arb_midref(acb_realref(fine_raw + index)), ARF_RND_NEAR);
        state.plot_values[offset + 1U] = arf_get_d(
            arb_midref(acb_imagref(fine_raw + index)), ARF_RND_NEAR);
        state.plot_values[offset + 2U] = arf_get_d(
            arb_midref(acb_realref(coarse_raw + index)), ARF_RND_NEAR);
        state.plot_values[offset + 3U] = arf_get_d(
            arb_midref(acb_imagref(coarse_raw + index)), ARF_RND_NEAR);
        mag_add(analytic_error, coefficient_tail + index, grid_omission + index);
        mag_add(analytic_error, analytic_error, outer_tail + index);
        state.plot_values[offset + 4U] = mag_get_d(analytic_error) +
            mag_get_d(arb_radref(acb_realref(fine_raw + index))) +
            mag_get_d(arb_radref(acb_imagref(fine_raw + index)));
    }
    mag_clear(analytic_error);
    return 1;
}

__attribute__((visibility("default")))
int32_t sagejs_wasm_ec_lseries_compute(int32_t root_number)
{
    if (!state.initialized || (root_number != -1 && root_number != 1))
        return SAGEJS_WASM_EC_ADAPTER_INVALID_INPUT;
    state.conductor_text[state.conductor_text_bytes] = '\0';
    state.point_text[state.point_text_bytes] = '\0';
    fmpz_t conductor;
    fmpz_init(conductor);
    if (fmpz_set_str(conductor, state.conductor_text, 10) != 0 ||
        fmpz_sgn(conductor) <= 0)
    {
        fmpz_clear(conductor);
        return SAGEJS_WASM_EC_ADAPTER_PARSE_FAILED;
    }
    acb_ptr points = _acb_vec_init((slong) state.point_count);
    if (!parse_points(points))
    {
        _acb_vec_clear(points, (slong) state.point_count);
        fmpz_clear(conductor);
        return SAGEJS_WASM_EC_ADAPTER_PARSE_FAILED;
    }
    const slong count = (slong) state.point_count;
    acb_ptr completed = _acb_vec_init(count);
    acb_ptr raw = _acb_vec_init(count);
    acb_ptr coarse_completed = state.refinement_bits == 0U
        ? NULL : _acb_vec_init(count);
    acb_ptr coarse_raw = state.refinement_bits == 0U
        ? NULL : _acb_vec_init(count);
    mag_ptr coefficient_tail = _mag_vec_init(count);
    mag_ptr grid_omission = _mag_vec_init(count);
    mag_ptr outer_tail = _mag_vec_init(count);
    mag_ptr raw_conversion = _mag_vec_init(count);
    const int status = state.refinement_bits == 0U
        ? sagejs_ec_lseries_values_acb(
            completed, raw, coefficient_tail, grid_omission, outer_tail,
            raw_conversion, &state.diagnostics, state.coefficients + 1,
            (slong) state.coefficient_count - 1, conductor, root_number,
            points, count, (slong) state.target_bits,
            (slong) state.work_precision_bits)
        : sagejs_ec_lseries_values_refined_acb(
            coarse_completed, coarse_raw, completed, raw, coefficient_tail,
            grid_omission, outer_tail, raw_conversion, &state.diagnostics,
            state.coefficients + 1, (slong) state.coefficient_count - 1,
            conductor, root_number, points, count,
            (slong) state.target_bits, (slong) state.refinement_bits,
            (slong) state.work_precision_bits);
    int packed = 1;
    if ((status == SAGEJS_EC_LFUNCTION_OK ||
        status == SAGEJS_EC_LFUNCTION_INSUFFICIENT_COEFFICIENTS)
        && state.output_mode != SAGEJS_WASM_EC_OUTPUT_PLAN)
        packed = state.output_mode == SAGEJS_WASM_EC_OUTPUT_PLOT
            ? pack_plot_output(
                coarse_raw, raw, coefficient_tail, grid_omission, outer_tail)
            : pack_decimal_output(
                completed, raw, coarse_completed, coarse_raw,
                coefficient_tail, grid_omission, outer_tail, raw_conversion);
    _mag_vec_clear(raw_conversion, count);
    _mag_vec_clear(outer_tail, count);
    _mag_vec_clear(grid_omission, count);
    _mag_vec_clear(coefficient_tail, count);
    if (coarse_raw != NULL) _acb_vec_clear(coarse_raw, count);
    if (coarse_completed != NULL) _acb_vec_clear(coarse_completed, count);
    _acb_vec_clear(raw, count);
    _acb_vec_clear(completed, count);
    _acb_vec_clear(points, count);
    fmpz_clear(conductor);
    return packed ? status : SAGEJS_WASM_EC_ADAPTER_ALLOCATION_FAILED;
}

__attribute__((visibility("default")))
uintptr_t sagejs_wasm_ec_lseries_decimal_bytes(void)
{
    return (uintptr_t) state.decimal_bytes;
}

__attribute__((visibility("default")))
uint32_t sagejs_wasm_ec_lseries_decimal_byte_count(void)
{
    return state.decimal_byte_count;
}

__attribute__((visibility("default")))
uintptr_t sagejs_wasm_ec_lseries_decimal_offsets(void)
{
    return (uintptr_t) state.decimal_offsets;
}

__attribute__((visibility("default")))
uint32_t sagejs_wasm_ec_lseries_decimal_offset_count(void)
{
    return state.decimal_offset_count;
}

__attribute__((visibility("default")))
uint32_t sagejs_wasm_ec_lseries_decimal_field_count(void)
{
    return state.decimal_field_count;
}

__attribute__((visibility("default")))
uintptr_t sagejs_wasm_ec_lseries_plot_values(void)
{
    return (uintptr_t) state.plot_values;
}

__attribute__((visibility("default")))
uint32_t sagejs_wasm_ec_lseries_plot_value_count(void)
{
    return state.plot_value_count;
}

__attribute__((visibility("default")))
uint32_t sagejs_wasm_ec_lseries_plot_stride(void)
{
    return SAGEJS_WASM_EC_PLOT_STRIDE;
}

__attribute__((visibility("default")))
int64_t sagejs_wasm_ec_lseries_diagnostic(uint32_t index)
{
    switch (index)
    {
        case 0: return (int64_t) state.diagnostics.status;
        case 1: return (int64_t) state.diagnostics.actual_cutoff;
        case 2: return (int64_t) state.diagnostics.required_cutoff;
        case 3: return (int64_t) state.diagnostics.grid_points;
        case 4: return (int64_t) state.diagnostics.coefficient_terms;
        case 5: return (int64_t) state.diagnostics.target_bits;
        case 6: return (int64_t) state.diagnostics.work_precision;
        case 7: return (int64_t) state.diagnostics.point_count;
        case 11: return (int64_t) state.diagnostics.known_error_target_met;
        case 12: return (int64_t) state.diagnostics.rigorous_enclosure;
        default: return 0;
    }
}

__attribute__((visibility("default")))
double sagejs_wasm_ec_lseries_diagnostic_double(uint32_t index)
{
    switch (index)
    {
        case 8: return state.diagnostics.grid_step;
        case 9: return state.diagnostics.max_abs_imaginary;
        case 10: return state.diagnostics.max_abs_real_offset;
        default: return 0.0;
    }
}
