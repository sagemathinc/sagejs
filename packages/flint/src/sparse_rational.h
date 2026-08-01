#ifndef SAGEJS_SPARSE_RATIONAL_H
#define SAGEJS_SPARSE_RATIONAL_H

#include <flint/fmpq_mat.h>
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
 * Exact sparse RREF for a generic-ring matrix whose context stores qqbar
 * elements. Output and source must have identical dimensions.
 */
int sagejs_qqbar_gr_mat_rref_sparse(
    gr_mat_t output, slong *rank, const gr_mat_t source, gr_ctx_t context);

#endif
