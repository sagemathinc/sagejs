#ifndef SAGEJS_CHARPOLY_H
#define SAGEJS_CHARPOLY_H

#include <flint/fmpz_mat.h>
#include <flint/fmpz_poly.h>

/* Certified multimodular characteristic polynomial with adaptive bounds. */
void sagejs_fmpz_mat_charpoly(
    fmpz_poly_t polynomial, const fmpz_mat_t matrix);

#endif
