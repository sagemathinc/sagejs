#include <limits.h>
#include <stdlib.h>
#include <string.h>

#include <gmp.h>

#include <flint/fmpz.h>
#include <flint/fmpz_factor.h>
#include <flint/nmod_poly.h>
#include <flint/ulong_extras.h>

#include <sagejs/hyperelliptic/genus3_jacobian.h>

typedef struct {
    nmod_poly_t f;
    nmod_poly_t h;
    nmod_poly_t completed_f;
    ulong prime;
    ulong inverse_two;
} g3j_model;

typedef struct {
    nmod_poly_t u;
    nmod_poly_t v;
} g3j_divisor;

typedef struct {
    uint64_t maximum;
    const _Atomic uint32_t *cancel;
    int32_t status;
    sagejs_g3j_diagnostics *diagnostics;
} g3j_budget;

typedef struct {
    uint64_t hash;
    uint64_t index;
    uint8_t occupied;
    g3j_divisor divisor;
} g3j_hash_entry;

static void diagnostics_zero(sagejs_g3j_diagnostics *diagnostics)
{
    if (diagnostics != NULL)
        memset(diagnostics, 0, sizeof(*diagnostics));
}

static int cancelled(const g3j_budget *budget)
{
    return budget->cancel != NULL &&
        atomic_load_explicit(budget->cancel, memory_order_relaxed) != 0;
}

static int consume_operation(g3j_budget *budget)
{
    if (cancelled(budget))
    {
        budget->status = SAGEJS_G3J_CANCELLED;
        return 0;
    }
    if (budget->diagnostics->group_operations >= budget->maximum)
    {
        budget->status = SAGEJS_G3J_RESOURCE_LIMIT;
        return 0;
    }
    budget->diagnostics->group_operations += 1;
    return 1;
}

static void model_init(g3j_model *model, ulong prime)
{
    model->prime = prime;
    model->inverse_two = n_invmod(2, prime);
    nmod_poly_init(model->f, prime);
    nmod_poly_init(model->h, prime);
    nmod_poly_init(model->completed_f, prime);
}

static void model_clear(g3j_model *model)
{
    nmod_poly_clear(model->completed_f);
    nmod_poly_clear(model->h);
    nmod_poly_clear(model->f);
}

static int32_t model_set(
    g3j_model *model,
    uint64_t prime,
    const uint64_t f[8],
    const uint64_t h[4])
{
    nmod_poly_t derivative;
    nmod_poly_t gcd;
    nmod_poly_t temporary;
    int32_t status = SAGEJS_G3J_OK;

    if (f == NULL || h == NULL || prime < 3 || (prime & 1) == 0 ||
        prime > SAGEJS_G3J_MAX_PRIME || !n_is_prime((ulong) prime))
        return SAGEJS_G3J_INVALID_ARGUMENT;

    model_init(model, (ulong) prime);
    for (size_t index = 0; index < 8; index += 1)
    {
        if (f[index] >= prime)
        {
            status = SAGEJS_G3J_INVALID_MODEL;
            goto done_without_temporaries;
        }
        nmod_poly_set_coeff_ui(model->f, (slong) index, (ulong) f[index]);
    }
    for (size_t index = 0; index < 4; index += 1)
    {
        if (h[index] >= prime)
        {
            status = SAGEJS_G3J_INVALID_MODEL;
            goto done_without_temporaries;
        }
        nmod_poly_set_coeff_ui(model->h, (slong) index, (ulong) h[index]);
    }
    if (nmod_poly_degree(model->f) != 7)
    {
        status = SAGEJS_G3J_INVALID_MODEL;
        goto done_without_temporaries;
    }

    nmod_poly_init(temporary, (ulong) prime);
    nmod_poly_init(derivative, (ulong) prime);
    nmod_poly_init(gcd, (ulong) prime);
    nmod_poly_scalar_mul_nmod(
        model->completed_f, model->f, (ulong) (4 % prime));
    nmod_poly_mul(temporary, model->h, model->h);
    nmod_poly_add(model->completed_f, model->completed_f, temporary);
    if (nmod_poly_degree(model->completed_f) != 7)
    {
        status = SAGEJS_G3J_INVALID_MODEL;
        goto done;
    }
    nmod_poly_derivative(derivative, model->completed_f);
    nmod_poly_gcd(gcd, model->completed_f, derivative);
    if (nmod_poly_degree(gcd) != 0)
        status = SAGEJS_G3J_INVALID_MODEL;

done:
    nmod_poly_clear(gcd);
    nmod_poly_clear(derivative);
    nmod_poly_clear(temporary);
done_without_temporaries:
    if (status != SAGEJS_G3J_OK)
        model_clear(model);
    return status;
}

static void divisor_init(g3j_divisor *divisor, ulong prime)
{
    nmod_poly_init(divisor->u, prime);
    nmod_poly_init(divisor->v, prime);
}

static void divisor_clear(g3j_divisor *divisor)
{
    nmod_poly_clear(divisor->v);
    nmod_poly_clear(divisor->u);
}

static void divisor_identity(g3j_divisor *divisor)
{
    nmod_poly_one(divisor->u);
    nmod_poly_zero(divisor->v);
}

static int divisor_is_identity(const g3j_divisor *divisor)
{
    return nmod_poly_is_one(divisor->u) && nmod_poly_is_zero(divisor->v);
}

static void divisor_set(g3j_divisor *target, const g3j_divisor *source)
{
    nmod_poly_set(target->u, source->u);
    nmod_poly_set(target->v, source->v);
}

static int divisor_equal(const g3j_divisor *left, const g3j_divisor *right)
{
    return nmod_poly_equal(left->u, right->u) &&
        nmod_poly_equal(left->v, right->v);
}

static void divisor_negate(g3j_divisor *target, const g3j_divisor *source)
{
    nmod_poly_set(target->u, source->u);
    nmod_poly_neg(target->v, source->v);
    nmod_poly_rem(target->v, target->v, target->u);
}

static int32_t divisor_from_packed(
    g3j_divisor *target,
    const sagejs_g3j_divisor *source,
    const g3j_model *model)
{
    nmod_poly_t original_v;
    nmod_poly_t check;
    nmod_poly_t temporary;
    int32_t status = SAGEJS_G3J_OK;

    if (source == NULL || source->u_degree > 3)
        return SAGEJS_G3J_INVALID_DIVISOR;
    for (size_t index = 0; index < 4; index += 1)
    {
        if (source->u[index] >= model->prime ||
            (index > source->u_degree && source->u[index] != 0))
            return SAGEJS_G3J_INVALID_DIVISOR;
    }
    for (size_t index = 0; index < 3; index += 1)
    {
        if (source->v[index] >= model->prime ||
            (index >= source->u_degree && source->v[index] != 0))
            return SAGEJS_G3J_INVALID_DIVISOR;
    }
    if (source->u[source->u_degree] != 1)
        return SAGEJS_G3J_INVALID_DIVISOR;

    nmod_poly_zero(target->u);
    for (size_t index = 0; index <= source->u_degree; index += 1)
        nmod_poly_set_coeff_ui(target->u, (slong) index, (ulong) source->u[index]);

    nmod_poly_init(original_v, model->prime);
    nmod_poly_init(check, model->prime);
    nmod_poly_init(temporary, model->prime);
    for (size_t index = 0; index < source->u_degree; index += 1)
        nmod_poly_set_coeff_ui(original_v, (slong) index, (ulong) source->v[index]);

    /* Verify the caller's generalized Mumford relation before mapping
     * v to 2v+h on the completed-square model. */
    nmod_poly_mul(check, original_v, original_v);
    nmod_poly_mul(temporary, model->h, original_v);
    nmod_poly_add(check, check, temporary);
    nmod_poly_sub(check, check, model->f);
    nmod_poly_rem(check, check, target->u);
    if (!nmod_poly_is_zero(check))
    {
        status = SAGEJS_G3J_INVALID_DIVISOR;
        goto done;
    }

    nmod_poly_scalar_mul_nmod(target->v, original_v, 2);
    nmod_poly_add(target->v, target->v, model->h);
    nmod_poly_rem(target->v, target->v, target->u);

done:
    nmod_poly_clear(temporary);
    nmod_poly_clear(check);
    nmod_poly_clear(original_v);
    return status;
}

static void divisor_to_packed(
    sagejs_g3j_divisor *target,
    const g3j_divisor *source,
    const g3j_model *model)
{
    nmod_poly_t original_v;
    memset(target, 0, sizeof(*target));
    target->u_degree = (uint8_t) nmod_poly_degree(source->u);
    for (slong index = 0; index <= nmod_poly_degree(source->u); index += 1)
        target->u[index] = (uint64_t) nmod_poly_get_coeff_ui(source->u, index);

    nmod_poly_init(original_v, model->prime);
    nmod_poly_sub(original_v, source->v, model->h);
    nmod_poly_scalar_mul_nmod(original_v, original_v, model->inverse_two);
    nmod_poly_rem(original_v, original_v, source->u);
    for (slong index = 0; index < nmod_poly_length(original_v) && index < 3; index += 1)
        target->v[index] = (uint64_t) nmod_poly_get_coeff_ui(original_v, index);
    nmod_poly_clear(original_v);
}

static void polynomial_exact_quotient(
    nmod_poly_t quotient,
    const nmod_poly_t numerator,
    const nmod_poly_t denominator)
{
    nmod_poly_divexact(quotient, numerator, denominator);
}

static void divisor_reduce(
    g3j_divisor *target,
    nmod_poly_t u,
    nmod_poly_t v,
    const g3j_model *model)
{
    nmod_poly_t numerator;
    nmod_poly_t quotient;
    nmod_poly_init(numerator, model->prime);
    nmod_poly_init(quotient, model->prime);
    while (nmod_poly_degree(u) > 3)
    {
        nmod_poly_mul(numerator, v, v);
        nmod_poly_sub(numerator, numerator, model->completed_f);
        polynomial_exact_quotient(quotient, numerator, u);
        nmod_poly_make_monic(u, quotient);
        nmod_poly_neg(v, v);
        nmod_poly_rem(v, v, u);
    }
    nmod_poly_make_monic(target->u, u);
    nmod_poly_rem(target->v, v, target->u);
    nmod_poly_clear(quotient);
    nmod_poly_clear(numerator);
}

static int32_t divisor_add_unchecked(
    g3j_divisor *target,
    const g3j_divisor *left,
    const g3j_divisor *right,
    const g3j_model *model)
{
    nmod_poly_t common0, common, coefficient0, coefficient1, right0;
    nmod_poly_t difference, conjugate, u3, v3, temporary0, temporary1;
    nmod_poly_init(common0, model->prime);
    nmod_poly_init(common, model->prime);
    nmod_poly_init(coefficient0, model->prime);
    nmod_poly_init(coefficient1, model->prime);
    nmod_poly_init(right0, model->prime);
    nmod_poly_init(difference, model->prime);
    nmod_poly_init(conjugate, model->prime);
    nmod_poly_init(u3, model->prime);
    nmod_poly_init(v3, model->prime);
    nmod_poly_init(temporary0, model->prime);
    nmod_poly_init(temporary1, model->prime);

    if (divisor_is_identity(left))
    {
        divisor_set(target, right);
        goto done;
    }
    if (divisor_is_identity(right))
    {
        divisor_set(target, left);
        goto done;
    }

    if (divisor_equal(left, right))
    {
        nmod_poly_scalar_mul_nmod(temporary0, left->v, 2);
        nmod_poly_xgcd(common, coefficient0, coefficient1, left->u, temporary0);
        polynomial_exact_quotient(temporary0, left->u, common);
        nmod_poly_mul(u3, temporary0, temporary0);
        nmod_poly_mul(temporary0, left->v, left->v);
        nmod_poly_sub(temporary0, model->completed_f, temporary0);
        polynomial_exact_quotient(temporary1, temporary0, common);
        nmod_poly_mul(temporary0, coefficient1, temporary1);
        nmod_poly_add(temporary0, temporary0, left->v);
        nmod_poly_rem(v3, temporary0, u3);
        divisor_reduce(target, u3, v3, model);
        goto done;
    }

    nmod_poly_xgcd(common0, coefficient0, right0, left->u, right->u);
    nmod_poly_sub(difference, left->v, right->v);
    if (nmod_poly_is_one(common0))
    {
        nmod_poly_mul(u3, left->u, right->u);
        nmod_poly_mul(temporary0, right0, right->u);
        nmod_poly_mul(temporary0, temporary0, difference);
        nmod_poly_add(temporary0, temporary0, right->v);
        nmod_poly_rem(v3, temporary0, u3);
        divisor_reduce(target, u3, v3, model);
        goto done;
    }

    nmod_poly_add(conjugate, left->v, right->v);
    if (nmod_poly_is_zero(conjugate))
    {
        nmod_poly_mul(temporary0, common0, common0);
        nmod_poly_mul(temporary1, left->u, right->u);
        polynomial_exact_quotient(u3, temporary1, temporary0);
        polynomial_exact_quotient(temporary0, right->u, common0);
        nmod_poly_mul(temporary0, temporary0, difference);
        nmod_poly_mul(temporary0, temporary0, right0);
        nmod_poly_add(temporary0, temporary0, right->v);
        nmod_poly_rem(v3, temporary0, u3);
        divisor_reduce(target, u3, v3, model);
        goto done;
    }

    nmod_poly_xgcd(common, coefficient0, coefficient1, common0, conjugate);
    nmod_poly_mul(temporary0, common, common);
    nmod_poly_mul(temporary1, left->u, right->u);
    polynomial_exact_quotient(u3, temporary1, temporary0);

    nmod_poly_mul(temporary0, coefficient0, right0);
    nmod_poly_mul(temporary0, temporary0, difference);
    nmod_poly_mul(temporary0, temporary0, right->u);
    nmod_poly_mul(temporary1, right->v, right->v);
    nmod_poly_sub(temporary1, model->completed_f, temporary1);
    nmod_poly_mul(temporary1, temporary1, coefficient1);
    nmod_poly_add(temporary0, temporary0, temporary1);
    polynomial_exact_quotient(temporary1, temporary0, common);
    nmod_poly_add(temporary1, temporary1, right->v);
    nmod_poly_rem(v3, temporary1, u3);
    divisor_reduce(target, u3, v3, model);

done:
    nmod_poly_clear(temporary1);
    nmod_poly_clear(temporary0);
    nmod_poly_clear(v3);
    nmod_poly_clear(u3);
    nmod_poly_clear(conjugate);
    nmod_poly_clear(difference);
    nmod_poly_clear(right0);
    nmod_poly_clear(coefficient1);
    nmod_poly_clear(coefficient0);
    nmod_poly_clear(common);
    nmod_poly_clear(common0);
    return SAGEJS_G3J_OK;
}

static int divisor_add(
    g3j_divisor *target,
    const g3j_divisor *left,
    const g3j_divisor *right,
    const g3j_model *model,
    g3j_budget *budget)
{
    g3j_divisor temporary;
    if (!consume_operation(budget))
        return 0;
    divisor_init(&temporary, model->prime);
    divisor_add_unchecked(&temporary, left, right, model);
    divisor_set(target, &temporary);
    divisor_clear(&temporary);
    return 1;
}

static int integer_to_fmpz(fmpz_t target, const sagejs_g3j_integer *source)
{
    mpz_t value;
    if (source == NULL || source->length > SAGEJS_G3J_INTEGER_BYTES)
        return 0;
    if (source->length > 0 && source->bytes[0] == 0)
        return 0;
    for (size_t index = source->length; index < SAGEJS_G3J_INTEGER_BYTES; index += 1)
        if (source->bytes[index] != 0)
            return 0;
    mpz_init(value);
    mpz_import(value, source->length, 1, 1, 1, 0, source->bytes);
    fmpz_set_mpz(target, value);
    mpz_clear(value);
    return 1;
}

static int fmpz_to_integer(sagejs_g3j_integer *target, const fmpz_t source)
{
    mpz_t value;
    size_t count = 0;
    memset(target, 0, sizeof(*target));
    if (fmpz_sgn(source) < 0 || fmpz_bits(source) > 8 * SAGEJS_G3J_INTEGER_BYTES)
        return 0;
    if (fmpz_is_zero(source))
        return 1;
    mpz_init(value);
    fmpz_get_mpz(value, source);
    mpz_export(target->bytes, &count, 1, 1, 1, 0, value);
    mpz_clear(value);
    if (count > SAGEJS_G3J_INTEGER_BYTES)
        return 0;
    target->length = (uint8_t) count;
    return 1;
}

static int scalar_multiply_fmpz(
    g3j_divisor *target,
    const g3j_divisor *source,
    const fmpz_t scalar,
    const g3j_model *model,
    g3j_budget *budget)
{
    g3j_divisor result, addend;
    slong bits;
    divisor_init(&result, model->prime);
    divisor_init(&addend, model->prime);
    divisor_identity(&result);
    divisor_set(&addend, source);
    bits = (slong) fmpz_bits(scalar);
    budget->diagnostics->scalar_bits += (uint64_t) bits;
    for (slong bit = 0; bit < bits; bit += 1)
    {
        if (fmpz_tstbit(scalar, (ulong) bit) &&
            !divisor_add(&result, &result, &addend, model, budget))
            goto failed;
        if (bit + 1 < bits &&
            !divisor_add(&addend, &addend, &addend, model, budget))
            goto failed;
    }
    divisor_set(target, &result);
    divisor_clear(&addend);
    divisor_clear(&result);
    return 1;
failed:
    divisor_clear(&addend);
    divisor_clear(&result);
    return 0;
}

static uint64_t divisor_hash(const g3j_divisor *divisor)
{
    uint64_t hash = UINT64_C(1469598103934665603);
    slong degree = nmod_poly_degree(divisor->u);
    hash = (hash ^ (uint64_t) degree) * UINT64_C(1099511628211);
    for (slong index = 0; index <= 3; index += 1)
    {
        hash ^= (uint64_t) nmod_poly_get_coeff_ui(divisor->u, index);
        hash *= UINT64_C(1099511628211);
    }
    for (slong index = 0; index <= 2; index += 1)
    {
        hash ^= (uint64_t) nmod_poly_get_coeff_ui(divisor->v, index);
        hash *= UINT64_C(1099511628211);
    }
    return hash;
}

static uint64_t next_power_of_two(uint64_t value)
{
    uint64_t answer = 1;
    while (answer < value && answer <= UINT64_MAX / 2)
        answer <<= 1;
    return answer;
}

static uint64_t ceil_sqrt_u64(uint64_t value)
{
    uint64_t low = 0, high = UINT64_C(1) << 32;
    while (low + 1 < high)
    {
        uint64_t middle = low + (high - low) / 2;
        if (middle != 0 && middle > value / middle)
            high = middle;
        else if (middle * middle == value)
            return middle;
        else
            low = middle;
    }
    return high;
}

static int hash_insert(
    g3j_hash_entry *table,
    uint64_t mask,
    const g3j_divisor *divisor,
    uint64_t index,
    sagejs_g3j_diagnostics *diagnostics)
{
    uint64_t hash = divisor_hash(divisor);
    uint64_t position = hash & mask;
    while (table[position].occupied)
    {
        diagnostics->hash_collisions += 1;
        if (table[position].hash == hash &&
            divisor_equal(&table[position].divisor, divisor))
            return 1;
        position = (position + 1) & mask;
    }
    table[position].occupied = 1;
    table[position].hash = hash;
    table[position].index = index;
    divisor_set(&table[position].divisor, divisor);
    return 1;
}

static int hash_find(
    const g3j_hash_entry *table,
    uint64_t mask,
    const g3j_divisor *divisor,
    uint64_t *index,
    sagejs_g3j_diagnostics *diagnostics)
{
    uint64_t hash = divisor_hash(divisor);
    uint64_t position = hash & mask;
    while (table[position].occupied)
    {
        if (table[position].hash == hash &&
            divisor_equal(&table[position].divisor, divisor))
        {
            *index = table[position].index;
            return 1;
        }
        diagnostics->hash_collisions += 1;
        position = (position + 1) & mask;
    }
    return 0;
}

static int32_t factor_and_strip(
    sagejs_g3j_certificate *certificate,
    const fmpz_t multiple,
    const g3j_divisor *divisor,
    const g3j_model *model,
    g3j_budget *budget)
{
    fmpz_factor_t factorization;
    fmpz_t order, quotient;
    g3j_divisor product;
    int32_t status = SAGEJS_G3J_OK;
    fmpz_factor_init(factorization);
    fmpz_init(order);
    fmpz_init(quotient);
    divisor_init(&product, model->prime);
    fmpz_set(order, multiple);
    fmpz_factor(factorization, multiple);
    if (factorization->num > SAGEJS_G3J_MAX_FACTORS)
    {
        status = SAGEJS_G3J_INTERNAL_ERROR;
        goto done;
    }

    for (slong index = 0; index < factorization->num; index += 1)
    {
        ulong removed = 0;
        for (ulong exponent = 0; exponent < factorization->exp[index]; exponent += 1)
        {
            fmpz_divexact(quotient, order, factorization->p + index);
            if (!scalar_multiply_fmpz(
                    &product, divisor, quotient, model, budget))
            {
                status = budget->status;
                goto done;
            }
            if (!divisor_is_identity(&product))
                break;
            fmpz_set(order, quotient);
            removed += 1;
        }
        factorization->exp[index] -= removed;
    }

    if (!fmpz_to_integer(&certificate->annihilating_multiple, multiple) ||
        !fmpz_to_integer(&certificate->element_order, order))
    {
        status = SAGEJS_G3J_INTERNAL_ERROR;
        goto done;
    }
    certificate->factor_count = 0;
    for (slong index = 0; index < factorization->num; index += 1)
    {
        if (factorization->exp[index] == 0)
            continue;
        size_t output = certificate->factor_count++;
        if (!fmpz_to_integer(
                &certificate->factor_primes[output], factorization->p + index) ||
            factorization->exp[index] > UINT8_MAX)
        {
            status = SAGEJS_G3J_INTERNAL_ERROR;
            goto done;
        }
        certificate->factor_exponents[output] =
            (uint8_t) factorization->exp[index];
    }

done:
    divisor_clear(&product);
    fmpz_clear(quotient);
    fmpz_clear(order);
    fmpz_factor_clear(factorization);
    return status;
}

int32_t sagejs_g3j_validate(
    uint64_t prime,
    const uint64_t f[8],
    const uint64_t h[4],
    const sagejs_g3j_divisor *divisor)
{
    g3j_model model;
    g3j_divisor internal;
    int32_t status = model_set(&model, prime, f, h);
    if (status != SAGEJS_G3J_OK)
        return status;
    divisor_init(&internal, model.prime);
    status = divisor_from_packed(&internal, divisor, &model);
    divisor_clear(&internal);
    model_clear(&model);
    return status;
}

int32_t sagejs_g3j_scalar_multiply(
    uint64_t prime,
    const uint64_t f[8],
    const uint64_t h[4],
    const sagejs_g3j_divisor *divisor,
    const sagejs_g3j_integer *scalar,
    uint64_t max_group_operations,
    const _Atomic uint32_t *cancel,
    sagejs_g3j_divisor *result,
    sagejs_g3j_diagnostics *diagnostics)
{
    g3j_model model;
    g3j_divisor input, output;
    fmpz_t exponent;
    g3j_budget budget;
    int32_t status;
    if (result == NULL || diagnostics == NULL)
        return SAGEJS_G3J_INVALID_ARGUMENT;
    diagnostics_zero(diagnostics);
    status = model_set(&model, prime, f, h);
    if (status != SAGEJS_G3J_OK)
        return status;
    divisor_init(&input, model.prime);
    divisor_init(&output, model.prime);
    fmpz_init(exponent);
    status = divisor_from_packed(&input, divisor, &model);
    if (status != SAGEJS_G3J_OK || !integer_to_fmpz(exponent, scalar))
    {
        if (status == SAGEJS_G3J_OK)
            status = SAGEJS_G3J_INVALID_ARGUMENT;
        goto done;
    }
    budget.maximum = max_group_operations;
    budget.cancel = cancel;
    budget.status = SAGEJS_G3J_OK;
    budget.diagnostics = diagnostics;
    if (!scalar_multiply_fmpz(&output, &input, exponent, &model, &budget))
    {
        status = budget.status;
        goto done;
    }
    divisor_to_packed(result, &output, &model);
done:
    fmpz_clear(exponent);
    divisor_clear(&output);
    divisor_clear(&input);
    model_clear(&model);
    return status;
}

int32_t sagejs_g3j_sum(
    uint64_t prime,
    const uint64_t f[8],
    const uint64_t h[4],
    const sagejs_g3j_divisor *divisors,
    uint64_t divisor_count,
    uint64_t max_group_operations,
    const _Atomic uint32_t *cancel,
    sagejs_g3j_divisor *result,
    sagejs_g3j_diagnostics *diagnostics)
{
    g3j_model model;
    g3j_divisor accumulator, input;
    g3j_budget budget;
    int32_t status;
    if (result == NULL || diagnostics == NULL ||
        (divisor_count > 0 && divisors == NULL))
        return SAGEJS_G3J_INVALID_ARGUMENT;
    diagnostics_zero(diagnostics);
    status = model_set(&model, prime, f, h);
    if (status != SAGEJS_G3J_OK)
        return status;
    divisor_init(&accumulator, model.prime);
    divisor_init(&input, model.prime);
    divisor_identity(&accumulator);
    budget.maximum = max_group_operations;
    budget.cancel = cancel;
    budget.status = SAGEJS_G3J_OK;
    budget.diagnostics = diagnostics;
    for (uint64_t index = 0; index < divisor_count; index += 1)
    {
        status = divisor_from_packed(&input, divisors + index, &model);
        if (status != SAGEJS_G3J_OK ||
            !divisor_add(&accumulator, &accumulator, &input, &model, &budget))
        {
            if (status == SAGEJS_G3J_OK)
                status = budget.status;
            goto done;
        }
    }
    divisor_to_packed(result, &accumulator, &model);
done:
    divisor_clear(&input);
    divisor_clear(&accumulator);
    model_clear(&model);
    return status;
}

int32_t sagejs_g3j_filter_orders(
    uint64_t prime,
    const uint64_t f[8],
    const uint64_t h[4],
    const sagejs_g3j_divisor *divisors,
    uint64_t divisor_count,
    const sagejs_g3j_integer *candidates,
    uint64_t candidate_count,
    uint64_t max_group_operations,
    const _Atomic uint32_t *cancel,
    uint8_t *outcomes,
    sagejs_g3j_diagnostics *diagnostics)
{
    g3j_model model;
    g3j_divisor *inputs = NULL;
    g3j_divisor product;
    fmpz_t candidate;
    g3j_budget budget;
    int32_t status;
    if ((divisor_count > 0 && divisors == NULL) ||
        (candidate_count > 0 && (candidates == NULL || outcomes == NULL)) ||
        diagnostics == NULL || divisor_count > SIZE_MAX / sizeof(*inputs))
        return SAGEJS_G3J_INVALID_ARGUMENT;
    diagnostics_zero(diagnostics);
    if (candidate_count > 0)
        memset(outcomes, 2, (size_t) candidate_count);
    status = model_set(&model, prime, f, h);
    if (status != SAGEJS_G3J_OK)
        return status;
    inputs = calloc((size_t) divisor_count, sizeof(*inputs));
    if (divisor_count > 0 && inputs == NULL)
    {
        model_clear(&model);
        return SAGEJS_G3J_ALLOCATION_FAILED;
    }
    for (uint64_t index = 0; index < divisor_count; index += 1)
    {
        divisor_init(inputs + index, model.prime);
        status = divisor_from_packed(inputs + index, divisors + index, &model);
        if (status != SAGEJS_G3J_OK)
        {
            for (uint64_t clear = 0; clear <= index; clear += 1)
                divisor_clear(inputs + clear);
            free(inputs);
            model_clear(&model);
            return status;
        }
    }
    divisor_init(&product, model.prime);
    fmpz_init(candidate);
    budget.maximum = max_group_operations;
    budget.cancel = cancel;
    budget.status = SAGEJS_G3J_OK;
    budget.diagnostics = diagnostics;
    for (uint64_t index = 0; index < candidate_count; index += 1)
    {
        int annihilates = 1;
        if (!integer_to_fmpz(candidate, candidates + index) ||
            fmpz_sgn(candidate) <= 0)
        {
            status = SAGEJS_G3J_INVALID_ARGUMENT;
            goto done;
        }
        for (uint64_t element = 0; element < divisor_count; element += 1)
        {
            if (!scalar_multiply_fmpz(
                    &product, inputs + element, candidate, &model, &budget))
            {
                status = budget.status;
                goto done;
            }
            if (!divisor_is_identity(&product))
            {
                annihilates = 0;
                break;
            }
        }
        outcomes[index] = annihilates ? 1 : 0;
        diagnostics->candidates_tested += 1;
    }
    status = SAGEJS_G3J_OK;
done:
    fmpz_clear(candidate);
    divisor_clear(&product);
    for (uint64_t index = 0; index < divisor_count; index += 1)
        divisor_clear(inputs + index);
    free(inputs);
    model_clear(&model);
    return status;
}

int32_t sagejs_g3j_search_progression(
    uint64_t prime,
    const uint64_t f[8],
    const uint64_t h[4],
    const sagejs_g3j_divisor *divisor,
    const sagejs_g3j_integer *base,
    const sagejs_g3j_integer *stride,
    uint64_t count,
    uint64_t max_baby_steps,
    uint64_t max_group_operations,
    const _Atomic uint32_t *cancel,
    sagejs_g3j_certificate *certificate)
{
    g3j_model model;
    g3j_divisor input, base_product, step, baby, giant_step, target;
    g3j_hash_entry *table = NULL;
    fmpz_t base_value, stride_value, multiple, maximum;
    g3j_budget budget;
    uint64_t baby_count, table_size, mask, giant_count, found_index = 0;
    int found = 0;
    int32_t status;
    if (certificate == NULL || count == 0 || max_baby_steps == 0)
        return SAGEJS_G3J_INVALID_ARGUMENT;
    memset(certificate, 0, sizeof(*certificate));
    certificate->status = SAGEJS_G3J_INTERNAL_ERROR;
    status = model_set(&model, prime, f, h);
    if (status != SAGEJS_G3J_OK)
        goto return_status;
    divisor_init(&input, model.prime);
    divisor_init(&base_product, model.prime);
    divisor_init(&step, model.prime);
    divisor_init(&baby, model.prime);
    divisor_init(&giant_step, model.prime);
    divisor_init(&target, model.prime);
    fmpz_init(base_value);
    fmpz_init(stride_value);
    fmpz_init(multiple);
    fmpz_init(maximum);
    status = divisor_from_packed(&input, divisor, &model);
    if (status != SAGEJS_G3J_OK || !integer_to_fmpz(base_value, base) ||
        !integer_to_fmpz(stride_value, stride) || fmpz_sgn(base_value) < 0 ||
        fmpz_sgn(stride_value) <= 0)
    {
        if (status == SAGEJS_G3J_OK)
            status = SAGEJS_G3J_INVALID_ARGUMENT;
        goto done;
    }
    /* Check the greatest possible value before any allocation or search. */
    fmpz_mul_ui(maximum, stride_value, (ulong) (count - 1));
    fmpz_add(maximum, maximum, base_value);
    if (fmpz_bits(maximum) > 8 * SAGEJS_G3J_INTEGER_BYTES)
    {
        status = SAGEJS_G3J_INVALID_ARGUMENT;
        goto done;
    }

    budget.maximum = max_group_operations;
    budget.cancel = cancel;
    budget.status = SAGEJS_G3J_OK;
    budget.diagnostics = &certificate->diagnostics;
    baby_count = ceil_sqrt_u64(count);
    if (baby_count > max_baby_steps)
    {
        status = SAGEJS_G3J_RESOURCE_LIMIT;
        goto done;
    }
    if (baby_count > (UINT64_MAX - 1) / 2)
    {
        status = SAGEJS_G3J_RESOURCE_LIMIT;
        goto done;
    }
    table_size = next_power_of_two(2 * baby_count + 1);
    if (table_size == 0 || table_size > SIZE_MAX / sizeof(*table))
    {
        status = SAGEJS_G3J_RESOURCE_LIMIT;
        goto done;
    }
    table = calloc((size_t) table_size, sizeof(*table));
    if (table == NULL)
    {
        status = SAGEJS_G3J_ALLOCATION_FAILED;
        goto done;
    }
    for (uint64_t index = 0; index < table_size; index += 1)
        divisor_init(&table[index].divisor, model.prime);
    mask = table_size - 1;

    if (!scalar_multiply_fmpz(
            &base_product, &input, base_value, &model, &budget) ||
        !scalar_multiply_fmpz(&step, &input, stride_value, &model, &budget))
    {
        status = budget.status;
        goto done;
    }
    divisor_identity(&baby);
    for (uint64_t index = 0; index < baby_count; index += 1)
    {
        hash_insert(table, mask, &baby, index, &certificate->diagnostics);
        certificate->diagnostics.baby_steps += 1;
        if (index + 1 < baby_count &&
            !divisor_add(&baby, &baby, &step, &model, &budget))
        {
            status = budget.status;
            goto done;
        }
    }
    fmpz_set_ui(multiple, (ulong) baby_count);
    if (!scalar_multiply_fmpz(
            &giant_step, &step, multiple, &model, &budget))
    {
        status = budget.status;
        goto done;
    }
    divisor_negate(&giant_step, &giant_step);
    divisor_negate(&target, &base_product);
    giant_count = 1 + (count - 1) / baby_count;
    for (uint64_t giant = 0; giant < giant_count; giant += 1)
    {
        uint64_t baby_index;
        certificate->diagnostics.giant_steps += 1;
        if (hash_find(
                table, mask, &target, &baby_index,
                &certificate->diagnostics))
        {
            uint64_t candidate_index;
            if (giant > UINT64_MAX / baby_count)
            {
                status = SAGEJS_G3J_INTERNAL_ERROR;
                goto done;
            }
            candidate_index = giant * baby_count + baby_index;
            if (candidate_index < count)
            {
                found = 1;
                found_index = candidate_index;
                break;
            }
        }
        if (giant + 1 < giant_count &&
            !divisor_add(&target, &target, &giant_step, &model, &budget))
        {
            status = budget.status;
            goto done;
        }
    }
    if (!found)
    {
        status = SAGEJS_G3J_NOT_FOUND;
        goto done;
    }
    fmpz_mul_ui(multiple, stride_value, (ulong) found_index);
    fmpz_add(multiple, multiple, base_value);
    status = factor_and_strip(
        certificate, multiple, &input, &model, &budget);

done:
    if (table != NULL)
    {
        for (uint64_t index = 0; index < table_size; index += 1)
            divisor_clear(&table[index].divisor);
        free(table);
    }
    fmpz_clear(maximum);
    fmpz_clear(multiple);
    fmpz_clear(stride_value);
    fmpz_clear(base_value);
    divisor_clear(&target);
    divisor_clear(&giant_step);
    divisor_clear(&baby);
    divisor_clear(&step);
    divisor_clear(&base_product);
    divisor_clear(&input);
    model_clear(&model);
return_status:
    certificate->status = status;
    return status;
}

const char *sagejs_g3j_status_name(int32_t status)
{
    switch (status)
    {
        case SAGEJS_G3J_OK: return "ok";
        case SAGEJS_G3J_NOT_FOUND: return "not_found";
        case SAGEJS_G3J_RESOURCE_LIMIT: return "resource_limit";
        case SAGEJS_G3J_CANCELLED: return "cancelled";
        case SAGEJS_G3J_INVALID_ARGUMENT: return "invalid_argument";
        case SAGEJS_G3J_INVALID_MODEL: return "invalid_model";
        case SAGEJS_G3J_INVALID_DIVISOR: return "invalid_divisor";
        case SAGEJS_G3J_ALLOCATION_FAILED: return "allocation_failed";
        default: return "internal_error";
    }
}
