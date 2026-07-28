# A deliberately small mathematical parent and coercion kernel.
#
# The semantics are adapted from SageMath's parent/coercion model, but this is
# a new, explicit implementation for the JavaScript runtime.  In particular,
# binary arithmetic resolves both operands to a common parent rather than
# relying on Python's __add__/__radd__ fallback protocol.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

# The v-string below is emitted as literal JavaScript.  This low-level runtime
# kernel intentionally uses the same function/prototype representation as the
# existing Parent, Element, and compiler-generated Python class machinery.
# Higher-level mathematical library code should normally be written in
# Sage.js/Python syntax rather than added here as raw JavaScript.
v"""
function ρσ_is_exact_integer(value) {
    return typeof value === "bigint" ||
        (typeof value === "number" && Number.isSafeInteger(value));
}

function ρσ_normalize_integer(value) {
    if (!ρσ_is_exact_integer(value)) {
        throw new TypeError("expected an exact integer");
    }
    if (typeof value === "number") {
        return value;
    }
    if (value <= BigInt(Number.MAX_SAFE_INTEGER) &&
            value >= BigInt(Number.MIN_SAFE_INTEGER)) {
        return Number(value);
    }
    return value;
}

function ρσ_integer_bigint(value) {
    if (!ρσ_is_exact_integer(value)) {
        throw new TypeError("expected an exact integer");
    }
    return BigInt(value);
}

function ρσ_new_map() {
    return new Map();
}

function ρσ_bigint_gcd(a, b) {
    if (a < 0n) a = -a;
    if (b < 0n) b = -b;
    while (b !== 0n) {
        const remainder = a % b;
        a = b;
        b = remainder;
    }
    return a;
}

function ρσ_bigint_divexact(numerator, denominator) {
    return numerator / denominator;
}

function Parent(name) {
    this._name = name;
}

Parent.prototype.__repr__ = function() {
    return this._name;
};
Parent.prototype.__str__ = Parent.prototype.__repr__;
Parent.prototype.toString = Parent.prototype.__repr__;
Parent.prototype.__getitem__ = function(variable) {
    return PolynomialRing(this, variable);
};
Object.defineProperty(Parent, "__repr__", {
    value: function() { return "<class 'Parent'>"; }
});

function Element(parent) {
    this._parent = parent;
}

Element.prototype.parent = function() {
    return this._parent;
};
Object.defineProperty(Element, "__repr__", {
    value: function() { return "<class 'Element'>"; }
});

function ρσ_make_parent(name, elementConstructor) {
    function callableParent() {
        return elementConstructor.apply(callableParent, arguments);
    }
    Object.setPrototypeOf(callableParent, Parent.prototype);
    Parent.call(callableParent, name);
    return callableParent;
}

var ZZ = ρσ_make_parent("Integer Ring", function(value) {
    return ρσ_normalize_integer(value);
});

Object.defineProperty(ZZ, "_kind", {value: "ZZ"});

var QQ = ρσ_make_parent("Rational Field", function(numerator, denominator) {
    if (numerator instanceof Rational && denominator === undefined) {
        return numerator;
    }
    return new Rational(numerator, denominator);
});
Object.defineProperty(QQ, "_kind", {value: "QQ"});

function CoercionModel() {
    this._maps = new Map();
    this._planCache = new Map();
}

CoercionModel.prototype.register = function(source, target, map) {
    let targets = this._maps.get(source);
    if (targets === undefined) {
        targets = new Map();
        this._maps.set(source, targets);
    }
    targets.set(target, map);
    this._planCache.clear();
};

CoercionModel.prototype._map = function(source, target) {
    const targets = this._maps.get(source);
    return targets === undefined ? undefined : targets.get(target);
};

CoercionModel.prototype._cache = function(left, right, plan) {
    let rights = this._planCache.get(left);
    if (rights === undefined) {
        rights = new Map();
        this._planCache.set(left, rights);
    }
    rights.set(right, plan);
    return plan;
};

CoercionModel.prototype.resolveParents = function(left, right) {
    let rights = this._planCache.get(left);
    if (rights !== undefined && rights.has(right)) return rights.get(right);

    const identity = function(value) { return value; };
    if (left === right) {
        return this._cache(left, right, {
            parent: left, leftMap: identity, rightMap: identity
        });
    }

    const leftToRight = this._map(left, right);
    const rightToLeft = this._map(right, left);
    if (leftToRight !== undefined && rightToLeft === undefined) {
        return this._cache(left, right, {
            parent: right, leftMap: leftToRight, rightMap: identity
        });
    }
    if (rightToLeft !== undefined && leftToRight === undefined) {
        return this._cache(left, right, {
            parent: left, leftMap: identity, rightMap: rightToLeft
        });
    }

    const leftTargets = this._maps.get(left);
    const rightTargets = this._maps.get(right);
    if (leftTargets !== undefined && rightTargets !== undefined) {
        const common = [];
        for (const target of leftTargets.keys()) {
            if (rightTargets.has(target)) common.push(target);
        }
        if (common.length > 0) {
            common.sort(function(a, b) {
                const ap = a._precision === undefined ? -1 : a._precision;
                const bp = b._precision === undefined ? -1 : b._precision;
                return bp - ap;
            });
            const target = common[0];
            if (common.length === 1 ||
                    (target._kind === common[1]._kind &&
                     target._precision !== common[1]._precision)) {
                return this._cache(left, right, {
                    parent: target,
                    leftMap: leftTargets.get(target),
                    rightMap: rightTargets.get(target)
                });
            }
        }
    }

    const leftConstruction = left._construction;
    const rightConstruction = right._construction;
    if (leftConstruction !== undefined &&
            leftConstruction.kind === "polynomial") {
        if (rightConstruction !== undefined &&
                rightConstruction.kind === "polynomial") {
            if (leftConstruction.variable !== rightConstruction.variable) {
                throw new TypeError(
                    "no canonical coercion between polynomial rings in " +
                    leftConstruction.variable + " and " +
                    rightConstruction.variable);
            }
            const basePlan = this.resolveParents(
                leftConstruction.base, rightConstruction.base);
            const target = PolynomialRing(
                basePlan.parent, leftConstruction.variable);
            return this._cache(left, right, {
                parent: target,
                leftMap: function(value) {
                    return target._coercePolynomial(value);
                },
                rightMap: function(value) {
                    return target._coercePolynomial(value);
                }
            });
        }

        const basePlan = this.resolveParents(leftConstruction.base, right);
        const target = PolynomialRing(
            basePlan.parent, leftConstruction.variable);
        return this._cache(left, right, {
            parent: target,
            leftMap: function(value) {
                return target._coercePolynomial(value);
            },
            rightMap: function(value) {
                return target._constant(basePlan.rightMap(value));
            }
        });
    }

    if (rightConstruction !== undefined &&
            rightConstruction.kind === "polynomial") {
        const basePlan = this.resolveParents(
            left, rightConstruction.base);
        const target = PolynomialRing(
            basePlan.parent, rightConstruction.variable);
        return this._cache(left, right, {
            parent: target,
            leftMap: function(value) {
                return target._constant(basePlan.leftMap(value));
            },
            rightMap: function(value) {
                return target._coercePolynomial(value);
            }
        });
    }

    if (leftToRight !== undefined && rightToLeft !== undefined) {
        throw new TypeError(
            "ambiguous canonical coercion between " + left + " and " + right);
    }
    throw new TypeError(
        "no canonical coercion between " + left + " and " + right);
};

CoercionModel.prototype.parentOf = function(value) {
    if (ρσ_is_exact_integer(value)) return ZZ;
    if (value !== null && typeof value === "object" &&
            value._parent !== undefined) {
        return value._parent;
    }
    throw new TypeError("value has no mathematical parent");
};

CoercionModel.prototype.coercePair = function(left, right) {
    const plan = this.resolveParents(
        this.parentOf(left), this.parentOf(right));
    return {
        parent: plan.parent,
        left: plan.leftMap(left),
        right: plan.rightMap(right)
    };
};

CoercionModel.prototype.binOp = function(operator, left, right) {
    if (left !== null && right !== null &&
            typeof left === "object" && typeof right === "object" &&
            left._parent !== undefined &&
            left._parent === right._parent) {
        const direct = left["_" + operator + "_"];
        if (typeof direct !== "function") {
            throw new TypeError(
                "operation " + operator + " is not defined in " +
                left._parent);
        }
        return direct.call(left, right);
    }
    const operands = this.coercePair(left, right);
    const method = operands.left["_" + operator + "_"];
    if (typeof method !== "function") {
        throw new TypeError(
            "operation " + operator + " is not defined in " + operands.parent);
    }
    return method.call(operands.left, operands.right);
};

CoercionModel.prototype.equals = function(left, right) {
    try {
        if (left !== null && right !== null &&
                typeof left === "object" && typeof right === "object" &&
                left._parent !== undefined &&
                left._parent === right._parent) {
            const direct = left._eq_;
            return typeof direct === "function"
                ? direct.call(left, right)
                : left === right;
        }
        const operands = this.coercePair(left, right);
        const method = operands.left._eq_;
        return typeof method === "function"
            ? method.call(operands.left, operands.right)
            : operands.left === operands.right;
    } catch (_) {
        return false;
    }
};

var ρσ_coercion_model = new CoercionModel();
ρσ_coercion_model.register(ZZ, QQ, function(value) {
    return new Rational(value, 1);
});

function ρσ_modular_inverse(value, modulus) {
    let oldR = value;
    let r = modulus;
    let oldS = 1n;
    let s = 0n;
    while (r !== 0n) {
        const quotient = oldR / r;
        const nextR = oldR - quotient * r;
        const nextS = oldS - quotient * s;
        oldR = r;
        r = nextR;
        oldS = s;
        s = nextS;
    }
    if (oldR !== 1n) {
        throw new ZeroDivisionError(
            "inverse of Mod(0, " + modulus + ") does not exist");
    }
    oldS %= modulus;
    return oldS < 0n ? oldS + modulus : oldS;
}

function ρσ_modular_power(value, exponent, modulus) {
    let result = 1n;
    while (exponent > 0n) {
        if ((exponent & 1n) !== 0n) {
            result = (result * value) % modulus;
        }
        exponent >>= 1n;
        if (exponent !== 0n) value = (value * value) % modulus;
    }
    return result;
}

function ρσ_math_tuple(values) {
    function tupleRepr() {
        const entries = this.map(function(value) {
            return ρσ_repr(value);
        }).join(", ");
        return "(" + entries + (this.length === 1 ? "," : "") + ")";
    }
    Object.defineProperties(values, {
        "__repr__": {value: tupleRepr},
        "__str__": {value: tupleRepr},
        "toString": {value: tupleRepr}
    });
    return Object.freeze(values);
}

var QuotientFunctor = Object.freeze({
    "__repr__": function() { return "QuotientFunctor"; },
    "__str__": function() { return "QuotientFunctor"; },
    "toString": function() { return "QuotientFunctor"; }
});

var AlgebraicExtensionFunctor = Object.freeze({
    "__repr__": function() { return "AlgebraicExtensionFunctor"; },
    "__str__": function() { return "AlgebraicExtensionFunctor"; },
    "toString": function() { return "AlgebraicExtensionFunctor"; }
});

function ρσ_finite_field_name(name, names, degree) {
    let variable = name;
    if (names !== undefined && names !== null) variable = names;
    if (Array.isArray(variable)) {
        if (variable.length !== 1) {
            throw new TypeError(
                "a finite-field extension needs exactly one generator name");
        }
        variable = variable[0];
    }
    if (variable === undefined || variable === null) {
        variable = "z" + degree;
    }
    if (typeof variable !== "string" ||
            !/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable)) {
        throw new TypeError(
            "the finite-field generator must be a valid identifier");
    }
    return variable;
}

function ρσ_polynomial_from_coefficients(base, variable, coefficients) {
    const ring = PolynomialRing(base, variable);
    const generator = ring.gen();
    let result = ring.__call__(0);
    for (let index = coefficients.length - 1; index >= 0; index--) {
        result = result._mul_(generator)._add_(
            ring.__call__(base(coefficients[index])));
    }
    return result;
}

var ρσ_prime_fields = new Map();
var ρσ_extension_fields = new Map();

function ρσ_make_extension_field(order, prime, degree, name, modulus) {
    if (modulus !== undefined && modulus !== null) {
        throw new NotImplementedError(
            "explicit extension-field moduli are not implemented yet");
    }
    const variable = ρσ_finite_field_name(name.name, name.names, degree);
    const key = order.toString() + "|" + variable;
    let field = ρσ_extension_fields.get(key);
    if (field !== undefined) return field;

    const backend = ρσ_flint_backend();
    let context;
    try {
        context = backend.fqContext(prime, degree, variable);
    } catch (error) {
        if (error !== null && error !== undefined &&
                typeof error.message === "string" &&
                error.message.includes("Conway polynomial")) {
            throw new NotImplementedError(
                "Sage-compatible pseudo-Conway polynomials are not " +
                "implemented for this finite field");
        }
        throw error;
    }
    const modulusCoefficients = backend.fqContextModulus(context);
    const primeField = GF(prime);
    const givaroRepresentation = order < 65536n;
    const parentType = givaroRepresentation
        ? FiniteField_givaro
        : (prime === 2n
            ? FiniteField_ntl_gf2e
            : FiniteField_pari_ffelt);
    const elementType = givaroRepresentation
        ? FiniteField_givaroElement
        : (prime === 2n
            ? FiniteField_ntl_gf2eElement
            : FiniteFieldElement_pari_ffelt);
    field = ρσ_make_parent(
        "Finite Field in " + variable + " of size " +
            prime + "^" + degree,
        function(value) {
            if (value instanceof FiniteFieldExtensionElement) {
                if (value._parent !== field) {
                    throw new TypeError(
                        "cannot convert between incompatible finite fields");
                }
                return value;
            }
            if (value instanceof FiniteFieldElement) {
                if (value._parent !== primeField) {
                    throw new TypeError(
                        "finite-field characteristics do not match");
                }
                value = value.lift();
            }
            if (value instanceof Rational) {
                const numerator = field(value.numerator());
                const denominator = field(value.denominator());
                return numerator._truediv_(denominator);
            }
            value = ρσ_integer_bigint(value);
            return ρσ_new_extension_field_element(
                field, backend.fqFromBigInt(context, value));
        });
    Object.setPrototypeOf(field, parentType.prototype);
    Object.defineProperty(field, "_kind", {value: "GF_EXTENSION"});
    Object.defineProperty(field, "_elementType", {value: elementType});
    Object.defineProperty(field, "_nativeContext", {value: context});
    Object.defineProperty(field, "_modulusCoefficients", {
        value: Object.freeze(modulusCoefficients)
    });
    Object.defineProperty(field, "_primeSubfield", {value: primeField});
    Object.defineProperty(field, "_order", {value: order});
    Object.defineProperty(field, "_prime", {value: prime});
    Object.defineProperty(field, "_degree", {value: degree});
    Object.defineProperty(field, "_variable", {value: variable});
    ρσ_extension_fields.set(key, field);
    ρσ_coercion_model.register(ZZ, field, function(value) {
        return field(value);
    });
    ρσ_coercion_model.register(primeField, field, function(value) {
        return field(value);
    });
    return field;
}

function GF(order, name, modulus, names) {
    if (name !== null && typeof name === "object" &&
            name[ρσ_kwargs_symbol]) {
        modulus = name.modulus;
        names = name.names;
        name = undefined;
    }
    order = ρσ_integer_bigint(order);
    if (order < 2n) {
        throw new ValueError(
            "the order of a finite field must be at least 2");
    }
    const primitive = modulus === "primitive";
    if (modulus !== undefined && modulus !== null && !primitive) {
        throw new NotImplementedError(
            "explicit finite-field moduli are not implemented yet");
    }
    const key = order.toString() + (primitive ? "|primitive" : "");
    let field = ρσ_prime_fields.get(key);
    if (field !== undefined) return field;
    const backend = ρσ_flint_backend();
    const prime = backend.isPrime(order);
    if (!prime) {
        const decomposition = backend.factor(order);
        if (decomposition.factors.length !== 1) {
            throw new ValueError(
                "the order of a finite field must be a prime power");
        }
        const primePower = decomposition.factors[0];
        if (primePower[1] < 2) {
            throw new ValueError(
                "the order of a finite field must be a prime power");
        }
        return ρσ_make_extension_field(
            order,
            primePower[0],
            primePower[1],
            {"name": name, "names": names},
            modulus);
    }
    field = ρσ_make_parent(
        "Finite Field of size " + order,
        function(value) {
            return ρσ_new_prime_field_element(field, value);
        });
    Object.setPrototypeOf(field, FiniteField_prime_modn.prototype);
    Object.defineProperty(field, "_kind", {value: "GF"});
    Object.defineProperty(field, "_modulus", {value: order});
    Object.defineProperty(field, "_order", {value: order});
    Object.defineProperty(field, "_generator", {
        value: primitive ? backend.wordPrimitiveRootPrime(order) : 1n
    });
    ρσ_prime_fields.set(key, field);
    ρσ_coercion_model.register(ZZ, field, function(value) {
        return ρσ_new_prime_field_element(field, value);
    });
    return field;
}

Object.defineProperty(GF, "__argnames__", {
    value: ["order", "name", "modulus", "names"]
});

var FiniteField = GF;

function ρσ_is_math_element(value) {
    return value !== null && typeof value === "object" &&
        value._parent !== undefined;
}

function ρσ_parent(value) {
    return ρσ_coercion_model.parentOf(value);
}

var ρσ_flint_state = {backend: null};
function ρσ_flint_backend() {
    if (ρσ_flint_state.backend === null) {
        ρσ_flint_state.backend = require("@sagemath/sagejs-flint");
    }
    return ρσ_flint_state.backend;
}

var ρσ_real_fields = new Map();
var ρσ_complex_fields = new Map();

function ρσ_field_precision(precision) {
    if (precision === undefined) precision = 53;
    if (!ρσ_is_exact_integer(precision)) {
        throw new TypeError("precision must be an integer");
    }
    precision = Number(precision);
    if (!Number.isSafeInteger(precision) || precision < 2) {
        throw new ValueError("precision must be at least 2");
    }
    return precision;
}

function RealNumberElement(parent, nativeValue) {
    Element.call(this, parent);
    this._native = nativeValue;
    Object.freeze(this);
}
RealNumberElement.prototype = Object.create(Element.prototype);
RealNumberElement.prototype.constructor = RealNumberElement;
Object.defineProperty(RealNumberElement, "__repr__", {
    value: function() { return "<class 'RealNumber'>"; }
});
RealNumberElement.prototype._add_ = function(other) {
    return new RealNumberElement(
        this._parent, ρσ_flint_backend().realAdd(this._native, other._native));
};
RealNumberElement.prototype._sub_ = function(other) {
    return new RealNumberElement(
        this._parent, ρσ_flint_backend().realSub(this._native, other._native));
};
RealNumberElement.prototype._mul_ = function(other) {
    return new RealNumberElement(
        this._parent, ρσ_flint_backend().realMul(this._native, other._native));
};
RealNumberElement.prototype._truediv_ = function(other) {
    return new RealNumberElement(
        this._parent, ρσ_flint_backend().realDiv(this._native, other._native));
};
RealNumberElement.prototype._eq_ = function(other) {
    return ρσ_flint_backend().realEqual(this._native, other._native);
};
RealNumberElement.prototype.__neg__ = function() {
    return new RealNumberElement(
        this._parent, ρσ_flint_backend().realNeg(this._native));
};
RealNumberElement.prototype.__pow__ = function(exponent) {
    exponent = ρσ_integer_bigint(exponent);
    return new RealNumberElement(this._parent,
        ρσ_flint_backend().realPowInt(this._native, exponent));
};
RealNumberElement.prototype.__add__ = function(other) {
    return ρσ_coercion_model.binOp("add", this, other);
};
RealNumberElement.prototype.__sub__ = function(other) {
    return ρσ_coercion_model.binOp("sub", this, other);
};
RealNumberElement.prototype.__mul__ = function(other) {
    return ρσ_coercion_model.binOp("mul", this, other);
};
RealNumberElement.prototype.__truediv__ = function(other) {
    return ρσ_coercion_model.binOp("truediv", this, other);
};
RealNumberElement.prototype.__eq__ = function(other) {
    return ρσ_coercion_model.equals(this, other);
};
RealNumberElement.prototype.precision = function() {
    return this._parent.precision();
};
RealNumberElement.prototype.__repr__ = function() {
    return ρσ_flint_backend().realToString(this._native);
};
RealNumberElement.prototype.__str__ = RealNumberElement.prototype.__repr__;
RealNumberElement.prototype.toString = RealNumberElement.prototype.__repr__;

function RealLiteral(parent, nativeValue, literal) {
    Element.call(this, parent);
    this._native = nativeValue;
    this.literal = literal;
    this.base = 10;
    Object.freeze(this);
}
RealLiteral.prototype = Object.create(RealNumberElement.prototype);
RealLiteral.prototype.constructor = RealLiteral;
Object.defineProperty(RealLiteral, "__repr__", {
    value: function() { return "<class 'RealLiteral'>"; }
});
RealLiteral.prototype.__neg__ = function() {
    const literal = this.literal[0] === "-"
        ? this.literal.slice(1)
        : "-" + this.literal;
    return ρσ_create_real_literal(literal);
};

function ComplexNumberElement(parent, nativeValue) {
    Element.call(this, parent);
    this._native = nativeValue;
    Object.freeze(this);
}
ComplexNumberElement.prototype = Object.create(Element.prototype);
ComplexNumberElement.prototype.constructor = ComplexNumberElement;
Object.defineProperty(ComplexNumberElement, "__repr__", {
    value: function() { return "<class 'ComplexNumber'>"; }
});
ComplexNumberElement.prototype._add_ = function(other) {
    return new ComplexNumberElement(this._parent,
        ρσ_flint_backend().complexAdd(this._native, other._native));
};
ComplexNumberElement.prototype._sub_ = function(other) {
    return new ComplexNumberElement(this._parent,
        ρσ_flint_backend().complexSub(this._native, other._native));
};
ComplexNumberElement.prototype._mul_ = function(other) {
    return new ComplexNumberElement(this._parent,
        ρσ_flint_backend().complexMul(this._native, other._native));
};
ComplexNumberElement.prototype._truediv_ = function(other) {
    return new ComplexNumberElement(this._parent,
        ρσ_flint_backend().complexDiv(this._native, other._native));
};
ComplexNumberElement.prototype._eq_ = function(other) {
    return ρσ_flint_backend().complexEqual(this._native, other._native);
};
ComplexNumberElement.prototype.__neg__ = function() {
    return new ComplexNumberElement(
        this._parent, ρσ_flint_backend().complexNeg(this._native));
};
ComplexNumberElement.prototype.__pow__ = function(exponent) {
    exponent = ρσ_integer_bigint(exponent);
    return new ComplexNumberElement(this._parent,
        ρσ_flint_backend().complexPowInt(this._native, exponent));
};
ComplexNumberElement.prototype.__add__ = function(other) {
    return ρσ_coercion_model.binOp("add", this, other);
};
ComplexNumberElement.prototype.__sub__ = function(other) {
    return ρσ_coercion_model.binOp("sub", this, other);
};
ComplexNumberElement.prototype.__mul__ = function(other) {
    return ρσ_coercion_model.binOp("mul", this, other);
};
ComplexNumberElement.prototype.__truediv__ = function(other) {
    return ρσ_coercion_model.binOp("truediv", this, other);
};
ComplexNumberElement.prototype.__eq__ = function(other) {
    return ρσ_coercion_model.equals(this, other);
};
ComplexNumberElement.prototype.precision = function() {
    return this._parent.precision();
};
ComplexNumberElement.prototype.__repr__ = function() {
    return ρσ_flint_backend().complexToString(this._native);
};
ComplexNumberElement.prototype.__str__ = ComplexNumberElement.prototype.__repr__;
ComplexNumberElement.prototype.toString = ComplexNumberElement.prototype.__repr__;

function ρσ_real_from_exact(field, value) {
    const backend = ρσ_flint_backend();
    if (value instanceof Rational) {
        return new RealNumberElement(field, backend.realFromRational(
            value._numerator, value._denominator, field._precision));
    }
    return new RealNumberElement(field,
        backend.realFromBigInt(BigInt(value), field._precision));
}

function ρσ_real_field_element(field, value) {
    const backend = ρσ_flint_backend();
    if (value instanceof RealLiteral) {
        return new RealNumberElement(field,
            backend.realFromString(value.literal, field._precision));
    }
    if (value instanceof RealNumberElement) {
        if (value._parent === field) return value;
        return new RealNumberElement(
            field, backend.realRound(value._native, field._precision));
    }
    if (value instanceof Rational || ρσ_is_exact_integer(value)) {
        return ρσ_real_from_exact(field, value);
    }
    if (typeof value === "number" || typeof value === "string") {
        return new RealNumberElement(field,
            backend.realFromString(String(value), field._precision));
    }
    throw new TypeError("unable to convert value to " + field);
}

function ρσ_register_real_field(field) {
    ρσ_coercion_model.register(ZZ, field, function(value) {
        return ρσ_real_from_exact(field, value);
    });
    ρσ_coercion_model.register(QQ, field, function(value) {
        return ρσ_real_from_exact(field, value);
    });
    for (const other of ρσ_real_fields.values()) {
        if (other === field) continue;
        if (other._precision >= field._precision) {
            ρσ_coercion_model.register(other, field, function(value) {
                return ρσ_real_field_element(field, value);
            });
        }
        if (field._precision >= other._precision) {
            ρσ_coercion_model.register(field, other, function(value) {
                return ρσ_real_field_element(other, value);
            });
        }
    }
    for (const complexField of ρσ_complex_fields.values()) {
        ρσ_register_real_complex_maps(field, complexField);
    }
}

function RealField(precision) {
    precision = ρσ_field_precision(precision);
    if (ρσ_real_fields.has(precision)) {
        return ρσ_real_fields.get(precision);
    }
    const field = ρσ_make_parent(
        "Real Field with " + precision + " bits of precision",
        function(value) { return ρσ_real_field_element(field, value); });
    Object.defineProperty(field, "_kind", {value: "RealField"});
    Object.defineProperty(field, "_precision", {value: precision});
    Object.defineProperty(field, "_fromNative", {
        value: function(nativeValue) {
            if (ρσ_flint_backend().realPrecision(nativeValue) !== precision) {
                throw new ValueError(
                    "native real has the wrong precision for " + field);
            }
            return new RealNumberElement(field, nativeValue);
        }
    });
    field.precision = function() { return precision; };
    field.prec = field.precision;
    ρσ_real_fields.set(precision, field);
    ρσ_register_real_field(field);
    return field;
}

function ρσ_create_real_literal(text) {
    text = String(text).replace(RegExp("_", "g"), "");
    let precision = 53;
    if (text.length > 15) {
        const exponentIndex = Math.max(
            text.indexOf("e"), text.indexOf("E"));
        const mantissa = exponentIndex === -1
            ? text
            : text.slice(0, exponentIndex);
        const significant = mantissa.replace(RegExp("^[-0.]*"), "");
        const significantDigits = significant.length -
            (significant.indexOf(".") === -1 ? 0 : 1);
        const bits = Math.floor(
            3.321928094887363 * significantDigits) + 1;
        precision = Math.max(bits, 53);
    }
    const field = RealField(precision);
    return new RealLiteral(field,
        ρσ_flint_backend().realFromString(text, precision), text);
}

function ρσ_complex_field_element(field, value, imag) {
    const backend = ρσ_flint_backend();
    if (imag === undefined && value instanceof ComplexNumberElement) {
        if (value._parent === field) return value;
        return new ComplexNumberElement(
            field, backend.complexRound(value._native, field._precision));
    }
    const realField = RealField(field._precision);
    const realPart = realField(value);
    const imagPart = realField(imag === undefined ? 0 : imag);
    return new ComplexNumberElement(field,
        backend.complexFromReals(realPart._native, imagPart._native));
}

function ρσ_register_real_complex_maps(realField, complexField) {
    if (realField._precision >= complexField._precision) {
        ρσ_coercion_model.register(realField, complexField, function(value) {
            return ρσ_complex_field_element(complexField, value);
        });
    }
}

function ρσ_register_complex_field(field) {
    ρσ_coercion_model.register(ZZ, field, function(value) {
        return ρσ_complex_field_element(field, value);
    });
    ρσ_coercion_model.register(QQ, field, function(value) {
        return ρσ_complex_field_element(field, value);
    });
    for (const realField of ρσ_real_fields.values()) {
        ρσ_register_real_complex_maps(realField, field);
    }
    for (const other of ρσ_complex_fields.values()) {
        if (other === field) continue;
        if (other._precision >= field._precision) {
            ρσ_coercion_model.register(other, field, function(value) {
                return ρσ_complex_field_element(field, value);
            });
        }
        if (field._precision >= other._precision) {
            ρσ_coercion_model.register(field, other, function(value) {
                return ρσ_complex_field_element(other, value);
            });
        }
    }
}

function ComplexField(precision) {
    precision = ρσ_field_precision(precision);
    if (ρσ_complex_fields.has(precision)) {
        return ρσ_complex_fields.get(precision);
    }
    const field = ρσ_make_parent(
        "Complex Field with " + precision + " bits of precision",
        function(value, imag) {
            return ρσ_complex_field_element(field, value, imag);
        });
    Object.defineProperty(field, "_kind", {value: "ComplexField"});
    Object.defineProperty(field, "_precision", {value: precision});
    Object.defineProperty(field, "_fromNative", {
        value: function(nativeValue) {
            if (ρσ_flint_backend().complexPrecision(nativeValue) !== precision) {
                throw new ValueError(
                    "native complex has the wrong precision for " + field);
            }
            return new ComplexNumberElement(field, nativeValue);
        }
    });
    field.precision = function() { return precision; };
    field.prec = field.precision;
    ρσ_complex_fields.set(precision, field);
    ρσ_register_complex_field(field);
    return field;
}

var RR = RealField(53);
var CC = ComplexField(53);

function ComplexNumber(real, imag) {
    return CC(real, imag);
}
"""

parent = ρσ_parent
