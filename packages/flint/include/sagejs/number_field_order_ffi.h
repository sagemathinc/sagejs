#ifndef SAGEJS_NUMBER_FIELD_ORDER_FFI_H
#define SAGEJS_NUMBER_FIELD_ORDER_FFI_H

#include <stdint.h>
#include <stdlib.h>

#include <flint/fmpq.h>
#include <flint/fmpq_mat.h>
#include <flint/fmpz.h>
#include <flint/fmpz_mat.h>
#include <flint/nmod_mat.h>
#include <flint/ulong_extras.h>

#include "sagejs/fmpq_matrix_ffi.h"
#include "sagejs/fmpz_matrix_ffi.h"

/* Optional benchmark-only hooks.  Production translation units compile these
 * away, while the focused witness can account for individual Round-2 phases
 * without adding a second implementation of the algorithm. */
#ifndef SAGEJS_NF_ORDER_PROFILE_BEGIN
#define SAGEJS_NF_ORDER_PROFILE_BEGIN(phase) ((void) 0)
#endif
#ifndef SAGEJS_NF_ORDER_PROFILE_END
#define SAGEJS_NF_ORDER_PROFILE_END(phase) ((void) 0)
#endif
#ifndef SAGEJS_NF_ORDER_PROFILE_ITERATION
#define SAGEJS_NF_ORDER_PROFILE_ITERATION(radical_dimension, nullity) \
    ((void) 0)
#endif
#ifndef SAGEJS_NF_ORDER_PROFILE_EQUATIONS
#define SAGEJS_NF_ORDER_PROFILE_EQUATIONS(total_rows, retained_rows) \
    ((void) 0)
#endif

/*
 * Zassenhaus Round 2 over an integral multiplication table.
 *
 * The input has n^2 rows and n columns. Row i*n+j is the coordinate row of
 * e_i*e_j in the integral order basis. The result is a rational change-of-
 * basis matrix whose rows span the p-maximal overorder in that basis.
 *
 * This is deliberately a batched FLINT-storage boundary. The same algorithm
 * lives in ordinary Python in number_fields.py; this implementation removes
 * thousands of object-at-a-time crossings in difficult local computations.
 */

static inline ulong sagejs_nf_mulmod(
    ulong left, ulong right, ulong prime, ulong inverse)
{
    if (prime == 2) return left & right;
    return n_mulmod2_preinv(left, right, prime, inverse);
}

static inline ulong sagejs_nf_fmpz_fdiv_ui(
    const fmpz_t value, ulong modulus)
{
    if ((modulus & (modulus - 1)) != 0)
        return fmpz_fdiv_ui(value, modulus);
    ulong remainder = fmpz_get_ui(value) & (modulus - 1);
    if (fmpz_sgn(value) < 0 && remainder != 0)
        remainder = modulus - remainder;
    return remainder;
}

static inline void sagejs_nf_modular_product(
    ulong *result, const ulong *left, const ulong *right,
    const ulong *table, slong degree, ulong prime, ulong inverse)
{
    for (slong k = 0; k < degree; k++) result[k] = 0;
    for (slong i = 0; i < degree; i++)
    {
        if (left[i] == 0) continue;
        for (slong j = 0; j < degree; j++)
        {
            if (right[j] == 0) continue;
            ulong scalar = sagejs_nf_mulmod(
                left[i], right[j], prime, inverse);
            const ulong *product = table + (i * degree + j) * degree;
            for (slong k = 0; k < degree; k++)
            {
                ulong term = sagejs_nf_mulmod(
                    scalar, product[k], prime, inverse);
                result[k] = prime == 2 ?
                    (result[k] ^ term) :
                    n_addmod(result[k], term, prime);
            }
        }
    }
}

static inline void sagejs_nf_modular_power(
    ulong *result, const ulong *source, ulong exponent, const ulong *one,
    const ulong *table, slong degree, ulong prime, ulong inverse,
    ulong *base, ulong *scratch)
{
    for (slong i = 0; i < degree; i++)
    {
        result[i] = one[i];
        base[i] = source[i];
    }
    while (exponent != 0)
    {
        if (exponent & 1)
        {
            sagejs_nf_modular_product(
                scratch, result, base, table, degree, prime, inverse);
            for (slong i = 0; i < degree; i++) result[i] = scratch[i];
        }
        exponent >>= 1;
        if (exponent != 0)
        {
            sagejs_nf_modular_product(
                scratch, base, base, table, degree, prime, inverse);
            for (slong i = 0; i < degree; i++) base[i] = scratch[i];
        }
    }
}

static inline slong sagejs_nf_right_kernel_rows_with_columns(
    nmod_mat_t rows, const nmod_mat_t source, nmod_mat_t columns_matrix)
{
    const slong columns = nmod_mat_ncols(source);
    const slong nullity = nmod_mat_nullspace(columns_matrix, source);
    nmod_mat_zero(rows);
    for (slong i = 0; i < nullity; i++)
        for (slong j = 0; j < columns; j++)
            nmod_mat_entry(rows, i, j) =
                nmod_mat_entry(columns_matrix, j, i);
    if (nullity != 0)
    {
        nmod_mat_t window;
        nmod_mat_window_init(window, rows, 0, 0, nullity, columns);
        nmod_mat_rref(window);
        nmod_mat_window_clear(window);
    }
    return nullity;
}

/* Store a canonical row basis for the right kernel of source. */
static inline slong sagejs_nf_right_kernel_rows(
    nmod_mat_t rows, const nmod_mat_t source)
{
    const slong columns = nmod_mat_ncols(source);
    nmod_mat_t columns_matrix;
    nmod_mat_init(columns_matrix, columns, columns, source->mod.n);
    const slong nullity = sagejs_nf_right_kernel_rows_with_columns(
        rows, source, columns_matrix);
    nmod_mat_clear(columns_matrix);
    return nullity;
}

typedef struct
{
    slong degree;
    nmod_mat_t defining;
    nmod_mat_t product;
    nmod_mat_t kernel_columns;
    ulong *one;
    ulong *source;
    ulong *power;
    ulong *base;
    ulong *scratch;
} sagejs_nf_p_radical_workspace;

static inline void sagejs_nf_p_radical_workspace_init(
    sagejs_nf_p_radical_workspace *workspace, slong degree, ulong prime)
{
    workspace->degree = degree;
    nmod_mat_init(workspace->defining, degree, degree, prime);
    nmod_mat_init(workspace->product, degree, degree, prime);
    nmod_mat_init(workspace->kernel_columns, degree, degree, prime);
    workspace->one = (ulong *) flint_malloc((size_t) degree * sizeof(ulong));
    workspace->source =
        (ulong *) flint_calloc((size_t) degree, sizeof(ulong));
    workspace->power = (ulong *) flint_malloc((size_t) degree * sizeof(ulong));
    workspace->base = (ulong *) flint_malloc((size_t) degree * sizeof(ulong));
    workspace->scratch =
        (ulong *) flint_malloc((size_t) degree * sizeof(ulong));
}

static inline void sagejs_nf_p_radical_workspace_clear(
    sagejs_nf_p_radical_workspace *workspace)
{
    flint_free(workspace->scratch);
    flint_free(workspace->base);
    flint_free(workspace->power);
    flint_free(workspace->source);
    flint_free(workspace->one);
    nmod_mat_clear(workspace->product);
    nmod_mat_clear(workspace->kernel_columns);
    nmod_mat_clear(workspace->defining);
}

static inline void sagejs_nf_p_radical_with_workspace(
    nmod_mat_t radical, slong *dimension, const ulong *table,
    const fmpz *identity, slong degree, ulong prime, ulong inverse,
    sagejs_nf_p_radical_workspace *workspace)
{
    nmod_mat_struct *defining = workspace->defining;
    if (prime > (ulong) degree)
    {
        /* Trace(M_i M_j), reduced modulo p. */
        for (slong i = 0; i < degree; i++)
            for (slong j = 0; j < degree; j++)
            {
                ulong trace = 0;
                for (slong row = 0; row < degree; row++)
                    for (slong column = 0; column < degree; column++)
                    {
                        ulong left = table[(i * degree + column) * degree + row];
                        ulong right = table[(j * degree + row) * degree + column];
                        ulong term = sagejs_nf_mulmod(
                            left, right, prime, inverse);
                        trace = n_addmod(trace, term, prime);
                    }
                nmod_mat_entry(defining, i, j) = trace;
            }
    }
    else
    {
        ulong *one = workspace->one;
        ulong *source = workspace->source;
        ulong *power = workspace->power;
        ulong *base = workspace->base;
        ulong *scratch = workspace->scratch;
        for (slong i = 0; i < degree; i++)
            one[i] = fmpz_fdiv_ui(identity + i, prime);
        for (slong column = 0; column < degree; column++)
        {
            for (slong i = 0; i < degree; i++) source[i] = 0;
            source[column] = 1;
            sagejs_nf_modular_power(
                power, source, prime, one, table, degree, prime, inverse,
                base, scratch);
            for (slong row = 0; row < degree; row++)
                nmod_mat_entry(defining, row, column) = power[row];
        }
        ulong bound = prime;
        nmod_mat_struct *product = workspace->product;
        while (bound < (ulong) degree)
        {
            nmod_mat_mul(product, defining, defining);
            nmod_mat_swap(defining, product);
            if (bound > UWORD_MAX / prime) break;
            bound *= prime;
        }
    }
    *dimension = sagejs_nf_right_kernel_rows_with_columns(
        radical, defining, workspace->kernel_columns);
}

static inline void sagejs_nf_p_radical(
    nmod_mat_t radical, slong *dimension, const ulong *table,
    const fmpz *identity, slong degree, ulong prime, ulong inverse)
{
    sagejs_nf_p_radical_workspace workspace;
    sagejs_nf_p_radical_workspace_init(&workspace, degree, prime);
    sagejs_nf_p_radical_with_workspace(
        radical, dimension, table, identity, degree, prime, inverse,
        &workspace);
    sagejs_nf_p_radical_workspace_clear(&workspace);
}

static inline slong sagejs_nf_pivot_columns(
    slong *pivots, const nmod_mat_t rows, slong row_count, slong degree)
{
    slong previous = -1;
    for (slong row = 0; row < row_count; row++)
    {
        slong column = previous + 1;
        while (column < degree && nmod_mat_entry(rows, row, column) == 0)
            column++;
        if (column == degree) return row;
        pivots[row] = column;
        previous = column;
    }
    return row_count;
}

static inline void sagejs_nf_build_lattice(
    fmpz_mat_t lattice, const nmod_mat_t radical, slong radical_dimension,
    slong degree, ulong prime)
{
    slong *pivots = (slong *) flint_malloc((size_t) degree * sizeof(slong));
    unsigned char *is_pivot = (unsigned char *) flint_calloc(
        (size_t) degree, sizeof(unsigned char));
    sagejs_nf_pivot_columns(pivots, radical, radical_dimension, degree);
    for (slong row = 0; row < radical_dimension; row++)
    {
        is_pivot[pivots[row]] = 1;
        for (slong column = 0; column < degree; column++)
            fmpz_set_ui(fmpz_mat_entry(lattice, row, column),
                nmod_mat_entry(radical, row, column));
    }
    slong row = radical_dimension;
    for (slong column = 0; column < degree; column++)
        if (!is_pivot[column])
            fmpz_set_ui(fmpz_mat_entry(lattice, row++, column), prime);
    flint_free(is_pivot);
    flint_free(pivots);
}

static inline slong sagejs_nf_multiplier_kernel_exact(
    nmod_mat_t kernel, const fmpz_mat_t *multiplication,
    const nmod_mat_t radical, slong radical_dimension,
    slong degree, ulong prime)
{
    fmpz_mat_t lattice, inverse;
    fmpz_t denominator, sum, term;
    nmod_mat_t equations;
    fmpz_mat_init(lattice, degree, degree);
    fmpz_mat_init(inverse, degree, degree);
    fmpz_init(denominator);
    fmpz_init(sum);
    fmpz_init(term);
    sagejs_nf_build_lattice(
        lattice, radical, radical_dimension, degree, prime);
    if (!fmpz_mat_inv(inverse, denominator, lattice))
    {
        fmpz_clear(term); fmpz_clear(sum); fmpz_clear(denominator);
        fmpz_mat_clear(inverse); fmpz_mat_clear(lattice);
        return -1;
    }
    nmod_mat_init(equations, degree * degree, degree, prime);
    fmpz *product = _fmpz_vec_init(degree);
    for (slong ideal_row = 0; ideal_row < degree; ideal_row++)
        for (slong basis = 0; basis < degree; basis++)
        {
            for (slong coordinate = 0; coordinate < degree; coordinate++)
            {
                fmpz_zero(product + coordinate);
                for (slong source = 0; source < degree; source++)
                    fmpz_addmul(
                        product + coordinate,
                        fmpz_mat_entry(lattice, ideal_row, source),
                        fmpz_mat_entry(multiplication[basis], coordinate, source));
            }
            for (slong coordinate = 0; coordinate < degree; coordinate++)
            {
                fmpz_zero(sum);
                for (slong source = 0; source < degree; source++)
                    fmpz_addmul(sum, product + source,
                        fmpz_mat_entry(inverse, source, coordinate));
                fmpz_divexact(term, sum, denominator);
                nmod_mat_entry(
                    equations, ideal_row * degree + coordinate, basis) =
                    fmpz_fdiv_ui(term, prime);
            }
        }
    _fmpz_vec_clear(product, degree);
    const slong nullity = sagejs_nf_right_kernel_rows(kernel, equations);
    nmod_mat_clear(equations);
    fmpz_clear(term); fmpz_clear(sum); fmpz_clear(denominator);
    fmpz_mat_clear(inverse); fmpz_mat_clear(lattice);
    return nullity;
}

/* For word primes whose square fits a limb, the multiplier equations need
 * only the multiplication table modulo p^2.  If R is the RREF basis of the
 * radical, then I = <R, p e_j (j nonpivot)>.  Coordinates in I are recovered
 * by reading pivot coordinates directly and dividing each nonpivot residual
 * by p.  Computing modulo p^2 therefore determines those coordinates modulo
 * p without constructing or inverting an fmpz lattice. */
typedef struct
{
    slong degree;
    slong *pivots;
    slong *nonpivots;
    slong *radical_offsets;
    slong *radical_sources;
    ulong *radical_coefficients;
    slong *equation_hash_slots;
    size_t equation_hash_capacity;
    unsigned char *is_pivot;
    ulong *product;
    nmod_mat_t equations;
    nmod_mat_t kernel_columns;
} sagejs_nf_multiplier_workspace;

static inline void sagejs_nf_multiplier_workspace_init(
    sagejs_nf_multiplier_workspace *workspace, slong degree, ulong prime)
{
    workspace->degree = degree;
    workspace->pivots =
        (slong *) flint_malloc((size_t) degree * sizeof(slong));
    workspace->nonpivots =
        (slong *) flint_malloc((size_t) degree * sizeof(slong));
    workspace->radical_offsets =
        (slong *) flint_malloc((size_t) (degree + 1) * sizeof(slong));
    workspace->radical_sources = (slong *) flint_malloc(
        (size_t) degree * (size_t) degree * sizeof(slong));
    workspace->radical_coefficients = (ulong *) flint_malloc(
        (size_t) degree * (size_t) degree * sizeof(ulong));
    const size_t equation_rows = (size_t) degree * (size_t) degree;
    workspace->equation_hash_capacity = 1;
    while (workspace->equation_hash_capacity < 2 * equation_rows)
        workspace->equation_hash_capacity <<= 1;
    workspace->equation_hash_slots = (slong *) flint_malloc(
        workspace->equation_hash_capacity * sizeof(slong));
    workspace->is_pivot = (unsigned char *) flint_calloc(
        (size_t) degree, sizeof(unsigned char));
    workspace->product =
        (ulong *) flint_malloc((size_t) degree * sizeof(ulong));
    nmod_mat_init(workspace->equations, degree * degree, degree, prime);
    nmod_mat_init(workspace->kernel_columns, degree, degree, prime);
}

static inline void sagejs_nf_multiplier_workspace_clear(
    sagejs_nf_multiplier_workspace *workspace)
{
    nmod_mat_clear(workspace->kernel_columns);
    nmod_mat_clear(workspace->equations);
    flint_free(workspace->product);
    flint_free(workspace->is_pivot);
    flint_free(workspace->equation_hash_slots);
    flint_free(workspace->radical_coefficients);
    flint_free(workspace->radical_sources);
    flint_free(workspace->radical_offsets);
    flint_free(workspace->nonpivots);
    flint_free(workspace->pivots);
}

static inline slong sagejs_nf_multiplier_kernel_mod_p2(
    nmod_mat_t kernel, const ulong *table_squared,
    const nmod_mat_t radical, slong radical_dimension,
    slong degree, ulong prime, sagejs_nf_multiplier_workspace *workspace)
{
    const ulong modulus = prime * prime;
    const ulong modulus_inverse = n_preinvert_limb(modulus);
    const int binary_prime = prime == 2;
    const int accumulation_fits =
        prime <= UWORD_MAX / modulus &&
        (ulong) degree <= UWORD_MAX / (prime * modulus);
    if (workspace->degree != degree) return -1;
    slong *pivots = workspace->pivots;
    slong *nonpivots = workspace->nonpivots;
    slong *radical_offsets = workspace->radical_offsets;
    slong *radical_sources = workspace->radical_sources;
    ulong *radical_coefficients = workspace->radical_coefficients;
    unsigned char *is_pivot = workspace->is_pivot;
    ulong *product = workspace->product;
    memset(is_pivot, 0, (size_t) degree * sizeof(unsigned char));
    sagejs_nf_pivot_columns(pivots, radical, radical_dimension, degree);
    for (slong row = 0; row < radical_dimension; row++)
        is_pivot[pivots[row]] = 1;
    slong radical_nonzeros = 0;
    radical_offsets[0] = 0;
    for (slong row = 0; row < radical_dimension; row++)
    {
        for (slong source = 0; source < degree; source++)
        {
            const ulong coefficient =
                nmod_mat_entry(radical, row, source);
            if (coefficient == 0) continue;
            radical_sources[radical_nonzeros] = source;
            radical_coefficients[radical_nonzeros] = coefficient;
            radical_nonzeros++;
        }
        radical_offsets[row + 1] = radical_nonzeros;
    }
    slong nonpivot_count = 0;
    for (slong column = 0; column < degree; column++)
        if (!is_pivot[column])
            nonpivots[nonpivot_count++] = column;
    if (radical_dimension + nonpivot_count != degree)
        return -1;

    nmod_mat_struct *equations = workspace->equations;
    for (slong ideal_row = 0; ideal_row < degree; ideal_row++)
        for (slong basis = 0; basis < degree; basis++)
        {
            if (ideal_row < radical_dimension)
            {
                for (slong coordinate = 0; coordinate < degree; coordinate++)
                {
                    ulong sum = 0;
                    if (accumulation_fits)
                    {
                        for (slong position = radical_offsets[ideal_row];
                             position < radical_offsets[ideal_row + 1];
                             position++)
                            sum += radical_coefficients[position] *
                                table_squared[(basis * degree +
                                    radical_sources[position]) *
                                    degree + coordinate];
                        sum = binary_prime ? (sum & 3) : sum % modulus;
                    }
                    else
                        for (slong position = radical_offsets[ideal_row];
                             position < radical_offsets[ideal_row + 1];
                             position++)
                        {
                            const ulong coefficient =
                                radical_coefficients[position];
                            const ulong entry = table_squared[
                                (basis * degree + radical_sources[position]) *
                                    degree + coordinate];
                            const ulong term = n_mulmod2_preinv(
                                coefficient, entry, modulus, modulus_inverse);
                            sum = n_addmod(sum, term, modulus);
                        }
                    product[coordinate] = sum;
                }
            }
            else
            {
                const slong source = nonpivots[ideal_row - radical_dimension];
                for (slong coordinate = 0; coordinate < degree; coordinate++)
                {
                    const ulong entry = table_squared[
                        (basis * degree + source) * degree + coordinate];
                    product[coordinate] = accumulation_fits ?
                        (binary_prime ? (prime * entry) & 3 :
                            (prime * entry) % modulus) :
                        n_mulmod2_preinv(
                            prime, entry, modulus, modulus_inverse);
                }
            }

            for (slong pivot_row = 0;
                 pivot_row < radical_dimension; pivot_row++)
                nmod_mat_entry(equations,
                    ideal_row * degree + pivot_row, basis) =
                    (binary_prime ? product[pivots[pivot_row]] & 1 :
                        product[pivots[pivot_row]] % prime);
            for (slong nonpivot_row = 0;
                 nonpivot_row < nonpivot_count; nonpivot_row++)
            {
                const slong column = nonpivots[nonpivot_row];
                ulong residual = product[column];
                if (accumulation_fits)
                {
                    ulong tail = 0;
                    for (slong pivot_row = 0;
                         pivot_row < radical_dimension; pivot_row++)
                        tail += product[pivots[pivot_row]] *
                            nmod_mat_entry(radical, pivot_row, column);
                    residual = binary_prime ?
                        (residual - tail) & 3 :
                        n_submod(residual, tail % modulus, modulus);
                }
                else
                    for (slong pivot_row = 0;
                         pivot_row < radical_dimension; pivot_row++)
                    {
                        const ulong coefficient =
                            nmod_mat_entry(radical, pivot_row, column);
                        if (coefficient == 0) continue;
                        const ulong term = n_mulmod2_preinv(
                            product[pivots[pivot_row]], coefficient,
                            modulus, modulus_inverse);
                        residual = n_submod(residual, term, modulus);
                    }
                if (binary_prime ? (residual & 1) != 0 :
                    residual % prime != 0)
                    return -1;
                nmod_mat_entry(equations,
                    ideal_row * degree + radical_dimension + nonpivot_row,
                    basis) = binary_prime ? residual >> 1 : residual / prime;
            }
        }
    const slong equation_rows = degree * degree;
    slong *equation_hash_slots = workspace->equation_hash_slots;
    memset(equation_hash_slots, 0xff,
        workspace->equation_hash_capacity * sizeof(slong));
    slong retained_rows = 0;
    for (slong source_row = 0; source_row < equation_rows; source_row++)
    {
        int is_zero = 1;
        uint64_t hash = UINT64_C(1469598103934665603);
        for (slong column = 0; column < degree; column++)
        {
            const ulong entry =
                nmod_mat_entry(equations, source_row, column);
            hash ^= (uint64_t) entry;
            hash *= UINT64_C(1099511628211);
            if (entry != 0)
            {
                is_zero = 0;
            }
        }
        if (is_zero) continue;
        int duplicate = 0;
        size_t slot = (size_t) hash &
            (workspace->equation_hash_capacity - 1);
        while (equation_hash_slots[slot] >= 0)
        {
            const slong prior_row = equation_hash_slots[slot];
            duplicate = 1;
            for (slong column = 0; column < degree; column++)
                if (nmod_mat_entry(equations, source_row, column) !=
                    nmod_mat_entry(equations, prior_row, column))
                {
                    duplicate = 0;
                    break;
                }
            if (duplicate) break;
            slot = (slot + 1) & (workspace->equation_hash_capacity - 1);
        }
        if (duplicate) continue;
        if (retained_rows != source_row)
            for (slong column = 0; column < degree; column++)
                nmod_mat_entry(equations, retained_rows, column) =
                    nmod_mat_entry(equations, source_row, column);
        equation_hash_slots[slot] = retained_rows;
        retained_rows++;
    }
    SAGEJS_NF_ORDER_PROFILE_EQUATIONS(equation_rows, retained_rows);
    nmod_mat_t retained_equations;
    nmod_mat_window_init(
        retained_equations, equations, 0, 0, retained_rows, degree);
    const slong nullity = sagejs_nf_right_kernel_rows_with_columns(
        kernel, retained_equations, workspace->kernel_columns);
    nmod_mat_window_clear(retained_equations);
    return nullity;
}

static inline slong sagejs_nf_multiplier_kernel(
    nmod_mat_t kernel, const fmpz_mat_t *multiplication,
    const ulong *table_squared, const nmod_mat_t radical,
    slong radical_dimension, slong degree, ulong prime,
    sagejs_nf_multiplier_workspace *workspace)
{
#if defined(SAGEJS_NF_ORDER_FORCE_EXACT_MULTIPLIER)
    (void) table_squared;
    (void) workspace;
#else
    if (table_squared != NULL)
        return sagejs_nf_multiplier_kernel_mod_p2(
            kernel, table_squared, radical, radical_dimension,
            degree, prime, workspace);
#endif
    return sagejs_nf_multiplier_kernel_exact(
        kernel, multiplication, radical, radical_dimension,
        degree, prime);
}

/* Small Round-2 changes are sparse even when the multiplication matrices are
 * dense.  FLINT's general matrix product pays dispatch and temporary-allocation
 * costs at degrees 2--10, so apply the sparse factor explicitly while keeping
 * every accumulator as an exact fmpz. */
static inline void sagejs_nf_fmpz_addmul_sparse_coefficient(
    fmpz_t target, const fmpz_t value, const fmpz_t coefficient)
{
    if (*coefficient == 1)
        fmpz_add(target, target, value);
    else if (*coefficient == -1)
        fmpz_sub(target, target, value);
    else if (fmpz_fits_si(coefficient))
        fmpz_addmul_si(target, value, fmpz_get_si(coefficient));
    else
        fmpz_addmul(target, value, coefficient);
}

static inline void sagejs_nf_fmpz_mul_right_transpose_sparse(
    fmpz_mat_t result, const fmpz_mat_t left, const fmpz_mat_t right)
{
    const slong rows = fmpz_mat_nrows(left);
    const slong shared = fmpz_mat_ncols(left);
    const slong columns = fmpz_mat_nrows(right);
    fmpz_mat_zero(result);
    for (slong column = 0; column < columns; column++)
        for (slong source = 0; source < shared; source++)
        {
            const fmpz *coefficient = fmpz_mat_entry(right, column, source);
            if (fmpz_is_zero(coefficient)) continue;
            for (slong row = 0; row < rows; row++)
                sagejs_nf_fmpz_addmul_sparse_coefficient(
                    fmpz_mat_entry(result, row, column),
                    fmpz_mat_entry(left, row, source), coefficient);
        }
}

static inline void sagejs_nf_fmpz_mul_left_transpose_sparse(
    fmpz_mat_t result, const fmpz_mat_t left, const fmpz_mat_t right)
{
    const slong shared = fmpz_mat_nrows(left);
    const slong rows = fmpz_mat_ncols(left);
    const slong columns = fmpz_mat_ncols(right);
    fmpz_mat_zero(result);
    for (slong source = 0; source < shared; source++)
        for (slong row = 0; row < rows; row++)
        {
            const fmpz *coefficient = fmpz_mat_entry(left, source, row);
            if (fmpz_is_zero(coefficient)) continue;
            for (slong column = 0; column < columns; column++)
                sagejs_nf_fmpz_addmul_sparse_coefficient(
                    fmpz_mat_entry(result, row, column),
                    fmpz_mat_entry(right, source, column), coefficient);
        }
}

typedef struct
{
    slong degree;
    slong *pivots;
    unsigned char *is_pivot;
    fmpz_mat_t change_numerator;
    fmpz_mat_t inverse;
    fmpz_mat_t linear_combination;
    fmpz_mat_t temporary;
    fmpz_mat_t combined;
    fmpz_mat_t updated_basis;
    fmpz_mat_t *new_multiplication;
    fmpz *new_identity;
    fmpz_t prime_value;
    fmpz_t prime_squared;
    int word_multiplication_valid;
    int fmpz_multiplication_current;
#if defined(__SIZEOF_INT128__)
    __int128 *word_linear_combination;
    __int128 *word_temporary;
    slong *word_linear_combination_si;
    slong *word_temporary_si;
    slong *word_multiplication;
    slong *word_new_multiplication;
    slong *word_change;
    slong *word_inverse;
#endif
} sagejs_nf_change_basis_workspace;

static inline void sagejs_nf_change_basis_workspace_init(
    sagejs_nf_change_basis_workspace *workspace, slong degree)
{
    workspace->degree = degree;
    workspace->pivots =
        (slong *) flint_malloc((size_t) degree * sizeof(slong));
    workspace->is_pivot = (unsigned char *) flint_calloc(
        (size_t) degree, sizeof(unsigned char));
    fmpz_mat_init(workspace->change_numerator, degree, degree);
    fmpz_mat_init(workspace->inverse, degree, degree);
    fmpz_mat_init(workspace->linear_combination, degree, degree);
    fmpz_mat_init(workspace->temporary, degree, degree);
    fmpz_mat_init(workspace->combined, degree, degree);
    fmpz_mat_init(workspace->updated_basis, degree, degree);
    workspace->new_multiplication = (fmpz_mat_t *) flint_malloc(
        (size_t) degree * sizeof(fmpz_mat_t));
    for (slong index = 0; index < degree; index++)
        fmpz_mat_init(workspace->new_multiplication[index], degree, degree);
    workspace->new_identity = _fmpz_vec_init(degree);
    fmpz_init(workspace->prime_value);
    fmpz_init(workspace->prime_squared);
    workspace->word_multiplication_valid = 0;
    workspace->fmpz_multiplication_current = 1;
#if defined(__SIZEOF_INT128__)
    workspace->word_linear_combination = (__int128 *) flint_malloc(
        (size_t) degree * (size_t) degree * sizeof(__int128));
    workspace->word_temporary = (__int128 *) flint_malloc(
        (size_t) degree * (size_t) degree * sizeof(__int128));
    workspace->word_linear_combination_si = (slong *) flint_malloc(
        (size_t) degree * (size_t) degree * sizeof(slong));
    workspace->word_temporary_si = (slong *) flint_malloc(
        (size_t) degree * (size_t) degree * sizeof(slong));
    workspace->word_multiplication = (slong *) flint_malloc(
        (size_t) degree * (size_t) degree * (size_t) degree * sizeof(slong));
    workspace->word_new_multiplication = (slong *) flint_malloc(
        (size_t) degree * (size_t) degree * (size_t) degree * sizeof(slong));
    workspace->word_change = (slong *) flint_malloc(
        (size_t) degree * (size_t) degree * sizeof(slong));
    workspace->word_inverse = (slong *) flint_malloc(
        (size_t) degree * (size_t) degree * sizeof(slong));
#endif
}

static inline void sagejs_nf_change_basis_workspace_clear(
    sagejs_nf_change_basis_workspace *workspace)
{
#if defined(__SIZEOF_INT128__)
    flint_free(workspace->word_inverse);
    flint_free(workspace->word_change);
    flint_free(workspace->word_new_multiplication);
    flint_free(workspace->word_multiplication);
    flint_free(workspace->word_temporary_si);
    flint_free(workspace->word_linear_combination_si);
    flint_free(workspace->word_temporary);
    flint_free(workspace->word_linear_combination);
#endif
    fmpz_clear(workspace->prime_squared);
    fmpz_clear(workspace->prime_value);
    _fmpz_vec_clear(workspace->new_identity, workspace->degree);
    for (slong index = 0; index < workspace->degree; index++)
        fmpz_mat_clear(workspace->new_multiplication[index]);
    flint_free(workspace->new_multiplication);
    fmpz_mat_clear(workspace->updated_basis);
    fmpz_mat_clear(workspace->combined);
    fmpz_mat_clear(workspace->temporary);
    fmpz_mat_clear(workspace->linear_combination);
    fmpz_mat_clear(workspace->inverse);
    fmpz_mat_clear(workspace->change_numerator);
    flint_free(workspace->is_pivot);
    flint_free(workspace->pivots);
}

#if defined(__SIZEOF_INT128__)
static inline void sagejs_nf_change_basis_enable_word_multiplication(
    sagejs_nf_change_basis_workspace *workspace,
    const fmpz_mat_t *multiplication, slong degree)
{
    for (slong index = 0; index < degree; index++)
        for (slong row = 0; row < degree; row++)
            for (slong column = 0; column < degree; column++)
            {
                const fmpz *entry =
                    fmpz_mat_entry(multiplication[index], row, column);
                if (!fmpz_fits_si(entry))
                {
                    workspace->word_multiplication_valid = 0;
                    return;
                }
                workspace->word_multiplication[
                    (index * degree + row) * degree + column] =
                    fmpz_get_si(entry);
            }
    workspace->word_multiplication_valid = 1;
}

static inline void sagejs_nf_change_basis_sync_fmpz_multiplication(
    sagejs_nf_change_basis_workspace *workspace,
    fmpz_mat_t *multiplication, slong degree)
{
    if (!workspace->word_multiplication_valid ||
        workspace->fmpz_multiplication_current)
        return;
    for (slong index = 0; index < degree; index++)
        for (slong row = 0; row < degree; row++)
            for (slong column = 0; column < degree; column++)
                fmpz_set_si(
                    fmpz_mat_entry(multiplication[index], row, column),
                    workspace->word_multiplication[
                        (index * degree + row) * degree + column]);
    workspace->fmpz_multiplication_current = 1;
}

static inline ulong sagejs_nf_slong_fdiv_ui(slong value, ulong modulus)
{
    if ((modulus & (modulus - 1)) == 0)
        return ((ulong) value) & (modulus - 1);
    if (value >= 0) return ((ulong) value) % modulus;
    const ulong magnitude = (ulong) (-(value + 1)) + 1;
    const ulong remainder = magnitude % modulus;
    return remainder == 0 ? 0 : modulus - remainder;
}

static inline int sagejs_nf_change_basis_slong_transform(
    slong degree, ulong prime, sagejs_nf_change_basis_workspace *workspace)
{
    slong *linear = workspace->word_linear_combination_si;
    slong *temporary = workspace->word_temporary_si;
    const slong *word_multiplication = workspace->word_multiplication;
    slong *word_new_multiplication = workspace->word_new_multiplication;
    const slong *word_change = workspace->word_change;
    const slong *word_inverse = workspace->word_inverse;
    const slong divisor = (slong) (prime * prime);
    const size_t matrix_size = (size_t) degree * (size_t) degree;
    for (slong index = 0; index < degree; index++)
    {
        memset(linear, 0, matrix_size * sizeof(slong));
        for (slong source = 0; source < degree; source++)
        {
            const slong coefficient = word_change[index * degree + source];
            if (coefficient == 0) continue;
            const slong *source_matrix =
                word_multiplication + source * degree * degree;
            for (size_t entry = 0; entry < matrix_size; entry++)
                linear[entry] += coefficient * source_matrix[entry];
        }
        memset(temporary, 0, matrix_size * sizeof(slong));
        for (slong column = 0; column < degree; column++)
            for (slong source = 0; source < degree; source++)
            {
                const slong coefficient =
                    word_change[column * degree + source];
                if (coefficient == 0) continue;
                for (slong row = 0; row < degree; row++)
                    temporary[row * degree + column] +=
                        linear[row * degree + source] * coefficient;
            }
        memset(linear, 0, matrix_size * sizeof(slong));
        for (slong source = 0; source < degree; source++)
            for (slong row = 0; row < degree; row++)
            {
                const slong coefficient =
                    word_inverse[source * degree + row];
                if (coefficient == 0) continue;
                for (slong column = 0; column < degree; column++)
                    linear[row * degree + column] +=
                        coefficient * temporary[source * degree + column];
            }
        for (size_t entry = 0; entry < matrix_size; entry++)
        {
            const slong value = linear[entry];
            if (value % divisor != 0) return -1;
            word_new_multiplication[
                (size_t) index * matrix_size + entry] = value / divisor;
        }
    }
    slong *swap = workspace->word_multiplication;
    workspace->word_multiplication = workspace->word_new_multiplication;
    workspace->word_new_multiplication = swap;
    workspace->fmpz_multiplication_current = 0;
    return 1;
}

static inline int sagejs_nf_change_basis_word_transform(
    const fmpz_mat_t change_numerator, const fmpz_mat_t inverse,
    slong degree, ulong prime,
    sagejs_nf_change_basis_workspace *workspace)
{
    if (prime > (ulong) WORD_MAX ||
        !workspace->word_multiplication_valid)
        return 0;
    ulong maximum_bits = 0;
    const size_t multiplication_size =
        (size_t) degree * (size_t) degree * (size_t) degree;
    for (size_t entry = 0; entry < multiplication_size; entry++)
    {
        const slong value = workspace->word_multiplication[entry];
        const ulong magnitude = value < 0 ?
            (ulong) (-(value + 1)) + 1 : (ulong) value;
        const ulong bits = FLINT_BIT_COUNT(magnitude);
        if (bits > maximum_bits) maximum_bits = bits;
    }
    ulong change_bits = 0;
    ulong inverse_bits = 0;
    for (slong row = 0; row < degree; row++)
        for (slong column = 0; column < degree; column++)
        {
            const fmpz *change_entry =
                fmpz_mat_entry(change_numerator, row, column);
            const fmpz *inverse_entry = fmpz_mat_entry(inverse, row, column);
            if (!fmpz_fits_si(change_entry) || !fmpz_fits_si(inverse_entry))
                return 0;
            workspace->word_change[row * degree + column] =
                fmpz_get_si(change_entry);
            workspace->word_inverse[row * degree + column] =
                fmpz_get_si(inverse_entry);
            const ulong cbits = fmpz_bits(change_entry);
            const ulong ibits = fmpz_bits(inverse_entry);
            if (cbits > change_bits) change_bits = cbits;
            if (ibits > inverse_bits) inverse_bits = ibits;
        }
    const ulong sum_bits = FLINT_BIT_COUNT((ulong) degree) + 1;
    const ulong transform_bits = maximum_bits + 2 * change_bits +
        inverse_bits + 3 * sum_bits;
    if (transform_bits > 120)
        return 0;
    if (transform_bits <= FLINT_BITS - 2 &&
        prime <= (ulong) WORD_MAX / prime)
        return sagejs_nf_change_basis_slong_transform(
            degree, prime, workspace);

    __int128 *linear = workspace->word_linear_combination;
    __int128 *temporary = workspace->word_temporary;
    const slong *word_multiplication = workspace->word_multiplication;
    slong *word_new_multiplication = workspace->word_new_multiplication;
    const slong *word_change = workspace->word_change;
    const slong *word_inverse = workspace->word_inverse;
    const __int128 divisor = (__int128) prime * (__int128) prime;
    const size_t matrix_size = (size_t) degree * (size_t) degree;
    for (slong index = 0; index < degree; index++)
    {
        memset(linear, 0, matrix_size * sizeof(__int128));
        for (slong source = 0; source < degree; source++)
        {
            const slong coefficient = word_change[index * degree + source];
            if (coefficient == 0) continue;
            const slong *source_matrix =
                word_multiplication + source * degree * degree;
            for (size_t entry = 0; entry < matrix_size; entry++)
                linear[entry] +=
                    (__int128) coefficient * (__int128) source_matrix[entry];
        }
        memset(temporary, 0, matrix_size * sizeof(__int128));
        for (slong column = 0; column < degree; column++)
            for (slong source = 0; source < degree; source++)
            {
                const slong coefficient =
                    word_change[column * degree + source];
                if (coefficient == 0) continue;
                for (slong row = 0; row < degree; row++)
                    temporary[row * degree + column] +=
                        linear[row * degree + source] *
                        (__int128) coefficient;
            }
        memset(linear, 0, matrix_size * sizeof(__int128));
        for (slong source = 0; source < degree; source++)
            for (slong row = 0; row < degree; row++)
            {
                const slong coefficient =
                    word_inverse[source * degree + row];
                if (coefficient == 0) continue;
                for (slong column = 0; column < degree; column++)
                    linear[row * degree + column] +=
                        (__int128) coefficient *
                        temporary[source * degree + column];
            }
        for (slong row = 0; row < degree; row++)
            for (slong column = 0; column < degree; column++)
            {
                __int128 value = linear[row * degree + column];
                if (value % divisor != 0) return -1;
                value /= divisor;
                if (value < (__int128) WORD_MIN || value > (__int128) WORD_MAX)
                    return 0;
                word_new_multiplication[
                    (index * degree + row) * degree + column] = (slong) value;
            }
    }
    slong *swap = workspace->word_multiplication;
    workspace->word_multiplication = workspace->word_new_multiplication;
    workspace->word_new_multiplication = swap;
    workspace->fmpz_multiplication_current = 0;
    return 1;
}
#else
static inline void sagejs_nf_change_basis_enable_word_multiplication(
    sagejs_nf_change_basis_workspace *workspace,
    const fmpz_mat_t *multiplication, slong degree)
{
    (void) workspace;
    (void) multiplication;
    (void) degree;
}

static inline void sagejs_nf_change_basis_sync_fmpz_multiplication(
    sagejs_nf_change_basis_workspace *workspace,
    fmpz_mat_t *multiplication, slong degree)
{
    (void) workspace;
    (void) multiplication;
    (void) degree;
}
#endif

static inline int sagejs_nf_change_basis(
    fmpz_mat_t *multiplication, fmpz_mat_t total_basis_numerator,
    fmpz_t total_basis_denominator, fmpz *identity,
    const nmod_mat_t kernel, slong nullity, slong degree, ulong prime,
    sagejs_nf_change_basis_workspace *workspace)
{
    SAGEJS_NF_ORDER_PROFILE_BEGIN("basis-prepare");
    if (workspace->degree != degree) return 0;
    slong *pivots = workspace->pivots;
    unsigned char *is_pivot = workspace->is_pivot;
    fmpz_mat_struct *change_numerator = workspace->change_numerator;
    fmpz_mat_struct *inverse = workspace->inverse;
    fmpz_mat_struct *linear_combination = workspace->linear_combination;
    fmpz_mat_struct *temporary = workspace->temporary;
    fmpz_mat_struct *combined = workspace->combined;
    fmpz_mat_struct *updated_basis = workspace->updated_basis;
    fmpz_mat_zero(change_numerator);
    fmpz_mat_zero(inverse);
    memset(is_pivot, 0, (size_t) degree * sizeof(unsigned char));
    sagejs_nf_pivot_columns(pivots, kernel, nullity, degree);
    fmpz *prime_value = workspace->prime_value;
    fmpz_set_ui(prime_value, prime);
    fmpz *prime_squared = workspace->prime_squared;
    fmpz_mul(prime_squared, prime_value, prime_value);
    for (slong row = 0; row < nullity; row++)
    {
        is_pivot[pivots[row]] = 1;
        for (slong column = 0; column < degree; column++)
        {
            fmpz_set_ui(fmpz_mat_entry(change_numerator, row, column),
                nmod_mat_entry(kernel, row, column));
        }
    }
    slong row = nullity;
    for (slong column = 0; column < degree; column++)
        if (!is_pivot[column])
            fmpz_set(fmpz_mat_entry(change_numerator, row++, column),
                prime_value);

    /* The kernel rows are in RREF.  If P and N are its pivot and nonpivot
     * columns, the change numerator is [K; p I_N].  Build
     * p * change_numerator^-1 directly: old pivot vectors are p times their
     * new divided generators minus the nonpivot tail, while old nonpivot
     * vectors are retained verbatim. */
    slong nonpivot_row = nullity;
    for (slong column = 0; column < degree; column++)
    {
        if (is_pivot[column])
        {
            slong kernel_row = 0;
            while (kernel_row < nullity && pivots[kernel_row] != column)
                kernel_row++;
            if (kernel_row == nullity) goto fail;
            fmpz_set(fmpz_mat_entry(inverse, column, kernel_row),
                prime_value);
            slong target = nullity;
            for (slong tail = 0; tail < degree; tail++)
                if (!is_pivot[tail])
                {
                    fmpz_set_ui(fmpz_mat_entry(inverse, column, target),
                        nmod_mat_entry(kernel, kernel_row, tail));
                    fmpz_neg(fmpz_mat_entry(inverse, column, target),
                        fmpz_mat_entry(inverse, column, target));
                    target++;
                }
        }
        else
        {
            fmpz_one(fmpz_mat_entry(inverse, column, nonpivot_row));
            nonpivot_row++;
        }
    }

    /* Update identity coordinates: u_new = u_old * change^-1. */
    fmpz *new_identity = workspace->new_identity;
    for (slong column = 0; column < degree; column++)
    {
        fmpz_zero(new_identity + column);
        for (slong source = 0; source < degree; source++)
            sagejs_nf_fmpz_addmul_sparse_coefficient(
                new_identity + column, identity + source,
                fmpz_mat_entry(inverse, source, column));
    }
    for (slong i = 0; i < degree; i++) fmpz_set(identity + i, new_identity + i);
    SAGEJS_NF_ORDER_PROFILE_END("basis-prepare");
    SAGEJS_NF_ORDER_PROFILE_BEGIN("basis-transform");
    fmpz_mat_t *new_multiplication = workspace->new_multiplication;
    int word_transform = 0;
#if defined(__SIZEOF_INT128__) && \
    !defined(SAGEJS_NF_ORDER_FORCE_EXACT_CHANGE_BASIS)
    word_transform = sagejs_nf_change_basis_word_transform(
        change_numerator, inverse, degree, prime, workspace);
    if (word_transform < 0) goto fail;
#endif
    if (word_transform == 0)
    {
        sagejs_nf_change_basis_sync_fmpz_multiplication(
            workspace, multiplication, degree);
        for (slong i = 0; i < degree; i++)
        {
            int has_linear_term = 0;
            for (slong source = 0; source < degree; source++)
                if (!fmpz_is_zero(
                        fmpz_mat_entry(change_numerator, i, source)))
                {
                    const fmpz *coefficient =
                        fmpz_mat_entry(change_numerator, i, source);
                    if (!has_linear_term)
                    {
                        if (*coefficient == 1)
                            fmpz_mat_set(
                                linear_combination, multiplication[source]);
                        else if (fmpz_fits_si(coefficient))
                            fmpz_mat_scalar_mul_si(
                                linear_combination, multiplication[source],
                                fmpz_get_si(coefficient));
                        else
                            fmpz_mat_scalar_mul_fmpz(
                                linear_combination, multiplication[source],
                                coefficient);
                        has_linear_term = 1;
                    }
                    else if (fmpz_fits_si(coefficient))
                        fmpz_mat_scalar_addmul_si(
                            linear_combination, multiplication[source],
                            fmpz_get_si(coefficient));
                    else
                        fmpz_mat_scalar_addmul_fmpz(
                            linear_combination, multiplication[source],
                            coefficient);
                }
            if (!has_linear_term) goto fail;
            sagejs_nf_fmpz_mul_right_transpose_sparse(
                temporary, linear_combination, change_numerator);
            sagejs_nf_fmpz_mul_left_transpose_sparse(
                combined, inverse, temporary);
            for (slong r = 0; r < degree; r++)
                for (slong c = 0; c < degree; c++)
                {
                    const fmpz *entry = fmpz_mat_entry(combined, r, c);
                    if (!fmpz_divisible(entry, prime_squared))
                        goto fail;
                }
            fmpz_mat_scalar_divexact_fmpz(
                new_multiplication[i], combined, prime_squared);
        }
        for (slong i = 0; i < degree; i++)
            fmpz_mat_swap(multiplication[i], new_multiplication[i]);
        workspace->word_multiplication_valid = 0;
        workspace->fmpz_multiplication_current = 1;
    }
    SAGEJS_NF_ORDER_PROFILE_END("basis-transform");
    SAGEJS_NF_ORDER_PROFILE_BEGIN("basis-output");

    /* Retain one common exact denominator across the full multiplier cycle.
     * Per-entry rational canonicalisation is deferred to the single public
     * result publication. */
    fmpz_mat_zero(updated_basis);
    for (slong target = 0; target < degree; target++)
        for (slong source = 0; source < degree; source++)
        {
            const fmpz *coefficient =
                fmpz_mat_entry(change_numerator, target, source);
            if (fmpz_is_zero(coefficient)) continue;
            for (slong column = 0; column < degree; column++)
                sagejs_nf_fmpz_addmul_sparse_coefficient(
                    fmpz_mat_entry(updated_basis, target, column),
                    fmpz_mat_entry(total_basis_numerator, source, column),
                    coefficient);
        }
    fmpz_mat_swap(total_basis_numerator, updated_basis);
    fmpz_mul(total_basis_denominator, total_basis_denominator, prime_value);
    SAGEJS_NF_ORDER_PROFILE_END("basis-output");
    return 1;

fail:
    return 0;
}

static inline int sagejs_number_field_order_maximal_at_primes(
    sagejs_fmpq_matrix_t result,
    const sagejs_fmpz_matrix_t source,
    const uint64_t *prime_inputs,
    uint64_t prime_count)
{
    const slong rows = fmpz_mat_nrows(source->value);
    const slong degree = fmpz_mat_ncols(source->value);
    if (degree < 1 || rows != degree * degree || prime_count == 0)
        return 0;
    for (uint64_t index = 0; index < prime_count; index++)
        if (prime_inputs[index] < 2 ||
            prime_inputs[index] > (uint64_t) UWORD_MAX ||
            !n_is_prime((ulong) prime_inputs[index]))
            return 0;
    const size_t table_size = (size_t) degree * (size_t) degree * (size_t) degree;
    SAGEJS_NF_ORDER_PROFILE_BEGIN("setup");
    ulong *table = (ulong *) flint_malloc(table_size * sizeof(ulong));
    ulong *table_squared = (ulong *) flint_malloc(table_size * sizeof(ulong));
    fmpz_mat_t *multiplication = (fmpz_mat_t *) flint_malloc(
        (size_t) degree * sizeof(fmpz_mat_t));
    for (slong i = 0; i < degree; i++)
    {
        fmpz_mat_init(multiplication[i], degree, degree);
        for (slong j = 0; j < degree; j++)
            for (slong k = 0; k < degree; k++)
            {
                const fmpz *entry = fmpz_mat_entry(
                    source->value, i * degree + j, k);
                fmpz_set(fmpz_mat_entry(multiplication[i], k, j), entry);
            }
    }
    fmpz_mat_t basis_numerator;
    fmpz_mat_init(basis_numerator, degree, degree);
    fmpz_mat_one(basis_numerator);
    fmpz_t basis_denominator;
    fmpz_init(basis_denominator);
    fmpz_one(basis_denominator);
    fmpz *identity = _fmpz_vec_init(degree);
    fmpz_one(identity);
    sagejs_nf_change_basis_workspace change_workspace;
    sagejs_nf_change_basis_workspace_init(&change_workspace, degree);
    sagejs_nf_change_basis_enable_word_multiplication(
        &change_workspace, multiplication, degree);
    SAGEJS_NF_ORDER_PROFILE_END("setup");
    int success = 1;
    for (uint64_t prime_index = 0;
         prime_index < prime_count && success;
         prime_index++)
    {
        const ulong prime = (ulong) prime_inputs[prime_index];
        const ulong prime_inverse = n_preinvert_limb(prime);
        const int square_fits = prime <= UWORD_MAX / prime;
        const ulong prime_squared = square_fits ? prime * prime : 0;
        nmod_mat_t radical, kernel;
        nmod_mat_init(radical, degree, degree, prime);
        nmod_mat_init(kernel, degree, degree, prime);
        sagejs_nf_p_radical_workspace radical_workspace;
        sagejs_nf_p_radical_workspace_init(
            &radical_workspace, degree, prime);
        sagejs_nf_multiplier_workspace multiplier_workspace;
        sagejs_nf_multiplier_workspace_init(
            &multiplier_workspace, degree, prime);
        for (;;)
        {
            /* Refresh the compact modular table after each basis change. */
            SAGEJS_NF_ORDER_PROFILE_BEGIN("modular-table");
            for (slong i = 0; i < degree; i++)
                for (slong j = 0; j < degree; j++)
                    for (slong k = 0; k < degree; k++)
                    {
#if defined(__SIZEOF_INT128__)
                        if (change_workspace.word_multiplication_valid)
                        {
                            const slong entry =
                                change_workspace.word_multiplication[
                                    (i * degree + k) * degree + j];
                            if (square_fits)
                            {
                                const ulong squared =
                                    sagejs_nf_slong_fdiv_ui(
                                        entry, prime_squared);
                                table_squared[
                                    (i * degree + j) * degree + k] = squared;
                                table[(i * degree + j) * degree + k] =
                                    prime == 2 ? squared & 1 : squared % prime;
                            }
                            else
                                table[(i * degree + j) * degree + k] =
                                    sagejs_nf_slong_fdiv_ui(entry, prime);
                            continue;
                        }
#endif
                        const fmpz *entry =
                            fmpz_mat_entry(multiplication[i], k, j);
                        if (square_fits)
                        {
                            const ulong squared =
                                sagejs_nf_fmpz_fdiv_ui(entry, prime_squared);
                            table_squared[(i * degree + j) * degree + k] =
                                squared;
                            table[(i * degree + j) * degree + k] =
                                prime == 2 ? squared & 1 : squared % prime;
                        }
                        else
                            table[(i * degree + j) * degree + k] =
                                sagejs_nf_fmpz_fdiv_ui(entry, prime);
                    }
            SAGEJS_NF_ORDER_PROFILE_END("modular-table");
            slong radical_dimension;
            SAGEJS_NF_ORDER_PROFILE_BEGIN("radical");
            sagejs_nf_p_radical_with_workspace(
                radical, &radical_dimension, table,
                identity, degree, prime, prime_inverse, &radical_workspace);
            SAGEJS_NF_ORDER_PROFILE_END("radical");
            SAGEJS_NF_ORDER_PROFILE_BEGIN("multiplier");
#if defined(SAGEJS_NF_ORDER_FORCE_EXACT_MULTIPLIER)
            sagejs_nf_change_basis_sync_fmpz_multiplication(
                &change_workspace, multiplication, degree);
#else
            if (!square_fits)
                sagejs_nf_change_basis_sync_fmpz_multiplication(
                    &change_workspace, multiplication, degree);
#endif
            const slong nullity = sagejs_nf_multiplier_kernel(
                kernel, multiplication, square_fits ? table_squared : NULL,
                radical, radical_dimension,
                degree, prime, &multiplier_workspace);
            SAGEJS_NF_ORDER_PROFILE_END("multiplier");
            SAGEJS_NF_ORDER_PROFILE_ITERATION(radical_dimension, nullity);
            if (nullity < 0)
            {
                success = 0;
                break;
            }
            if (nullity == 0)
                break;
            const int changed = sagejs_nf_change_basis(
                multiplication, basis_numerator, basis_denominator, identity,
                kernel, nullity, degree, prime, &change_workspace);
            if (!changed)
            {
                success = 0;
                break;
            }
        }
        sagejs_nf_multiplier_workspace_clear(&multiplier_workspace);
        sagejs_nf_p_radical_workspace_clear(&radical_workspace);
        nmod_mat_clear(kernel);
        nmod_mat_clear(radical);
    }
    if (success)
    {
        SAGEJS_NF_ORDER_PROFILE_BEGIN("publish");
        if (!sagejs_fmpq_matrix_init(result, (uint64_t) degree, (uint64_t) degree))
            success = 0;
        else
        {
            for (slong row = 0; row < degree; row++)
                for (slong column = 0; column < degree; column++)
                {
                    fmpz_set(fmpq_numref(
                            fmpq_mat_entry(result->value, row, column)),
                        fmpz_mat_entry(basis_numerator, row, column));
                    fmpz_set(fmpq_denref(
                            fmpq_mat_entry(result->value, row, column)),
                        basis_denominator);
                    fmpq_canonicalise(
                        fmpq_mat_entry(result->value, row, column));
                }
            sagejs_fmpq_matrix_recompute_allocated_bytes(result);
        }
        SAGEJS_NF_ORDER_PROFILE_END("publish");
    }
    SAGEJS_NF_ORDER_PROFILE_BEGIN("cleanup");
    sagejs_nf_change_basis_workspace_clear(&change_workspace);
    _fmpz_vec_clear(identity, degree);
    fmpz_clear(basis_denominator);
    fmpz_mat_clear(basis_numerator);
    for (slong i = 0; i < degree; i++) fmpz_mat_clear(multiplication[i]);
    flint_free(multiplication);
    flint_free(table_squared);
    flint_free(table);
    SAGEJS_NF_ORDER_PROFILE_END("cleanup");
    return success;
}

static inline int sagejs_number_field_order_pmaximal(
    sagejs_fmpq_matrix_t result,
    const sagejs_fmpz_matrix_t source,
    uint64_t prime)
{
    return sagejs_number_field_order_maximal_at_primes(
        result, source, &prime, 1);
}

#endif
