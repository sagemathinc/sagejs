#include <limits.h>
#include <stdlib.h>
#include <string.h>

#include <flint/nmod_poly.h>
#include <flint/ulong_extras.h>
#include <gmp.h>

#ifdef SAGEJS_HAVE_RFOREST
#include <rforest.h>
#endif

#include <sagejs/hyperelliptic/rforest.h>
#include <sagejs/hyperelliptic/smalljac.h>

typedef struct {
    int c;
    int e;
    int dimension;
    mpz_t h[SAGEJS_RFOREST_MAX_DEGREE + 1];
} translated_model;

static uint64_t add_mod(uint64_t left, uint64_t right, uint64_t prime)
{
    uint64_t sum = left + right;
    return sum >= prime ? sum - prime : sum;
}

static uint64_t subtract_mod(uint64_t left, uint64_t right, uint64_t prime)
{
    return left >= right ? left - right : prime - (right - left);
}

static uint64_t multiply_mod(uint64_t left, uint64_t right, uint64_t prime)
{
    return (left * right) % prime;
}

static uint64_t power_mod(uint64_t value, uint64_t exponent, uint64_t prime)
{
    uint64_t result = 1;
    while (exponent != 0)
    {
        if (exponent & 1)
            result = multiply_mod(result, value, prime);
        value = multiply_mod(value, value, prime);
        exponent >>= 1;
    }
    return result;
}

static uint64_t inverse_mod(uint64_t value, uint64_t prime)
{
    return power_mod(value, prime - 2, prime);
}

static int legendre_symbol(uint64_t value, uint64_t prime)
{
    uint64_t symbol;
    value %= prime;
    if (value == 0)
        return 0;
    symbol = power_mod(value, (prime - 1) / 2, prime);
    return symbol == 1 ? 1 : -1;
}

static uint64_t signed_mod(int64_t value, uint64_t prime)
{
    uint64_t magnitude = value < 0
        ? UINT64_C(0) - (uint64_t) value
        : (uint64_t) value;
    uint64_t residue = magnitude % prime;
    return value < 0 && residue != 0 ? prime - residue : residue;
}

static void mpz_set_int64(mpz_t target, int64_t value)
{
    uint64_t magnitude = value < 0
        ? UINT64_C(0) - (uint64_t) value
        : (uint64_t) value;
    mpz_import(target, 1, -1, sizeof(magnitude), 0, 0, &magnitude);
    if (value < 0)
        mpz_neg(target, target);
}

static uint64_t small_binomial(unsigned n, unsigned k)
{
    uint64_t result = 1;
    if (k > n - k)
        k = n - k;
    for (unsigned index = 1; index <= k; index += 1)
        result = result * (n - k + index) / index;
    return result;
}

static uint64_t small_power(unsigned base, unsigned exponent)
{
    uint64_t result = 1;
    while (exponent-- != 0)
        result *= base;
    return result;
}

static void translated_model_init(translated_model *model)
{
    memset(model, 0, sizeof(*model));
    for (size_t index = 0; index <= SAGEJS_RFOREST_MAX_DEGREE; index += 1)
        mpz_init(model->h[index]);
}

static void translated_model_clear(translated_model *model)
{
    for (size_t index = 0; index <= SAGEJS_RFOREST_MAX_DEGREE; index += 1)
        mpz_clear(model->h[index]);
}

static void translate_model(
    translated_model *model,
    const int64_t *coefficients,
    size_t coefficient_count,
    unsigned translation)
{
    mpz_t term;
    mpz_t shifted[SAGEJS_RFOREST_MAX_DEGREE + 1];
    size_t degree = coefficient_count - 1;
    for (size_t index = 0; index <= SAGEJS_RFOREST_MAX_DEGREE; index += 1)
        mpz_init(shifted[index]);
    mpz_init(term);
    for (size_t output = 0; output <= degree; output += 1)
    {
        for (size_t input = output; input <= degree; input += 1)
        {
            mpz_set_int64(term, coefficients[input]);
            mpz_mul_ui(
                term, term,
                small_binomial((unsigned) input, (unsigned) output) *
                    small_power(translation, (unsigned) (input - output)));
            mpz_add(shifted[output], shifted[output], term);
        }
    }
    model->c = mpz_sgn(shifted[0]) == 0 ? 1 : 0;
    model->e = 2 - model->c;
    model->dimension = (int) degree - model->c;
    for (int index = 0; index <= model->dimension; index += 1)
        mpz_set(model->h[index], shifted[index + model->c]);
    mpz_clear(term);
    for (size_t index = 0; index <= SAGEJS_RFOREST_MAX_DEGREE; index += 1)
        mpz_clear(shifted[index]);
}

static uint64_t next_prime_at_least(uint64_t value)
{
    if (value <= 2)
        return 2;
    return (uint64_t) n_nextprime((ulong) (value - 1), 0);
}

static size_t prime_count(uint64_t start, uint64_t stop)
{
    size_t count = 0;
    uint64_t prime = next_prime_at_least(start);
    while (prime != 0 && prime <= stop)
    {
        count += 1;
        prime = (uint64_t) n_nextprime((ulong) prime, 0);
    }
    return count;
}

static int good_reduction(
    const int64_t *coefficients,
    size_t coefficient_count,
    uint8_t genus,
    uint64_t prime)
{
    nmod_poly_t polynomial;
    nmod_poly_t derivative;
    nmod_poly_t divisor;
    slong degree;
    int good;
    nmod_poly_init(polynomial, (ulong) prime);
    nmod_poly_init(derivative, (ulong) prime);
    nmod_poly_init(divisor, (ulong) prime);
    for (size_t index = 0; index < coefficient_count; index += 1)
        nmod_poly_set_coeff_ui(
            polynomial, (slong) index,
            (ulong) signed_mod(coefficients[index], prime));
    degree = nmod_poly_degree(polynomial);
    nmod_poly_derivative(derivative, polynomial);
    nmod_poly_gcd(divisor, polynomial, derivative);
    good = degree >= 2 * genus + 1 && degree <= 2 * genus + 2 &&
        nmod_poly_degree(divisor) == 0;
    nmod_poly_clear(divisor);
    nmod_poly_clear(derivative);
    nmod_poly_clear(polynomial);
    return good;
}

static uint64_t determinant3(const uint64_t *matrix, uint64_t prime)
{
    uint64_t positive = add_mod(
        add_mod(
            multiply_mod(matrix[0], multiply_mod(matrix[4], matrix[8], prime), prime),
            multiply_mod(matrix[1], multiply_mod(matrix[5], matrix[6], prime), prime),
            prime),
        multiply_mod(matrix[2], multiply_mod(matrix[3], matrix[7], prime), prime),
        prime);
    uint64_t negative = add_mod(
        add_mod(
            multiply_mod(matrix[2], multiply_mod(matrix[4], matrix[6], prime), prime),
            multiply_mod(matrix[1], multiply_mod(matrix[3], matrix[8], prime), prime),
            prime),
        multiply_mod(matrix[0], multiply_mod(matrix[5], matrix[7], prime), prime),
        prime);
    return subtract_mod(positive, negative, prime);
}

static void matrix_residues(
    const uint64_t *matrix,
    uint8_t genus,
    uint64_t prime,
    uint64_t *residues)
{
    uint64_t trace = 0;
    for (uint8_t index = 0; index < genus; index += 1)
        trace = add_mod(trace, matrix[index * genus + index], prime);
    residues[0] = trace == 0 ? 0 : prime - trace;
    if (genus == 2)
    {
        residues[1] = subtract_mod(
            multiply_mod(matrix[0], matrix[3], prime),
            multiply_mod(matrix[1], matrix[2], prime), prime);
        return;
    }
    residues[1] = add_mod(
        add_mod(
            subtract_mod(
                multiply_mod(matrix[0], matrix[4], prime),
                multiply_mod(matrix[1], matrix[3], prime), prime),
            subtract_mod(
                multiply_mod(matrix[0], matrix[8], prime),
                multiply_mod(matrix[2], matrix[6], prime), prime),
            prime),
        subtract_mod(
            multiply_mod(matrix[4], matrix[8], prime),
            multiply_mod(matrix[5], matrix[7], prime), prime),
        prime);
    {
        uint64_t determinant = determinant3(matrix, prime);
        residues[2] = determinant == 0 ? 0 : prime - determinant;
    }
}

static int direct_residues(
    const int64_t *coefficients,
    size_t coefficient_count,
    uint8_t genus,
    uint64_t prime,
    uint64_t *residues)
{
    nmod_poly_t polynomial;
    nmod_poly_t power;
    uint64_t matrix[SAGEJS_RFOREST_MAX_GENUS * SAGEJS_RFOREST_MAX_GENUS];
    slong truncation;
    if (prime > SAGEJS_RFOREST_DIRECT_MAX_PRIME)
        return 0;
    truncation = (slong) (genus * prime);
    nmod_poly_init(polynomial, (ulong) prime);
    nmod_poly_init(power, (ulong) prime);
    for (size_t index = 0; index < coefficient_count; index += 1)
        nmod_poly_set_coeff_ui(
            polynomial, (slong) index,
            (ulong) signed_mod(coefficients[index], prime));
    nmod_poly_pow_trunc(
        power, polynomial, (ulong) ((prime - 1) / 2), truncation);
    for (uint8_t row = 0; row < genus; row += 1)
        for (uint8_t column = 0; column < genus; column += 1)
            matrix[row * genus + column] = (uint64_t)
                nmod_poly_get_coeff_ui(
                    power,
                    (slong) (prime * (row + 1) - (column + 1)));
    matrix_residues(matrix, genus, prime, residues);
    nmod_poly_clear(power);
    nmod_poly_clear(polynomial);
    return 1;
}

static void initialize_mpz_array(mpz_t *values, size_t count)
{
    for (size_t index = 0; index < count; index += 1)
        mpz_init(values[index]);
}

static void clear_mpz_array(mpz_t *values, size_t count)
{
    for (size_t index = 0; index < count; index += 1)
        mpz_clear(values[index]);
}

static void integer_matrix_multiply(
    mpz_t *result, mpz_t *left, mpz_t *right, int dimension)
{
    mpz_t term;
    mpz_init(term);
    for (int row = 0; row < dimension; row += 1)
        for (int column = 0; column < dimension; column += 1)
        {
            mpz_set_ui(result[row * dimension + column], 0);
            for (int inner = 0; inner < dimension; inner += 1)
            {
                mpz_mul(
                    term, left[row * dimension + inner],
                    right[inner * dimension + column]);
                mpz_add(
                    result[row * dimension + column],
                    result[row * dimension + column], term);
            }
        }
    mpz_clear(term);
}

#ifdef SAGEJS_HAVE_RFOREST
static int run_transition_forest(
    const translated_model *model,
    const sagejs_rforest_batch *batch,
    const size_t *row_indices,
    size_t count,
    uint8_t genus,
    uint64_t *first_rows)
{
    int dimension = model->dimension;
    int degree = model->e == 1 ? 1 : 2;
    size_t matrix_size = (size_t) dimension * (size_t) dimension;
    mpz_t *a = calloc(matrix_size, sizeof(*a));
    mpz_t *b = calloc(matrix_size, sizeof(*b));
    mpz_t *left = calloc(matrix_size, sizeof(*left));
    mpz_t *work1 = calloc(matrix_size, sizeof(*work1));
    mpz_t *work2 = calloc(matrix_size, sizeof(*work2));
    mpz_t *polynomial = calloc(matrix_size * (degree + 1), sizeof(*polynomial));
    mpz_t *outputs = calloc(count * (size_t) dimension, sizeof(*outputs));
    mpz_t *moduli = calloc(count, sizeof(*moduli));
    mpz_t *vector = calloc((size_t) dimension, sizeof(*vector));
    long *endpoints = calloc(count, sizeof(*endpoints));
    mpz_t product;
    int ok = a != NULL && b != NULL && left != NULL && work1 != NULL &&
        work2 != NULL && polynomial != NULL && outputs != NULL &&
        moduli != NULL && vector != NULL && endpoints != NULL;
    if (!ok)
        goto cleanup_allocations;

    initialize_mpz_array(a, matrix_size);
    initialize_mpz_array(b, matrix_size);
    initialize_mpz_array(left, matrix_size);
    initialize_mpz_array(work1, matrix_size);
    initialize_mpz_array(work2, matrix_size);
    initialize_mpz_array(polynomial, matrix_size * (degree + 1));
    initialize_mpz_array(outputs, count * (size_t) dimension);
    initialize_mpz_array(moduli, count);
    initialize_mpz_array(vector, (size_t) dimension);
    mpz_init(product);

    for (int row = 1; row < dimension; row += 1)
        mpz_mul_ui(a[row * dimension + row - 1], model->h[0], 2);
    for (int row = 0; row < dimension; row += 1)
    {
        mpz_mul_ui(
            a[row * dimension + dimension - 1],
            model->h[dimension - row], 2);
        mpz_neg(
            a[row * dimension + dimension - 1],
            a[row * dimension + dimension - 1]);
        mpz_mul_ui(
            b[row * dimension + dimension - 1],
            model->h[dimension - row], (unsigned long) (dimension - row));
    }

    if (model->e == 1)
    {
        for (size_t index = 0; index < matrix_size; index += 1)
        {
            mpz_set(polynomial[index * 2], b[index]);
            mpz_set(polynomial[index * 2 + 1], a[index]);
        }
    }
    else
    {
        for (size_t index = 0; index < matrix_size; index += 1)
            mpz_sub(left[index], b[index], a[index]);
        integer_matrix_multiply(work1, left, b, dimension);
        integer_matrix_multiply(work2, left, a, dimension);
        integer_matrix_multiply(left, a, b, dimension);
        for (size_t index = 0; index < matrix_size; index += 1)
        {
            mpz_set(polynomial[index * 3], work1[index]);
            mpz_add(work2[index], work2[index], left[index]);
            mpz_mul_ui(polynomial[index * 3 + 1], work2[index], 2);
        }
        integer_matrix_multiply(work1, a, a, dimension);
        for (size_t index = 0; index < matrix_size; index += 1)
            mpz_mul_ui(polynomial[index * 3 + 2], work1[index], 4);
    }

    mpz_set_ui(vector[dimension - 1], 1);
    for (size_t index = 0; index < count; index += 1)
    {
        uint64_t prime = batch->rows[row_indices[index]].prime;
        mpz_set_ui(moduli[index], (unsigned long) prime);
        endpoints[index] = (long) ((prime + 1) / 2);
    }
    mproduct(product, moduli, (long) count);
    rforest(
        outputs, vector, 1, polynomial, degree, dimension, moduli, 1,
        endpoints, (long) count, product, 4);
    for (size_t index = 0; index < count; index += 1)
    {
        uint64_t prime = batch->rows[row_indices[index]].prime;
        uint64_t scale;
        if (model->e == 2)
        {
            uint64_t h0 = (uint64_t) mpz_fdiv_ui(model->h[0], (unsigned long) prime);
            scale = legendre_symbol(h0, prime) == 1 ? prime - 1 : 1;
        }
        else
        {
            /* Filled by the caller after the shared factorial forest. */
            scale = 1;
        }
        for (uint8_t column = 0; column < genus; column += 1)
            first_rows[index * genus + column] = multiply_mod(
                scale,
                (uint64_t) mpz_get_ui(
                    outputs[index * (size_t) dimension +
                        (size_t) dimension - column - 1]),
                prime);
    }

    mpz_clear(product);
    clear_mpz_array(vector, (size_t) dimension);
    clear_mpz_array(moduli, count);
    clear_mpz_array(outputs, count * (size_t) dimension);
    clear_mpz_array(polynomial, matrix_size * (degree + 1));
    clear_mpz_array(work2, matrix_size);
    clear_mpz_array(work1, matrix_size);
    clear_mpz_array(left, matrix_size);
    clear_mpz_array(b, matrix_size);
    clear_mpz_array(a, matrix_size);

cleanup_allocations:
    free(endpoints);
    free(vector);
    free(moduli);
    free(outputs);
    free(polynomial);
    free(work2);
    free(work1);
    free(left);
    free(b);
    free(a);
    return ok;
}

static int run_factorial_forest(
    const sagejs_rforest_batch *batch,
    const size_t *row_indices,
    size_t count,
    uint64_t *factorials)
{
    mpz_t polynomial[2];
    mpz_t vector[1];
    mpz_t product;
    mpz_t *outputs = calloc(count, sizeof(*outputs));
    mpz_t *moduli = calloc(count, sizeof(*moduli));
    long *endpoints = calloc(count, sizeof(*endpoints));
    int ok = outputs != NULL && moduli != NULL && endpoints != NULL;
    if (!ok)
        goto cleanup_allocations;
    initialize_mpz_array(polynomial, 2);
    initialize_mpz_array(vector, 1);
    initialize_mpz_array(outputs, count);
    initialize_mpz_array(moduli, count);
    mpz_init(product);
    mpz_set_ui(polynomial[1], 1);
    mpz_set_ui(vector[0], 1);
    for (size_t index = 0; index < count; index += 1)
    {
        uint64_t prime = batch->rows[row_indices[index]].prime;
        mpz_set_ui(moduli[index], (unsigned long) prime);
        endpoints[index] = (long) ((prime + 1) / 2);
    }
    mproduct(product, moduli, (long) count);
    rforest(
        outputs, vector, 1, polynomial, 1, 1, moduli, 1, endpoints,
        (long) count, product, 4);
    for (size_t index = 0; index < count; index += 1)
        factorials[index] = (uint64_t) mpz_get_ui(outputs[index]);
    mpz_clear(product);
    clear_mpz_array(moduli, count);
    clear_mpz_array(outputs, count);
    clear_mpz_array(vector, 1);
    clear_mpz_array(polynomial, 2);

cleanup_allocations:
    free(endpoints);
    free(moduli);
    free(outputs);
    return ok;
}
#endif

static uint64_t signed_small_power_mod(int value, unsigned exponent, uint64_t prime)
{
    uint64_t base = value < 0
        ? prime - ((uint64_t) (-value) % prime)
        : (uint64_t) value % prime;
    return power_mod(base, exponent, prime);
}

static int solve_vandermonde(
    uint64_t matrix[SAGEJS_RFOREST_MAX_GENUS][SAGEJS_RFOREST_MAX_GENUS],
    uint64_t values[SAGEJS_RFOREST_MAX_GENUS],
    uint8_t genus,
    uint64_t prime,
    uint64_t solution[SAGEJS_RFOREST_MAX_GENUS])
{
    for (uint8_t column = 0; column < genus; column += 1)
    {
        uint8_t pivot = column;
        while (pivot < genus && matrix[pivot][column] == 0)
            pivot += 1;
        if (pivot == genus)
            return 0;
        if (pivot != column)
        {
            for (uint8_t index = 0; index < genus; index += 1)
            {
                uint64_t temporary = matrix[column][index];
                matrix[column][index] = matrix[pivot][index];
                matrix[pivot][index] = temporary;
            }
            {
                uint64_t temporary = values[column];
                values[column] = values[pivot];
                values[pivot] = temporary;
            }
        }
        {
            uint64_t inverse = inverse_mod(matrix[column][column], prime);
            for (uint8_t index = column; index < genus; index += 1)
                matrix[column][index] = multiply_mod(
                    matrix[column][index], inverse, prime);
            values[column] = multiply_mod(values[column], inverse, prime);
        }
        for (uint8_t row = 0; row < genus; row += 1)
        {
            uint64_t factor;
            if (row == column)
                continue;
            factor = matrix[row][column];
            for (uint8_t index = column; index < genus; index += 1)
                matrix[row][index] = subtract_mod(
                    matrix[row][index],
                    multiply_mod(factor, matrix[column][index], prime),
                    prime);
            values[row] = subtract_mod(
                values[row], multiply_mod(factor, values[column], prime),
                prime);
        }
    }
    for (uint8_t index = 0; index < genus; index += 1)
        solution[index] = values[index];
    return 1;
}

static int reconstruct_residues(
    const uint64_t *first_rows,
    uint8_t genus,
    uint64_t prime,
    uint64_t *residues)
{
    uint64_t matrix[SAGEJS_RFOREST_MAX_GENUS * SAGEJS_RFOREST_MAX_GENUS] = {0};
    for (uint8_t column = 0; column < genus; column += 1)
    {
        uint64_t system[SAGEJS_RFOREST_MAX_GENUS][SAGEJS_RFOREST_MAX_GENUS];
        uint64_t values[SAGEJS_RFOREST_MAX_GENUS];
        uint64_t solution[SAGEJS_RFOREST_MAX_GENUS];
        for (uint8_t translation = 0; translation < genus; translation += 1)
        {
            uint64_t gamma = 0;
            for (uint8_t row = 0; row < genus; row += 1)
                for (uint8_t previous = 0; previous < column; previous += 1)
                {
                    uint64_t term = small_binomial(column, previous) % prime;
                    term = multiply_mod(
                        term,
                        signed_small_power_mod(
                            -(int) translation,
                            (unsigned) (column - previous), prime),
                        prime);
                    term = multiply_mod(
                        term, power_mod(translation, row, prime), prime);
                    term = multiply_mod(
                        term, matrix[row * genus + previous], prime);
                    gamma = add_mod(gamma, term, prime);
                }
            values[translation] = subtract_mod(
                first_rows[translation * genus + column], gamma, prime);
            for (uint8_t row = 0; row < genus; row += 1)
                system[translation][row] = power_mod(translation, row, prime);
        }
        if (!solve_vandermonde(system, values, genus, prime, solution))
            return 0;
        for (uint8_t row = 0; row < genus; row += 1)
            matrix[row * genus + column] = solution[row];
    }
    matrix_residues(matrix, genus, prime, residues);
    return 1;
}

static int exceptional_prime(
    const int64_t *coefficients,
    size_t coefficient_count,
    const translated_model *models,
    uint8_t genus,
    uint64_t prime)
{
    if (prime < genus)
        return 1;
    for (uint8_t left = 0; left < genus; left += 1)
        for (uint8_t right = left + 1; right < genus; right += 1)
            if ((right - left) % prime == 0)
                return 1;
    if (coefficient_count == (size_t) (2 * genus + 3) &&
        signed_mod(coefficients[coefficient_count - 1], prime) == 0)
        return 1;
    for (uint8_t index = 0; index < genus; index += 1)
        if (models[index].c == 0 &&
            mpz_fdiv_ui(models[index].h[0], (unsigned long) prime) == 0)
            return 1;
    return 0;
}

int sagejs_rforest_available(void)
{
#ifdef SAGEJS_HAVE_RFOREST
    return 1;
#else
    return 0;
#endif
}

const char *sagejs_rforest_backend_version(void)
{
    return sagejs_rforest_available() ? SAGEJS_RFOREST_VERSION : "unavailable";
}

const char *sagejs_rforest_status_name(int32_t status)
{
    switch (status)
    {
        case SAGEJS_RFOREST_STATUS_OK: return "ok";
        case SAGEJS_RFOREST_STATUS_TRUNCATED: return "truncated";
        case SAGEJS_RFOREST_STATUS_UNAVAILABLE: return "unavailable";
        case SAGEJS_RFOREST_STATUS_INVALID_ARGUMENT: return "invalid-argument";
        case SAGEJS_RFOREST_STATUS_UNSUPPORTED_MODEL: return "unsupported-model";
        case SAGEJS_RFOREST_STATUS_INVALID_INTERVAL: return "invalid-interval";
        case SAGEJS_RFOREST_STATUS_ALLOCATION_FAILED: return "allocation-failed";
        case SAGEJS_RFOREST_STATUS_INTERNAL_ERROR: return "internal-error";
        default: return "unknown";
    }
}

void sagejs_rforest_batch_clear(sagejs_rforest_batch *result)
{
    if (result == NULL)
        return;
    free(result->rows);
    memset(result, 0, sizeof(*result));
}

int32_t sagejs_rforest_hasse_witt_batch_compute(
    const int64_t *coefficients,
    size_t coefficient_count,
    uint8_t genus,
    uint64_t start,
    uint64_t stop,
    size_t maximum_rows,
    sagejs_rforest_batch *result)
{
    translated_model models[SAGEJS_RFOREST_MAX_GENUS];
    size_t *forest_rows = NULL;
    uint64_t *first_rows = NULL;
    uint64_t *factorials = NULL;
    size_t forest_count = 0;
    uint64_t prime;
    int needs_factorials = 0;
    int32_t status = SAGEJS_RFOREST_STATUS_OK;
    if (result == NULL)
        return SAGEJS_RFOREST_STATUS_INVALID_ARGUMENT;
    memset(result, 0, sizeof(*result));
    if (coefficients == NULL || (genus != 2 && genus != 3))
        return result->status = SAGEJS_RFOREST_STATUS_INVALID_ARGUMENT;
    if (coefficient_count != (size_t) (2 * genus + 2) &&
        coefficient_count != (size_t) (2 * genus + 3))
        return result->status = SAGEJS_RFOREST_STATUS_UNSUPPORTED_MODEL;
    if (coefficients[coefficient_count - 1] == 0)
        return result->status = SAGEJS_RFOREST_STATUS_UNSUPPORTED_MODEL;
    if (start < 2 || stop < start || stop > SAGEJS_RFOREST_MAX_PRIME)
        return result->status = SAGEJS_RFOREST_STATUS_INVALID_INTERVAL;
    if (!sagejs_rforest_available())
        return result->status = SAGEJS_RFOREST_STATUS_UNAVAILABLE;

    result->genus = genus;
    result->required_rows = prime_count(start, stop);
    result->row_count = result->required_rows;
    if (maximum_rows != 0 && result->row_count > maximum_rows)
    {
        result->row_count = maximum_rows;
        result->truncated = 1;
        status = SAGEJS_RFOREST_STATUS_TRUNCATED;
    }
    if (result->row_count != 0)
    {
        result->rows = calloc(result->row_count, sizeof(*result->rows));
        forest_rows = calloc(result->row_count, sizeof(*forest_rows));
        if (result->rows == NULL || forest_rows == NULL)
        {
            status = SAGEJS_RFOREST_STATUS_ALLOCATION_FAILED;
            goto cleanup;
        }
    }

    for (uint8_t index = 0; index < genus; index += 1)
    {
        translated_model_init(&models[index]);
        translate_model(
            &models[index], coefficients, coefficient_count, index);
        if (models[index].c == 1)
            needs_factorials = 1;
    }

    prime = next_prime_at_least(start);
    for (size_t row_index = 0; row_index < result->row_count; row_index += 1)
    {
        sagejs_rforest_row *row = &result->rows[row_index];
        row->prime = prime;
        if (prime == 2)
        {
            row->status = SAGEJS_RFOREST_ROW_UNSUPPORTED_CHARACTERISTIC;
        }
        else if (!good_reduction(
            coefficients, coefficient_count, genus, prime))
        {
            row->status = SAGEJS_RFOREST_ROW_SINGULAR_MODEL;
        }
        else if (exceptional_prime(
            coefficients, coefficient_count, models, genus, prime))
        {
            if (direct_residues(
                coefficients, coefficient_count, genus, prime,
                row->coefficients))
            {
                row->good = 1;
                row->coefficient_count = genus;
                row->status = SAGEJS_RFOREST_ROW_DIRECT;
            }
            else
            {
                row->status = SAGEJS_RFOREST_ROW_RESOURCE_LIMIT;
            }
        }
        else
        {
            forest_rows[forest_count++] = row_index;
        }
        prime = (uint64_t) n_nextprime((ulong) prime, 0);
    }

#ifdef SAGEJS_HAVE_RFOREST
    if (forest_count != 0)
    {
        size_t first_row_count = (size_t) genus * forest_count * genus;
        first_rows = calloc(first_row_count, sizeof(*first_rows));
        factorials = needs_factorials
            ? calloc(forest_count, sizeof(*factorials))
            : NULL;
        if (first_rows == NULL || (needs_factorials && factorials == NULL))
        {
            status = SAGEJS_RFOREST_STATUS_ALLOCATION_FAILED;
            goto cleanup_models;
        }
        sagejs_smalljac_lock();
        for (uint8_t translation = 0; translation < genus; translation += 1)
        {
            if (!run_transition_forest(
                &models[translation], result, forest_rows, forest_count,
                genus,
                first_rows + (size_t) translation * forest_count * genus))
            {
                sagejs_smalljac_unlock();
                status = SAGEJS_RFOREST_STATUS_ALLOCATION_FAILED;
                goto cleanup_models;
            }
        }
        if (needs_factorials && !run_factorial_forest(
            result, forest_rows, forest_count, factorials))
        {
            sagejs_smalljac_unlock();
            status = SAGEJS_RFOREST_STATUS_ALLOCATION_FAILED;
            goto cleanup_models;
        }
        sagejs_smalljac_unlock();

        for (size_t forest_index = 0; forest_index < forest_count;
             forest_index += 1)
        {
            sagejs_rforest_row *row = &result->rows[forest_rows[forest_index]];
            uint64_t translated_rows[
                SAGEJS_RFOREST_MAX_GENUS * SAGEJS_RFOREST_MAX_GENUS];
            for (uint8_t translation = 0; translation < genus; translation += 1)
            {
                uint64_t scale = 1;
                if (models[translation].e == 1)
                {
                    int chi2 = legendre_symbol(2, row->prime);
                    scale = multiply_mod(
                        chi2 == 1 ? 1 : row->prime - 1,
                        inverse_mod(factorials[forest_index], row->prime),
                        row->prime);
                }
                for (uint8_t column = 0; column < genus; column += 1)
                    translated_rows[translation * genus + column] =
                        multiply_mod(
                            scale,
                            first_rows[
                                ((size_t) translation * forest_count +
                                    forest_index) * genus + column],
                            row->prime);
            }
            if (!reconstruct_residues(
                translated_rows, genus, row->prime, row->coefficients))
            {
                status = SAGEJS_RFOREST_STATUS_INTERNAL_ERROR;
                goto cleanup_models;
            }
            row->good = 1;
            row->coefficient_count = genus;
            row->status = SAGEJS_RFOREST_ROW_FOREST;
        }
    }
#endif

cleanup_models:
    for (uint8_t index = 0; index < genus; index += 1)
        translated_model_clear(&models[index]);
cleanup:
    free(factorials);
    free(first_rows);
    free(forest_rows);
    if (status < 0)
    {
        sagejs_rforest_batch_clear(result);
        result->status = status;
        return status;
    }
    result->status = status;
    return status;
}
