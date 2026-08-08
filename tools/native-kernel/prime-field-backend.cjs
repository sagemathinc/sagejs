"use strict";

function cString(value) {
  return JSON.stringify(String(value));
}

function generatePrimeFieldSupport() {
  return String.raw`
typedef struct
{
    nmod_t modulus;
    int narrow;
} sagejs_prime_arithmetic;

static void sagejs_prime_arithmetic_init(
    sagejs_prime_arithmetic *arithmetic, ulong modulus)
{
    sagejs_native_init_nmod(&arithmetic->modulus, modulus);
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
    if (length >= 10 &&
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
    if (length >= 10 &&
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

static int sagejs_prime_entry_count(
    napi_env env, slong rows, slong columns, size_t *count)
{
    if (rows < 0 || columns < 0 ||
        ((size_t) columns != 0 &&
            (size_t) rows > SIZE_MAX / (size_t) columns))
    {
        napi_throw_range_error(env, NULL, "prime-field matrix is too large");
        return 0;
    }
    *count = (size_t) rows * (size_t) columns;
    if (*count > SIZE_MAX / sizeof(ulong))
    {
        napi_throw_range_error(env, NULL, "prime-field matrix is too large");
        return 0;
    }
    return 1;
}

static ulong *sagejs_prime_copy_entries(
    napi_env env, const sagejs_matrix *matrix)
{
    const slong rows = nmod_mat_nrows(matrix->modular);
    const slong columns = nmod_mat_ncols(matrix->modular);
    size_t count;
    ulong *entries;
    if (!sagejs_prime_entry_count(env, rows, columns, &count))
        return NULL;
    entries = (ulong *) malloc((count == 0 ? 1 : count) * sizeof(*entries));
    if (entries == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to allocate prime-field elimination workspace");
        return NULL;
    }
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
            entries[(size_t) row * (size_t) columns + (size_t) column] =
                nmod_mat_entry(matrix->modular, row, column);
    return entries;
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

static slong sagejs_prime_forward_eliminate(
    ulong *entries,
    slong rows,
    slong columns,
    slong pivot_columns,
    const sagejs_prime_arithmetic *arithmetic,
    ulong *determinant)
{
    slong pivot_row = 0;
    ulong det = 1 % arithmetic->modulus.n;
    for (slong pivot_column = 0;
         pivot_column < pivot_columns && pivot_row < rows;
         pivot_column++)
    {
        slong selected = pivot_row;
        while (selected < rows &&
            entries[(size_t) selected * (size_t) columns +
                (size_t) pivot_column] == 0)
            selected++;
        if (selected == rows)
            continue;
        if (selected != pivot_row)
        {
            sagejs_prime_swap_rows(
                entries, columns, selected, pivot_row);
            if (determinant != NULL && det != 0)
                det = arithmetic->modulus.n - det;
        }
        const size_t pivot_index =
            (size_t) pivot_row * (size_t) columns +
            (size_t) pivot_column;
        const ulong pivot = entries[pivot_index];
        const ulong inverse = sagejs_prime_inv(pivot, arithmetic);
        if (determinant != NULL)
            det = sagejs_prime_mul(det, pivot, arithmetic);
        for (slong row = pivot_row + 1; row < rows; row++)
        {
            const size_t row_offset = (size_t) row * (size_t) columns;
            const ulong value = entries[row_offset + (size_t) pivot_column];
            if (value == 0)
                continue;
            const ulong factor = sagejs_prime_mul(value, inverse, arithmetic);
            entries[row_offset + (size_t) pivot_column] = 0;
            sagejs_prime_subtract_row_multiple(
                entries + row_offset + (size_t) pivot_column + 1,
                entries + (size_t) pivot_row * (size_t) columns +
                    (size_t) pivot_column + 1,
                columns - pivot_column - 1,
                factor,
                arithmetic);
        }
        pivot_row++;
    }
    if (determinant != NULL)
        *determinant = pivot_row == rows && rows == pivot_columns ? det : 0;
    return pivot_row;
}

static slong sagejs_prime_rref_entries(
    ulong *entries,
    slong rows,
    slong columns,
    slong pivot_columns,
    const sagejs_prime_arithmetic *arithmetic)
{
    slong pivot_row = 0;
    for (slong pivot_column = 0;
         pivot_column < pivot_columns && pivot_row < rows;
         pivot_column++)
    {
        slong selected = pivot_row;
        while (selected < rows &&
            entries[(size_t) selected * (size_t) columns +
                (size_t) pivot_column] == 0)
            selected++;
        if (selected == rows)
            continue;
        sagejs_prime_swap_rows(entries, columns, selected, pivot_row);
        const size_t pivot_offset =
            (size_t) pivot_row * (size_t) columns;
        const ulong inverse = sagejs_prime_inv(
            entries[pivot_offset + (size_t) pivot_column],
            arithmetic);
        entries[pivot_offset + (size_t) pivot_column] = 1;
        sagejs_prime_scale_row(
            entries + pivot_offset + (size_t) pivot_column + 1,
            columns - pivot_column - 1,
            inverse,
            arithmetic);
        for (slong row = 0; row < rows; row++)
        {
            if (row == pivot_row)
                continue;
            const size_t row_offset = (size_t) row * (size_t) columns;
            const ulong factor =
                entries[row_offset + (size_t) pivot_column];
            if (factor == 0)
                continue;
            entries[row_offset + (size_t) pivot_column] = 0;
            sagejs_prime_subtract_row_multiple(
                entries + row_offset + (size_t) pivot_column + 1,
                entries + pivot_offset + (size_t) pivot_column + 1,
                columns - pivot_column - 1,
                factor,
                arithmetic);
        }
        pivot_row++;
    }
    return pivot_row;
}

static sagejs_matrix *sagejs_prime_matrix_from_entries(
    napi_env env,
    slong rows,
    slong columns,
    ulong modulus,
    const ulong *entries)
{
    sagejs_matrix *answer = sagejs_native_new_prime_matrix(
        env, rows, columns, modulus);
    if (answer == NULL)
        return NULL;
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
            nmod_mat_entry(answer->modular, row, column) =
                entries[(size_t) row * (size_t) columns + (size_t) column];
    return answer;
}

static int sagejs_prime_rank(
    napi_env env, const sagejs_matrix *matrix, slong *rank)
{
    const slong rows = nmod_mat_nrows(matrix->modular);
    const slong columns = nmod_mat_ncols(matrix->modular);
    sagejs_prime_arithmetic arithmetic;
    ulong *entries = sagejs_prime_copy_entries(env, matrix);
    if (entries == NULL)
        return 0;
    sagejs_prime_arithmetic_init(
        &arithmetic, matrix->modular->mod.n);
    *rank = sagejs_prime_forward_eliminate(
        entries, rows, columns, columns, &arithmetic, NULL);
    free(entries);
    return 1;
}

static int sagejs_prime_determinant(
    napi_env env, const sagejs_matrix *matrix, ulong *determinant)
{
    const slong rows = nmod_mat_nrows(matrix->modular);
    const slong columns = nmod_mat_ncols(matrix->modular);
    sagejs_prime_arithmetic arithmetic;
    ulong *entries;
    if (rows != columns)
    {
        napi_throw_range_error(env, NULL,
            "determinant requires a square matrix");
        return 0;
    }
    entries = sagejs_prime_copy_entries(env, matrix);
    if (entries == NULL)
        return 0;
    sagejs_prime_arithmetic_init(
        &arithmetic, matrix->modular->mod.n);
    sagejs_prime_forward_eliminate(
        entries, rows, columns, columns, &arithmetic, determinant);
    free(entries);
    return 1;
}

static sagejs_matrix *sagejs_prime_echelon(
    napi_env env, const sagejs_matrix *matrix)
{
    const slong rows = nmod_mat_nrows(matrix->modular);
    const slong columns = nmod_mat_ncols(matrix->modular);
    const ulong modulus = matrix->modular->mod.n;
    sagejs_prime_arithmetic arithmetic;
    sagejs_matrix *answer;
    ulong *entries = sagejs_prime_copy_entries(env, matrix);
    if (entries == NULL)
        return NULL;
    sagejs_prime_arithmetic_init(&arithmetic, modulus);
    sagejs_prime_rref_entries(
        entries, rows, columns, columns, &arithmetic);
    answer = sagejs_prime_matrix_from_entries(
        env, rows, columns, modulus, entries);
    free(entries);
    return answer;
}

static sagejs_matrix *sagejs_prime_solve(
    napi_env env,
    const sagejs_matrix *left,
    const sagejs_matrix *right)
{
    const slong rows = nmod_mat_nrows(left->modular);
    const slong columns = nmod_mat_ncols(left->modular);
    const slong right_rows = nmod_mat_nrows(right->modular);
    const slong right_columns = nmod_mat_ncols(right->modular);
    const ulong modulus = left->modular->mod.n;
    slong augmented_columns;
    sagejs_prime_arithmetic arithmetic;
    sagejs_matrix *answer;
    size_t count;
    ulong *entries;
    slong rank;
    if (rows != columns || right_rows != rows)
    {
        napi_throw_range_error(env, NULL,
            "solve requires a square matrix and compatible right side");
        return NULL;
    }
    if (right->modular->mod.n != modulus)
    {
        napi_throw_type_error(env, NULL, "matrix base rings differ");
        return NULL;
    }
    if (right_columns > WORD_MAX - columns)
    {
        napi_throw_range_error(env, NULL, "prime-field matrix is too large");
        return NULL;
    }
    augmented_columns = columns + right_columns;
    if (!sagejs_prime_entry_count(env, rows, augmented_columns, &count))
        return NULL;
    entries = (ulong *) malloc((count == 0 ? 1 : count) * sizeof(*entries));
    if (entries == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to allocate prime-field solve workspace");
        return NULL;
    }
    for (slong row = 0; row < rows; row++)
    {
        const size_t offset = (size_t) row * (size_t) augmented_columns;
        for (slong column = 0; column < columns; column++)
            entries[offset + (size_t) column] =
                nmod_mat_entry(left->modular, row, column);
        for (slong column = 0; column < right_columns; column++)
            entries[offset + (size_t) columns + (size_t) column] =
                nmod_mat_entry(right->modular, row, column);
    }
    sagejs_prime_arithmetic_init(&arithmetic, modulus);
    rank = sagejs_prime_rref_entries(
        entries, rows, augmented_columns, columns, &arithmetic);
    if (rank != rows)
    {
        free(entries);
        napi_throw_range_error(env, NULL, "matrix is singular");
        return NULL;
    }
    answer = sagejs_native_new_prime_matrix(
        env, columns, right_columns, modulus);
    if (answer == NULL)
    {
        free(entries);
        return NULL;
    }
    for (slong row = 0; row < columns; row++)
        for (slong column = 0; column < right_columns; column++)
            nmod_mat_entry(answer->modular, row, column) =
                entries[(size_t) row * (size_t) augmented_columns +
                    (size_t) columns + (size_t) column];
    free(entries);
    return answer;
}
`;
}

function emitPrimeFieldFunction(fn) {
  const argumentCount = fn.params.length;
  const first = fn.params[0].name;
  const parse = `    sagejs_matrix *sagejs_${first};

    if (!sagejs_native_check_napi(env,
        napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return NULL;
    if (argc != ${argumentCount})
    {
        napi_throw_type_error(env, NULL, "wrong native argument count");
        return NULL;
    }
    sagejs_${first} = sagejs_native_unwrap_prime_matrix(env, args[0]);
    if (sagejs_${first} == NULL)
        return NULL;`;

  let body;
  if (fn.operation === "rank") {
    body = `    slong rank;
${parse}
    if (!sagejs_prime_rank(env, sagejs_${first}, &rank) ||
        !sagejs_native_check_napi(env,
            napi_create_int64(env, (int64_t) rank, &result)))
        return NULL;
    return result;`;
  } else if (fn.operation === "determinant") {
    body = `    ulong determinant;
${parse}
    if (!sagejs_prime_determinant(
            env, sagejs_${first}, &determinant) ||
        !sagejs_native_check_napi(env,
            napi_create_bigint_uint64(
                env, (uint64_t) determinant, &result)))
        return NULL;
    return result;`;
  } else if (fn.operation === "echelon") {
    body = `    sagejs_matrix *answer;
${parse}
    answer = sagejs_prime_echelon(env, sagejs_${first});
    return answer == NULL
        ? NULL
        : sagejs_native_wrap_prime_matrix(env, answer);`;
  } else if (fn.operation === "solve") {
    const second = fn.params[1].name;
    body = `    sagejs_matrix *sagejs_${second};
    sagejs_matrix *answer;
${parse}
    sagejs_${second} = sagejs_native_unwrap_prime_matrix(env, args[1]);
    if (sagejs_${second} == NULL)
        return NULL;
    answer = sagejs_prime_solve(
        env, sagejs_${first}, sagejs_${second});
    return answer == NULL
        ? NULL
        : sagejs_native_wrap_prime_matrix(env, answer);`;
  } else {
    throw new Error(`unsupported prime-field operation ${fn.operation}`);
  }

  return `static napi_value compiled_${fn.name}(
    napi_env env, napi_callback_info info)
{
    napi_value args[${argumentCount}];
    size_t argc = ${argumentCount};
${["rank", "determinant"].includes(fn.operation) ? "    napi_value result;" : ""}
${body}
}`;
}

module.exports = {
  emitPrimeFieldFunction,
  generatePrimeFieldSupport,
};
