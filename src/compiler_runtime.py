"""Minimal `sagejs.runtime` implementation for the compiler process.

The compiler is itself compiled Python and needs the core Python object model,
but it does not execute Sage mathematical operations.  Keeping that boundary
explicit avoids initializing the complete mathematical baselib once in the
compiler VM and a second time in the generated program.

This module is compiled with module id `sagejs.runtime` only inside the
compiler.  Generated programs continue to use `baselib/sagejs/runtime.py`.
"""

# globals: Array, BigInt, Error, Function, JSON, Map, Math, Number, Object
# globals: Proxy, ReferenceError, Reflect, RegExp, String, SyntaxError
# globals: RuntimeError, TypeError, ZeroDivisionError, globalThis, isNaN
# globals: parseFloat, parseInt
# globals: __sagejs_runtime_require__
# globals: ρσ_arraylike, ρσ_bool, ρσ_equals, ρσ_float
# globals: ρσ_flint_backend, ρσ_int, ρσ_integer_bigint, ρσ_is_exact_integer
# globals: ρσ_iterator_symbol, ρσ_kwargs_symbol, ρσ_lightweight_math_class
# globals: ρσ_list_constructor, ρσ_list_contains, ρσ_math_tuple
# globals: ρσ_modular_inverse, ρσ_modular_power, ρσ_modules
# globals: ρσ_native_method, ρσ_non_exception_throw
# globals: ρσ_normalize_integer, ρσ_output_write, ρσ_repr, ρσ_scope_dict
# globals: ρσ_operator_add_exact, ρσ_operator_mul_exact
# globals: ρσ_sequence_class, ρσ_set_class_repr, ρσ_str, ρσ_strict_equal
# globals: ρσ_string_find, ρσ_string_primitive, ρσ_tuple


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


def native_ge(left, right):
    return r"%js left >= right"


def native_get(value, property_name):
    return r"%js value[property_name]"


def native_gt(left, right):
    return r"%js left > right"


def native_le(left, right):
    return r"%js left <= right"


def native_lshift(left, right):
    return r"%js left << right"


def native_lt(left, right):
    return r"%js left < right"


def native_mod(left, right):
    return r"%js left % right"


def native_mul(left, right):
    return r"%js left * right"


def native_neg(value):
    return r"%js -value"


def native_pow(left, right):
    return r"%js left ** right"


def native_rshift(left, right):
    return r"%js left >> right"


def native_sub(left, right):
    return r"%js left - right"


def native_method_adapter(target_function):
    return r"""%js (() => {
        function method(...args) {
            args.unshift(this);
            return Reflect.apply(target_function, undefined, args);
        }
        if (target_function.__argnames__) {
            method.__argnames__ = target_function.__argnames__.slice(1);
        }
        for (const name of [
            "__annotations__", "__annotations_text__", "__code__",
            "__defaults__", "__doc__", "__globals__",
            "__handles_kwarg_interpolation__", "__kwdefaults__",
            "__kwonly__", "__module__", "__name__",
            "__positional_only__", "__python_type__", "__qualname__",
            "__varargs__", "__varkw__",
        ]) {
            const descriptor = Object.getOwnPropertyDescriptor(
                target_function, name
            );
            if (descriptor && typeof descriptor.get === "function") {
                Object.defineProperty(method, name, descriptor);
            } else {
                method[name] = target_function[name];
            }
        }
        method.__sagejs_native_method__ = true;
        return method;
    })()"""


def unbound_method_adapter(target_function):
    return r"""%js (() => {
        if (target_function.__sagejs_unbound_adapter__) {
            return target_function.__sagejs_unbound_adapter__;
        }
        function method(receiver, ...args) {
            return Reflect.apply(target_function, receiver, args);
        }
        if (target_function.__argnames__) {
            method.__argnames__ = ["self", ...target_function.__argnames__];
        }
        for (const name of [
            "__annotations__", "__annotations_text__", "__code__",
            "__defaults__", "__doc__", "__globals__",
            "__handles_kwarg_interpolation__", "__kwdefaults__",
            "__kwonly__", "__module__", "__name__",
            "__positional_only__", "__python_type__", "__qualname__",
            "__varargs__", "__varkw__",
        ]) {
            if (name !== "__argnames__") {
                const descriptor = Object.getOwnPropertyDescriptor(
                    target_function, name
                );
                if (descriptor && typeof descriptor.get === "function") {
                    Object.defineProperty(method, name, descriptor);
                } else {
                    method[name] = target_function[name];
                }
            }
        }
        method.__func__ = target_function;
        method.__python_descriptor__ = true;
        target_function.__sagejs_unbound_adapter__ = method;
        return method;
    })()"""


def exact_integer_range_iterator(start, step, length):
    return r"""%js (() => {
        function exactInteger(value) {
            return typeof value === "bigint" || Number.isSafeInteger(value);
        }
        function exactAdd(left, right) {
            if (typeof left === "bigint" || typeof right === "bigint") {
                return BigInt(left) + BigInt(right);
            }
            const answer = left + right;
            return Number.isSafeInteger(answer)
                ? answer
                : BigInt(left) + BigInt(right);
        }
        if (!exactInteger(start) || !exactInteger(step)) {
            throw new TypeError("exact range start and step must be integers");
        }
        if (step === 0 || step === 0n) {
            throw new RangeError("exact range step must not be zero");
        }
        if ((typeof length === "bigint" && length < 0n) ||
            (typeof length !== "bigint" &&
                (!Number.isSafeInteger(length) || length < 0))) {
            throw new RangeError("invalid exact range length");
        }
        let current = start;
        let remaining = length;
        const zero = typeof remaining === "bigint" ? 0n : 0;
        const one = typeof remaining === "bigint" ? 1n : 1;
        return {
            next() {
                if (remaining === zero) {
                    return { done: true, value: undefined };
                }
                const value = current;
                current = exactAdd(current, step);
                remaining -= one;
                return { done: false, value };
            },
            [Symbol.iterator]() { return this; },
        };
    })()"""


def exact_integer_range_values(start, step, length):
    return r"""%js (() => {
        function exactInteger(value) {
            return typeof value === "bigint" || Number.isSafeInteger(value);
        }
        function exactAdd(left, right) {
            if (typeof left === "bigint" || typeof right === "bigint") {
                return BigInt(left) + BigInt(right);
            }
            const answer = left + right;
            return Number.isSafeInteger(answer)
                ? answer
                : BigInt(left) + BigInt(right);
        }
        if (!exactInteger(start) || !exactInteger(step)) {
            throw new TypeError("exact range start and step must be integers");
        }
        if (step === 0 || step === 0n) {
            throw new RangeError("exact range step must not be zero");
        }
        let size;
        if (typeof length === "bigint") {
            if (length < 0n || length > 0xffffffffn) {
                throw new RangeError("exact range is too large to materialize");
            }
            size = Number(length);
        } else {
            if (!Number.isSafeInteger(length) || length < 0 ||
                length > 0xffffffff) {
                throw new RangeError("invalid exact range length");
            }
            size = length;
        }
        const answer = new Array(size);
        if (size === 0) return answer;
        if (typeof start === "number" && typeof step === "number") {
            const last = start + step * (size - 1);
            if (Number.isSafeInteger(last)) {
                let current = start;
                for (let index = 0; index < size; index += 1) {
                    answer[index] = current;
                    current += step;
                }
                return answer;
            }
        }
        let current = start;
        for (let index = 0; index < size; index += 1) {
            answer[index] = current;
            current = exactAdd(current, step);
        }
        return answer;
    })()"""


def dynamic_eval(javascript, input_namespace, module_id):
    return r"""%js (() => {
        const dynamicModules = {[module_id]: Object.assign({}, input_namespace)};
        const inputNamespace = input_namespace;
        const evaluate = new Function(
            "ρσ_modules", "__sagejs_input_namespace__", "javascript",
            "return eval(javascript)"
        );
        const completion = evaluate(dynamicModules, inputNamespace, javascript);
        return {completion, namespace: dynamicModules[module_id]};
    })()"""


def output_write(text):
    return r"""%js (
        typeof globalThis.__sagejs_output_write__ === "function"
        ? globalThis.__sagejs_output_write__(String(text))
        : process.stdout.write(String(text))
    )"""


def _not_a_math_element(value):
    return False


def _unavailable_math_value(*args, **kwargs):
    raise RuntimeError("mathematical runtime operation used inside compiler")


class _UnavailableMathType:
    def __init__(self, *args, **kwargs):
        _unavailable_math_value(*args, **kwargs)


def register_doc(name, value, metadata=None):
    registry = reflect.get(global_object, "__sagejs_doc_registry__")
    if registry is undefined:
        registry = []
        reflect.set(global_object, "__sagejs_doc_registry__", registry)
    if metadata is None:
        metadata = object.create(None)
    reflect.apply(reflect.get(registry, "push"), registry, [[name, value, metadata]])


def documentation_registry():
    registry = reflect.get(global_object, "__sagejs_doc_registry__")
    if registry is undefined:
        return []
    return registry


array = Array
arraylike = ρσ_arraylike
bigint = BigInt
bool_builtin = ρσ_bool
coercion_model = Object.create(None)
equals = ρσ_equals
error = Error
flint_backend = ρσ_flint_backend
float_builtin = ρσ_float
function_class = Function
global_object = globalThis
int_builtin = ρσ_int
integer_bigint = ρσ_integer_bigint
integer_factorization = _UnavailableMathType
is_exact_integer = ρσ_is_exact_integer
is_math_element = _not_a_math_element
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
modular_inverse = ρσ_modular_inverse
modular_power = ρσ_modular_power
modules = ρσ_modules
native_method = ρσ_native_method
native_number_class = Number
non_exception_throw = ρσ_non_exception_throw
normalize_integer = ρσ_normalize_integer
number = Number
object = Object
operator_add_exact = ρσ_operator_add_exact
operator_mul_exact = ρσ_operator_mul_exact
parse_float = parseFloat
parse_int = parseInt
proxy_class = Proxy
rational_class = _UnavailableMathType
real_literal = _unavailable_math_value
reference_error = ReferenceError
reflect = Reflect
regexp = RegExp
repr = ρσ_repr
require_module = __sagejs_runtime_require__
scope_dict = ρσ_scope_dict
sequence_class = ρσ_sequence_class
set_class = Set
set_class_repr = ρσ_set_class_repr
strict_equal = ρσ_strict_equal
string = ρσ_string_primitive
string_builtin = ρσ_str
string_class = String
string_find = ρσ_string_find
syntax_error = SyntaxError
tuple_builtin = ρσ_tuple
type_error = TypeError
undefined = r"%js undefined"
zero_division_error = ZeroDivisionError
