#ifndef SAGEJS_SPARSE_RATIONAL_H
#define SAGEJS_SPARSE_RATIONAL_H

#include <flint/fmpq_mat.h>
#include <flint/fmpz.h>
#include <flint/gr_mat.h>

/* Return true when sparse elimination is likely preferable to dense FLINT. */
int sagejs_fmpq_mat_prefers_sparse_rref(const fmpq_mat_t source);

/*
 * Set output to the exact RREF of source and store its rank. Output and
 * source may alias and must have identical dimensions. Return zero only on
 * allocation failure.
 */
int sagejs_fmpq_mat_rref_sparse(
    fmpq_mat_t output, slong *rank, const fmpq_mat_t source);

/*
 * Exact sparse RREF from integer CSR input. Duplicate column indices within
 * a row are combined. Output must be uninitialized; on success it is
 * initialized with exactly rank rows and columns columns. On failure output
 * remains uninitialized.
 */
int sagejs_fmpq_rref_sparse_fmpz_csr(
    fmpq_mat_t output,
    slong *rank,
    size_t rows,
    size_t columns,
    const size_t *row_offsets,
    const size_t *column_indices,
    const fmpz *values);

/*
 * Exact sparse RREF for a generic-ring matrix whose context stores qqbar
 * elements. Output and source must have identical dimensions.
 */
int sagejs_qqbar_gr_mat_rref_sparse(
    gr_mat_t output, slong *rank, const gr_mat_t source, gr_ctx_t context);

#endif
