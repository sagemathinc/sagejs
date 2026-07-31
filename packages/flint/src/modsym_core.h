#ifndef SAGEJS_MODSYM_CORE_H
#define SAGEJS_MODSYM_CORE_H

/* Copyright (C) 2026 Sage.js contributors; GPL-3.0-only. */

#include <stddef.h>
#include <stdint.h>

#include <flint/flint.h>

typedef struct
{
    int64_t numerator;
    int64_t denominator;
    size_t next;
    unsigned char edge_type;
} sagejs_modsym_cusp;

typedef struct
{
    size_t cusps;
    size_t interior_paths;
    size_t e1;
    size_t e2;
    size_t torsion2;
    size_t torsion3;
    sagejs_modsym_cusp *ordered_cusps;
    sagejs_modsym_cusp *e1_start;
    sagejs_modsym_cusp *e1_stop;
    int32_t *coset_reduction;
    int32_t *boundary_reduction;
    uint32_t *f_start;
    uint32_t *f_stop;
} sagejs_modsym_presentation;

typedef size_t (*sagejs_modsym_coset_index)(
    const void *context, int64_t u, int64_t v);

typedef struct
{
    uint32_t level;
    size_t projective_cosets;
    const sagejs_modsym_presentation *presentation;
    const void *coset_context;
    sagejs_modsym_coset_index coset_index;
} sagejs_modsym_presentation_view;

int sagejs_modsym_presentation_build(
    const sagejs_modsym_presentation_view *view,
    sagejs_modsym_presentation *result);

void sagejs_modsym_presentation_clear(
    sagejs_modsym_presentation *presentation);

/*
 * Return a newly allocated row-major exact integer matrix, or NULL on
 * failure. The caller owns the returned buffer. This interface deliberately
 * contains no Node-API types and is suitable for both native and WASM
 * adapters.
 */
slong *sagejs_modsym_weight2_hecke_matrix(
    const sagejs_modsym_presentation_view *view,
    ulong prime,
    size_t *dimension);

/*
 * Return the boundary map with one row per E1 basis path and one column per
 * Gamma0 cusp class. The caller owns both the matrix and cusp buffers.
 */
slong *sagejs_modsym_weight2_boundary_matrix(
    const sagejs_modsym_presentation_view *view,
    size_t *dimension,
    size_t *cusps,
    sagejs_modsym_cusp **cusp_representatives);

/* Return a sparse integral cycle basis for the kernel of the boundary map. */
slong *sagejs_modsym_weight2_cuspidal_basis(
    const sagejs_modsym_presentation_view *view,
    size_t *rows,
    size_t *columns);

/* Return the column-action matrix of complex conjugation. */
slong *sagejs_modsym_weight2_star_matrix(
    const sagejs_modsym_presentation_view *view,
    size_t *dimension);

/* Reduce an arbitrary rational path into the E1 basis. */
slong *sagejs_modsym_weight2_reduce_path(
    const sagejs_modsym_presentation_view *view,
    int64_t start_numerator,
    int64_t start_denominator,
    int64_t stop_numerator,
    int64_t stop_denominator,
    size_t *dimension);

#endif
