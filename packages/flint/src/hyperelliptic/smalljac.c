#include <limits.h>
#include <stdlib.h>
#include <string.h>

#include <pthread.h>

#ifdef SAGEJS_HAVE_SMALLJAC
#include <ff_poly/polyparse.h>
#include <smalljac.h>
#endif

#include <sagejs/hyperelliptic/smalljac.h>

static pthread_mutex_t sagejs_smalljac_mutex = PTHREAD_MUTEX_INITIALIZER;

void sagejs_smalljac_lock(void)
{
    pthread_mutex_lock(&sagejs_smalljac_mutex);
}

void sagejs_smalljac_unlock(void)
{
    pthread_mutex_unlock(&sagejs_smalljac_mutex);
}

int sagejs_smalljac_available(void)
{
#ifdef SAGEJS_HAVE_SMALLJAC
    return 1;
#else
    return 0;
#endif
}

const char *sagejs_smalljac_backend_version(void)
{
#ifdef SAGEJS_HAVE_SMALLJAC
    return SMALLJAC_VERSION_STRING;
#else
    return "unavailable";
#endif
}

const char *sagejs_smalljac_status_name(int32_t status)
{
    switch (status)
    {
        case SAGEJS_SMALLJAC_STATUS_OK: return "ok";
        case SAGEJS_SMALLJAC_STATUS_TRUNCATED: return "truncated";
        case SAGEJS_SMALLJAC_STATUS_UNAVAILABLE: return "unavailable";
        case SAGEJS_SMALLJAC_STATUS_INVALID_ARGUMENT: return "invalid-argument";
        case SAGEJS_SMALLJAC_STATUS_PARSE_ERROR: return "parse-error";
        case SAGEJS_SMALLJAC_STATUS_UNSUPPORTED_CURVE: return "unsupported-curve";
        case SAGEJS_SMALLJAC_STATUS_SINGULAR_CURVE: return "singular-curve";
        case SAGEJS_SMALLJAC_STATUS_INVALID_INTERVAL: return "invalid-interval";
        case SAGEJS_SMALLJAC_STATUS_ALLOCATION_FAILED: return "allocation-failed";
        case SAGEJS_SMALLJAC_STATUS_CALLBACK_CANCELLED: return "callback-cancelled";
        case SAGEJS_SMALLJAC_STATUS_COEFFICIENT_RANGE: return "coefficient-range";
        case SAGEJS_SMALLJAC_STATUS_INTERNAL_ERROR: return "internal-error";
        default: return "unknown";
    }
}

static int32_t map_upstream_error(int32_t status)
{
#ifdef SAGEJS_HAVE_SMALLJAC
    switch (status)
    {
        case SMALLJAC_PARSE_ERROR: return SAGEJS_SMALLJAC_STATUS_PARSE_ERROR;
        case SMALLJAC_UNSUPPORTED_CURVE:
        case SMALLJAC_WRONG_GENUS:
            return SAGEJS_SMALLJAC_STATUS_UNSUPPORTED_CURVE;
        case SMALLJAC_SINGULAR_CURVE:
            return SAGEJS_SMALLJAC_STATUS_SINGULAR_CURVE;
        case SMALLJAC_INVALID_INTERVAL:
        case SMALLJAC_INVALID_PP:
            return SAGEJS_SMALLJAC_STATUS_INVALID_INTERVAL;
        default: return SAGEJS_SMALLJAC_STATUS_INTERNAL_ERROR;
    }
#else
    (void) status;
    return SAGEJS_SMALLJAC_STATUS_UNAVAILABLE;
#endif
}

static int invalid_common_arguments(
    const char *curve_text, uint64_t start, uint64_t stop)
{
    return curve_text == NULL || curve_text[0] == '\0' ||
        start < 2 || stop < start;
}

static size_t next_capacity(size_t current, size_t maximum, size_t item_size)
{
    size_t next = current == 0 ? 64 : current * 2;
    if (next < current || next > SIZE_MAX / item_size)
        next = SIZE_MAX / item_size;
    if (maximum != 0 && next > maximum)
        next = maximum;
    return next;
}

void sagejs_smalljac_lpoly_batch_clear(sagejs_smalljac_lpoly_batch *result)
{
    if (result == NULL)
        return;
    free(result->rows);
    memset(result, 0, sizeof(*result));
}

void sagejs_smalljac_group_batch_clear(sagejs_smalljac_group_batch *result)
{
    if (result == NULL)
        return;
    free(result->rows);
    memset(result, 0, sizeof(*result));
}

#ifdef SAGEJS_HAVE_SMALLJAC
#ifdef _WIN32
typedef uint64_t sagejs_smalljac_prime_t;
typedef int64_t sagejs_smalljac_coefficient_t;
typedef int64_t sagejs_smalljac_upstream_status_t;
#else
typedef unsigned long sagejs_smalljac_prime_t;
typedef long sagejs_smalljac_coefficient_t;
typedef long sagejs_smalljac_upstream_status_t;
#endif

typedef struct {
    mpq_t coefficients[SMALLJAC_MAX_DEGREE + 1];
} rational_polynomial;

static void rational_polynomial_set_zero(void *polynomial, int index)
{
    rational_polynomial *value = polynomial;
    mpq_set_ui(value->coefficients[index], 0, 1);
}

static int rational_polynomial_add(
    void *polynomial, int index, mpq_t coefficient, void *argument)
{
    rational_polynomial *value = polynomial;
    (void) argument;
    mpq_add(
        value->coefficients[index],
        value->coefficients[index],
        coefficient);
    return 1;
}

static int rational_polynomial_is_zero(void *polynomial, int index)
{
    rational_polynomial *value = polynomial;
    return mpq_sgn(value->coefficients[index]) == 0;
}

static int rational_polynomial_degree(char *expression, int maximum_degree)
{
    rational_polynomial polynomial;
    int degree;
    for (int index = 0; index <= SMALLJAC_MAX_DEGREE; index += 1)
        mpq_init(polynomial.coefficients[index]);
    degree = poly_parse(
        &polynomial, maximum_degree, expression,
        rational_polynomial_set_zero, rational_polynomial_add,
        rational_polynomial_is_zero, NULL);
    for (int index = 0; index <= SMALLJAC_MAX_DEGREE; index += 1)
        mpq_clear(polynomial.coefficients[index]);
    return degree;
}

/*
 * The public smalljac handle hides the normalized model degree, but the
 * public polynomial parser accepts the same expressions.  Determine the
 * degree of 4*f+h^2 before requesting a group so an unsupported even-degree
 * model never reaches smalljac's diagnostic path.
 */
static int hyperelliptic_model_degree(smalljac_curve_t curve)
{
    char *curve_text = smalljac_curve_str(curve);
    char *comma = strchr(curve_text, ',');
    int f_degree = rational_polynomial_degree(
        curve_text, SMALLJAC_MAX_DEGREE);
    int h_degree = comma == NULL
        ? -1
        : rational_polynomial_degree(
            comma + 1, (SMALLJAC_MAX_DEGREE + 1) / 2);
    if (f_degree < 0 || h_degree < -1)
        return -1;
    return f_degree > 2 * h_degree ? f_degree : 2 * h_degree;
}

typedef struct {
    sagejs_smalljac_lpoly_batch *batch;
    size_t capacity;
    size_t maximum_rows;
    int callback_failed;
} lpoly_callback_context;

static int lpoly_callback(
    smalljac_curve_t curve,
    sagejs_smalljac_prime_t prime,
    int good,
    sagejs_smalljac_coefficient_t coefficients[],
    int count,
    void *argument)
{
    lpoly_callback_context *context = argument;
    sagejs_smalljac_lpoly_batch *batch = context->batch;
    sagejs_smalljac_lpoly_row *row;
    (void) curve;

    batch->required_rows += 1;
    if (context->maximum_rows != 0 &&
        batch->row_count >= context->maximum_rows)
    {
        batch->truncated = 1;
        return 1;
    }
    if (batch->row_count == context->capacity)
    {
        size_t capacity = next_capacity(
            context->capacity, context->maximum_rows,
            sizeof(sagejs_smalljac_lpoly_row));
        sagejs_smalljac_lpoly_row *rows;
        if (capacity <= context->capacity)
        {
            batch->status = SAGEJS_SMALLJAC_STATUS_ALLOCATION_FAILED;
            context->callback_failed = 1;
            return 0;
        }
        rows = realloc(batch->rows, capacity * sizeof(*rows));
        if (rows == NULL)
        {
            batch->status = SAGEJS_SMALLJAC_STATUS_ALLOCATION_FAILED;
            context->callback_failed = 1;
            return 0;
        }
        batch->rows = rows;
        context->capacity = capacity;
    }

    row = &batch->rows[batch->row_count++];
    memset(row, 0, sizeof(*row));
    row->prime = (uint64_t) prime;
    row->good = good ? 1 : 0;
    row->status = good
        ? SAGEJS_SMALLJAC_ROW_GOOD
        : SAGEJS_SMALLJAC_ROW_BAD_REDUCTION;
    if (!good)
        return 1;
    if (coefficients == NULL || count != batch->genus || count != 2)
    {
        batch->status = SAGEJS_SMALLJAC_STATUS_INTERNAL_ERROR;
        context->callback_failed = 1;
        return 0;
    }
    row->coefficient_count = (uint8_t) count;
    if (coefficients[0] < INT64_C(-262144) ||
        coefficients[0] > INT64_C(262144) ||
        coefficients[1] < -(sagejs_smalljac_coefficient_t)
            (UINT64_C(6) * (uint64_t) prime) ||
        coefficients[1] > (sagejs_smalljac_coefficient_t)
            (UINT64_C(6) * (uint64_t) prime))
    {
        batch->status = SAGEJS_SMALLJAC_STATUS_COEFFICIENT_RANGE;
        context->callback_failed = 1;
        return 0;
    }
    for (int index = 0; index < count; index += 1)
        row->coefficients[index] = (int64_t) coefficients[index];
    return 1;
}

typedef struct {
    sagejs_smalljac_group_batch *batch;
    size_t capacity;
    size_t maximum_rows;
    int callback_failed;
} group_callback_context;

static int group_callback(
    smalljac_curve_t curve,
    sagejs_smalljac_prime_t prime,
    int good,
    sagejs_smalljac_coefficient_t invariants[],
    int count,
    void *argument)
{
    group_callback_context *context = argument;
    sagejs_smalljac_group_batch *batch = context->batch;
    sagejs_smalljac_group_row *row;
    (void) curve;

    batch->required_rows += 1;
    if (context->maximum_rows != 0 &&
        batch->row_count >= context->maximum_rows)
    {
        batch->truncated = 1;
        return 1;
    }
    if (batch->row_count == context->capacity)
    {
        size_t capacity = next_capacity(
            context->capacity, context->maximum_rows,
            sizeof(sagejs_smalljac_group_row));
        sagejs_smalljac_group_row *rows;
        if (capacity <= context->capacity)
        {
            batch->status = SAGEJS_SMALLJAC_STATUS_ALLOCATION_FAILED;
            context->callback_failed = 1;
            return 0;
        }
        rows = realloc(batch->rows, capacity * sizeof(*rows));
        if (rows == NULL)
        {
            batch->status = SAGEJS_SMALLJAC_STATUS_ALLOCATION_FAILED;
            context->callback_failed = 1;
            return 0;
        }
        batch->rows = rows;
        context->capacity = capacity;
    }

    row = &batch->rows[batch->row_count++];
    memset(row, 0, sizeof(*row));
    row->prime = (uint64_t) prime;
    row->good = good ? 1 : 0;
    row->status = good
        ? SAGEJS_SMALLJAC_ROW_GOOD
        : SAGEJS_SMALLJAC_ROW_BAD_REDUCTION;
    if (!good)
        return 1;
    if (invariants == NULL || count < 1 ||
        count > SAGEJS_SMALLJAC_MAX_GROUP_RANK)
    {
        batch->status = SAGEJS_SMALLJAC_STATUS_INTERNAL_ERROR;
        context->callback_failed = 1;
        return 0;
    }
    row->invariant_count = (uint8_t) count;
    uint64_t product = 1;
    for (int index = 0; index < count; index += 1)
    {
        uint64_t invariant;
        if (invariants[index] <= 0)
        {
            batch->status = SAGEJS_SMALLJAC_STATUS_COEFFICIENT_RANGE;
            context->callback_failed = 1;
            return 0;
        }
        invariant = (uint64_t) invariants[index];
        if ((index != 0 && invariant % row->invariants[index - 1] != 0) ||
            invariant > UINT64_MAX / product)
        {
            batch->status = SAGEJS_SMALLJAC_STATUS_COEFFICIENT_RANGE;
            context->callback_failed = 1;
            return 0;
        }
        product *= invariant;
        row->invariants[index] = invariant;
    }
    return 1;
}
#endif

int32_t sagejs_smalljac_lpoly_batch_compute(
    const char *curve_text,
    uint64_t start,
    uint64_t stop,
    size_t maximum_rows,
    sagejs_smalljac_lpoly_batch *result)
{
    if (result == NULL)
        return SAGEJS_SMALLJAC_STATUS_INVALID_ARGUMENT;
    memset(result, 0, sizeof(*result));
#ifndef SAGEJS_HAVE_SMALLJAC
    (void) curve_text;
    (void) start;
    (void) stop;
    (void) maximum_rows;
    result->status = SAGEJS_SMALLJAC_STATUS_UNAVAILABLE;
#else
    smalljac_curve_t curve;
    sagejs_smalljac_upstream_status_t status;
    lpoly_callback_context context;
    int error = 0;

    if (invalid_common_arguments(curve_text, start, stop))
        result->status = SAGEJS_SMALLJAC_STATUS_INVALID_ARGUMENT;
    else if (stop > SAGEJS_SMALLJAC_LPOLY_MAX_PRIME)
        result->status = SAGEJS_SMALLJAC_STATUS_INVALID_INTERVAL;
    else
    {
        sagejs_smalljac_lock();
        curve = smalljac_curve_init((char *) curve_text, &error);
        if (curve == NULL || error != 0)
        {
            result->upstream_status = error;
            result->status = error == 0
                ? SAGEJS_SMALLJAC_STATUS_PARSE_ERROR
                : map_upstream_error(error);
            sagejs_smalljac_unlock();
            return result->status;
        }
        result->genus = (uint8_t) smalljac_curve_genus(curve);
        if (result->genus != 2)
        {
            result->status = SAGEJS_SMALLJAC_STATUS_UNSUPPORTED_CURVE;
            smalljac_curve_clear(curve);
            sagejs_smalljac_unlock();
            return result->status;
        }
        memset(&context, 0, sizeof(context));
        context.batch = result;
        context.maximum_rows = maximum_rows;
        status = smalljac_Lpolys(
            curve, (sagejs_smalljac_prime_t) start,
            (sagejs_smalljac_prime_t) stop, 0,
            lpoly_callback, &context);
        result->upstream_status = (int64_t) status;
        smalljac_curve_clear(curve);
        sagejs_smalljac_unlock();
        if (context.callback_failed)
        {
            if (result->status == SAGEJS_SMALLJAC_STATUS_OK)
                result->status = SAGEJS_SMALLJAC_STATUS_CALLBACK_CANCELLED;
        }
        else if (status < 0)
            result->status = map_upstream_error((int32_t) status);
        else
            result->status = result->truncated
                ? SAGEJS_SMALLJAC_STATUS_TRUNCATED
                : SAGEJS_SMALLJAC_STATUS_OK;
    }
#endif
    return result->status;
}

int32_t sagejs_smalljac_group_batch_compute(
    const char *curve_text,
    uint64_t start,
    uint64_t stop,
    size_t maximum_rows,
    sagejs_smalljac_group_batch *result)
{
    if (result == NULL)
        return SAGEJS_SMALLJAC_STATUS_INVALID_ARGUMENT;
    memset(result, 0, sizeof(*result));
#ifndef SAGEJS_HAVE_SMALLJAC
    (void) curve_text;
    (void) start;
    (void) stop;
    (void) maximum_rows;
    result->status = SAGEJS_SMALLJAC_STATUS_UNAVAILABLE;
#else
    smalljac_curve_t curve;
    sagejs_smalljac_upstream_status_t status;
    group_callback_context context;
    int error = 0;

    if (invalid_common_arguments(curve_text, start, stop))
        result->status = SAGEJS_SMALLJAC_STATUS_INVALID_ARGUMENT;
    else if (stop > SAGEJS_SMALLJAC_GROUP_MAX_PRIME)
        result->status = SAGEJS_SMALLJAC_STATUS_INVALID_INTERVAL;
    else
    {
        sagejs_smalljac_lock();
        curve = smalljac_curve_init((char *) curve_text, &error);
        if (curve == NULL || error != 0)
        {
            result->upstream_status = error;
            result->status = error == 0
                ? SAGEJS_SMALLJAC_STATUS_PARSE_ERROR
                : map_upstream_error(error);
            sagejs_smalljac_unlock();
            return result->status;
        }
        result->genus = (uint8_t) smalljac_curve_genus(curve);
        if (result->genus != 2)
        {
            result->status = SAGEJS_SMALLJAC_STATUS_UNSUPPORTED_CURVE;
            smalljac_curve_clear(curve);
            sagejs_smalljac_unlock();
            return result->status;
        }
        int model_degree = hyperelliptic_model_degree(curve);
        if (model_degree < 0)
        {
            result->status = SAGEJS_SMALLJAC_STATUS_INTERNAL_ERROR;
            smalljac_curve_clear(curve);
            sagejs_smalljac_unlock();
            return result->status;
        }
        if ((model_degree & 1) == 0)
        {
            result->status = SAGEJS_SMALLJAC_STATUS_UNSUPPORTED_CURVE;
            result->upstream_status = SMALLJAC_UNSUPPORTED_CURVE;
            smalljac_curve_clear(curve);
            sagejs_smalljac_unlock();
            return result->status;
        }
        memset(&context, 0, sizeof(context));
        context.batch = result;
        context.maximum_rows = maximum_rows;
        status = smalljac_groups(
            curve, (sagejs_smalljac_prime_t) start,
            (sagejs_smalljac_prime_t) stop, 0,
            group_callback, &context);
        result->upstream_status = (int64_t) status;
        smalljac_curve_clear(curve);
        sagejs_smalljac_unlock();
        if (context.callback_failed)
        {
            if (result->status == SAGEJS_SMALLJAC_STATUS_OK)
                result->status = SAGEJS_SMALLJAC_STATUS_CALLBACK_CANCELLED;
        }
        else if (status < 0)
            result->status = map_upstream_error((int32_t) status);
        else
            result->status = result->truncated
                ? SAGEJS_SMALLJAC_STATUS_TRUNCATED
                : SAGEJS_SMALLJAC_STATUS_OK;
    }
#endif
    return result->status;
}
