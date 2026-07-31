#include <limits.h>
#include <math.h>
#include <stdint.h>
#include <stdlib.h>

#include <node_api.h>

#include <flint/dirichlet.h>
#include <flint/flint.h>

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
    if (!lossless || number > ULONG_MAX)
    {
        napi_throw_range_error(
            env, NULL, "BigInt does not fit in an unsigned FLINT word");
        return 0;
    }
    *result = (ulong) number;
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
