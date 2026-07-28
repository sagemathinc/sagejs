"""
Names for low-level Sage.js runtime operations.

With the current compiler these attributes are checked at compile time and
lowered directly to their corresponding runtime globals.  These assignments
are the bootstrap implementation used by older checked-in compilers.
"""

# globals: Array, BigInt, console, Element, Error, IntegerFactorization, Map, Math
# globals: Number, Object, PolynomialRing, Proxy
# globals: JSON, Set, create_real_literal, globalThis, isNaN, parseFloat
# globals: parseInt
# globals: QQ, Rational, ReferenceError, Reflect, RegExp, String, SyntaxError
# globals: TypeError
# globals: ZeroDivisionError, require
# globals: ρσ_bigint_divexact, ρσ_bigint_gcd
# globals: ρσ_bigint_fields, ρσ_callable_instance_class
# globals: ρσ_arraylike
# globals: ρσ_coercion_model, ρσ_equals, ρσ_factor_pair, ρσ_flint_backend
# globals: ρσ_integer_bigint, ρσ_is_exact_integer, ρσ_is_math_element
# globals: ρσ_iterator_symbol, ρσ_kwargs_symbol
# globals: ρσ_float, ρσ_int, ρσ_list_constructor, ρσ_list_contains, ρσ_str
# globals: ρσ_tuple
# globals: ρσ_lightweight_math_class, ρσ_sequence_class
# globals: ρσ_math_tuple, ρσ_modular_inverse, ρσ_modular_power, ρσ_modules
# globals: ρσ_output_write
# globals: ρσ_named_tuple
# globals: ρσ_native_method, ρσ_native_method_adapter
# globals: ρσ_normalize_integer, ρσ_operator_add_exact, ρσ_operator_mul_exact
# globals: ρσ_operator_pow_exact, ρσ_repr
# globals: ρσ_set_class_repr, ρσ_string_find, ρσ_string_primitive
# globals: ρσ_strict_equal

def jstype(value):
    return r"%js typeof value"


def map():
    return r"%js new Map()"


def instance_of(value, constructor):
    return r"%js value instanceof constructor"


def native_add(left, right):
    return r"%js left + right"


def native_bitand(left, right):
    return r"%js left & right"


def native_bitor(left, right):
    return r"%js left | right"


def native_bitxor(left, right):
    return r"%js left ^ right"


def native_div(left, right):
    return r"%js left / right"


def native_mul(left, right):
    return r"%js left * right"


def native_mod(left, right):
    return r"%js left % right"


def native_neg(value):
    return r"%js -value"


def native_pow(left, right):
    return r"%js left ** right"


def native_sub(left, right):
    return r"%js left - right"


def native_lshift(left, right):
    return r"%js left << right"


def native_rshift(left, right):
    return r"%js left >> right"


def native_lt(left, right):
    return r"%js left < right"


def native_le(left, right):
    return r"%js left <= right"


def native_gt(left, right):
    return r"%js left > right"


def native_ge(left, right):
    return r"%js left >= right"


array = Array
arraylike = ρσ_arraylike
bigint = BigInt
bigint_divexact = ρσ_bigint_divexact
bigint_gcd = ρσ_bigint_gcd
bigint_fields = ρσ_bigint_fields
callable_instance_class = ρσ_callable_instance_class
console_object = console
coercion_model = ρσ_coercion_model
equals = ρσ_equals
element = Element
error = Error
factor_pair = ρσ_factor_pair
float_builtin = ρσ_float
flint_backend = ρσ_flint_backend
global_object = globalThis
int_builtin = ρσ_int
integer_bigint = ρσ_integer_bigint
integer_factorization = IntegerFactorization
is_exact_integer = ρσ_is_exact_integer
is_math_element = ρσ_is_math_element
is_nan = isNaN
iterator_symbol = ρσ_iterator_symbol
json = JSON
kwargs_symbol = ρσ_kwargs_symbol
lightweight_math_class = ρσ_lightweight_math_class
list_constructor = ρσ_list_constructor
list_contains = ρσ_list_contains
map_class = Map
math = Math
math_tuple = ρσ_math_tuple
named_tuple = ρσ_named_tuple
modular_inverse = ρσ_modular_inverse
modular_power = ρσ_modular_power
modules = ρσ_modules
native_method = ρσ_native_method
native_method_adapter = ρσ_native_method_adapter
normalize_integer = ρσ_normalize_integer
number = Number
object = Object
operator_add_exact = ρσ_operator_add_exact
operator_mul_exact = ρσ_operator_mul_exact
operator_pow_exact = ρσ_operator_pow_exact
output_write = ρσ_output_write
parse_float = parseFloat
parse_int = parseInt
polynomial_ring = PolynomialRing
proxy_class = Proxy
qq = QQ
rational_class = Rational
reflect = Reflect
reference_error = ReferenceError
regexp = RegExp
real_literal = create_real_literal
require_module = require
repr = ρσ_repr
sequence_class = ρσ_sequence_class
set_class = Set
set_class_repr = ρσ_set_class_repr
strict_equal = ρσ_strict_equal
string_find = ρσ_string_find
string_class = String
string_builtin = ρσ_str
string = ρσ_string_primitive
syntax_error = SyntaxError
type_error = TypeError
tuple_builtin = ρσ_tuple
undefined = r"%js undefined"
zero_division_error = ZeroDivisionError
