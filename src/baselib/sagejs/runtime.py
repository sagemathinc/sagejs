"""
Names for low-level Sage.js runtime operations.

With the current compiler these attributes are checked at compile time and
lowered directly to their corresponding runtime globals.  These assignments
are the bootstrap implementation used by older checked-in compilers.
"""

# globals: Array, Atomics, BigInt, BigUint64Array, console, Date, Element, Error, Function
# globals: FinalizationRegistry, Int32Array, IntegerFactorization, Map, Math
# globals: Number, Object, PolynomialRing, Proxy
# globals: RuntimeError, SharedArrayBuffer
# globals: JSON, Set, create_real_literal, globalThis, isNaN, parseFloat
# globals: parseInt
# globals: QQ, Rational, ReferenceError, Reflect, RegExp, String, SyntaxError
# globals: TypeError, Uint8Array, WeakRef
# globals: ZeroDivisionError, __sagejs_runtime_require__
# globals: ρσ_bigint_divexact, ρσ_bigint_gcd
# globals: ρσ_bigint_fields, ρσ_callable_instance_class
# globals: ρσ_arraylike
# globals: ρσ_coercion_model, ρσ_equals, ρσ_factor_pair, ρσ_flint_backend
# globals: ρσ_integer_bigint, ρσ_is_exact_integer, ρσ_is_math_element
# globals: ρσ_json_scalar_sequence
# globals: ρσ_integer_buffer, ρσ_integer_buffer_from_packed_bytes
# globals: ρσ_integer_buffer_prefix
# globals: ρσ_integer_buffer_to_packed_bytes
# globals: ρσ_exact_integer_values_from_packed_bytes
# globals: ρσ_exact_integer_values_to_packed_bytes
# globals: ρσ_canonical_rational_values_to_packed_bytes
# globals: ρσ_exact_integer_range_iterator, ρσ_exact_integer_range_values
# globals: ρσ_reduced_rational_values_from_parts, ρσ_reference_matrix_flatten
# globals: ρσ_reference_matrix_transpose
# globals: ρσ_rational_buffers_from_packed_bytes
# globals: ρσ_integer_buffer_used_word_capacity
# globals: ρσ_uint64_pack_le, ρσ_uint64_unpack_le
# globals: ρσ_ffi_call, ρσ_ffi_resource_borrow, ρσ_ffi_resource_close
# globals: ρσ_ffi_resource_copy_bytes
# globals: ρσ_ffi_resource_closed, ρσ_ffi_resource_create
# globals: ρσ_ffi_view_create, ρσ_ffi_view_valid
# globals: ρσ_iterator_symbol, ρσ_kwargs_symbol
# globals: ρσ_non_exception_throw
# globals: ρσ_float, ρσ_int, ρσ_list_constructor, ρσ_list_contains, ρσ_str
# globals: ρσ_tuple
# globals: ρσ_lightweight_math_class, ρσ_sequence_class
# globals: ρσ_math_tuple, ρσ_modular_inverse, ρσ_modular_power, ρσ_modules
# globals: ρσ_output_write
# globals: ρσ_live_scope_dict, ρσ_named_tuple, ρσ_scope_dict
# globals: ρσ_unbound_method_adapter
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


def native_get(value, property_name):
    """Read a JavaScript property, allowing ordinary primitive boxing."""
    return r"%js value[property_name]"


def uint64_buffer(source):
    """Return owned packed unsigned-64-bit storage.

    `source` may be a nonnegative length or an iterable of exact unsigned
    integers.  This is a representation primitive: mathematical modules use
    it instead of naming a JavaScript typed-array constructor directly.
    """
    return r"""%js (() => {
        if (Number.isSafeInteger(source) && source >= 0) {
            return new BigUint64Array(source);
        }
        if (source instanceof BigUint64Array) {
            const start = source.byteOffset;
            const stop = start + source.byteLength;
            return new BigUint64Array(source.buffer.slice(start, stop));
        }
        return BigUint64Array.from(source, (value) => BigInt(value));
    })()"""


def immutable_uint64_capsule(source, owner, model, format, count):
    """Copy unsigned words into opaque immutable runtime-owned storage.

    The capsule exposes neither its words nor its binding. `owner` is matched
    by identity; `model`, `format`, and `count` are matched exactly whenever a
    consumer requests either a native lease or a dynamic copy.
    """
    try:
        return r"%js globalThis.__sagejs_create_immutable_uint64_capsule__(source, owner, model, format, count)"
    except:
        message = r"%js ρσ_last_exception.message"
        if r"%js ρσ_last_exception instanceof RangeError":
            raise ValueError(message)
        raise TypeError(message)


def immutable_uint64_capsule_lease(capsule, owner, model, format, count):
    """Authorize a short-lived read-only native lease for `capsule`."""
    try:
        return r"%js globalThis.__sagejs_authorize_immutable_uint64_capsule__(capsule, owner, model, format, count)"
    except:
        message = r"%js ρσ_last_exception.message"
        if r"%js ρσ_last_exception instanceof RangeError":
            raise ValueError(message)
        raise TypeError(message)


def immutable_uint64_capsule_copy(capsule, owner, model, format, count):
    """Return an owned mutable copy for source-transparent dynamic fallback."""
    try:
        return r"%js globalThis.__sagejs_copy_immutable_uint64_capsule__(capsule, owner, model, format, count)"
    except:
        message = r"%js ρσ_last_exception.message"
        if r"%js ρσ_last_exception instanceof RangeError":
            raise ValueError(message)
        raise TypeError(message)


def integer_buffer(source, minimum_word_capacity=1):
    """Pack primitive exact integers into owned signed-limb storage."""
    return ρσ_integer_buffer(source, minimum_word_capacity)


def integer_buffer_from_packed_bytes(source, length):
    """Decode SagePack signed magnitudes into owned IntegerBuffer storage."""
    return ρσ_integer_buffer_from_packed_bytes(source, length)


def integer_buffer_to_packed_bytes(source):
    """Encode owned IntegerBuffer storage as SagePack signed magnitudes."""
    return ρσ_integer_buffer_to_packed_bytes(source)


def exact_integer_values_to_packed_bytes(values):
    """Encode exact values as canonical variable-length signed magnitudes."""
    return ρσ_exact_integer_values_to_packed_bytes(values)


def canonical_rational_values_to_packed_bytes(values, rational_class, parent):
    """Encode canonical integers/rationals, or return `undefined`.

    This fail-closed representation primitive recognizes primitive exact
    integers and frozen instances of `rational_class` owned by `parent`. It
    invokes no language-level coercion or conversion protocol. Callers retain
    their ordinary coercion path for every unrecognized value.
    """
    return ρσ_canonical_rational_values_to_packed_bytes(values, rational_class, parent)


def exact_integer_values_from_packed_bytes(source, count, start=0):
    """Decode canonical signed magnitudes at a byte offset."""
    return ρσ_exact_integer_values_from_packed_bytes(source, count, start)


def exact_integer_range_values(start, step, length):
    """Materialize trusted exact range values into a native array."""
    return ρσ_exact_integer_range_values(start, step, length)


def exact_integer_range_iterator(start, step, length):
    """Return a lazy native iterator over trusted exact range values."""
    return ρσ_exact_integer_range_iterator(start, step, length)


def reduced_rational_values_from_parts(parts, rational_class, parent):
    """Construct immutable rationals from trusted reduced interleaved parts."""
    return ρσ_reduced_rational_values_from_parts(parts, rational_class, parent)


def reference_matrix_transpose(rows, row_count, column_count):
    """Transpose nested arrays without copying their scalar objects."""
    return ρσ_reference_matrix_transpose(rows, row_count, column_count)


def reference_matrix_flatten(rows, row_count, column_count):
    """Flatten nested arrays without copying their scalar objects."""
    return ρσ_reference_matrix_flatten(rows, row_count, column_count)


def rational_buffers_from_packed_bytes(source, length):
    """Decode normalized rational pairs into two owned IntegerBuffers."""
    return ρσ_rational_buffers_from_packed_bytes(source, length)


def uint64_buffer_prefix(source, length):
    """Copy the first `length` entries into owned unsigned-64-bit storage.

    This representation primitive keeps packed result truncation out of the
    mathematical host language.  It validates the requested prefix before
    borrowing the source buffer and always returns independently owned bytes.
    """
    return r"""%js (() => {
        if (!(source instanceof BigUint64Array)) {
            throw new TypeError("source must be a BigUint64Array");
        }
        if (
            !Number.isSafeInteger(length)
            || length < 0
            || length > source.length
        ) {
            throw new RangeError("invalid uint64 buffer prefix length");
        }
        const start = source.byteOffset;
        const stop = start + length * BigUint64Array.BYTES_PER_ELEMENT;
        return new BigUint64Array(source.buffer.slice(start, stop));
    })()"""


def uint64_pack_le(source, width):
    """Pack unsigned 64-bit entries into explicit little-endian bytes.

    `width` must be 1, 2, 4, or 8. Values that do not fit the selected
    width are rejected rather than truncated. Byte shifts are explicit, so
    the result does not depend on host endianness.
    """
    return ρσ_uint64_pack_le(source, width)


def uint64_unpack_le(source, width, length):
    """Unpack an exact-length little-endian byte sequence as uint64 entries.

    The source length must be exactly `width * length`; both truncated and
    overlong inputs fail. Decoding uses explicit shifts and is portable across
    native host byte orders.
    """
    return ρσ_uint64_unpack_le(source, width, length)


def uint64_matrix_format(source, rows, columns):
    """Format a row-major uint64 matrix with Sage's default alignment.

    This stable structural primitive handles ordinary dense unsigned entries:
    decimal text, one global entry width, square brackets around each row, and
    a single space between columns. Row or column subdivisions remain the
    responsibility of the mathematical matrix layer.
    """
    return r"""%js (() => {
        if (!(source instanceof BigUint64Array)) {
            throw new TypeError("source must be a BigUint64Array");
        }
        if (!Number.isSafeInteger(rows) || rows < 0 ||
            !Number.isSafeInteger(columns) || columns < 0 ||
            (rows !== 0 &&
                columns > Math.floor(Number.MAX_SAFE_INTEGER / rows))) {
            throw new RangeError("invalid uint64 matrix dimensions");
        }
        if (source.length !== rows * columns) {
            throw new RangeError(
                "uint64 matrix entry count does not match dimensions"
            );
        }
        if (rows === 0) return "[]";
        const entries = new Array(source.length);
        let width = 0;
        for (let index = 0; index < source.length; index += 1) {
            const text = source[index].toString();
            entries[index] = text;
            if (text.length > width) width = text.length;
        }
        const lines = new Array(rows);
        for (let row = 0; row < rows; row += 1) {
            const fields = new Array(columns);
            const offset = row * columns;
            for (let column = 0; column < columns; column += 1) {
                fields[column] = entries[offset + column].padStart(width, " ");
            }
            lines[row] = "[" + fields.join(" ") + "]";
        }
        return lines.join("\n");
    })()"""


def uint64_polynomial_format(source, variable):
    """Format canonical low-to-high prime-field polynomial residues."""
    return r"""%js (() => {
        if (!(source instanceof BigUint64Array)) {
            throw new TypeError("source must be a BigUint64Array");
        }
        if (typeof variable !== "string") {
            throw new TypeError("polynomial variable must be a string");
        }
        const pieces = [];
        for (let exponent = source.length - 1; exponent >= 0; exponent -= 1) {
            const coefficient = source[exponent];
            if (coefficient === 0n) continue;
            if (exponent === 0) {
                pieces.push(coefficient.toString());
                continue;
            }
            const monomial = exponent === 1
                ? variable
                : variable + "^" + exponent.toString();
            pieces.push(
                coefficient === 1n
                    ? monomial
                    : coefficient.toString() + "*" + monomial
            );
        }
        return pieces.length === 0 ? "0" : pieces.join(" + ");
    })()"""


def uint64_residue_elements(source, parent, element_type):
    """Materialize immutable prime-field elements from canonical residues.

    This structural primitive performs one checked traversal of compiler-owned
    packed storage. It bypasses repeated coercion because every source entry is
    already a canonical residue, but still constructs ordinary immutable
    mathematical elements with their public parent and class.
    """
    return r"""%js (() => {
        if (!(source instanceof BigUint64Array)) {
            throw new TypeError("source must be a BigUint64Array");
        }
        if (typeof element_type !== "function" ||
            Reflect.get(parent, "_elementType") !== element_type) {
            throw new TypeError("invalid uint64 residue element type");
        }
        const prototype = Reflect.get(element_type, "prototype");
        if (prototype === null || typeof prototype !== "object") {
            throw new TypeError("invalid uint64 residue element prototype");
        }
        const modulus = BigInt(Reflect.get(parent, "_modulus"));
        if (modulus <= 0n || modulus > 0xffffffffffffffffn) {
            throw new RangeError("invalid uint64 residue modulus");
        }
        const output = new Array(source.length);
        for (let index = 0; index < source.length; index += 1) {
            const residue = source[index];
            if (residue >= modulus) {
                throw new RangeError("noncanonical uint64 residue");
            }
            const value = Object.create(prototype);
            value._parent = parent;
            value._value = residue;
            output[index] = Object.freeze(value);
        }
        return ρσ_list_decorate(output);
    })()"""


def integer_buffer_prefix(source, length):
    """Copy a packed exact-integer prefix without materializing integers."""
    return ρσ_integer_buffer_prefix(source, length)


def integer_buffer_used_word_capacity(source):
    """Return the occupied signed-limb width of a packed IntegerBuffer.

    The scan belongs to the representation boundary so mathematical Python
    never pays an interpreted per-entry loop merely to inspect ABI metadata.
    """
    return ρσ_integer_buffer_used_word_capacity(source)


def uint64_residue_buffer(source, modulus):
    """Pack primitive exact integers as canonical residues, or return undefined.

    The caller retains the ordinary coercion path for mathematical elements.
    This primitive handles the overwhelmingly common flat-list constructor
    without allocating one host-language object per residue.
    """
    return r"""%js (() => {
        const prime = BigInt(modulus);
        if (prime <= 0n || prime > 0xffffffffffffffffn) {
            throw new RangeError("invalid uint64 residue modulus");
        }
        const length = source.length;
        if (!Number.isSafeInteger(length) || length < 0) return undefined;
        const output = new BigUint64Array(length);
        for (let index = 0; index < length; index += 1) {
            const value = source[index];
            let exact;
            if (typeof value === "bigint") {
                exact = value;
            } else if (Number.isSafeInteger(value)) {
                exact = BigInt(value);
            } else {
                return undefined;
            }
            let residue = exact % prime;
            if (residue < 0n) residue += prime;
            output[index] = residue;
        }
        return output;
    })()"""


def native_freeze_tuple(values, prototype):
    """Install the shared tuple prototype and freeze a fresh native array."""
    return r"""%js (
        Object.setPrototypeOf(values, prototype),
        Object.freeze(values),
        values
    )"""


def json_scalar_sequence(source):
    """Copy a JSON-scalar sequence using the host's native array loop.

    Return `None` when any entry needs recursive materialization. Finite
    numbers, exact integers, strings, booleans, and `None` are copied;
    non-finite floating-point entries are normalized to `None`.
    """
    return ρσ_json_scalar_sequence(source)


def wall_time():
    """Return Unix time as a native JavaScript floating-point number."""
    return r"""%js (
        typeof globalThis.performance !== "undefined"
        && typeof globalThis.performance.now === "function"
        ? (globalThis.performance.timeOrigin + globalThis.performance.now()) / 1000
        : Date.now() / 1000
    )"""


def check_interrupt():
    """Raise KeyboardInterrupt when the embedding host requests it."""
    return r"%js ρσ_check_interrupt()"


def blocking_sleep(seconds):
    """Synchronously sleep in Node or an isolated browser worker."""
    return r"""%js (() => {
        if (
            typeof SharedArrayBuffer !== "function" ||
            typeof Atomics !== "object" ||
            typeof Atomics.wait !== "function"
        ) {
            throw new RuntimeError(
                "time.sleep() requires Node.js or an isolated Web Worker"
            );
        }
        try {
            const state = (
                globalThis.__sagejs_interrupt_state__
                ?? new Int32Array(new SharedArrayBuffer(4))
            );
            Atomics.wait(
                state,
                0,
                0,
                Number(seconds) * 1000
            );
            ρσ_check_interrupt();
        } catch (error) {
            if (error?.code === "ERR_SCRIPT_EXECUTION_INTERRUPTED") {
                throw ρσ_normalize_exception(error);
            }
            if (
                error instanceof KeyboardInterrupt
                || error?.name === "KeyboardInterrupt"
            ) {
                throw error;
            }
            throw new RuntimeError(
                "time.sleep() cannot block this JavaScript execution context"
            );
        }
    })()"""


def ρσ_dynamic_eval(
    javascript,
    input_namespace,
    module_id,
):
    return r"""%js (() => {
        const ρσ_dynamic_modules = {
            [module_id]: Object.assign({}, input_namespace)
        };
        const __sagejs_input_namespace__ = input_namespace;
        const evaluate = new Function(
            "ρσ_modules",
            "__sagejs_input_namespace__",
            "javascript",
            "return eval(javascript)"
        );
        const completion = evaluate(
            ρσ_dynamic_modules,
            __sagejs_input_namespace__,
            javascript
        );
        return {completion, namespace: ρσ_dynamic_modules[module_id]};
    })()"""


def register_doc(name, value, metadata=None):
    """Register a public runtime object and optional DocSpec metadata."""
    registry = reflect.get(global_object, "__sagejs_doc_registry__")
    if registry is undefined:
        registry = []
        reflect.set(global_object, "__sagejs_doc_registry__", registry)
    if metadata is None:
        metadata = object.create(None)
    reflect.apply(
        reflect.get(registry, "push"),
        registry,
        [[name, value, metadata]],
    )


def documentation_registry():
    """Return public names explicitly registered for documentation."""
    registry = reflect.get(global_object, "__sagejs_doc_registry__")
    if registry is undefined:
        return []
    return registry


array = Array
arraylike = ρσ_arraylike
bigint = BigInt
bigint_divexact = ρσ_bigint_divexact
bigint_gcd = ρσ_bigint_gcd
bigint_fields = ρσ_bigint_fields
callable_instance_class = ρσ_callable_instance_class
console_object = console
coercion_model = ρσ_coercion_model
dynamic_eval = ρσ_dynamic_eval
equals = ρσ_equals
element = Element
error = Error
function_class = Function
factor_pair = ρσ_factor_pair
finalization_registry_class = FinalizationRegistry
float_builtin = ρσ_float
flint_backend = ρσ_flint_backend
ffi_call = ρσ_ffi_call
ffi_resource_borrow = ρσ_ffi_resource_borrow
ffi_resource_close = ρσ_ffi_resource_close
ffi_resource_closed = ρσ_ffi_resource_closed
ffi_resource_copy_bytes = ρσ_ffi_resource_copy_bytes
ffi_resource_create = ρσ_ffi_resource_create
ffi_view_create = ρσ_ffi_view_create
ffi_view_valid = ρσ_ffi_view_valid
global_object = globalThis
int_builtin = ρσ_int
bool_builtin = ρσ_bool
integer_bigint = ρσ_integer_bigint
integer_factorization = IntegerFactorization
is_exact_integer = ρσ_is_exact_integer
is_math_element = ρσ_is_math_element
is_nan = isNaN
iterator_symbol = ρσ_iterator_symbol
last_exception = r"%js ρσ_last_exception"
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
unbound_method_adapter = ρσ_unbound_method_adapter
non_exception_throw = ρσ_non_exception_throw
normalize_integer = ρσ_normalize_integer
native_number_class = Number
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
require_module = __sagejs_runtime_require__
repr = ρσ_repr
live_scope_dict = ρσ_live_scope_dict
scope_dict = ρσ_scope_dict
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
weak_ref_class = WeakRef
zero_division_error = ZeroDivisionError
