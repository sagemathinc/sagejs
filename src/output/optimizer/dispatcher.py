from output.optimizer.scalar import print_closed_field_region
from output.optimizer.bounded_integer import print_bounded_integer_region
from output.optimizer.strict_float import print_strict_float_region
from output.optimizer.strict_float_array import print_strict_float_array_region


LOWERINGS = {
    "v8.bounded-integer-loop.v1": print_bounded_integer_region,
    "v8.closed-ring-loop.v1": print_closed_field_region,
    "v8.strict-float-array-loop.v1": print_strict_float_array_region,
    "v8.strict-float-loop.v1": print_strict_float_region,
}


def print_optimized_for_in(loop, output):
    """Dispatch only a verifier-registered selected target lowering."""
    lowering_id = loop.optimization_region.loweringId
    if lowering_id not in LOWERINGS:
        raise TypeError(
            "selected optimizer region has no target lowering: " + lowering_id
        )
    lowering = LOWERINGS[lowering_id]
    return lowering(loop, output)
