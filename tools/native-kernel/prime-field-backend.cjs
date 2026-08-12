"use strict";

function generatePrimeFieldSupport() {
  return String.raw`
#define SAGEJS_PRIME_FACTOR_MAGIC UINT64_C(0x534147454A534C55)
#ifndef SAGEJS_PRIME_BLOCK_THRESHOLD_U32
#define SAGEJS_PRIME_BLOCK_THRESHOLD_U32 32
#endif
#ifndef SAGEJS_PRIME_BLOCK_THRESHOLD_U64
#define SAGEJS_PRIME_BLOCK_THRESHOLD_U64 320
#endif
#ifndef SAGEJS_PRIME_PANEL_U32
#define SAGEJS_PRIME_PANEL_U32 20
#endif
#ifndef SAGEJS_PRIME_PANEL_U64
#define SAGEJS_PRIME_PANEL_U64 48
#endif
#ifndef SAGEJS_PRIME_COLUMN_TILE
#define SAGEJS_PRIME_COLUMN_TILE 512
#endif
#ifndef SAGEJS_PRIME_SHOUP_THRESHOLD
#define SAGEJS_PRIME_SHOUP_THRESHOLD 4
#endif

typedef struct
{
    nmod_t modulus;
    int narrow;
} sagejs_prime_arithmetic;

typedef struct sagejs_prime_factor
{
    uint64_t magic;
    sagejs_prime_arithmetic arithmetic;
    slong rows;
    slong columns;
    slong rank;
    slong swaps;
    int blocked;
    ulong *entries;
    slong *pivots;
    slong *permutation;
} sagejs_prime_factor;

static inline unsigned int sagejs_prime_word_clz(ulong value)
{
#if FLINT_BITS == 64
#if defined(_MSC_VER)
    unsigned long index;
    _BitScanReverse64(&index, (unsigned __int64) value);
    return 63U - (unsigned int) index;
#else
    return (unsigned int) __builtin_clzl(value);
#endif
#else
#if defined(_MSC_VER)
    unsigned long index;
    _BitScanReverse(&index, (unsigned long) value);
    return 31U - (unsigned int) index;
#else
    return (unsigned int) __builtin_clzl(value);
#endif
#endif
}

static inline ulong sagejs_prime_preinverse_prenorm(ulong divisor)
{
#if FLINT_BITS == 64
#if defined(_MSC_VER)
    unsigned __int64 remainder;
    return (ulong) _udiv128(
        (unsigned __int64) ~divisor,
        UINT64_MAX,
        (unsigned __int64) divisor,
        &remainder);
#else
    const __uint128_t numerator =
        ((__uint128_t) ~divisor << 64) | (__uint128_t) UINT64_MAX;
    return (ulong) (numerator / divisor);
#endif
#else
    const uint64_t numerator =
        ((uint64_t) ~divisor << 32) | (uint64_t) UINT32_MAX;
    return (ulong) (numerator / divisor);
#endif
}

static void sagejs_prime_arithmetic_init(
    sagejs_prime_arithmetic *arithmetic, ulong modulus)
{
    arithmetic->modulus.n = modulus;
    arithmetic->modulus.norm = sagejs_prime_word_clz(modulus);
    arithmetic->modulus.ninv = sagejs_prime_preinverse_prenorm(
        modulus << arithmetic->modulus.norm);
    arithmetic->narrow = modulus <= (ulong) UINT32_MAX;
}

static inline ulong sagejs_prime_mul(
    ulong left, ulong right, const sagejs_prime_arithmetic *arithmetic)
{
    if (arithmetic->narrow)
        return (ulong) (((uint64_t) left * (uint64_t) right) %
            (uint64_t) arithmetic->modulus.n);
    return nmod_mul(left, right, arithmetic->modulus);
}

static inline ulong sagejs_prime_sub(
    ulong left, ulong right, const sagejs_prime_arithmetic *arithmetic)
{
    return left >= right
        ? left - right
        : arithmetic->modulus.n - (right - left);
}

static ulong sagejs_prime_inv(
    ulong value, const sagejs_prime_arithmetic *arithmetic)
{
    ulong old_remainder = arithmetic->modulus.n;
    ulong remainder = value;
    ulong old_coefficient = 0;
    ulong coefficient = 1;
    while (remainder != 0)
    {
        const ulong quotient = old_remainder / remainder;
        const ulong next_remainder = old_remainder % remainder;
        const ulong next_coefficient = sagejs_prime_sub(
            old_coefficient,
            sagejs_prime_mul(
                quotient % arithmetic->modulus.n,
                coefficient,
                arithmetic),
            arithmetic);
        old_remainder = remainder;
        remainder = next_remainder;
        old_coefficient = coefficient;
        coefficient = next_coefficient;
    }
    return old_coefficient;
}

static void sagejs_prime_scale_row(
    ulong *target,
    slong length,
    ulong scalar,
    const sagejs_prime_arithmetic *arithmetic)
{
    if (length >= SAGEJS_PRIME_SHOUP_THRESHOLD &&
        NMOD_CAN_USE_SHOUP(arithmetic->modulus))
    {
        const ulong precomputed = n_mulmod_precomp_shoup(
            scalar, arithmetic->modulus.n);
        for (slong index = 0; index < length; index++)
            target[index] = n_mulmod_shoup(
                scalar,
                target[index],
                precomputed,
                arithmetic->modulus.n);
        return;
    }
    for (slong index = 0; index < length; index++)
        target[index] = sagejs_prime_mul(
            scalar, target[index], arithmetic);
}

static void sagejs_prime_subtract_row_multiple(
    ulong *target,
    const ulong *source,
    slong length,
    ulong factor,
    const sagejs_prime_arithmetic *arithmetic)
{
    if (factor == 0 || length <= 0)
        return;
    if (length >= SAGEJS_PRIME_SHOUP_THRESHOLD &&
        NMOD_CAN_USE_SHOUP(arithmetic->modulus))
    {
        const ulong scalar = arithmetic->modulus.n - factor;
        const ulong precomputed = n_mulmod_precomp_shoup(
            scalar, arithmetic->modulus.n);
        for (slong index = 0; index < length; index++)
        {
            const ulong product = n_mulmod_shoup(
                scalar,
                source[index],
                precomputed,
                arithmetic->modulus.n);
            target[index] = _nmod_add(
                target[index], product, arithmetic->modulus);
        }
        return;
    }
    for (slong index = 0; index < length; index++)
        target[index] = sagejs_prime_sub(
            target[index],
            sagejs_prime_mul(factor, source[index], arithmetic),
            arithmetic);
}

/*
 * Apply a short row-panel dot product.  For narrow primes, several products
 * are accumulated before reduction whenever the exact uint64 bound permits;
 * this is the main blocked-kernel advantage over one modular reduction per
 * scalar update.  Wide primes retain Shoup-specialized row updates.
 */
static void sagejs_prime_subtract_panel_product(
    ulong *target,
    const ulong *factor_row,
    const ulong *entries,
    slong stride,
    slong first,
    slong count,
    slong column_start,
    slong length,
    const sagejs_prime_arithmetic *arithmetic)
{
    if (count <= 0 || length <= 0)
        return;
    if (!arithmetic->narrow)
    {
        for (slong offset = 0; offset < count; offset++)
        {
            const slong prior = first + offset;
            sagejs_prime_subtract_row_multiple(
                target,
                entries + (size_t) prior * (size_t) stride +
                    (size_t) column_start,
                length,
                factor_row[prior],
                arithmetic);
        }
        return;
    }
    const uint64_t modulus = (uint64_t) arithmetic->modulus.n;
    const uint64_t magnitude = modulus - UINT64_C(1);
    const uint64_t product_bound = magnitude * magnitude;
    const uint64_t batch_bound = product_bound == 0
        ? (uint64_t) count
        : (UINT64_MAX - magnitude) / product_bound;
    slong batch = batch_bound > (uint64_t) count
        ? count
        : (slong) batch_bound;
    if (batch < 1)
        batch = 1;
    if (batch > count)
        batch = count;
    for (slong column = 0; column < length; column++)
    {
        ulong value = target[column];
        for (slong offset = 0; offset < count; offset += batch)
        {
            const slong end = offset + batch < count
                ? offset + batch
                : count;
            uint64_t sum = 0;
            for (slong item = offset; item < end; item++)
            {
                const slong prior = first + item;
                sum += (uint64_t) factor_row[prior] *
                    (uint64_t) entries[
                        (size_t) prior * (size_t) stride +
                        (size_t) column_start + (size_t) column];
            }
            value = sagejs_prime_sub(
                value, (ulong) (sum % modulus), arithmetic);
        }
        target[column] = value;
    }
}

static void sagejs_prime_subtract_packed_panel(
    ulong *target,
    const ulong *factors,
    const ulong *packed_columns,
    slong count,
    slong length,
    const sagejs_prime_arithmetic *arithmetic)
{
    const uint64_t modulus = (uint64_t) arithmetic->modulus.n;
    const uint64_t magnitude = modulus - UINT64_C(1);
    const uint64_t product_bound = magnitude * magnitude;
    const uint64_t batch_bound = product_bound == 0
        ? (uint64_t) count
        : (UINT64_MAX - magnitude) / product_bound;
    slong batch = batch_bound > (uint64_t) count
        ? count
        : (slong) batch_bound;
    if (batch < 1)
        batch = 1;
    for (slong column = 0; column < length; column++)
    {
        const ulong *packed = packed_columns +
            (size_t) column * (size_t) count;
        ulong value = target[column];
        for (slong offset = 0; offset < count; offset += batch)
        {
            const slong end = offset + batch < count
                ? offset + batch
                : count;
            uint64_t sum = 0;
            for (slong item = offset; item < end; item++)
                sum += (uint64_t) factors[item] *
                    (uint64_t) packed[item];
            value = sagejs_prime_sub(
                value, (ulong) (sum % modulus), arithmetic);
        }
        target[column] = value;
    }
}

static int sagejs_prime_entry_count(
    sagejs_native_status *status,
    slong rows, slong columns, size_t *count)
{
    if (rows < 0 || columns < 0 ||
        ((size_t) columns != 0 &&
            (size_t) rows > SIZE_MAX / (size_t) columns))
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "prime-field matrix is too large");
        return 0;
    }
    *count = (size_t) rows * (size_t) columns;
    if (*count > SIZE_MAX / sizeof(ulong))
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "prime-field matrix is too large");
        return 0;
    }
    return 1;
}

static void sagejs_prime_swap_rows(
    ulong *entries, slong columns, slong left, slong right)
{
    if (left == right)
        return;
    for (slong column = 0; column < columns; column++)
    {
        const size_t left_index =
            (size_t) left * (size_t) columns + (size_t) column;
        const size_t right_index =
            (size_t) right * (size_t) columns + (size_t) column;
        const ulong temporary = entries[left_index];
        entries[left_index] = entries[right_index];
        entries[right_index] = temporary;
    }
}

static void sagejs_prime_factor_clear(sagejs_prime_factor *factor)
{
    if (factor == NULL)
        return;
    free(factor->entries);
    free(factor->pivots);
    free(factor->permutation);
    factor->entries = NULL;
    factor->pivots = NULL;
    factor->permutation = NULL;
    factor->magic = 0;
    free(factor);
}

static void sagejs_prime_matrix_clear(nmod_mat_struct *matrix)
{
    if (matrix == NULL) return;
    free(matrix->entries);
    matrix->entries = NULL;
    free(matrix);
}

static nmod_mat_struct *sagejs_prime_matrix_new(
    sagejs_native_status *status,
    slong rows, slong columns, ulong modulus)
{
    size_t count;
    nmod_mat_struct *matrix;
    if (modulus < 2 ||
        !sagejs_prime_entry_count(status, rows, columns, &count))
        return NULL;
    matrix = (nmod_mat_struct *) calloc(1, sizeof(*matrix));
    if (matrix == NULL)
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
            "unable to allocate prime-field matrix");
        return NULL;
    }
    matrix->r = rows;
    matrix->c = columns;
    matrix->stride = columns;
    sagejs_prime_arithmetic arithmetic;
    sagejs_prime_arithmetic_init(&arithmetic, modulus);
    matrix->mod = arithmetic.modulus;
    matrix->entries = count == 0
        ? NULL : (ulong *) calloc(count, sizeof(ulong));
    if (count != 0 && matrix->entries == NULL)
    {
        free(matrix);
        sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
            "unable to allocate prime-field matrix entries");
        return NULL;
    }
    return matrix;
}

static int sagejs_prime_factor_reset(
    sagejs_prime_factor *factor,
    const nmod_mat_struct *matrix)
{
    factor->rank = 0;
    factor->swaps = 0;
    factor->blocked = 0;
    for (slong row = 0; row < factor->rows; row++)
    {
        factor->permutation[row] = row;
        for (slong column = 0; column < factor->columns; column++)
            factor->entries[(size_t) row * (size_t) factor->columns +
                (size_t) column] =
                nmod_mat_entry(matrix, row, column);
    }
    return 1;
}

static void sagejs_prime_factor_classical(sagejs_prime_factor *factor)
{
    const slong rows = factor->rows;
    const slong columns = factor->columns;
    const sagejs_prime_arithmetic *arithmetic = &factor->arithmetic;
    slong pivot_row = 0;
    for (slong pivot_column = 0;
         pivot_column < columns && pivot_row < rows;
         pivot_column++)
    {
        slong selected = pivot_row;
        while (selected < rows &&
            factor->entries[(size_t) selected * (size_t) columns +
                (size_t) pivot_column] == 0)
            selected++;
        if (selected == rows)
            continue;
        if (selected != pivot_row)
        {
            const slong temporary = factor->permutation[selected];
            sagejs_prime_swap_rows(
                factor->entries, columns, selected, pivot_row);
            factor->permutation[selected] =
                factor->permutation[pivot_row];
            factor->permutation[pivot_row] = temporary;
            factor->swaps++;
        }
        const size_t pivot_offset =
            (size_t) pivot_row * (size_t) columns;
        const ulong pivot =
            factor->entries[pivot_offset + (size_t) pivot_column];
        const ulong inverse = sagejs_prime_inv(pivot, arithmetic);
        factor->pivots[pivot_row] = pivot_column;
        for (slong row = pivot_row + 1; row < rows; row++)
        {
            const size_t row_offset = (size_t) row * (size_t) columns;
            const ulong value =
                factor->entries[row_offset + (size_t) pivot_column];
            if (value == 0)
                continue;
            const ulong multiple = sagejs_prime_mul(
                value, inverse, arithmetic);
            factor->entries[row_offset + (size_t) pivot_column] = multiple;
            sagejs_prime_subtract_row_multiple(
                factor->entries + row_offset + (size_t) pivot_column + 1,
                factor->entries + pivot_offset + (size_t) pivot_column + 1,
                columns - pivot_column - 1,
                multiple,
                arithmetic);
        }
        pivot_row++;
    }
    factor->rank = pivot_row;
}

/*
 * Factor a dense nonsingular square matrix by panels.  Updates within the
 * active panel are immediate so pivoting remains exact; updates to the far
 * trailing matrix are delayed and applied in cache-sized column tiles.
 */
static int sagejs_prime_factor_blocked(sagejs_prime_factor *factor)
{
    const slong size = factor->rows;
    const slong columns = factor->columns;
    const sagejs_prime_arithmetic *arithmetic = &factor->arithmetic;
    const slong panel_width = arithmetic->narrow
        ? SAGEJS_PRIME_PANEL_U32
        : SAGEJS_PRIME_PANEL_U64;
    const slong block_threshold = arithmetic->narrow
        ? SAGEJS_PRIME_BLOCK_THRESHOLD_U32
        : SAGEJS_PRIME_BLOCK_THRESHOLD_U64;
    ulong *packed = NULL;
    if (size != columns || size < block_threshold)
        return 0;
    if (arithmetic->narrow)
    {
        const size_t packed_count =
            (size_t) panel_width * (size_t) SAGEJS_PRIME_COLUMN_TILE;
        if (panel_width > 0 &&
            packed_count / (size_t) panel_width !=
                (size_t) SAGEJS_PRIME_COLUMN_TILE)
            return 0;
        if (packed_count > SIZE_MAX / sizeof(*packed))
            return 0;
        packed = (ulong *) malloc(
            (packed_count == 0 ? 1 : packed_count) * sizeof(*packed));
        if (packed == NULL)
            return 0;
    }
    for (slong panel = 0; panel < size; panel += panel_width)
    {
        const slong panel_end = panel + panel_width < size
            ? panel + panel_width
            : size;
        for (slong pivot_row = panel;
             pivot_row < panel_end;
             pivot_row++)
        {
            slong selected = pivot_row;
            while (selected < size &&
                factor->entries[(size_t) selected * (size_t) size +
                    (size_t) pivot_row] == 0)
                selected++;
            if (selected == size)
            {
                free(packed);
                return 0;
            }
            if (selected != pivot_row)
            {
                const slong temporary = factor->permutation[selected];
                sagejs_prime_swap_rows(
                    factor->entries, size, selected, pivot_row);
                factor->permutation[selected] =
                    factor->permutation[pivot_row];
                factor->permutation[pivot_row] = temporary;
                factor->swaps++;
            }
            const size_t pivot_offset =
                (size_t) pivot_row * (size_t) size;
            const ulong pivot = factor->entries[
                pivot_offset + (size_t) pivot_row];
            const ulong inverse = sagejs_prime_inv(pivot, arithmetic);
            factor->pivots[pivot_row] = pivot_row;
            for (slong row = pivot_row + 1; row < size; row++)
            {
                const size_t row_offset = (size_t) row * (size_t) size;
                const ulong value = factor->entries[
                    row_offset + (size_t) pivot_row];
                if (value == 0)
                    continue;
                const ulong multiple = sagejs_prime_mul(
                    value, inverse, arithmetic);
                factor->entries[row_offset + (size_t) pivot_row] = multiple;
                sagejs_prime_subtract_row_multiple(
                    factor->entries + row_offset + (size_t) pivot_row + 1,
                    factor->entries + pivot_offset + (size_t) pivot_row + 1,
                    panel_end - pivot_row - 1,
                    multiple,
                    arithmetic);
            }
        }

        for (slong column_start = panel_end;
             column_start < size;
             column_start += SAGEJS_PRIME_COLUMN_TILE)
        {
            const slong length =
                column_start + SAGEJS_PRIME_COLUMN_TILE < size
                    ? SAGEJS_PRIME_COLUMN_TILE
                    : size - column_start;

            /* U12 = L11^-1 A12. */
            for (slong row = panel + 1; row < panel_end; row++)
                sagejs_prime_subtract_panel_product(
                    factor->entries +
                        (size_t) row * (size_t) size +
                        (size_t) column_start,
                    factor->entries + (size_t) row * (size_t) size,
                    factor->entries,
                    size,
                    panel,
                    row - panel,
                    column_start,
                    length,
                    arithmetic);

            /* A22 -= L21 U12, tiled along the contiguous column axis. */
            if (arithmetic->narrow)
            {
                const slong count = panel_end - panel;
                for (slong column = 0; column < length; column++)
                    for (slong prior = 0; prior < count; prior++)
                        packed[(size_t) column * (size_t) count +
                            (size_t) prior] = factor->entries[
                                (size_t) (panel + prior) * (size_t) size +
                                (size_t) column_start + (size_t) column];
                for (slong row = panel_end; row < size; row++)
                    sagejs_prime_subtract_packed_panel(
                        factor->entries +
                            (size_t) row * (size_t) size +
                            (size_t) column_start,
                        factor->entries + (size_t) row * (size_t) size +
                            (size_t) panel,
                        packed,
                        count,
                        length,
                        arithmetic);
            }
            else
            {
                for (slong row = panel_end; row < size; row++)
                    sagejs_prime_subtract_panel_product(
                        factor->entries +
                            (size_t) row * (size_t) size +
                            (size_t) column_start,
                        factor->entries + (size_t) row * (size_t) size,
                        factor->entries,
                        size,
                        panel,
                        panel_end - panel,
                        column_start,
                        length,
                        arithmetic);
            }
        }
    }
    free(packed);
    factor->rank = size;
    factor->blocked = 1;
    return 1;
}

static sagejs_prime_factor *sagejs_prime_factor_new(
    sagejs_native_status *status, const nmod_mat_struct *matrix)
{
    const slong rows = nmod_mat_nrows(matrix);
    const slong columns = nmod_mat_ncols(matrix);
    const slong capacity = rows < columns ? rows : columns;
    size_t count;
    sagejs_prime_factor *factor;
    if (!sagejs_prime_entry_count(status, rows, columns, &count))
        return NULL;
    if ((size_t) rows > SIZE_MAX / sizeof(slong) ||
        (size_t) capacity > SIZE_MAX / sizeof(slong))
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "prime-field matrix is too large");
        return NULL;
    }
    factor = (sagejs_prime_factor *) calloc(1, sizeof(*factor));
    if (factor == NULL)
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
            "unable to allocate prime-field decomposition");
        return NULL;
    }
    factor->magic = SAGEJS_PRIME_FACTOR_MAGIC;
    factor->rows = rows;
    factor->columns = columns;
    factor->entries = (ulong *) malloc(
        (count == 0 ? 1 : count) * sizeof(*factor->entries));
    factor->pivots = (slong *) malloc(
        (capacity == 0 ? 1 : (size_t) capacity) * sizeof(*factor->pivots));
    factor->permutation = (slong *) malloc(
        (rows == 0 ? 1 : (size_t) rows) * sizeof(*factor->permutation));
    if (factor->entries == NULL || factor->pivots == NULL ||
        factor->permutation == NULL)
    {
        sagejs_prime_factor_clear(factor);
        sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
            "unable to allocate prime-field decomposition workspace");
        return NULL;
    }
    sagejs_prime_arithmetic_init(
        &factor->arithmetic, matrix->mod.n);
    sagejs_prime_factor_reset(factor, matrix);
    if (!sagejs_prime_factor_blocked(factor))
    {
        /* A failed block attempt may have mutated the workspace. */
        sagejs_prime_factor_reset(factor, matrix);
        sagejs_prime_factor_classical(factor);
    }
    return factor;
}

static ulong sagejs_prime_factor_determinant(
    const sagejs_prime_factor *factor)
{
    ulong determinant = 1 % factor->arithmetic.modulus.n;
    if (factor->rows != factor->columns || factor->rank != factor->rows)
        return 0;
    for (slong row = 0; row < factor->rank; row++)
        determinant = sagejs_prime_mul(
            determinant,
            factor->entries[(size_t) row * (size_t) factor->columns +
                (size_t) factor->pivots[row]],
            &factor->arithmetic);
    if ((factor->swaps & 1) != 0 && determinant != 0)
        determinant = factor->arithmetic.modulus.n - determinant;
    return determinant;
}

static nmod_mat_struct *sagejs_prime_factor_echelon(
    sagejs_native_status *status, const sagejs_prime_factor *factor)
{
    const slong rows = factor->rows;
    const slong columns = factor->columns;
    nmod_mat_struct *answer = sagejs_prime_matrix_new(
        status, rows, columns, factor->arithmetic.modulus.n);
    if (answer == NULL)
        return NULL;
    if (rows == columns && factor->rank == rows)
    {
        for (slong index = 0; index < rows; index++)
            nmod_mat_entry(answer, index, index) = 1;
        return answer;
    }
    for (slong row = 0; row < factor->rank; row++)
    {
        const slong pivot = factor->pivots[row];
        for (slong column = pivot; column < columns; column++)
            nmod_mat_entry(answer, row, column) =
                factor->entries[(size_t) row * (size_t) columns +
                    (size_t) column];
    }
    for (slong row = factor->rank; row-- > 0; )
    {
        const slong pivot = factor->pivots[row];
        ulong *pivot_entries = nmod_mat_row_ptr(answer, row);
        const ulong inverse = sagejs_prime_inv(
            pivot_entries[pivot], &factor->arithmetic);
        sagejs_prime_scale_row(
            pivot_entries + pivot,
            columns - pivot,
            inverse,
            &factor->arithmetic);
        pivot_entries[pivot] = 1;
        for (slong upper = 0; upper < row; upper++)
        {
            ulong *upper_entries = nmod_mat_row_ptr(answer, upper);
            const ulong multiple = upper_entries[pivot];
            if (multiple == 0)
                continue;
            upper_entries[pivot] = 0;
            sagejs_prime_subtract_row_multiple(
                upper_entries + pivot + 1,
                pivot_entries + pivot + 1,
                columns - pivot - 1,
                multiple,
                &factor->arithmetic);
        }
    }
    return answer;
}

static nmod_mat_struct *sagejs_prime_factor_solve(
    sagejs_native_status *status,
    const sagejs_prime_factor *factor,
    const nmod_mat_struct *right)
{
    const slong size = factor->rows;
    const slong right_rows = nmod_mat_nrows(right);
    const slong right_columns = nmod_mat_ncols(right);
    nmod_mat_struct *answer;
    if (factor->rows != factor->columns || right_rows != size)
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "solve requires a square matrix and compatible right side");
        return NULL;
    }
    if (right->mod.n != factor->arithmetic.modulus.n)
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_TYPE_ERROR,
            "matrix base rings differ");
        return NULL;
    }
    if (factor->rank != size)
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "matrix is singular");
        return NULL;
    }
    answer = sagejs_prime_matrix_new(
        status, size, right_columns, factor->arithmetic.modulus.n);
    if (answer == NULL)
        return NULL;

    /* Apply P to the right side. */
    for (slong row = 0; row < size; row++)
        for (slong column = 0; column < right_columns; column++)
            nmod_mat_entry(answer, row, column) =
                nmod_mat_entry(
                    right, factor->permutation[row], column);

    /* Forward substitution through unit lower triangular L. */
    for (slong row = 0; row < size; row++)
    {
        ulong *target = nmod_mat_row_ptr(answer, row);
        for (slong prior = 0; prior < row; prior++)
        {
            const ulong multiple = factor->entries[
                (size_t) row * (size_t) size + (size_t) prior];
            sagejs_prime_subtract_row_multiple(
                target,
                nmod_mat_row_ptr(answer, prior),
                right_columns,
                multiple,
                &factor->arithmetic);
        }
    }

    /* Back substitution through U. */
    for (slong row = size; row-- > 0; )
    {
        ulong *target = nmod_mat_row_ptr(answer, row);
        for (slong upper = row + 1; upper < size; upper++)
        {
            const ulong multiple = factor->entries[
                (size_t) row * (size_t) size + (size_t) upper];
            sagejs_prime_subtract_row_multiple(
                target,
                nmod_mat_row_ptr(answer, upper),
                right_columns,
                multiple,
                &factor->arithmetic);
        }
        sagejs_prime_scale_row(
            target,
            right_columns,
            sagejs_prime_inv(
                factor->entries[(size_t) row * (size_t) size +
                    (size_t) row],
                &factor->arithmetic),
            &factor->arithmetic);
    }
    return answer;
}

static int sagejs_prime_rank(
    sagejs_native_status *status,
    const nmod_mat_struct *matrix, slong *rank)
{
    sagejs_prime_factor *factor = sagejs_prime_factor_new(status, matrix);
    if (factor == NULL)
        return 0;
    *rank = factor->rank;
    sagejs_prime_factor_clear(factor);
    return 1;
}

static int sagejs_prime_determinant(
    sagejs_native_status *status,
    const nmod_mat_struct *matrix, ulong *determinant)
{
    sagejs_prime_factor *factor;
    if (nmod_mat_nrows(matrix) != nmod_mat_ncols(matrix))
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "determinant requires a square matrix");
        return 0;
    }
    factor = sagejs_prime_factor_new(status, matrix);
    if (factor == NULL)
        return 0;
    *determinant = sagejs_prime_factor_determinant(factor);
    sagejs_prime_factor_clear(factor);
    return 1;
}

static nmod_mat_struct *sagejs_prime_echelon(
    sagejs_native_status *status, const nmod_mat_struct *matrix)
{
    sagejs_prime_factor *factor = sagejs_prime_factor_new(status, matrix);
    nmod_mat_struct *answer;
    if (factor == NULL)
        return NULL;
    answer = sagejs_prime_factor_echelon(status, factor);
    sagejs_prime_factor_clear(factor);
    return answer;
}

static nmod_mat_struct *sagejs_prime_solve(
    sagejs_native_status *status,
    const nmod_mat_struct *left,
    const nmod_mat_struct *right)
{
    sagejs_prime_factor *factor = sagejs_prime_factor_new(status, left);
    nmod_mat_struct *answer;
    if (factor == NULL)
        return NULL;
    answer = sagejs_prime_factor_solve(status, factor, right);
    sagejs_prime_factor_clear(factor);
    return answer;
}
`;
}

function primeFieldCoreSignature(fn, prototype = false) {
  const output = fn.returnType === "PrimeFieldMatrix"
    ? "nmod_mat_struct **sagejs_native_output"
    : fn.returnType === "PrimeFieldDecomposition"
      ? "sagejs_prime_factor **sagejs_native_output"
      : "uint64_t *sagejs_native_output";
  const params = fn.params.map((param) => param.type === "PrimeFieldMatrix"
    ? `const nmod_mat_struct *sagejs_${param.name}`
    : `const sagejs_prime_factor *sagejs_${param.name}`
  );
  return `int sagejs_kernel_${fn.name}(` + [
    "sagejs_native_status *status", output, ...params,
  ].join(", ") + `)${prototype ? ";" : ""}`;
}

function emitPrimeFieldCoreFunction(fn) {
  const first = `sagejs_${fn.params[0].name}`;
  const second = fn.params.length > 1
    ? `sagejs_${fn.params[1].name}` : undefined;
  let body;
  if (fn.operation === "rank") {
    body = `slong answer;
    if (!sagejs_prime_rank(status, ${first}, &answer)) return 0;
    *sagejs_native_output = (uint64_t) answer;`;
  } else if (fn.operation === "determinant") {
    body = `ulong answer;
    if (!sagejs_prime_determinant(status, ${first}, &answer)) return 0;
    *sagejs_native_output = (uint64_t) answer;`;
  } else if (fn.operation === "echelon") {
    body = `*sagejs_native_output = sagejs_prime_echelon(status, ${first});
    if (*sagejs_native_output == NULL) return 0;`;
  } else if (fn.operation === "solve") {
    body = `*sagejs_native_output = sagejs_prime_solve(
        status, ${first}, ${second});
    if (*sagejs_native_output == NULL) return 0;`;
  } else if (fn.operation === "factor") {
    body = `*sagejs_native_output = sagejs_prime_factor_new(status, ${first});
    if (*sagejs_native_output == NULL) return 0;`;
  } else if (fn.operation === "factor-rank") {
    body = `*sagejs_native_output = (uint64_t) ${first}->rank;`;
  } else if (fn.operation === "factor-determinant") {
    body = `if (${first}->rows != ${first}->columns)
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "determinant requires a square matrix");
        return 0;
    }
    *sagejs_native_output = (uint64_t)
        sagejs_prime_factor_determinant(${first});`;
  } else if (fn.operation === "factor-echelon") {
    body = `*sagejs_native_output =
        sagejs_prime_factor_echelon(status, ${first});
    if (*sagejs_native_output == NULL) return 0;`;
  } else if (fn.operation === "factor-solve") {
    body = `*sagejs_native_output = sagejs_prime_factor_solve(
        status, ${first}, ${second});
    if (*sagejs_native_output == NULL) return 0;`;
  } else {
    throw new Error(`unsupported prime-field operation ${fn.operation}`);
  }
  return `${primeFieldCoreSignature(fn)}
{
    sagejs_native_status_reset(status);
    ${fn.returnType === "PrimeFieldMatrix" ||
        fn.returnType === "PrimeFieldDecomposition"
      ? "*sagejs_native_output = NULL;" : "*sagejs_native_output = 0;"}
    ${body}
    return 1;
}`;
}

function generatePrimeFieldNodeSupport() {
  return String.raw`
static const napi_type_tag sagejs_prime_factor_type_tag = {
    UINT64_C(0x8d6d4da2c995451d),
    UINT64_C(0xa2fe9b60db00ed87)
};

static void sagejs_prime_factor_finalize(
    node_api_basic_env env, void *data, void *hint)
{
    sagejs_prime_factor *factor = (sagejs_prime_factor *) data;
    (void) env;
    (void) hint;
    if (factor != NULL && factor->magic == SAGEJS_PRIME_FACTOR_MAGIC)
        sagejs_prime_factor_clear(factor);
}

static napi_value sagejs_prime_factor_wrap(
    napi_env env, sagejs_prime_factor *factor)
{
    napi_value object;
    napi_value algorithm;
    napi_value rank;
    if (!sagejs_native_check_napi(env, napi_create_object(env, &object)) ||
        !sagejs_native_check_napi(env,
            napi_create_string_utf8(env,
                factor->blocked ? "blocked" : "classical",
                NAPI_AUTO_LENGTH, &algorithm)) ||
        !sagejs_native_check_napi(env,
            napi_set_named_property(env, object, "algorithm", algorithm)) ||
        !sagejs_native_check_napi(env,
            napi_create_int64(env, (int64_t) factor->rank, &rank)) ||
        !sagejs_native_check_napi(env,
            napi_set_named_property(env, object, "rank", rank)))
    {
        sagejs_prime_factor_clear(factor);
        return NULL;
    }
    if (!sagejs_native_check_napi(env,
            napi_wrap(env, object, factor, sagejs_prime_factor_finalize,
                NULL, NULL)))
    {
        sagejs_prime_factor_clear(factor);
        return NULL;
    }
    /* Ownership transferred to the object finalizer at napi_wrap. */
    if (!sagejs_native_check_napi(env,
            napi_type_tag_object(env, object, &sagejs_prime_factor_type_tag)))
        return NULL;
    return object;
}

static sagejs_prime_factor *sagejs_prime_factor_unwrap(
    napi_env env, napi_value object)
{
    bool tagged = false;
    sagejs_prime_factor *factor = NULL;
    if (!sagejs_native_check_napi(env,
            napi_check_object_type_tag(
                env, object, &sagejs_prime_factor_type_tag, &tagged)))
        return NULL;
    if (!tagged || !sagejs_native_check_napi(
            env, napi_unwrap(env, object, (void **) &factor)) ||
        factor == NULL || factor->magic != SAGEJS_PRIME_FACTOR_MAGIC)
    {
        napi_throw_type_error(env, NULL,
            "expected a prime-field decomposition");
        return NULL;
    }
    return factor;
}

static napi_value sagejs_prime_wrap_matrix(
    napi_env env, nmod_mat_struct *source)
{
    sagejs_matrix *matrix;
    if (source == NULL) return NULL;
    matrix = (sagejs_matrix *) calloc(1, sizeof(*matrix));
    if (matrix == NULL)
    {
        sagejs_prime_matrix_clear(source);
        napi_throw_error(env, NULL, "unable to allocate matrix wrapper");
        return NULL;
    }
    matrix->magic = SAGEJS_MATRIX_MAGIC;
    matrix->kind = SAGEJS_MATRIX_NMOD;
    matrix->modular[0] = *source;
    free(source);
    return sagejs_native_wrap_prime_matrix(env, matrix);
}`;
}

function emitPrimeFieldNodeAdapter(fn) {
  const declarations = fn.params.map((param) => param.type === "PrimeFieldMatrix"
    ? `    sagejs_matrix *sagejs_wrapper_${param.name};`
    : `    sagejs_prime_factor *sagejs_wrapper_${param.name};`
  ).join("\n");
  const parsing = fn.params.map((param, index) => param.type === "PrimeFieldMatrix"
    ? `    sagejs_wrapper_${param.name} = ` +
      `sagejs_native_unwrap_prime_matrix(env, args[${index}]);\n` +
      `    if (sagejs_wrapper_${param.name} == NULL) return NULL;`
    : `    sagejs_wrapper_${param.name} = ` +
      `sagejs_prime_factor_unwrap(env, args[${index}]);\n` +
      `    if (sagejs_wrapper_${param.name} == NULL) return NULL;`
  ).join("\n");
  const args = fn.params.map((param) => param.type === "PrimeFieldMatrix"
    ? `sagejs_wrapper_${param.name}->modular`
    : `sagejs_wrapper_${param.name}`
  );
  const outputType = fn.returnType === "PrimeFieldMatrix"
    ? "nmod_mat_struct *"
    : fn.returnType === "PrimeFieldDecomposition"
      ? "sagejs_prime_factor *" : "uint64_t ";
  const cleanup = fn.returnType === "PrimeFieldMatrix"
    ? "sagejs_prime_matrix_clear(output);"
    : fn.returnType === "PrimeFieldDecomposition"
      ? "sagejs_prime_factor_clear(output);" : "";
  const result = fn.returnType === "PrimeFieldMatrix"
    ? "return sagejs_prime_wrap_matrix(env, output);"
    : fn.returnType === "PrimeFieldDecomposition"
      ? "return sagejs_prime_factor_wrap(env, output);"
      : fn.returnType === "PrimeFieldElement"
        ? `if (!sagejs_native_check_napi(env,
        napi_create_bigint_uint64(env, output, &result))) return NULL;
    return result;`
        : `if (!sagejs_native_check_napi(env,
        napi_create_int64(env, (int64_t) output, &result))) return NULL;
    return result;`;
  return `static napi_value compiled_${fn.name}(
    napi_env env, napi_callback_info info)
{
    napi_value args[${Math.max(1, fn.params.length)}];
    size_t argc = ${fn.params.length};
    sagejs_native_status status = {0, NULL};
${declarations}
    ${outputType}output = ${outputType.includes("*") ? "NULL" : "0"};
    napi_value result = NULL;
    if (!sagejs_native_check_napi(env,
        napi_get_cb_info(env, info, &argc, args, NULL, NULL))) return NULL;
    if (argc != ${fn.params.length})
    {
        napi_throw_type_error(env, NULL, "wrong native argument count");
        return NULL;
    }
${parsing}
    if (!sagejs_kernel_${fn.name}(&status, &output, ${args.join(", ")}))
    {
        sagejs_native_throw_status(env, &status);
        ${cleanup}
        return NULL;
    }
    ${result}
}`;
}

module.exports = {
  emitPrimeFieldCoreFunction,
  emitPrimeFieldNodeAdapter,
  generatePrimeFieldNodeSupport,
  generatePrimeFieldSupport,
  primeFieldCoreSignature,
};
