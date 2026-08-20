#include <limits.h>
#include <stdint.h>

#include <flint/dirichlet.h>

static dirichlet_group_t sagejs_group;
static int sagejs_group_initialized = 0;

void sagejs_wasm_dirichlet_group_clear(void)
{
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

uint64_t sagejs_wasm_dirichlet_group_size(void)
{
    return sagejs_group_initialized ? sagejs_group->phi_q : 0;
}

uint64_t sagejs_wasm_dirichlet_group_exponent(void)
{
    return sagejs_group_initialized ? sagejs_group->expo : 0;
}

uint64_t sagejs_wasm_dirichlet_group_number_primitive(void)
{
    return sagejs_group_initialized
        ? dirichlet_group_num_primitive(sagejs_group)
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
    return sagejs_group->P[component].phi.n;
}

uint64_t sagejs_wasm_dirichlet_group_generator(uint32_t component)
{
    if (!sagejs_group_initialized || component >= (uint32_t) sagejs_group->num)
        return 0;
    return sagejs_group->generators[component];
}
