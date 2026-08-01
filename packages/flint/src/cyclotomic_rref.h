#ifndef SAGEJS_CYCLOTOMIC_RREF_H
#define SAGEJS_CYCLOTOMIC_RREF_H

#include <stddef.h>

#include <flint/fmpz.h>
#include <flint/gr_mat.h>

typedef struct
{
    size_t row;
    size_t column;
    ulong exponent;
    fmpz coefficient;
} sagejs_cyclotomic_term;

/* Power-basis coordinates for a matrix over Q(zeta_order). */
typedef struct
{
    size_t rank;
    size_t columns;
    size_t degree;
    ulong order;
    fmpq *coefficients;
} sagejs_cyclotomic_matrix;

void sagejs_cyclotomic_matrix_clear(sagejs_cyclotomic_matrix *matrix);

/*
 * Reconstruct an exact cyclotomic RREF from completely split word primes.
 * The source is an integral sum of coefficient*zeta_order^exponent terms.
 * Return 1 on a proven reconstruction and 0 when the caller should use its
 * exact fallback.
 */
int sagejs_cyclotomic_rref_multimodular(
    gr_mat_t output,
    slong *rank,
    size_t rows,
    size_t columns,
    const sagejs_cyclotomic_term *terms,
    size_t term_count,
    ulong order,
    const fmpz_t source_coefficient_bound,
    gr_ctx_t context,
    sagejs_cyclotomic_matrix *coordinates);

#endif
