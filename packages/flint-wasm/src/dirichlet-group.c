#include <limits.h>
#include <stdint.h>
#include <stdlib.h>

#include <flint/dirichlet.h>

/*
 * This adapter deliberately exposes scalar metadata and one packed uint32
 * character-value buffer.  JavaScript never sees FLINT-owned pointers or
 * layout-dependent dirichlet structures, so the boundary is identical on
 * native 32/64-bit hosts and wasm32-wasip1.
 */

#define SAGEJS_DIRICHLET_MAX_VECTOR_ENTRIES UINT32_C(1048576)
#define SAGEJS_DIRICHLET_NULL_EXPONENT UINT32_MAX

static dirichlet_group_t sagejs_group;
static dirichlet_char_t sagejs_character;
static int sagejs_group_initialized = 0;
static int sagejs_character_initialized = 0;
static uint64_t sagejs_exponent_value = 0;
static uint32_t *sagejs_exponents = NULL;
static uint32_t sagejs_exponent_count = 0;

static void sagejs_wasm_dirichlet_character_clear_internal(void)
{
    free(sagejs_exponents);
    sagejs_exponents = NULL;
    sagejs_exponent_count = 0;
    sagejs_exponent_value = 0;
    if (sagejs_character_initialized)
    {
        dirichlet_char_clear(sagejs_character);
        sagejs_character_initialized = 0;
    }
}

void sagejs_wasm_dirichlet_group_clear(void)
{
    sagejs_wasm_dirichlet_character_clear_internal();
    if (sagejs_group_initialized)
    {
        dirichlet_group_clear(sagejs_group);
        sagejs_group_initialized = 0;
    }
}

int sagejs_wasm_dirichlet_group_begin(uint64_t modulus)
{
    sagejs_wasm_dirichlet_group_clear();
    if (modulus == 0 || modulus > (uint64_t) ULONG_MAX)
        return 0;
    if (!dirichlet_group_init(sagejs_group, (ulong) modulus))
        return 0;
    sagejs_group_initialized = 1;
    return 1;
}

uint64_t sagejs_wasm_dirichlet_group_modulus(void)
{
    return sagejs_group_initialized ? (uint64_t) sagejs_group->q : 0;
}

uint64_t sagejs_wasm_dirichlet_group_size(void)
{
    return sagejs_group_initialized ? (uint64_t) sagejs_group->phi_q : 0;
}

uint64_t sagejs_wasm_dirichlet_group_exponent(void)
{
    return sagejs_group_initialized ? (uint64_t) sagejs_group->expo : 0;
}

uint64_t sagejs_wasm_dirichlet_group_number_primitive(void)
{
    return sagejs_group_initialized
        ? (uint64_t) dirichlet_group_num_primitive(sagejs_group)
        : 0;
}

uint32_t sagejs_wasm_dirichlet_group_component_count(void)
{
    return sagejs_group_initialized ? (uint32_t) sagejs_group->num : 0;
}

uint64_t sagejs_wasm_dirichlet_group_component_order(uint32_t component)
{
    if (!sagejs_group_initialized || component >= (uint32_t) sagejs_group->num)
        return 0;
    return (uint64_t) sagejs_group->P[component].phi.n;
}

uint64_t sagejs_wasm_dirichlet_group_generator(uint32_t component)
{
    if (!sagejs_group_initialized || component >= (uint32_t) sagejs_group->num)
        return 0;
    return (uint64_t) sagejs_group->generators[component];
}

int sagejs_wasm_dirichlet_character_begin(uint64_t index)
{
    slong component;
    ulong remaining;

    sagejs_wasm_dirichlet_character_clear_internal();
    if (!sagejs_group_initialized || index > (uint64_t) ULONG_MAX ||
        index >= (uint64_t) sagejs_group->phi_q)
        return 0;

    remaining = (ulong) index;
    dirichlet_char_init(sagejs_character, sagejs_group);
    sagejs_character_initialized = 1;
    for (component = 0; component < sagejs_group->num; component++)
    {
        const ulong order = sagejs_group->P[component].phi.n;
        sagejs_character->log[component] = remaining % order;
        remaining /= order;
    }
    _dirichlet_char_exp(sagejs_character, sagejs_group);
    return 1;
}

uint64_t sagejs_wasm_dirichlet_character_conrey_number(void)
{
    return sagejs_character_initialized
        ? (uint64_t) sagejs_character->n
        : 0;
}

uint64_t sagejs_wasm_dirichlet_character_conductor(void)
{
    return sagejs_character_initialized
        ? (uint64_t) dirichlet_conductor_char(sagejs_group, sagejs_character)
        : 0;
}

uint64_t sagejs_wasm_dirichlet_character_order(void)
{
    return sagejs_character_initialized
        ? (uint64_t) dirichlet_order_char(sagejs_group, sagejs_character)
        : 0;
}

int sagejs_wasm_dirichlet_character_is_even(void)
{
    return sagejs_character_initialized &&
        dirichlet_parity_char(sagejs_group, sagejs_character) == 0;
}

int sagejs_wasm_dirichlet_character_is_principal(void)
{
    return sagejs_character_initialized &&
        dirichlet_char_is_principal(sagejs_group, sagejs_character);
}

int sagejs_wasm_dirichlet_character_is_real(void)
{
    return sagejs_character_initialized &&
        dirichlet_char_is_real(sagejs_group, sagejs_character);
}

int sagejs_wasm_dirichlet_character_is_primitive(void)
{
    return sagejs_character_initialized &&
        dirichlet_char_is_primitive(sagejs_group, sagejs_character);
}

/*
 * Return 2 for a unit residue (read exponent_value), 1 for a nonunit/null
 * character value, and 0 for invalid state or an unreduced residue.
 */
int sagejs_wasm_dirichlet_character_exponent_compute(uint64_t residue)
{
    ulong exponent;

    sagejs_exponent_value = 0;
    if (!sagejs_character_initialized || residue > (uint64_t) ULONG_MAX ||
        residue >= (uint64_t) sagejs_group->q)
        return 0;
    exponent = dirichlet_chi(
        sagejs_group, sagejs_character, (ulong) residue);
    if (exponent == DIRICHLET_CHI_NULL)
        return 1;
    sagejs_exponent_value = (uint64_t) exponent;
    return 2;
}

uint64_t sagejs_wasm_dirichlet_character_exponent_value(void)
{
    return sagejs_exponent_value;
}

/*
 * Compute the complete value table in FLINT, then copy it to an explicitly
 * uint32 packed ABI buffer.  Return 2 on success, 1 when the browser resource
 * ceiling is exceeded, and 0 for invalid state/allocation failure.
 */
int sagejs_wasm_dirichlet_character_exponents_compute(void)
{
    ulong *native_exponents;
    uint32_t position;
    const uint64_t count = sagejs_group_initialized
        ? (uint64_t) sagejs_group->q
        : 0;

    free(sagejs_exponents);
    sagejs_exponents = NULL;
    sagejs_exponent_count = 0;
    if (!sagejs_character_initialized || count == 0)
        return 0;
    if (count > SAGEJS_DIRICHLET_MAX_VECTOR_ENTRIES)
        return 1;

    sagejs_exponents = malloc((size_t) count * sizeof(*sagejs_exponents));
    native_exponents = sizeof(ulong) == sizeof(uint32_t)
        ? (ulong *) sagejs_exponents
        : malloc((size_t) count * sizeof(*native_exponents));
    if (sagejs_exponents == NULL || native_exponents == NULL)
    {
        free(native_exponents);
        free(sagejs_exponents);
        sagejs_exponents = NULL;
        return 0;
    }
    dirichlet_chi_vec(
        native_exponents, sagejs_group, sagejs_character, (slong) count);
    if (native_exponents != (ulong *) sagejs_exponents)
    {
        for (position = 0; position < (uint32_t) count; position++)
        {
            const ulong exponent = native_exponents[position];
            sagejs_exponents[position] = exponent == DIRICHLET_CHI_NULL
                ? SAGEJS_DIRICHLET_NULL_EXPONENT
                : (uint32_t) exponent;
        }
        free(native_exponents);
    }
    sagejs_exponent_count = (uint32_t) count;
    return 2;
}

uintptr_t sagejs_wasm_dirichlet_character_exponents(void)
{
    return (uintptr_t) sagejs_exponents;
}

uint32_t sagejs_wasm_dirichlet_character_exponent_count(void)
{
    return sagejs_exponent_count;
}

uint32_t sagejs_wasm_dirichlet_character_max_vector_entries(void)
{
    return SAGEJS_DIRICHLET_MAX_VECTOR_ENTRIES;
}
