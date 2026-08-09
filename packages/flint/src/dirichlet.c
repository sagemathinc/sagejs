#include <limits.h>
#include <math.h>
#include <stdint.h>
#include <stdlib.h>

#include <node_api.h>
#include <sagejs/native.h>

#include <flint/acb.h>
#include <flint/acb_dirichlet.h>
#include <flint/arith.h>
#include <flint/arb.h>
#include <flint/arf.h>
#include <flint/dirichlet.h>
#include <flint/flint.h>
#include <flint/fmpq.h>
#include <flint/fmpq_poly.h>
#include <flint/fmpz.h>
#include <flint/qqbar.h>

#include "algebraic.h"
#include "dirichlet.h"

#define SAGEJS_DIRICHLET_GROUP_MAGIC UINT64_C(0x534147454A534447)

typedef struct
{
    uint64_t magic;
    dirichlet_group_t value;
} sagejs_dirichlet_group_value;

static const napi_type_tag sagejs_dirichlet_group_type_tag = {
    UINT64_C(0xa739178f68194da1),
    UINT64_C(0xbd69c03542082795)
};

static int check_napi(napi_env env, napi_status status)
{
    const napi_extended_error_info *info;

    if (status == napi_ok)
        return 1;
    napi_get_last_error_info(env, &info);
    napi_throw_error(env, NULL,
        info != NULL && info->error_message != NULL
            ? info->error_message
            : "Node-API call failed");
    return 0;
}

static int require_arguments(
    napi_env env,
    napi_callback_info info,
    size_t expected,
    napi_value *args)
{
    size_t argc = expected;

    if (!check_napi(env, napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return 0;
    if (argc != expected)
    {
        napi_throw_type_error(env, NULL, "wrong number of arguments");
        return 0;
    }
    return 1;
}

static int bigint_to_ulong(napi_env env, napi_value value, ulong *result)
{
    napi_valuetype type;
    uint64_t number;
    bool lossless;

    if (!check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_bigint)
    {
        napi_throw_type_error(env, NULL, "expected a BigInt");
        return 0;
    }
    if (!check_napi(env,
        napi_get_value_bigint_uint64(env, value, &number, &lossless)))
        return 0;
    if (!lossless || number > UWORD_MAX)
    {
        napi_throw_range_error(
            env, NULL, "BigInt does not fit in an unsigned FLINT word");
        return 0;
    }
    *result = (ulong) number;
    return 1;
}

static int number_to_ulong(napi_env env, napi_value value, ulong *result)
{
    double number;

    if (!check_napi(env, napi_get_value_double(env, value, &number)))
        return 0;
    if (!isfinite(number) || number < 0 ||
        number > (double) WORD_MAX || floor(number) != number)
    {
        napi_throw_range_error(
            env, NULL, "expected a nonnegative machine integer");
        return 0;
    }
    *result = (ulong) number;
    return 1;
}

static int get_precision(
    napi_env env, napi_value value, mpfr_prec_t *precision)
{
    int64_t result;

    if (!check_napi(env, napi_get_value_int64(env, value, &result)))
        return 0;
    if (result < MPFR_PREC_MIN || (uint64_t) result > MPFR_PREC_MAX)
    {
        napi_throw_range_error(env, NULL, "invalid MPFR precision");
        return 0;
    }
    *precision = (mpfr_prec_t) result;
    return 1;
}

static napi_value ulong_to_bigint(napi_env env, ulong value)
{
    napi_value result;

    if (!check_napi(env,
        napi_create_bigint_uint64(env, (uint64_t) value, &result)))
        return NULL;
    return result;
}

static int set_named(
    napi_env env,
    napi_value object,
    const char *name,
    napi_value value)
{
    return value != NULL &&
        check_napi(env, napi_set_named_property(env, object, name, value));
}

static void finalize_group(napi_env env, void *data, void *hint)
{
    sagejs_dirichlet_group_value *group = data;
    (void) env;
    (void) hint;

    if (group != NULL && group->magic == SAGEJS_DIRICHLET_GROUP_MAGIC)
    {
        dirichlet_group_clear(group->value);
        group->magic = 0;
        free(group);
    }
}

static napi_value wrap_group(
    napi_env env, sagejs_dirichlet_group_value *group)
{
    napi_value object;

    if (!check_napi(env, napi_create_object(env, &object)) ||
        !check_napi(env,
            napi_type_tag_object(
                env, object, &sagejs_dirichlet_group_type_tag)) ||
        !check_napi(env,
            napi_wrap(env, object, group, finalize_group, NULL, NULL)))
    {
        finalize_group(env, group, NULL);
        return NULL;
    }
    return object;
}

static sagejs_dirichlet_group_value *unwrap_group(
    napi_env env, napi_value object)
{
    bool tagged = false;
    sagejs_dirichlet_group_value *group = NULL;

    if (!check_napi(env,
        napi_check_object_type_tag(
            env, object, &sagejs_dirichlet_group_type_tag, &tagged)))
        return NULL;
    if (!tagged ||
        !check_napi(env, napi_unwrap(env, object, (void **) &group)) ||
        group == NULL || group->magic != SAGEJS_DIRICHLET_GROUP_MAGIC)
    {
        napi_throw_type_error(
            env, NULL, "expected a Sage.js FLINT Dirichlet group");
        return NULL;
    }
    return group;
}

static int character_from_sage_index(
    napi_env env,
    dirichlet_char_t character,
    const dirichlet_group_t group,
    ulong index)
{
    slong component;

    if (index >= group->phi_q)
    {
        napi_throw_range_error(env, NULL,
            "Dirichlet character index is out of range");
        return 0;
    }
    for (component = 0; component < group->num; component++)
    {
        ulong order = group->P[component].phi.n;
        character->log[component] = index % order;
        index /= order;
    }
    _dirichlet_char_exp(character, group);
    return 1;
}

static int initialized_character(
    napi_env env,
    dirichlet_char_t character,
    const sagejs_dirichlet_group_value *group,
    napi_value index_value)
{
    ulong index;

    if (!bigint_to_ulong(env, index_value, &index))
        return 0;
    dirichlet_char_init(character, group->value);
    if (!character_from_sage_index(
            env, character, group->value, index))
    {
        dirichlet_char_clear(character);
        return 0;
    }
    return 1;
}

int sagejs_dirichlet_character_init_native(
    napi_env env,
    napi_value group_value,
    napi_value index_value,
    const dirichlet_group_struct **group,
    dirichlet_char_t character)
{
    sagejs_dirichlet_group_value *wrapped = unwrap_group(
        env, group_value);

    if (wrapped == NULL ||
        !initialized_character(env, character, wrapped, index_value))
        return 0;
    *group = wrapped->value;
    return 1;
}

static void acb_from_complex(
    acb_t result, const sagejs_complex *value, mpfr_prec_t precision)
{
    arb_set_interval_mpfr(
        acb_realref(result),
        mpc_realref(value->value),
        mpc_realref(value->value),
        precision);
    arb_set_interval_mpfr(
        acb_imagref(result),
        mpc_imagref(value->value),
        mpc_imagref(value->value),
        precision);
}

static napi_value complex_from_acb(
    napi_env env, const acb_t value, mpfr_prec_t precision)
{
    sagejs_complex *result =
        sagejs_native_new_complex(env, precision);

    if (result == NULL)
        return NULL;
    arf_get_mpfr(
        mpc_realref(result->value),
        arb_midref(acb_realref(value)),
        MPFR_RNDN);
    arf_get_mpfr(
        mpc_imagref(result->value),
        arb_midref(acb_imagref(value)),
        MPFR_RNDN);
    return sagejs_native_wrap_complex(env, result);
}

static slong root_exponent(ulong exponent, ulong order)
{
    exponent %= order;
    if (exponent <= (ulong) WORD_MAX)
        return (slong) exponent;
    return -(slong) (order - exponent);
}

napi_value sagejs_dirichlet_group(
    napi_env env, napi_callback_info info)
{
    napi_value args[1];
    ulong modulus;
    sagejs_dirichlet_group_value *group;

    if (!require_arguments(env, info, 1, args) ||
        !bigint_to_ulong(env, args[0], &modulus))
        return NULL;
    if (modulus == 0)
    {
        napi_throw_range_error(
            env, NULL, "Dirichlet modulus must be positive");
        return NULL;
    }
    group = malloc(sizeof(*group));
    if (group == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to allocate a Dirichlet group");
        return NULL;
    }
    group->magic = SAGEJS_DIRICHLET_GROUP_MAGIC;
    if (!dirichlet_group_init(group->value, modulus))
    {
        group->magic = 0;
        free(group);
        napi_throw_range_error(env, NULL,
            "FLINT could not initialize this Dirichlet modulus");
        return NULL;
    }
    return wrap_group(env, group);
}

napi_value sagejs_dirichlet_group_close(
    napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    bool tagged = false;
    sagejs_dirichlet_group_value *group = NULL;

    if (!require_arguments(env, info, 1, args) ||
        !check_napi(env, napi_check_object_type_tag(
            env, args[0], &sagejs_dirichlet_group_type_tag, &tagged)))
        return NULL;
    if (!tagged)
    {
        napi_throw_type_error(
            env, NULL, "expected an open Sage.js FLINT Dirichlet group");
        return NULL;
    }
    if (!check_napi(env, napi_remove_wrap(env, args[0], (void **) &group)))
        return NULL;
    if (group == NULL || group->magic != SAGEJS_DIRICHLET_GROUP_MAGIC)
    {
        napi_throw_type_error(
            env, NULL, "expected an open Sage.js FLINT Dirichlet group");
        return NULL;
    }
    finalize_group(env, group, NULL);
    if (!check_napi(env, napi_get_undefined(env, &result)))
        return NULL;
    return result;
}

napi_value sagejs_dirichlet_group_data(
    napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    napi_value orders;
    napi_value generators;
    sagejs_dirichlet_group_value *wrapped;
    dirichlet_group_struct *group;
    slong component;

    if (!require_arguments(env, info, 1, args) ||
        (wrapped = unwrap_group(env, args[0])) == NULL)
        return NULL;
    group = wrapped->value;
    if (!check_napi(env, napi_create_object(env, &result)) ||
        !set_named(env, result, "modulus",
            ulong_to_bigint(env, group->q)) ||
        !set_named(env, result, "size",
            ulong_to_bigint(env, group->phi_q)) ||
        !set_named(env, result, "exponent",
            ulong_to_bigint(env, group->expo)) ||
        !set_named(env, result, "numberPrimitive",
            ulong_to_bigint(
                env, dirichlet_group_num_primitive(group))) ||
        !check_napi(env,
            napi_create_array_with_length(
                env, (size_t) group->num, &orders)) ||
        !check_napi(env,
            napi_create_array_with_length(
                env, (size_t) group->num, &generators)))
        return NULL;
    for (component = 0; component < group->num; component++)
    {
        if (!check_napi(env,
                napi_set_element(env, orders, (uint32_t) component,
                    ulong_to_bigint(
                        env, group->P[component].phi.n))) ||
            !check_napi(env,
                napi_set_element(env, generators, (uint32_t) component,
                    ulong_to_bigint(
                        env, group->generators[component]))))
            return NULL;
    }
    if (!set_named(env, result, "orders", orders) ||
        !set_named(env, result, "generators", generators))
        return NULL;
    return result;
}

napi_value sagejs_dirichlet_character_data(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    napi_value boolean;
    sagejs_dirichlet_group_value *wrapped;
    dirichlet_char_t character;
    ulong index;

    if (!require_arguments(env, info, 2, args) ||
        (wrapped = unwrap_group(env, args[0])) == NULL ||
        !bigint_to_ulong(env, args[1], &index))
        return NULL;
    dirichlet_char_init(character, wrapped->value);
    if (!character_from_sage_index(
            env, character, wrapped->value, index))
    {
        dirichlet_char_clear(character);
        return NULL;
    }
    if (!check_napi(env, napi_create_object(env, &result)) ||
        !set_named(env, result, "conreyNumber",
            ulong_to_bigint(env, character->n)) ||
        !set_named(env, result, "conductor",
            ulong_to_bigint(env,
                dirichlet_conductor_char(
                    wrapped->value, character))) ||
        !set_named(env, result, "order",
            ulong_to_bigint(env,
                dirichlet_order_char(
                    wrapped->value, character))) ||
        !check_napi(env,
            napi_get_boolean(env,
                dirichlet_parity_char(
                    wrapped->value, character) == 0,
                &boolean)) ||
        !set_named(env, result, "even", boolean) ||
        !check_napi(env,
            napi_get_boolean(env,
                dirichlet_char_is_principal(
                    wrapped->value, character),
                &boolean)) ||
        !set_named(env, result, "principal", boolean) ||
        !check_napi(env,
            napi_get_boolean(env,
                dirichlet_char_is_real(
                    wrapped->value, character),
                &boolean)) ||
        !set_named(env, result, "real", boolean) ||
        !check_napi(env,
            napi_get_boolean(env,
                dirichlet_char_is_primitive(
                    wrapped->value, character),
                &boolean)) ||
        !set_named(env, result, "primitive", boolean))
    {
        dirichlet_char_clear(character);
        return NULL;
    }
    dirichlet_char_clear(character);
    return result;
}

napi_value sagejs_dirichlet_character_exponent(
    napi_env env, napi_callback_info info)
{
    napi_value args[3];
    napi_value result;
    sagejs_dirichlet_group_value *wrapped;
    dirichlet_char_t character;
    ulong index;
    ulong residue;
    ulong exponent;

    if (!require_arguments(env, info, 3, args) ||
        (wrapped = unwrap_group(env, args[0])) == NULL ||
        !bigint_to_ulong(env, args[1], &index) ||
        !bigint_to_ulong(env, args[2], &residue))
        return NULL;
    if (residue >= wrapped->value->q)
    {
        napi_throw_range_error(env, NULL,
            "Dirichlet argument must be reduced modulo its modulus");
        return NULL;
    }
    dirichlet_char_init(character, wrapped->value);
    if (!character_from_sage_index(
            env, character, wrapped->value, index))
    {
        dirichlet_char_clear(character);
        return NULL;
    }
    exponent = dirichlet_chi(wrapped->value, character, residue);
    dirichlet_char_clear(character);
    if (exponent == DIRICHLET_CHI_NULL)
    {
        if (!check_napi(env, napi_get_null(env, &result)))
            return NULL;
        return result;
    }
    return ulong_to_bigint(env, exponent);
}

napi_value sagejs_dirichlet_character_exponents(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    napi_value value;
    sagejs_dirichlet_group_value *wrapped;
    dirichlet_char_t character;
    ulong index;
    ulong *exponents;
    ulong position;

    if (!require_arguments(env, info, 2, args) ||
        (wrapped = unwrap_group(env, args[0])) == NULL ||
        !bigint_to_ulong(env, args[1], &index))
        return NULL;
    if (wrapped->value->q > UINT32_MAX)
    {
        napi_throw_range_error(env, NULL,
            "Dirichlet value vector is too large for a JavaScript array");
        return NULL;
    }
    dirichlet_char_init(character, wrapped->value);
    if (!character_from_sage_index(
            env, character, wrapped->value, index))
    {
        dirichlet_char_clear(character);
        return NULL;
    }
    exponents = flint_malloc(
        wrapped->value->q * sizeof(*exponents));
    dirichlet_chi_vec(
        exponents, wrapped->value, character,
        (slong) wrapped->value->q);
    dirichlet_char_clear(character);
    if (!check_napi(env,
        napi_create_array_with_length(
            env, (size_t) wrapped->value->q, &result)))
        goto failure;
    for (position = 0; position < wrapped->value->q; position++)
    {
        if (exponents[position] == DIRICHLET_CHI_NULL)
        {
            if (!check_napi(env, napi_get_null(env, &value)))
                goto failure;
        }
        else
        {
            value = ulong_to_bigint(env, exponents[position]);
            if (value == NULL)
                goto failure;
        }
        if (!check_napi(env,
            napi_set_element(env, result, (uint32_t) position, value)))
            goto failure;
    }
    flint_free(exponents);
    return result;

failure:
    flint_free(exponents);
    return NULL;
}

napi_value sagejs_dirichlet_gauss_sum_exact(
    napi_env env, napi_callback_info info)
{
    napi_value args[3];
    napi_value answer;
    sagejs_dirichlet_group_value *wrapped;
    dirichlet_char_t character;
    qqbar_t result;
    qqbar_t character_value;
    qqbar_t additive_value;
    qqbar_t term;
    ulong additive_factor;
    ulong position;

    if (!require_arguments(env, info, 3, args) ||
        (wrapped = unwrap_group(env, args[0])) == NULL ||
        !initialized_character(
            env, character, wrapped, args[1]))
        return NULL;
    if (!bigint_to_ulong(env, args[2], &additive_factor))
    {
        dirichlet_char_clear(character);
        return NULL;
    }
    if (additive_factor >= wrapped->value->q)
    {
        dirichlet_char_clear(character);
        napi_throw_range_error(env, NULL,
            "Gauss-sum parameter must be reduced modulo the modulus");
        return NULL;
    }

    qqbar_init(result);
    qqbar_init(character_value);
    qqbar_init(additive_value);
    qqbar_init(term);
    qqbar_zero(result);
    for (position = 0; position < wrapped->value->q; position++)
    {
        ulong exponent =
            dirichlet_chi(wrapped->value, character, position);
        ulong additive_exponent;

        if (exponent == DIRICHLET_CHI_NULL)
            continue;
        additive_exponent = nmod_mul(
            position, additive_factor, wrapped->value->mod);
        qqbar_root_of_unity(
            character_value,
            root_exponent(exponent, wrapped->value->expo),
            wrapped->value->expo);
        qqbar_root_of_unity(
            additive_value,
            root_exponent(
                additive_exponent, wrapped->value->q),
            wrapped->value->q);
        qqbar_mul(term, character_value, additive_value);
        qqbar_add(result, result, term);
    }
    answer = sagejs_qqbar_wrap_copy(env, result);
    qqbar_clear(term);
    qqbar_clear(additive_value);
    qqbar_clear(character_value);
    qqbar_clear(result);
    dirichlet_char_clear(character);
    return answer;
}

napi_value sagejs_dirichlet_gauss_sum(
    napi_env env, napi_callback_info info)
{
    napi_value args[4];
    napi_value answer;
    sagejs_dirichlet_group_value *wrapped;
    dirichlet_char_t character;
    mpfr_prec_t precision;
    ulong additive_factor;
    acb_t result;

    if (!require_arguments(env, info, 4, args) ||
        (wrapped = unwrap_group(env, args[0])) == NULL ||
        !initialized_character(
            env, character, wrapped, args[1]))
        return NULL;
    if (!bigint_to_ulong(env, args[2], &additive_factor) ||
        !get_precision(env, args[3], &precision))
    {
        dirichlet_char_clear(character);
        return NULL;
    }
    if (additive_factor >= wrapped->value->q)
    {
        dirichlet_char_clear(character);
        napi_throw_range_error(env, NULL,
            "Gauss-sum parameter must be reduced modulo the modulus");
        return NULL;
    }

    acb_init(result);
    if (additive_factor == 1 % wrapped->value->q)
    {
        acb_dirichlet_gauss_sum(
            result, wrapped->value, character, precision);
    }
    else
    {
        acb_t character_value;
        acb_t additive_value;
        acb_t term;
        acb_dirichlet_roots_t roots;
        ulong position;

        acb_init(character_value);
        acb_init(additive_value);
        acb_init(term);
        acb_dirichlet_roots_init(
            roots, wrapped->value->q,
            (slong) wrapped->value->q, precision);
        acb_zero(result);
        for (position = 0;
             position < wrapped->value->q;
             position++)
        {
            ulong additive_exponent = nmod_mul(
                position, additive_factor, wrapped->value->mod);
            acb_dirichlet_chi(
                character_value, wrapped->value,
                character, position, precision);
            acb_dirichlet_root(
                additive_value, roots,
                additive_exponent, precision);
            acb_mul(
                term, character_value,
                additive_value, precision);
            acb_add(result, result, term, precision);
        }
        acb_dirichlet_roots_clear(roots);
        acb_clear(term);
        acb_clear(additive_value);
        acb_clear(character_value);
    }
    answer = complex_from_acb(env, result, precision);
    acb_clear(result);
    dirichlet_char_clear(character);
    return answer;
}

napi_value sagejs_dirichlet_jacobi_sum_exact(
    napi_env env, napi_callback_info info)
{
    napi_value args[3];
    napi_value answer;
    sagejs_dirichlet_group_value *wrapped;
    dirichlet_char_t left;
    dirichlet_char_t right;
    qqbar_t result;
    qqbar_t term;
    ulong position;

    if (!require_arguments(env, info, 3, args) ||
        (wrapped = unwrap_group(env, args[0])) == NULL ||
        !initialized_character(env, left, wrapped, args[1]))
        return NULL;
    if (!initialized_character(env, right, wrapped, args[2]))
    {
        dirichlet_char_clear(left);
        return NULL;
    }

    qqbar_init(result);
    qqbar_init(term);
    qqbar_zero(result);
    for (position = 0; position < wrapped->value->q; position++)
    {
        ulong complement = position <= 1
            ? 1 - position
            : wrapped->value->q - (position - 1);
        ulong left_exponent =
            dirichlet_chi(wrapped->value, left, position);
        ulong right_exponent = dirichlet_chi(
            wrapped->value, right, complement);
        ulong exponent;

        if (left_exponent == DIRICHLET_CHI_NULL ||
            right_exponent == DIRICHLET_CHI_NULL)
            continue;
        exponent = n_addmod(
            left_exponent, right_exponent,
            wrapped->value->expo);
        qqbar_root_of_unity(
            term,
            root_exponent(exponent, wrapped->value->expo),
            wrapped->value->expo);
        qqbar_add(result, result, term);
    }
    answer = sagejs_qqbar_wrap_copy(env, result);
    qqbar_clear(term);
    qqbar_clear(result);
    dirichlet_char_clear(right);
    dirichlet_char_clear(left);
    return answer;
}

napi_value sagejs_dirichlet_jacobi_sum(
    napi_env env, napi_callback_info info)
{
    napi_value args[4];
    napi_value answer;
    sagejs_dirichlet_group_value *wrapped;
    dirichlet_char_t left;
    dirichlet_char_t right;
    mpfr_prec_t precision;
    acb_t result;

    if (!require_arguments(env, info, 4, args) ||
        (wrapped = unwrap_group(env, args[0])) == NULL ||
        !initialized_character(env, left, wrapped, args[1]))
        return NULL;
    if (!initialized_character(env, right, wrapped, args[2]))
    {
        dirichlet_char_clear(left);
        return NULL;
    }
    if (!get_precision(env, args[3], &precision))
    {
        dirichlet_char_clear(right);
        dirichlet_char_clear(left);
        return NULL;
    }
    acb_init(result);
    acb_dirichlet_jacobi_sum(
        result, wrapped->value, left, right, precision);
    answer = complex_from_acb(env, result, precision);
    acb_clear(result);
    dirichlet_char_clear(right);
    dirichlet_char_clear(left);
    return answer;
}

napi_value sagejs_dirichlet_root_number(
    napi_env env, napi_callback_info info)
{
    napi_value args[3];
    napi_value answer;
    sagejs_dirichlet_group_value *wrapped;
    dirichlet_char_t character;
    mpfr_prec_t precision;
    acb_t result;

    if (!require_arguments(env, info, 3, args) ||
        (wrapped = unwrap_group(env, args[0])) == NULL ||
        !initialized_character(
            env, character, wrapped, args[1]))
        return NULL;
    if (!get_precision(env, args[2], &precision))
    {
        dirichlet_char_clear(character);
        return NULL;
    }
    if (!dirichlet_char_is_primitive(
            wrapped->value, character))
    {
        dirichlet_char_clear(character);
        napi_throw_range_error(env, NULL,
            "root number requires a primitive character");
        return NULL;
    }
    acb_init(result);
    acb_dirichlet_root_number(
        result, wrapped->value, character, precision);
    answer = complex_from_acb(env, result, precision);
    acb_clear(result);
    dirichlet_char_clear(character);
    return answer;
}

napi_value sagejs_dirichlet_l_value(
    napi_env env, napi_callback_info info)
{
    napi_value args[5];
    napi_value answer;
    sagejs_dirichlet_group_value *wrapped;
    sagejs_complex *input_value;
    dirichlet_char_t character;
    mpfr_prec_t precision;
    ulong derivative;
    acb_t input;
    acb_ptr jet;
    fmpz_t factorial;

    if (!require_arguments(env, info, 5, args) ||
        (wrapped = unwrap_group(env, args[0])) == NULL ||
        !initialized_character(
            env, character, wrapped, args[1]))
        return NULL;
    input_value = sagejs_native_unwrap_complex(env, args[2]);
    if (input_value == NULL ||
        !number_to_ulong(env, args[3], &derivative) ||
        !get_precision(env, args[4], &precision))
    {
        dirichlet_char_clear(character);
        return NULL;
    }
    if (derivative >= (ulong) WORD_MAX)
    {
        dirichlet_char_clear(character);
        napi_throw_range_error(env, NULL,
            "Dirichlet L-function derivative is too large");
        return NULL;
    }

    acb_init(input);
    acb_from_complex(input, input_value, precision);
    jet = _acb_vec_init((slong) derivative + 1);
    acb_dirichlet_l_jet(
        jet, input, wrapped->value, character, 0,
        (slong) derivative + 1, precision);
    if (derivative != 0)
    {
        fmpz_init(factorial);
        fmpz_fac_ui(factorial, derivative);
        acb_mul_fmpz(
            jet + derivative, jet + derivative,
            factorial, precision);
        fmpz_clear(factorial);
    }
    answer = complex_from_acb(
        env, jet + derivative, precision);
    _acb_vec_clear(jet, (slong) derivative + 1);
    acb_clear(input);
    dirichlet_char_clear(character);
    return answer;
}

napi_value sagejs_dirichlet_bernoulli(
    napi_env env, napi_callback_info info)
{
    napi_value args[3];
    napi_value answer;
    sagejs_dirichlet_group_value *wrapped;
    dirichlet_char_t character;
    ulong index;
    ulong residue;
    fmpq_poly_t polynomial;
    fmpq_t argument;
    fmpq_t value;
    fmpq_t scale;
    fmpz_t power;
    qqbar_t result;
    qqbar_t root;
    qqbar_t term;

    if (!require_arguments(env, info, 3, args) ||
        (wrapped = unwrap_group(env, args[0])) == NULL ||
        !initialized_character(
            env, character, wrapped, args[1]))
        return NULL;
    if (!number_to_ulong(env, args[2], &index))
    {
        dirichlet_char_clear(character);
        return NULL;
    }

    fmpq_poly_init(polynomial);
    fmpq_init(argument);
    fmpq_init(value);
    fmpq_init(scale);
    fmpz_init(power);
    qqbar_init(result);
    qqbar_init(root);
    qqbar_init(term);
    arith_bernoulli_polynomial(polynomial, index);
    if (index == 0)
    {
        fmpq_set_ui(scale, 1, wrapped->value->q);
    }
    else
    {
        fmpz_set_ui(power, wrapped->value->q);
        fmpz_pow_ui(power, power, index - 1);
        fmpq_set_fmpz(scale, power);
    }
    qqbar_zero(result);
    for (residue = 0; residue < wrapped->value->q; residue++)
    {
        ulong exponent =
            dirichlet_chi(wrapped->value, character, residue);
        ulong numerator =
            residue == 0 ? wrapped->value->q : residue;

        if (exponent == DIRICHLET_CHI_NULL)
            continue;
        fmpq_set_ui(argument, numerator, wrapped->value->q);
        fmpq_poly_evaluate_fmpq(
            value, polynomial, argument);
        fmpq_mul(value, value, scale);
        qqbar_root_of_unity(
            root,
            root_exponent(exponent, wrapped->value->expo),
            wrapped->value->expo);
        qqbar_mul_fmpq(term, root, value);
        qqbar_add(result, result, term);
    }
    answer = sagejs_qqbar_wrap_copy(env, result);
    qqbar_clear(term);
    qqbar_clear(root);
    qqbar_clear(result);
    fmpz_clear(power);
    fmpq_clear(scale);
    fmpq_clear(value);
    fmpq_clear(argument);
    fmpq_poly_clear(polynomial);
    dirichlet_char_clear(character);
    return answer;
}
