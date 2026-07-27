# globals: exports, console, require, BigInt, ρσ_iterator_symbol, ρσ_kwargs_symbol, ρσ_arraylike, ρσ_list_contains

def abs(a):
    if jstype(a) is 'bigint':
        return v'a < 0n ? -a : a'
    return r"%js (typeof a === 'object' && a.__abs__ !== undefined) ? a.__abs__() : Math.abs(a)"

def ρσ_exact_integer_primitive(value):
    return v"""typeof value === "bigint" ||
        (typeof value === "number" && Number.isSafeInteger(value))"""

def ρσ_operator_add(a, b):
    if ρσ_is_math_element(a) or ρσ_is_math_element(b):
        return ρσ_coercion_model.binOp('add', a, b)
    return r"""%js (
typeof a !== 'object' ? a + b :
    ((a.__add__ !== undefined ? a.__add__(b) :
      a.concat !== undefined ? a.concat(b) :
      a + b)
    )
)
"""

def ρσ_operator_add_exact(a, b):
    if ρσ_is_math_element(a) or ρσ_is_math_element(b):
        return ρσ_coercion_model.binOp('add', a, b)
    if jstype(a) is 'object':
        if a.__add__ is not undefined:
            return a.__add__(b)
        if a.concat is not undefined:
            return a.concat(b)
        return v'a + b'
    if jstype(a) is 'bigint' or jstype(b) is 'bigint':
        if ρσ_exact_integer_primitive(a) and ρσ_exact_integer_primitive(b):
            return v'BigInt(a) + BigInt(b)'
        return v'a + b'
    if jstype(a) is not 'number' or jstype(b) is not 'number':
        return v'a + b'
    result = v'a + b'
    if v'result <= Number.MAX_SAFE_INTEGER && result >= Number.MIN_SAFE_INTEGER':
        return result
    if Number.isSafeInteger(a) and Number.isSafeInteger(b):
        return v'BigInt(a) + BigInt(b)'
    return result

def ρσ_operator_neg(a):
    return v"(typeof a === 'object' && a.__neg__ !== undefined) ? a.__neg__() : (-a)"

def ρσ_operator_sub(a, b):
    if ρσ_is_math_element(a) or ρσ_is_math_element(b):
        return ρσ_coercion_model.binOp('sub', a, b)
    return v"(typeof a === 'object' && a.__sub__ !== undefined) ? a.__sub__(b) : a - b"

def ρσ_operator_sub_exact(a, b):
    if ρσ_is_math_element(a) or ρσ_is_math_element(b):
        return ρσ_coercion_model.binOp('sub', a, b)
    if jstype(a) is 'object' and a.__sub__ is not undefined:
        return a.__sub__(b)
    if jstype(a) is 'bigint' or jstype(b) is 'bigint':
        if ρσ_exact_integer_primitive(a) and ρσ_exact_integer_primitive(b):
            return v'BigInt(a) - BigInt(b)'
        return v'a - b'
    if jstype(a) is not 'number' or jstype(b) is not 'number':
        return v'a - b'
    result = v'a - b'
    if v'result <= Number.MAX_SAFE_INTEGER && result >= Number.MIN_SAFE_INTEGER':
        return result
    if Number.isSafeInteger(a) and Number.isSafeInteger(b):
        return v'BigInt(a) - BigInt(b)'
    return result

def ρσ_operator_mul(a, b):
    if ρσ_is_math_element(a) or ρσ_is_math_element(b):
        return ρσ_coercion_model.binOp('mul', a, b)
    return v"(typeof a === 'object'  && a.__mul__ !== undefined) ? a.__mul__(b) : a * b"

def ρσ_operator_mul_exact(a, b):
    if ρσ_is_math_element(a) or ρσ_is_math_element(b):
        return ρσ_coercion_model.binOp('mul', a, b)
    if jstype(a) is 'object' and a.__mul__ is not undefined:
        return a.__mul__(b)
    if jstype(a) is 'bigint' or jstype(b) is 'bigint':
        if ρσ_exact_integer_primitive(a) and ρσ_exact_integer_primitive(b):
            return v'BigInt(a) * BigInt(b)'
        return v'a * b'
    if jstype(a) is not 'number' or jstype(b) is not 'number':
        return v'a * b'
    result = v'a * b'
    if v'result <= Number.MAX_SAFE_INTEGER && result >= Number.MIN_SAFE_INTEGER':
        return result
    if Number.isSafeInteger(a) and Number.isSafeInteger(b):
        return v'BigInt(a) * BigInt(b)'
    return result

def ρσ_operator_div(a, b):
    if ρσ_is_math_element(a) or ρσ_is_math_element(b):
        return ρσ_coercion_model.binOp('truediv', a, b)
    return v"(typeof a === 'object'  && a.__div__ !== undefined) ? a.__div__(b) : a / b"

def ρσ_operator_pow(a, b):
    return v"(typeof a === 'object'  && a.__pow__ !== undefined) ? a.__pow__(b) : a ** b"

def ρσ_operator_pow_exact(a, b):
    if jstype(a) is 'object' and a.__pow__ is not undefined:
        return a.__pow__(b)
    if ((jstype(a) is 'bigint' or jstype(b) is 'bigint')
            and ρσ_exact_integer_primitive(a)
            and ρσ_exact_integer_primitive(b)):
        if b < 0:
            raise ValueError(
                'negative powers of exact integers are not implemented yet')
        return v'BigInt(a) ** BigInt(b)'
    if jstype(a) is not 'number' or jstype(b) is not 'number':
        return v'a ** b'
    result = v'a ** b'
    if v'result <= Number.MAX_SAFE_INTEGER && result >= Number.MIN_SAFE_INTEGER':
        return result
    if Number.isSafeInteger(a) and Number.isSafeInteger(b) and b >= 0:
        return v'BigInt(a) ** BigInt(b)'
    return result


def ρσ_operator_iadd(a, b):
    return v"(typeof a === 'object' && a.__iadd__ !== undefined) ? a.__iadd__(b) : ρσ_operator_add(a,b)"

def ρσ_operator_isub(a, b):
    return v"(typeof a === 'object' && a.__isub__ !== undefined) ? a.__isub__(b) : ρσ_operator_sub(a,b)"

def ρσ_operator_imul(a, b):
    return v"(typeof a === 'object' && a.__imul__ !== undefined) ? a.__imul__(b) : ρσ_operator_mul(a,b)"

def ρσ_operator_idiv(a, b):
    return v"(typeof a === 'object' && a.__idiv__ !== undefined) ? a.__idiv__(b) : ρσ_operator_div(a,b)"

def ρσ_operator_ipow(a, b):
    return v"(typeof a === 'object' && a.__ipow__ !== undefined) ? a.__ipow__(b) : ρσ_operator_pow(a,b)"

def ρσ_operator_iadd_exact(a, b):
    return v"(typeof a === 'object' && a.__iadd__ !== undefined) ? a.__iadd__(b) : ρσ_operator_add_exact(a,b)"

def ρσ_operator_isub_exact(a, b):
    return v"(typeof a === 'object' && a.__isub__ !== undefined) ? a.__isub__(b) : ρσ_operator_sub_exact(a,b)"

def ρσ_operator_imul_exact(a, b):
    return v"(typeof a === 'object' && a.__imul__ !== undefined) ? a.__imul__(b) : ρσ_operator_mul_exact(a,b)"

def ρσ_operator_ipow_exact(a, b):
    return v"(typeof a === 'object' && a.__ipow__ !== undefined) ? a.__ipow__(b) : ρσ_operator_pow_exact(a,b)"

def ρσ_operator_idiv_exact(a, b):
    return v"(typeof a === 'object' && a.__itruediv__ !== undefined) ? a.__itruediv__(b) : ρσ_operator_truediv_exact(a,b)"


def ρσ_operator_truediv(a, b):
    if ρσ_is_math_element(a) or ρσ_is_math_element(b):
        return ρσ_coercion_model.binOp('truediv', a, b)
    return v"(typeof a === 'object'  && a.__truediv__ !== undefined) ? a.__truediv__(b) : a / b"

def ρσ_operator_truediv_exact(a, b):
    if ρσ_is_math_element(a) or ρσ_is_math_element(b):
        return ρσ_coercion_model.binOp('truediv', a, b)
    if ρσ_exact_integer_primitive(a) and ρσ_exact_integer_primitive(b):
        return new Rational(a, b)
    if jstype(a) is 'object' and a.__truediv__ is not undefined:
        return a.__truediv__(b)
    return v'a / b'

def ρσ_operator_floordiv(a, b):
    return v"(typeof a === 'object'  && a.__floordiv__ !== undefined) ? a.__floordiv__(b) : Math.floor(a / b)"

def ρσ_bool(val):
    return v'!!val'

def ρσ_round(val):
    # no attempt at Python semantics yet
    return v"Math.round(val)"

def ρσ_print():
    if v'typeof console' is 'object':
        parts = v'[]'
        for v'var i = 0; i < arguments.length; i++':
            parts.push(ρσ_str(arguments[i]))  # noqa: undef
        console.log(parts.join(' '))

def ρσ_int(val, base):
    if jstype(val) is "number":
        ans = val | 0
    else:
        ans = parseInt(val, base or 10)
    if isNaN(ans):
        raise ValueError('Invalid literal for int with base ' + (base or 10) + ': ' + val)
    return ans

def ρσ_float(val):
    if jstype(val) is "number":
        ans = val
    elif val and jstype(val.__float__) is 'function':
        ans = val.__float__()
    else:
        ans = parseFloat(val)
    if isNaN(ans):
        raise ValueError('Could not convert string to float: ' + arguments[0])
    return ans

ρσ_max_safe_integer = BigInt(Number.MAX_SAFE_INTEGER)
ρσ_min_safe_integer = BigInt(Number.MIN_SAFE_INTEGER)

def ρσ_integer_literal(text):
    # Preserve exact Sage integer literals without yet replacing the pervasive
    # JavaScript Number representation used by the existing base library.
    # This constructor is the seam for a future Sage Integer element type.
    text = text.replace(RegExp('_', 'g'), '')
    # Sage has historically accepted leading-zero decimal integers.  BigInt
    # already interprets their string form as decimal; do not apply old
    # Python-2 octal semantics here.
    value = BigInt(text)
    if ρσ_min_safe_integer <= value <= ρσ_max_safe_integer:
        return Number(value)
    return value

def ρσ_real_literal(text):
    return Number(text.replace(RegExp('_', 'g'), ''))

def ρσ_arraylike_creator():
    names = 'Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array Uint32Array Float32Array Float64Array'.split(' ')
    if jstype(HTMLCollection) is 'function':
        names = names.concat('HTMLCollection NodeList NamedNodeMap TouchList'.split(' '))
    return def(x):
        if Array.isArray(x) or v'typeof x' is 'string' or names.indexOf(Object.prototype.toString.call(x).slice(8, -1)) > -1:
            return True
        return False

def options_object(f):
    return def():
        if v'typeof arguments[arguments.length - 1] === "object"':
            arguments[arguments.length - 1][ρσ_kwargs_symbol] = True
        return f.apply(this, arguments)

def ρσ_id(x):
    return x.ρσ_object_id

def ρσ_dir(item):
    # TODO: this isn't really representative of real Python's dir(), nor is it
    # an intuitive replacement for "for ... in" loop, need to update this logic
    # and introduce a different way of achieving "for ... in"
    arr = []
    for v'var i in item': arr.push(i)  # noqa:undef
    return arr

def ρσ_ord(x):
    ans = x.charCodeAt(0)
    if 0xD800 <= ans <= 0xDBFF:
        second = x.charCodeAt(1)
        if 0xDC00 <= second <= 0xDFFF:
            return (ans - 0xD800) * 0x400 + second - 0xDC00 + 0x10000
        raise TypeError('string is missing the low surrogate char')
    return ans

def ρσ_chr(code):
    if code <= 0xFFFF:
        return String.fromCharCode(code)
    code -= 0x10000
    return String.fromCharCode(0xD800+(code>>10), 0xDC00+(code&0x3FF))

def ρσ_callable(x):
    return v'typeof x === "function"'

def ρσ_bin(x):
    if jstype(x) is not 'number' or x % 1 is not 0:
        raise TypeError('integer required')
    ans = x.toString(2)
    if ans[0] is '-':
        ans = '-' + '0b' + ans[1:]
    else:
        ans = '0b' + ans
    return ans

def ρσ_hex(x):
    if jstype(x) is not 'number' or x % 1 is not 0:
        raise TypeError('integer required')
    ans = x.toString(16)
    if ans[0] is '-':
        ans = '-' + '0x' + ans[1:]
    else:
        ans = '0x' + ans
    return ans

def ρσ_enumerate(iterable):
    ans = v'{"_i":-1}'
    ans[ρσ_iterator_symbol] = def():
        return this
    if ρσ_arraylike(iterable):
        ans['next'] = def():
                this._i += 1
                if this._i < iterable.length:
                    return v"{'done':false, 'value':[this._i, iterable[this._i]]}"
                return v"{'done':true}"
        return ans
    if jstype(iterable[ρσ_iterator_symbol]) is 'function':
        iterator = iterable.keys() if jstype(Map) is 'function' and v'iterable instanceof Map' else iterable[ρσ_iterator_symbol]()
        ans['_iterator'] = iterator
        ans['next'] = def():
            r = this._iterator.next()
            if r.done:
                return v"{'done':true}"
            this._i += 1
            return v"{'done':false, 'value':[this._i, r.value]}"
        return ans
    return ρσ_enumerate(Object.keys(iterable))

def ρσ_reversed(iterable):
    if ρσ_arraylike(iterable):
        ans = v'{"_i": iterable.length}'
        ans['next'] = def():
            this._i -= 1
            if this._i > -1:
                return v"{'done':false, 'value':iterable[this._i]}"
            return v"{'done':true}"
        ans[ρσ_iterator_symbol] = def():
            return this
        return ans
    raise TypeError('reversed() can only be called on arrays or strings')

def ρσ_iter(iterable):
    # Generate a JavaScript iterator object from iterable
    if jstype(iterable[ρσ_iterator_symbol]) is 'function':
        return iterable.keys() if jstype(Map) is 'function' and v'iterable instanceof Map' else iterable[ρσ_iterator_symbol]()
    if ρσ_arraylike(iterable):
        ans = v'{"_i":-1}'
        ans[ρσ_iterator_symbol] = def():
            return this
        ans['next'] = def():
            this._i += 1
            if this._i < iterable.length:
                return v"{'done':false, 'value':iterable[this._i]}"
            return v"{'done':true}"
        return ans
    return ρσ_iter(Object.keys(iterable))

def ρσ_range_next(step, length):
    this._i += step
    this._idx += 1
    if this._idx >= length:
        this._i, this._idx = this.__i, -1
        return v"{'done':true}"
    return v"{'done':false, 'value':this._i}"

def ρσ_range(start, stop, step):
    if arguments.length <= 1:
        stop = start or 0
        start = 0
    step = arguments[2] or 1
    length = Math.max(Math.ceil((stop - start) / step), 0)
    ans = v'{start:start, step:step, stop:stop}'
    ans[ρσ_iterator_symbol] = def():
        it = v'{"_i": start - step, "_idx": -1}'
        it.next = ρσ_range_next.bind(it, step, length)
        it[ρσ_iterator_symbol] = def():
            return this
        return it
    ans.count = def(val):
        if not this._cached:
            this._cached = list(this)
        return this._cached.count(val)
    ans.index = def(val):
        if not this._cached:
            this._cached = list(this)
        return this._cached.index(val)

    def slice(new_start=undefined, new_stop=undefined):
        if step < 0:
            if new_start is undefined and new_stop is undefined:
                return ans
            # I'm too lazy to do this directly, so just fallback for now.
            return list(ans)[new_start:new_stop]

        if new_start is undefined:
            if new_stop is undefined:
                return ans
            else:
                if new_stop < 0:
                    new_stop = (length + new_stop);
                return ρσ_range(start, Math.max(start, Math.min(new_stop*step+start, stop)), step)
        if new_stop is undefined:
            if new_start < 0:
                new_start = (length + new_start);
            return ρσ_range(Math.min(stop, Math.max(new_start*step+start, start)), stop, step)
        else:
            if new_stop < 0:
                new_stop = (length + new_stop);
            if new_start < 0:
                new_start = (length + new_start);
            return ρσ_range(Math.min(new_stop*step, Math.max(new_start*step+start, start)), Math.max(new_start*step+start, Math.min(new_stop*step+start, stop)), step)
    ans.slice = slice;

    # ans.__getitem__

    ans.__len__ = def():
        return length
    ans.__repr__ = def():
        if step == 1:
            return f'range({start}, {stop})'
        else:
            return f'range({start}, {stop}, {step})'
    ans.__str__ = ans.toString = ans.__repr__
    if jstype(Proxy) is 'function':
        ans = new Proxy(ans, {
            'get': def(obj, prop):
                if jstype(prop) is 'string':
                    iprop = parseInt(prop)
                    if not isNaN(iprop):
                        prop = iprop
                if jstype(prop) is 'number':
                    if not obj._cached:
                        obj._cached = list(obj)
                    return obj._cached[prop]
                return obj[prop]
        })
    return ans

v"""var Ellipsis = Object.freeze({
    __repr__: function() { return "Ellipsis"; },
    __str__: function() { return "Ellipsis"; },
    toString: function() { return "Ellipsis"; }
});"""

def ρσ_ellipsis_range(*specification):
    result = []
    saw_ellipsis = False
    for value in specification:
        if value is Ellipsis:
            saw_ellipsis = True
            continue
        if not saw_ellipsis:
            result.push(value)
            continue
        if result.length is 0:
            raise ValueError('an ellipsis range requires a starting value')

        last = result[result.length - 1]
        if result.length >= 2:
            step = ρσ_operator_sub_exact(
                last, result[result.length - 2])
        else:
            step = v"typeof last === 'bigint' ? 1n : 1"
        if step is 0 or (jstype(step) is 'bigint' and step == BigInt(0)):
            raise ValueError('ellipsis range step must not be zero')

        current = ρσ_operator_add_exact(last, step)
        if step > 0:
            while current <= value:
                result.push(current)
                current = ρσ_operator_add_exact(current, step)
        else:
            while current >= value:
                result.push(current)
                current = ρσ_operator_add_exact(current, step)
        saw_ellipsis = False

    if saw_ellipsis:
        raise ValueError('an ellipsis range requires an endpoint')
    return list(result)

def ρσ_ellipsis_iter(*specification):
    return iter(ρσ_ellipsis_range.apply(None, specification))

def ρσ_getattr(obj, name, defval):
    try:
        ret = obj[name]
    except TypeError:
        if defval is undefined:
            raise AttributeError('The attribute ' + name + ' is not present')
        return defval
    if ret is undefined and not v'(name in obj)':
        if defval is undefined:
            raise AttributeError('The attribute ' + name + ' is not present')
        ret = defval
    return ret

def ρσ_setattr(obj, name, value):
    obj[name] = value

def ρσ_hasattr(obj, name):
    return v'name in obj'

ρσ_len = (def ():

    def len(obj):
        if ρσ_arraylike(obj): return obj.length
        if jstype(obj.__len__) is 'function': return obj.__len__()
        if v'obj instanceof Set' or v'obj instanceof Map': return obj.size
        return Object.keys(obj).length

    def len5(obj):
        if ρσ_arraylike(obj): return obj.length
        if jstype(obj.__len__) is 'function': return obj.__len__()
        return Object.keys(obj).length

    return len if v'typeof Set' is 'function' and v'typeof Map' is 'function' else len5
)()

def ρσ_get_module(name):
    return ρσ_modules[name]

def ρσ_pow(x, y, z):
    ans = Math.pow(x, y)
    if z is not undefined:
        ans %= z
    return ans

def ρσ_type(x):
    return x.constructor


def ρσ_divmod(x, y):
    if y is 0:
        raise ZeroDivisionError('integer division or modulo by zero')
    d = Math.floor(x / y)
    return d, x - d * y


def ρσ_factor(value):
    if jstype(value) is 'number':
        if not Number.isSafeInteger(value):
            raise TypeError('factor() requires a safe integer; use a BigInt for larger values')
        value = BigInt(value)
    elif jstype(value) is not 'bigint':
        raise TypeError('factor() requires an integer')

    result = ρσ_flint_backend().factor(value)
    return new IntegerFactorization(
        result.factors, BigInt(result.sign), False, False, False)


def ρσ_max(*args, **kwargs):
    if args.length is 0:
        if kwargs.defval is not undefined:
            return kwargs.defval
        raise TypeError('expected at least one argument')
    if args.length is 1:
        args = args[0]
    if kwargs.key:
        args = [kwargs.key(x) for x in args]
    if not Array.isArray(args):
        args = list(args)
    if args.length:
        return this.apply(None, args)
    if kwargs.defval is not undefined:
        return kwargs.defval
    raise TypeError('expected at least one argument')

v'var round = ρσ_round; var max = ρσ_max.bind(Math.max), min = ρσ_max.bind(Math.min), bool = ρσ_bool, type = ρσ_type'
v'var float = ρσ_float, int = ρσ_int, Integer = ρσ_integer_literal, RealNumber = ρσ_real_literal'
v'var arraylike = ρσ_arraylike_creator(), ρσ_arraylike = arraylike'
v'var print = ρσ_print, id = ρσ_id, get_module = ρσ_get_module, pow = ρσ_pow, divmod = ρσ_divmod'
v'var dir = ρσ_dir, ord = ρσ_ord, chr = ρσ_chr, bin = ρσ_bin, hex = ρσ_hex, callable = ρσ_callable'
v'var enumerate = ρσ_enumerate, iter = ρσ_iter, reversed = ρσ_reversed, len = ρσ_len'
v'var range = ρσ_range, getattr = ρσ_getattr, setattr = ρσ_setattr, hasattr = ρσ_hasattr, factor = ρσ_factor'
