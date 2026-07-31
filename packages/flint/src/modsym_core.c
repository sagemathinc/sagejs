/*
 * Exact weight-2 Gamma0 modular-symbol fundamentals and Hecke operators.
 *
 * Copyright (C) 2026 Sage.js contributors
 * License: GPL-3.0-only
 *
 * The well-formed fundamental-domain algorithm is adapted from PARI/GP
 * src/basemath/modsym.c, copyright (C) 2011 The PARI Group,
 * GPL-2.0-or-later, development revision 0f5a08ee7e (2026-07-31).
 * See bench/MODULAR-SYMBOLS.md for mathematical and software provenance.
 */

#include <limits.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <flint/ulong_extras.h>

#include "modsym_core.h"

#define SAGEJS_MANIN_F_PATH INT32_MIN

enum
{
    SAGEJS_FAREY_EDGE_CLOSED,
    SAGEJS_FAREY_EDGE_PENDING,
    SAGEJS_FAREY_EDGE_TORSION3
};

static uint32_t reduce_signed(int64_t value, uint32_t modulus)
{
    int64_t result = value % (int64_t) modulus;
    if (result < 0)
        result += modulus;
    return (uint32_t) result;
}

static size_t presentation_path_index(
    const sagejs_modsym_presentation_view *view,
    const sagejs_modsym_cusp *start,
    const sagejs_modsym_cusp *stop)
{
    __int128 determinant = (__int128) start->numerator * stop->denominator
        - (__int128) stop->numerator * start->denominator;
    int64_t c = start->denominator;
    if (determinant < 0)
        c = -c;
    {
        size_t index = view->coset_index(
            view->coset_context, c, stop->denominator);
        return index < view->projective_cosets ? index : SIZE_MAX;
    }
}

static int farey_mark(
    const sagejs_modsym_presentation_view *view,
    unsigned char *visited,
    int64_t u,
    int64_t v)
{
    size_t index = view->coset_index(view->coset_context, u, v);
    if (index >= view->projective_cosets)
        return 0;
    visited[index] = 1;
    return 1;
}

static int farey_torsion3(
    uint32_t level, int64_t left, int64_t right)
{
    uint64_t a = reduce_signed(left, level);
    uint64_t b = reduce_signed(right, level);
    __uint128_t value = (__uint128_t) a * a
        + (__uint128_t) b * b + (__uint128_t) a * b;
    return (uint32_t) (value % level) == 0;
}

static int insert_boundary_path(
    const sagejs_modsym_presentation_view *view,
    const sagejs_modsym_cusp *start,
    const sagejs_modsym_cusp *stop,
    size_t *standard_e1,
    sagejs_modsym_presentation *result)
{
    size_t reverse = presentation_path_index(view, stop, start);
    size_t forward;
    if (reverse == SIZE_MAX)
        return 0;
    forward = presentation_path_index(view, start, stop);
    if (forward == SIZE_MAX)
        return 0;
    if (standard_e1[reverse] != 0)
    {
        if (standard_e1[reverse] > INT32_MAX)
            return 0;
        result->e2++;
        result->coset_reduction[forward] =
            -(int32_t) standard_e1[reverse];
    }
    else
    {
        if (result->e1 >= INT32_MAX)
            return 0;
        result->e1++;
        standard_e1[forward] = result->e1;
        result->coset_reduction[forward] = (int32_t) result->e1;
        result->e1_start[result->e1 - 1] = *start;
        result->e1_stop[result->e1 - 1] = *stop;
    }
    return 1;
}

void sagejs_modsym_presentation_clear(
    sagejs_modsym_presentation *presentation)
{
    if (presentation == NULL)
        return;
    free(presentation->ordered_cusps);
    free(presentation->e1_start);
    free(presentation->e1_stop);
    free(presentation->coset_reduction);
    free(presentation->boundary_reduction);
    free(presentation->f_start);
    free(presentation->f_stop);
    memset(presentation, 0, sizeof(*presentation));
}

/*
 * Construct the Pollack--Stevens well-formed fundamental domain used by
 * PARI's msinit. The maximum storage is known from #P1(Z/NZ), so every
 * working array is allocated once and no cusp or edge node is individually
 * allocated.
 */
int sagejs_modsym_presentation_build(
    const sagejs_modsym_presentation_view *view,
    sagejs_modsym_presentation *result)
{
    sagejs_modsym_cusp *nodes = NULL;
    unsigned char *visited = NULL;
    size_t *order = NULL, *standard_e1 = NULL;
    size_t used = 2;
    const size_t none = SIZE_MAX;
    sagejs_modsym_cusp infinity = {1, 0, SIZE_MAX, 0};

    if (view == NULL || result == NULL || view->coset_index == NULL ||
        view->projective_cosets == 0)
        return 0;
    memset(result, 0, sizeof(*result));
    if (view->level == 1)
    {
        result->cusps = 2;
        return 1;
    }
    nodes = calloc(view->projective_cosets, sizeof(*nodes));
    visited = calloc(view->projective_cosets, sizeof(*visited));
    order = malloc(view->projective_cosets * sizeof(*order));
    standard_e1 = calloc(view->projective_cosets, sizeof(*standard_e1));
    result->e1_start = calloc(
        view->projective_cosets, sizeof(*result->e1_start));
    result->e1_stop = calloc(
        view->projective_cosets, sizeof(*result->e1_stop));
    result->coset_reduction = calloc(
        view->projective_cosets, sizeof(*result->coset_reduction));
    result->f_start = malloc(
        view->projective_cosets * sizeof(*result->f_start));
    result->f_stop = malloc(
        view->projective_cosets * sizeof(*result->f_stop));
    if (nodes == NULL || visited == NULL || order == NULL ||
        standard_e1 == NULL || result->e1_start == NULL ||
        result->e1_stop == NULL || result->coset_reduction == NULL ||
        result->f_start == NULL || result->f_stop == NULL)
        goto fail;
    for (size_t index = 0; index < view->projective_cosets; index++)
    {
        result->f_start[index] = UINT32_MAX;
        result->f_stop[index] = UINT32_MAX;
    }

    nodes[0] = (sagejs_modsym_cusp) {
        0, 1, 1, SAGEJS_FAREY_EDGE_CLOSED};
    nodes[1] = (sagejs_modsym_cusp) {
        1, 1, none, SAGEJS_FAREY_EDGE_PENDING};
    if (!farey_mark(view, visited, 0, 1) ||
        !farey_mark(view, visited, 1, -1) ||
        !farey_mark(view, visited, -1, 0))
        goto fail;

    for (;;)
    {
        int done = 1;
        size_t current = 0;
        while (current != none && nodes[current].next != none)
        {
            size_t right = nodes[current].next;
            int64_t b1, b2;
            size_t position;

            if (nodes[right].edge_type != SAGEJS_FAREY_EDGE_PENDING)
            {
                current = right;
                continue;
            }
            b1 = nodes[right].denominator;
            b2 = nodes[current].denominator;
            position = view->coset_index(view->coset_context, b1, b2);
            if (position >= view->projective_cosets)
                goto fail;
            if (visited[position])
            {
                nodes[right].edge_type = SAGEJS_FAREY_EDGE_CLOSED;
            }
            else
            {
                int64_t denominator, numerator;
                visited[position] = 1;
                if (!farey_mark(view, visited, -(b1 + b2), b1) ||
                    !farey_mark(view, visited, b2, -(b1 + b2)))
                    goto fail;
                if (farey_torsion3(view->level, b1, b2))
                {
                    nodes[right].edge_type = SAGEJS_FAREY_EDGE_TORSION3;
                }
                else
                {
                    if (used >= view->projective_cosets ||
                        __builtin_add_overflow(
                            nodes[current].numerator,
                            nodes[right].numerator,
                            &numerator) ||
                        __builtin_add_overflow(
                            nodes[current].denominator,
                            nodes[right].denominator,
                            &denominator))
                        goto fail;
                    nodes[used] = (sagejs_modsym_cusp) {
                        numerator,
                        denominator,
                        right,
                        SAGEJS_FAREY_EDGE_PENDING
                    };
                    nodes[current].next = used++;
                    done = 0;
                }
            }
            current = right;
        }
        if (done)
            break;
    }

    result->cusps = 0;
    for (size_t current = 0; current != none; current = nodes[current].next)
        order[result->cusps++] = current;
    if (result->cusps != used)
        goto fail;
    result->ordered_cusps = malloc(
        result->cusps * sizeof(*result->ordered_cusps));
    if (result->ordered_cusps == NULL)
        goto fail;
    for (size_t index = 0; index < result->cusps; index++)
        result->ordered_cusps[index] = nodes[order[index]];
    result->boundary_reduction = calloc(
        result->cusps > 1 ? result->cusps - 1 : 1,
        sizeof(*result->boundary_reduction));
    if (result->boundary_reduction == NULL)
        goto fail;
    for (size_t index = 1; index < result->cusps; index++)
        if (nodes[order[index]].edge_type == SAGEJS_FAREY_EDGE_TORSION3)
            result->torsion3++;

    if (!insert_boundary_path(
            view, &infinity, &nodes[order[0]], standard_e1, result) ||
        !insert_boundary_path(
            view, &nodes[order[result->cusps - 1]], &infinity,
            standard_e1, result))
        goto fail;
    for (size_t left = 0; left + 1 < result->cusps; left++)
    {
        const sagejs_modsym_cusp *c1 = &nodes[order[left]];
        for (size_t right = left + 1; right < result->cusps; right++)
        {
            const sagejs_modsym_cusp *c2 = &nodes[order[right]];
            __int128 determinant = (__int128) c1->numerator * c2->denominator
                - (__int128) c1->denominator * c2->numerator;
            if (determinant != 1 && determinant != -1)
                continue;
            if (right == left + 1)
            {
                size_t forward, reverse;
                if (c2->edge_type == SAGEJS_FAREY_EDGE_TORSION3)
                    continue;
                forward = presentation_path_index(view, c1, c2);
                reverse = presentation_path_index(view, c2, c1);
                if (forward == SIZE_MAX || reverse == SIZE_MAX)
                    goto fail;
                if (forward == reverse)
                    result->torsion2++;
                else if (!insert_boundary_path(
                    view, c1, c2, standard_e1, result))
                    goto fail;
            }
            else
            {
                size_t forward = presentation_path_index(view, c1, c2);
                size_t reverse = presentation_path_index(view, c2, c1);
                if (forward == SIZE_MAX || reverse == SIZE_MAX ||
                    left > UINT32_MAX || right > UINT32_MAX)
                    goto fail;
                result->interior_paths += 2;
                result->coset_reduction[forward] = SAGEJS_MANIN_F_PATH;
                result->f_start[forward] = (uint32_t) left;
                result->f_stop[forward] = (uint32_t) right;
                result->coset_reduction[reverse] = SAGEJS_MANIN_F_PATH;
                result->f_start[reverse] = (uint32_t) right;
                result->f_stop[reverse] = (uint32_t) left;
            }
        }
    }
    for (size_t index = 0; index + 1 < result->cusps; index++)
    {
        size_t edge = presentation_path_index(
            view,
            &result->ordered_cusps[index],
            &result->ordered_cusps[index + 1]);
        if (edge == SIZE_MAX ||
            result->coset_reduction[edge] == SAGEJS_MANIN_F_PATH)
            goto fail;
        result->boundary_reduction[index] = result->coset_reduction[edge];
    }

    free(nodes);
    free(visited);
    free(order);
    free(standard_e1);
    return 1;

fail:
    free(nodes);
    free(visited);
    free(order);
    free(standard_e1);
    sagejs_modsym_presentation_clear(result);
    return 0;
}

static int vector_add_entry(
    slong *vector, size_t dimension, size_t index, slong coefficient)
{
    slong value;

    if (index >= dimension ||
        __builtin_add_overflow(vector[index], coefficient, &value))
        return 0;
    vector[index] = value;
    return 1;
}

static int add_reduction_code(
    const sagejs_modsym_presentation *presentation,
    int32_t reduction,
    slong coefficient,
    slong *vector)
{
    if (reduction > 0)
        return vector_add_entry(
            vector, presentation->e1,
            (size_t) reduction - 1, coefficient);
    if (reduction < 0 && reduction != SAGEJS_MANIN_F_PATH)
        return vector_add_entry(
            vector, presentation->e1,
            (size_t) (-reduction) - 1, -coefficient);
    return reduction == 0;
}

static int reduce_coset(
    const sagejs_modsym_presentation_view *view,
    size_t coset,
    slong coefficient,
    slong *vector)
{
    const sagejs_modsym_presentation *presentation = view->presentation;
    int32_t reduction;

    if (coset >= view->projective_cosets)
        return 0;
    reduction = presentation->coset_reduction[coset];
    if (reduction != SAGEJS_MANIN_F_PATH)
        return add_reduction_code(
            presentation, reduction, coefficient, vector);

    {
        uint32_t start = presentation->f_start[coset];
        uint32_t stop = presentation->f_stop[coset];
        if (start == UINT32_MAX || stop == UINT32_MAX ||
            start >= presentation->cusps || stop >= presentation->cusps)
            return 0;
        if (start < stop)
        {
            for (uint32_t index = start; index < stop; index++)
                if (!add_reduction_code(
                        presentation,
                        presentation->boundary_reduction[index],
                        coefficient, vector))
                    return 0;
        }
        else
        {
            for (uint32_t index = stop; index < start; index++)
                if (!add_reduction_code(
                        presentation,
                        presentation->boundary_reduction[index],
                        -coefficient, vector))
                    return 0;
        }
    }
    return 1;
}

static size_t path_index(
    const sagejs_modsym_presentation_view *view,
    int64_t start_numerator,
    int64_t start_denominator,
    int64_t stop_numerator,
    int64_t stop_denominator)
{
    __int128 determinant = (__int128) start_numerator * stop_denominator
        - (__int128) stop_numerator * start_denominator;
    int64_t c = start_denominator;

    if (determinant != 1 && determinant != -1)
        return SIZE_MAX;
    if (determinant < 0)
        c = -c;
    return view->coset_index(view->coset_context, c, stop_denominator);
}

static uint64_t gcd_u64(uint64_t left, uint64_t right)
{
    while (right != 0)
    {
        uint64_t remainder = left % right;
        left = right;
        right = remainder;
    }
    return left;
}

static uint64_t abs_i64(int64_t value)
{
    return value < 0
        ? (uint64_t) (-(value + 1)) + 1
        : (uint64_t) value;
}

static int normalize_cusp(int64_t *numerator, int64_t *denominator)
{
    uint64_t common;

    if (*numerator == 0 && *denominator == 0)
        return 0;
    common = gcd_u64(abs_i64(*numerator), abs_i64(*denominator));
    if (common > 1)
    {
        *numerator /= (int64_t) common;
        *denominator /= (int64_t) common;
    }
    if (*denominator < 0)
    {
        if (*numerator == INT64_MIN || *denominator == INT64_MIN)
            return 0;
        *numerator = -*numerator;
        *denominator = -*denominator;
    }
    if (*denominator == 0)
        *numerator = 1;
    return 1;
}

static int reduce_unimodular_path(
    const sagejs_modsym_presentation_view *view,
    int64_t start_numerator,
    int64_t start_denominator,
    int64_t stop_numerator,
    int64_t stop_denominator,
    slong coefficient,
    slong *vector)
{
    size_t coset = path_index(
        view,
        start_numerator, start_denominator,
        stop_numerator, stop_denominator);
    return coset != SIZE_MAX &&
        reduce_coset(view, coset, coefficient, vector);
}

/* Add coefficient * {infinity, numerator / denominator}. */
static int reduce_infinity_to_cusp(
    const sagejs_modsym_presentation_view *view,
    int64_t numerator,
    int64_t denominator,
    slong coefficient,
    slong *vector)
{
    int64_t a, b;
    int64_t previous2_numerator = 0, previous2_denominator = 1;
    int64_t previous1_numerator = 1, previous1_denominator = 0;

    if (!normalize_cusp(&numerator, &denominator))
        return 0;
    if (denominator == 0)
        return 1;
    a = numerator;
    b = denominator;
    while (b != 0)
    {
        int64_t quotient = a / b;
        int64_t remainder = a % b;
        __int128 next_numerator, next_denominator;

        if (remainder < 0)
        {
            quotient--;
            remainder += b;
        }
        next_numerator = (__int128) quotient * previous1_numerator
            + previous2_numerator;
        next_denominator = (__int128) quotient * previous1_denominator
            + previous2_denominator;
        if (next_numerator < INT64_MIN || next_numerator > INT64_MAX ||
            next_denominator < INT64_MIN || next_denominator > INT64_MAX ||
            !reduce_unimodular_path(
                view,
                previous1_numerator, previous1_denominator,
                (int64_t) next_numerator, (int64_t) next_denominator,
                coefficient, vector))
            return 0;
        previous2_numerator = previous1_numerator;
        previous2_denominator = previous1_denominator;
        previous1_numerator = (int64_t) next_numerator;
        previous1_denominator = (int64_t) next_denominator;
        a = b;
        b = remainder;
    }
    return previous1_numerator == numerator &&
        previous1_denominator == denominator;
}

/* Add coefficient * {start, stop}. */
static int reduce_path(
    const sagejs_modsym_presentation_view *view,
    int64_t start_numerator,
    int64_t start_denominator,
    int64_t stop_numerator,
    int64_t stop_denominator,
    slong coefficient,
    slong *vector)
{
    return reduce_infinity_to_cusp(
            view, stop_numerator, stop_denominator, coefficient, vector) &&
        reduce_infinity_to_cusp(
            view, start_numerator, start_denominator, -coefficient, vector);
}

static int transform_cusp(
    const sagejs_modsym_cusp *input,
    int64_t a,
    int64_t b,
    int64_t c,
    int64_t d,
    int64_t *numerator,
    int64_t *denominator)
{
    __int128 transformed_numerator = (__int128) a * input->numerator
        + (__int128) b * input->denominator;
    __int128 transformed_denominator = (__int128) c * input->numerator
        + (__int128) d * input->denominator;

    if (transformed_numerator < INT64_MIN ||
        transformed_numerator > INT64_MAX ||
        transformed_denominator < INT64_MIN ||
        transformed_denominator > INT64_MAX)
        return 0;
    *numerator = (int64_t) transformed_numerator;
    *denominator = (int64_t) transformed_denominator;
    return normalize_cusp(numerator, denominator);
}

slong *sagejs_modsym_weight2_hecke_matrix(
    const sagejs_modsym_presentation_view *view,
    ulong prime,
    size_t *dimension)
{
    const sagejs_modsym_presentation *presentation;
    slong *entries = NULL;
    slong *vector = NULL;
    size_t cells;

    if (dimension == NULL)
        return NULL;
    *dimension = 0;
    if (view == NULL || view->presentation == NULL ||
        view->coset_index == NULL || prime < 2 || prime > INT32_MAX ||
        !n_is_prime(prime))
        return NULL;
    presentation = view->presentation;
    *dimension = presentation->e1;
    if (presentation->e1 != 0 &&
        presentation->e1 > SIZE_MAX / presentation->e1)
        goto fail;
    cells = presentation->e1 * presentation->e1;
    entries = calloc(cells == 0 ? 1 : cells, sizeof(*entries));
    vector = calloc(presentation->e1 == 0 ? 1 : presentation->e1,
        sizeof(*vector));
    if (entries == NULL || vector == NULL)
        goto fail;

    for (size_t column = 0; column < presentation->e1; column++)
    {
        const sagejs_modsym_cusp *start = &presentation->e1_start[column];
        const sagejs_modsym_cusp *stop = &presentation->e1_stop[column];
        memset(vector, 0, presentation->e1 * sizeof(*vector));

        for (ulong translate = 0; translate < prime; translate++)
        {
            int64_t start_numerator, start_denominator;
            int64_t stop_numerator, stop_denominator;
            if (!transform_cusp(
                    start, 1, (int64_t) translate, 0, (int64_t) prime,
                    &start_numerator, &start_denominator) ||
                !transform_cusp(
                    stop, 1, (int64_t) translate, 0, (int64_t) prime,
                    &stop_numerator, &stop_denominator) ||
                !reduce_path(
                    view,
                    start_numerator, start_denominator,
                    stop_numerator, stop_denominator, 1, vector))
                goto fail;
        }
        if (view->level % prime != 0)
        {
            int64_t start_numerator, start_denominator;
            int64_t stop_numerator, stop_denominator;
            if (!transform_cusp(
                    start, (int64_t) prime, 0, 0, 1,
                    &start_numerator, &start_denominator) ||
                !transform_cusp(
                    stop, (int64_t) prime, 0, 0, 1,
                    &stop_numerator, &stop_denominator) ||
                !reduce_path(
                    view,
                    start_numerator, start_denominator,
                    stop_numerator, stop_denominator, 1, vector))
                goto fail;
        }
        for (size_t row = 0; row < presentation->e1; row++)
            entries[row * presentation->e1 + column] = vector[row];
    }
    free(vector);
    return entries;

fail:
    free(vector);
    free(entries);
    *dimension = 0;
    return NULL;
}
