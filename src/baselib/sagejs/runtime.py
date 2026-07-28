"""
Names for low-level Sage.js runtime operations.

With the current compiler these attributes are checked at compile time and
lowered directly to their corresponding runtime globals.  These assignments
are the bootstrap implementation used by older checked-in compilers.
"""

# globals: Array, BigInt, Element, Map, Number, Object, QQ, Reflect, RegExp
# globals: ρσ_bigint_divexact, ρσ_bigint_gcd
# globals: ρσ_bigint_fields, ρσ_callable_instance_class
# globals: ρσ_coercion_model, ρσ_equals, ρσ_factor_pair, ρσ_flint_backend
# globals: ρσ_integer_bigint, ρσ_iterator_symbol, ρσ_kwargs_symbol
# globals: ρσ_lightweight_math_class, ρσ_sequence_class
# globals: ρσ_math_tuple, ρσ_modular_inverse, ρσ_modular_power
# globals: ρσ_normalize_integer, ρσ_operator_mul_exact
# globals: ρσ_operator_pow_exact, ρσ_polynomial_from_coefficients, ρσ_repr
# globals: ρσ_set_class_repr

def jstype(value):
    return r"%js typeof value"


def map():
    return r"%js new Map()"


array = Array
bigint = BigInt
bigint_divexact = ρσ_bigint_divexact
bigint_gcd = ρσ_bigint_gcd
bigint_fields = ρσ_bigint_fields
callable_instance_class = ρσ_callable_instance_class
coercion_model = ρσ_coercion_model
equals = ρσ_equals
element = Element
factor_pair = ρσ_factor_pair
flint_backend = ρσ_flint_backend
integer_bigint = ρσ_integer_bigint
iterator_symbol = ρσ_iterator_symbol
kwargs_symbol = ρσ_kwargs_symbol
lightweight_math_class = ρσ_lightweight_math_class
math_tuple = ρσ_math_tuple
modular_inverse = ρσ_modular_inverse
modular_power = ρσ_modular_power
normalize_integer = ρσ_normalize_integer
number = Number
object = Object
operator_mul_exact = ρσ_operator_mul_exact
operator_pow_exact = ρσ_operator_pow_exact
polynomial_from_coefficients = ρσ_polynomial_from_coefficients
qq = QQ
reflect = Reflect
regexp = RegExp
repr = ρσ_repr
sequence_class = ρσ_sequence_class
set_class_repr = ρσ_set_class_repr
undefined = r"%js undefined"
