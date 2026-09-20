// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

#include <flint/fmpz.h>
#include <flint/fmpz_mat.h>
#include <limits.h>
#include <stdint.h>

int sagejs_rust_flint_snf_i64(
    size_t rows, size_t columns, const int64_t *entries, int64_t *diagonal)
{
    if (rows == 0 || columns == 0 || entries == NULL || diagonal == NULL ||
        rows > LONG_MAX || columns > LONG_MAX ||
        (columns != 0 && rows > SIZE_MAX / columns))
        return -1;
    fmpz_mat_t source;
    fmpz_mat_t smith;
    fmpz_mat_init(source, (slong) rows, (slong) columns);
    fmpz_mat_init(smith, (slong) rows, (slong) columns);
    for (size_t row = 0; row < rows; row++)
        for (size_t column = 0; column < columns; column++)
            fmpz_set_si(fmpz_mat_entry(source, (slong) row, (slong) column),
                        (slong) entries[row * columns + column]);
    fmpz_mat_snf(smith, source);
    size_t count = rows < columns ? rows : columns;
    int status = 0;
    for (size_t index = 0; index < count; index++)
    {
        const fmpz *entry = fmpz_mat_entry(smith, (slong) index, (slong) index);
        if (!fmpz_fits_si(entry))
        {
            status = -2;
            break;
        }
        diagonal[index] = (int64_t) fmpz_get_si(entry);
    }
    fmpz_mat_clear(smith);
    fmpz_mat_clear(source);
    flint_cleanup();
    return status;
}
