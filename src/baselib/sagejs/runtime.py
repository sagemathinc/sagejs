"""
Names for low-level Sage.js runtime operations.

With the current compiler these attributes are checked at compile time and
lowered directly to their corresponding runtime globals.  These assignments
are the bootstrap implementation used by older checked-in compilers.
"""

# globals: ρσ_coercion_model, ρσ_equals, ρσ_factor_pair, ρσ_flint_backend
# globals: ρσ_integer_bigint, ρσ_iterator_symbol, ρσ_kwargs_symbol
# globals: ρσ_math_tuple, ρσ_modular_inverse, ρσ_modular_power
# globals: ρσ_normalize_integer, ρσ_operator_mul_exact
# globals: ρσ_operator_pow_exact, ρσ_polynomial_from_coefficients, ρσ_repr
# globals: ρσ_set_class_repr

coercion_model = ρσ_coercion_model
equals = ρσ_equals
factor_pair = ρσ_factor_pair
flint_backend = ρσ_flint_backend
integer_bigint = ρσ_integer_bigint
iterator_symbol = ρσ_iterator_symbol
kwargs_symbol = ρσ_kwargs_symbol
math_tuple = ρσ_math_tuple
modular_inverse = ρσ_modular_inverse
modular_power = ρσ_modular_power
normalize_integer = ρσ_normalize_integer
operator_mul_exact = ρσ_operator_mul_exact
operator_pow_exact = ρσ_operator_pow_exact
polynomial_from_coefficients = ρσ_polynomial_from_coefficients
repr = ρσ_repr
set_class_repr = ρσ_set_class_repr
