#ifndef SAGEJS_FQ_MPOLY_FFI_H
#define SAGEJS_FQ_MPOLY_FFI_H

#include <flint/fq_nmod_mpoly.h>
#include <flint/fq_nmod_mpoly_factor.h>
#include "sagejs/fq_polynomial_ffi.h"

/* Host-neutral representation adapter, not a polynomial algorithm.
 *
 * Context ingress is a canonical modulus, never a scalar resource pointer.
 * This permits a separate Wasm reactor. Dependents retain their own context;
 * resources and their reference counts are thread-affine. All input lengths,
 * coordinates, exponents and products are checked before FLINT allocation.
 *
 * Initial common native/Wasm envelope: prime p <= 2^32-1, degree 2..1024,
 * 1..64 variables, 4096 input/output terms, exponents <= 2^20, 16 MiB transfer.
 * The bounds are representation limits, not platform qualification receipts.
 */
#define SAGEJS_FQ_MPOLY_MAX_TERMS UINT64_C(4096)
#define SAGEJS_FQ_MPOLY_MAX_EXPONENT UINT64_C(1048576)
#define SAGEJS_FQ_MPOLY_MAX_BYTES ((size_t) 16777216)

typedef struct
{
    fq_nmod_mpoly_ctx_t value;
    uint64_t characteristic, degree, variables, order;
    size_t references;
} sagejs_fq_mpoly_context_state;

typedef struct
{
    sagejs_fq_mpoly_context_state *state;
} sagejs_fq_mpoly_context_struct;
typedef sagejs_fq_mpoly_context_struct sagejs_fq_mpoly_context_t[1];

typedef struct
{
    fq_nmod_mpoly_t value;
    sagejs_fq_mpoly_context_state *context;
} sagejs_fq_mpoly_struct;
typedef sagejs_fq_mpoly_struct sagejs_fq_mpoly_t[1];

/* A distinct semantic byte resource keeps copies on the owning reactor when
 * this family is loaded separately from the scalar finite-field backend. */
typedef sagejs_flint_byte_region_struct sagejs_fq_mpoly_bytes_struct;
typedef sagejs_fq_mpoly_bytes_struct sagejs_fq_mpoly_bytes_t[1];

static inline size_t sagejs_fq_mpoly_context_allocated_bytes(
    const sagejs_fq_mpoly_context_t context)
{
    if (context->state == NULL)
        return 0;
    const fq_nmod_ctx_struct *inner = context->state->value->fqctx;
    size_t retained = sizeof(sagejs_fq_mpoly_context_state);
    retained = sagejs_retained_size_add(retained,
        sagejs_retained_size_multiply((size_t) inner->modulus->alloc, sizeof(ulong)));
    retained = sagejs_retained_size_add(retained,
        sagejs_retained_size_multiply((size_t) inner->inv->alloc, sizeof(ulong)));
    retained = sagejs_retained_size_add(retained,
        sagejs_retained_size_multiply((size_t) inner->len, sizeof(ulong) + sizeof(slong)));
    if (inner->var != NULL)
        retained = sagejs_retained_size_add(retained, strlen(inner->var) + 1);
    return retained;
}

static inline size_t sagejs_fq_mpoly_allocated_bytes(const sagejs_fq_mpoly_t value)
{
    if (value->context == NULL)
        return 0;
    return sagejs_retained_size_add(sizeof(sagejs_fq_mpoly_struct),
        sagejs_retained_size_add(
            sagejs_retained_size_multiply((size_t) value->value->coeffs_alloc, sizeof(ulong)),
            sagejs_retained_size_multiply((size_t) value->value->exps_alloc, sizeof(ulong))));
}

/* Charge a shared context conservatively to each cached child. This counts
 * retained FLINT buffers, not allocator metadata or transient algorithm RSS. */
static inline uint64_t sagejs_fq_mpoly_cache_bytes(const sagejs_fq_mpoly_t value)
{
    sagejs_fq_mpoly_context_struct context = {value->context};
    return (uint64_t) sagejs_retained_size_add(
        sagejs_fq_mpoly_allocated_bytes(value),
        sagejs_fq_mpoly_context_allocated_bytes(&context));
}

static inline void sagejs_fq_mpoly_state_release(
    sagejs_fq_mpoly_context_state *state)
{
    if (state == NULL || state->references == 0)
        return;
    if (--state->references == 0)
    {
        fq_nmod_mpoly_ctx_clear(state->value);
        free(state);
    }
}

static inline int sagejs_fq_mpoly_context_init(
    sagejs_fq_mpoly_context_t result, const uint64_t *modulus,
    uint64_t modulus_length, uint64_t characteristic,
    uint64_t variables, uint64_t order)
{
    sagejs_fq_context_t scalar;
    ordering_t ordering;
    result->state = NULL;
    if (modulus_length < 3 || modulus_length > 1025 ||
        characteristic > UINT32_MAX || variables < 1 || variables > 64)
        return 0;
    switch (order)
    {
        case 0: ordering = ORD_LEX; break;
        case 1: ordering = ORD_DEGLEX; break;
        case 2: ordering = ORD_DEGREVLEX; break;
        default: return 0;
    }
    if (!sagejs_fq_context_init(scalar, modulus, modulus_length, characteristic))
        return 0;
    sagejs_fq_mpoly_context_state *state =
        (sagejs_fq_mpoly_context_state *) calloc(1, sizeof(*state));
    if (state == NULL)
    {
        sagejs_fq_context_clear(scalar);
        return 0;
    }
    /* FLINT copies the defining field context here. */
    fq_nmod_mpoly_ctx_init(state->value, (slong) variables, ordering,
        FQ_DEFAULT_CTX_FQ_NMOD(scalar->state->value));
    sagejs_fq_context_clear(scalar);
    state->characteristic = characteristic;
    state->degree = modulus_length - 1;
    state->variables = variables;
    state->order = order;
    state->references = 1;
    result->state = state;
    return 1;
}

static inline void sagejs_fq_mpoly_context_clear(sagejs_fq_mpoly_context_t value)
{
    sagejs_fq_mpoly_state_release(value->state);
    value->state = NULL;
}

static inline int sagejs_fq_mpoly_attach(
    sagejs_fq_mpoly_t result, sagejs_fq_mpoly_context_state *context)
{
    result->context = NULL;
    if (context == NULL || context->references == SIZE_MAX)
        return 0;
    context->references++;
    result->context = context;
    fq_nmod_mpoly_init(result->value, context->value);
    return 1;
}

static inline void sagejs_fq_mpoly_clear(sagejs_fq_mpoly_t value)
{
    if (value->context == NULL)
        return;
    fq_nmod_mpoly_clear(value->value, value->context->value);
    sagejs_fq_mpoly_state_release(value->context);
    value->context = NULL;
}

static inline int sagejs_fq_mpoly_transfer_size(
    const sagejs_fq_mpoly_context_state *context,
    uint64_t terms, size_t *total)
{
    size_t words, payload, header;
    if (context == NULL || terms > SAGEJS_FQ_MPOLY_MAX_TERMS ||
        !sagejs_fq_size_multiply((size_t) terms,
            (size_t) (context->degree + context->variables), &words) ||
        !sagejs_fq_size_multiply(words, sizeof(uint64_t), &payload))
        return 0;
    header = 48 + (size_t) (context->degree + 1) * sizeof(uint64_t);
    if (payload > SAGEJS_FQ_MPOLY_MAX_BYTES - header)
        return 0;
    *total = payload + header;
    return 1;
}

static inline int sagejs_fq_mpoly_init_terms(
    sagejs_fq_mpoly_t result, const sagejs_fq_mpoly_context_t context,
    const uint64_t *coefficients, uint64_t coefficient_length,
    const uint64_t *exponents, uint64_t exponent_length, uint64_t terms)
{
    size_t expected_coefficients, expected_exponents, total;
    sagejs_fq_mpoly_context_state *state = context->state;
    result->context = NULL;
    if (!sagejs_fq_mpoly_transfer_size(state, terms, &total) ||
        !sagejs_fq_size_multiply((size_t) terms, (size_t) state->degree,
            &expected_coefficients) ||
        !sagejs_fq_size_multiply((size_t) terms, (size_t) state->variables,
            &expected_exponents) ||
        coefficient_length != (uint64_t) expected_coefficients ||
        exponent_length != (uint64_t) expected_exponents ||
        (coefficient_length != 0 && coefficients == NULL) ||
        (exponent_length != 0 && exponents == NULL))
        return 0;
    for (uint64_t i = 0; i < coefficient_length; i++)
        if (coefficients[i] >= state->characteristic)
            return 0;
    for (uint64_t i = 0; i < exponent_length; i++)
        if (exponents[i] > SAGEJS_FQ_MPOLY_MAX_EXPONENT ||
            !sagejs_fq_word_fits(exponents[i]))
            return 0;
    if (!sagejs_fq_mpoly_attach(result, state))
        return 0;
    fq_nmod_t coefficient;
    ulong powers[64];
    fq_nmod_init(coefficient, state->value->fqctx);
    for (uint64_t term = 0; term < terms; term++)
    {
        fq_nmod_zero(coefficient, state->value->fqctx);
        for (uint64_t i = 0; i < state->degree; i++)
            nmod_poly_set_coeff_ui(coefficient, (slong) i,
                (ulong) coefficients[term * state->degree + i]);
        for (uint64_t i = 0; i < state->variables; i++)
            powers[i] = (ulong) exponents[term * state->variables + i];
        fq_nmod_mpoly_push_term_fq_nmod_ui(
            result->value, coefficient, powers, state->value);
    }
    fq_nmod_clear(coefficient, state->value->fqctx);
    fq_nmod_mpoly_sort_terms(result->value, state->value);
    fq_nmod_mpoly_combine_like_terms(result->value, state->value);
    return 1;
}

/* The declared ABI uses one checked packed slice: all coefficient coordinates
 * followed by all exponent vectors. This needs no compiler extension for
 * composing multiple resource/slice adapters, and makes no additional copy. */
static inline int sagejs_fq_mpoly_init_packed(
    sagejs_fq_mpoly_t result, const sagejs_fq_mpoly_context_t context,
    const uint64_t *data, uint64_t length, uint64_t terms)
{
    size_t coefficient_length, exponent_length, total;
    result->context = NULL;
    if (!sagejs_fq_mpoly_transfer_size(context->state, terms, &total) ||
        !sagejs_fq_size_multiply((size_t) terms, (size_t) context->state->degree,
            &coefficient_length) ||
        !sagejs_fq_size_multiply((size_t) terms, (size_t) context->state->variables,
            &exponent_length) ||
        length != (uint64_t) coefficient_length + (uint64_t) exponent_length ||
        (length != 0 && data == NULL))
        return 0;
    return sagejs_fq_mpoly_init_terms(result, context, data,
        (uint64_t) coefficient_length,
        data == NULL ? NULL : data + coefficient_length,
        (uint64_t) exponent_length, terms);
}

static inline int sagejs_fq_mpoly_copy(
    sagejs_fq_mpoly_t result, const sagejs_fq_mpoly_t source)
{
    if (!sagejs_fq_mpoly_attach(result, source->context))
        return 0;
    fq_nmod_mpoly_set(result->value, source->value, source->context->value);
    return 1;
}

static inline int sagejs_fq_mpoly_value_fits(
    const fq_nmod_mpoly_t source, sagejs_fq_mpoly_context_state *state)
{
    size_t total;
    if (state == NULL || !sagejs_fq_mpoly_transfer_size(state,
            (uint64_t) source->length, &total))
        return 0;
    for (slong term = 0; term < source->length; term++)
    {
        if (!fq_nmod_mpoly_term_exp_fits_ui(source, term, state->value))
            return 0;
        for (slong i = 0; i < (slong) state->variables; i++)
            if (fq_nmod_mpoly_get_term_var_exp_ui(source, term, i,
                    state->value) > SAGEJS_FQ_MPOLY_MAX_EXPONENT)
                return 0;
    }
    return 1;
}

static inline int sagejs_fq_mpoly_result_fits(const sagejs_fq_mpoly_t source)
{
    return sagejs_fq_mpoly_value_fits(source->value, source->context);
}

/* These operation tags select foreign FLINT primitives, not implementations
 * of mathematical Python kernels. Multiplication is conservatively preflighted
 * by expanded term count and component degrees before allocating its result. */
static inline int sagejs_fq_mpoly_binary(
    sagejs_fq_mpoly_t result, const sagejs_fq_mpoly_t left,
    const sagejs_fq_mpoly_t right, uint64_t operation)
{
    size_t total;
    result->context = NULL;
    if (left->context == NULL || left->context != right->context || operation > 2 ||
        !sagejs_fq_mpoly_result_fits(left) || !sagejs_fq_mpoly_result_fits(right))
        return 0;
    sagejs_fq_mpoly_context_state *state = left->context;
    const uint64_t left_terms = (uint64_t) left->value->length;
    const uint64_t right_terms = (uint64_t) right->value->length;
    const uint64_t bound = operation == 2 ? left_terms * right_terms
                                        : left_terms + right_terms;
    if (!sagejs_fq_mpoly_transfer_size(state, bound, &total))
        return 0;
    if (operation == 2 && left_terms != 0 && right_terms != 0)
        for (slong i = 0; i < (slong) state->variables; i++)
            if ((uint64_t) fq_nmod_mpoly_degree_si(left->value, i, state->value) +
                (uint64_t) fq_nmod_mpoly_degree_si(right->value, i, state->value) >
                    SAGEJS_FQ_MPOLY_MAX_EXPONENT)
                return 0;
    if (!sagejs_fq_mpoly_attach(result, state))
        return 0;
    if (operation == 0)
        fq_nmod_mpoly_add(result->value, left->value, right->value, state->value);
    else if (operation == 1)
        fq_nmod_mpoly_sub(result->value, left->value, right->value, state->value);
    else
        fq_nmod_mpoly_mul(result->value, left->value, right->value, state->value);
    if (!sagejs_fq_mpoly_result_fits(result))
    {
        sagejs_fq_mpoly_clear(result);
        return 0;
    }
    return 1;
}

static inline int sagejs_fq_mpoly_neg(
    sagejs_fq_mpoly_t result, const sagejs_fq_mpoly_t source)
{
    result->context = NULL;
    if (!sagejs_fq_mpoly_result_fits(source) ||
        !sagejs_fq_mpoly_attach(result, source->context))
        return 0;
    fq_nmod_mpoly_neg(result->value, source->value, source->context->value);
    return 1;
}

static inline int sagejs_fq_mpoly_equal(
    const sagejs_fq_mpoly_t left, const sagejs_fq_mpoly_t right)
{
    return left->context != NULL && left->context == right->context &&
        fq_nmod_mpoly_equal(left->value, right->value, left->context->value);
}

static inline int sagejs_fq_mpoly_term_bytes(
    sagejs_flint_byte_region_t result, const sagejs_fq_mpoly_t source)
{
    size_t total;
    sagejs_fq_mpoly_context_state *state = source->context;
    result->data = NULL;
    result->length = 0;
    if (state == NULL)
        return 0;
    const slong terms = fq_nmod_mpoly_length(source->value, state->value);
    if (terms < 0 || !sagejs_fq_mpoly_transfer_size(state, (uint64_t) terms, &total))
        return 0;
    /* Preflight every native width before any ulong export or output copy. */
    if (!sagejs_fq_mpoly_result_fits(source))
        return 0;
    unsigned char *data = (unsigned char *) malloc(total);
    if (data == NULL)
        return 0;
    memcpy(data, "SJFM", 4);
    data[4] = 1;
    data[5] = data[6] = data[7] = 0;
    sagejs_fq_write_u64(data + 8, state->characteristic);
    sagejs_fq_write_u64(data + 16, state->degree);
    sagejs_fq_write_u64(data + 24, state->variables);
    sagejs_fq_write_u64(data + 32, state->order);
    sagejs_fq_write_u64(data + 40, (uint64_t) terms);
    /* A packet identifies the defining polynomial, not only the cardinality.
     * Equal-size nonidentical field presentations must not silently rebind. */
    for (slong i = 0; i <= (slong) state->degree; i++)
        sagejs_fq_write_u64(data + 48 + 8 * (size_t) i,
            (uint64_t) nmod_poly_get_coeff_ui(state->value->fqctx->modulus, i));
    fq_nmod_t coefficient;
    fq_nmod_init(coefficient, state->value->fqctx);
    size_t offset = 48 + (size_t) (state->degree + 1) * 8;
    for (slong term = 0; term < terms; term++)
    {
        fq_nmod_mpoly_get_term_coeff_fq_nmod(
            coefficient, source->value, term, state->value);
        for (slong i = 0; i < (slong) state->degree; i++, offset += 8)
            sagejs_fq_write_u64(data + offset,
                (uint64_t) nmod_poly_get_coeff_ui(coefficient, i));
        for (slong i = 0; i < (slong) state->variables; i++, offset += 8)
            sagejs_fq_write_u64(data + offset,
                (uint64_t) fq_nmod_mpoly_get_term_var_exp_ui(
                    source->value, term, i, state->value));
    }
    fq_nmod_clear(coefficient, state->value->fqctx);
    result->data = data;
    result->length = total;
    return 1;
}

/* Foreign-library algorithms remain synchronous: these limits bound ingress
 * and exported representations, not FLINT's internal intermediate allocation
 * or elapsed time. Cancellation of a long call requires terminating its worker.
 * Do not report an input/output envelope as a hard RSS or timeout guarantee. */
static inline int sagejs_fq_mpoly_gcd(
    sagejs_fq_mpoly_t result, const sagejs_fq_mpoly_t left,
    const sagejs_fq_mpoly_t right)
{
    result->context = NULL;
    if (left->context == NULL || left->context != right->context ||
        !sagejs_fq_mpoly_result_fits(left) || !sagejs_fq_mpoly_result_fits(right) ||
        !sagejs_fq_mpoly_attach(result, left->context))
        return 0;
    if (!fq_nmod_mpoly_gcd(result->value, left->value, right->value,
            left->context->value) || !sagejs_fq_mpoly_result_fits(result))
    {
        sagejs_fq_mpoly_clear(result);
        return 0;
    }
    return 1;
}

static inline int sagejs_fq_mpoly_resultant(
    sagejs_fq_mpoly_t result, const sagejs_fq_mpoly_t left,
    const sagejs_fq_mpoly_t right, uint64_t variable)
{
    result->context = NULL;
    if (left->context == NULL || left->context != right->context ||
        variable >= left->context->variables ||
        !sagejs_fq_mpoly_result_fits(left) || !sagejs_fq_mpoly_result_fits(right) ||
        !sagejs_fq_mpoly_attach(result, left->context))
        return 0;
    if (!fq_nmod_mpoly_resultant(result->value, left->value, right->value,
            (slong) variable, left->context->value) ||
        !sagejs_fq_mpoly_result_fits(result))
    {
        sagejs_fq_mpoly_clear(result);
        return 0;
    }
    return 1;
}

/* SJFF v1 is a bounded copied factorization, not a borrowed factor array:
 * magic/version (8), factor count (u64), unit packet length (u64), unit SJFM,
 * then (multiplicity u64, packet length u64, factor SJFM) for each factor.
 * Multiplicities are checked fmpz values, never narrowed through double.
 * A constant has zero factors; factorization of zero is undefined/rejected.
 * All foreign factors and context references are released before return. */
static inline int sagejs_fq_mpoly_factor_bytes(
    sagejs_fq_mpoly_bytes_t result, const sagejs_fq_mpoly_t source)
{
    result->data = NULL;
    result->length = 0;
    sagejs_fq_mpoly_context_state *state = source->context;
    if (!sagejs_fq_mpoly_result_fits(source) || source->value->length == 0)
        return 0;
    fq_nmod_mpoly_factor_t factors;
    fq_nmod_mpoly_factor_init(factors, state->value);
    int success = fq_nmod_mpoly_factor(factors, source->value, state->value);
    size_t total = 24, unit_length = 0, packet_length = 0;
    sagejs_fq_mpoly_t temporary;
    temporary->context = NULL;
    sagejs_fq_mpoly_bytes_t packet;
    packet->data = NULL;
    packet->length = 0;
    unsigned char *data = NULL;
    if (!success || factors->num < 0 ||
        (uint64_t) factors->num > SAGEJS_FQ_MPOLY_MAX_TERMS ||
        !sagejs_fq_mpoly_transfer_size(state, 1, &unit_length))
        goto fail;
    fq_nmod_mpoly_factor_sort(factors, state->value);
    total += unit_length;
    for (slong i = 0; i < factors->num; i++)
    {
        if (fmpz_sgn(factors->exp + i) <= 0 ||
            fmpz_cmp_ui(factors->exp + i, (ulong) UINT32_MAX) > 0 ||
            !sagejs_fq_mpoly_value_fits(factors->poly + i, state) ||
            !sagejs_fq_mpoly_transfer_size(state,
                (uint64_t) factors->poly[i].length, &packet_length) ||
            packet_length > SAGEJS_FQ_MPOLY_MAX_BYTES - 16 ||
            total > SAGEJS_FQ_MPOLY_MAX_BYTES - 16 - packet_length)
            goto fail;
        total += 16 + packet_length;
    }
    data = (unsigned char *) malloc(total);
    if (data == NULL || !sagejs_fq_mpoly_attach(temporary, state))
        goto fail;
    memcpy(data, "SJFF\1\0\0\0", 8);
    sagejs_fq_write_u64(data + 8, (uint64_t) factors->num);
    sagejs_fq_write_u64(data + 16, (uint64_t) unit_length);
    fq_nmod_mpoly_set_fq_nmod(temporary->value, factors->constant, state->value);
    if (!sagejs_fq_mpoly_term_bytes(packet, temporary) || packet->length != unit_length)
        goto fail;
    memcpy(data + 24, packet->data, packet->length);
    size_t offset = 24 + packet->length;
    sagejs_flint_byte_region_clear(packet);
    for (slong i = 0; i < factors->num; i++)
    {
        fq_nmod_mpoly_factor_get_base(temporary->value, factors, i, state->value);
        if (!sagejs_fq_mpoly_term_bytes(packet, temporary))
            goto fail;
        sagejs_fq_write_u64(data + offset, (uint64_t) fmpz_get_ui(factors->exp + i));
        sagejs_fq_write_u64(data + offset + 8, (uint64_t) packet->length);
        memcpy(data + offset + 16, packet->data, packet->length);
        offset += 16 + packet->length;
        sagejs_flint_byte_region_clear(packet);
    }
    sagejs_fq_mpoly_clear(temporary);
    fq_nmod_mpoly_factor_clear(factors, state->value);
    result->data = data;
    result->length = total;
    return 1;
fail:
    sagejs_flint_byte_region_clear(packet);
    sagejs_fq_mpoly_clear(temporary);
    fq_nmod_mpoly_factor_clear(factors, state->value);
    free(data);
    return 0;
}

#endif
