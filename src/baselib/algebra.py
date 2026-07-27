# A deliberately small mathematical parent and coercion kernel.
#
# The semantics are adapted from SageMath's parent/coercion model, but this is
# a new, explicit implementation for the JavaScript runtime.  In particular,
# binary arithmetic resolves both operands to a common parent rather than
# relying on Python's __add__/__radd__ fallback protocol.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

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

function Rational(numerator, denominator) {
    if (!(this instanceof Rational)) {
        return new Rational(numerator, denominator);
    }
    if (numerator instanceof Rational && denominator === undefined) {
        return numerator;
    }
    if (denominator === undefined) denominator = 1;
    numerator = ρσ_integer_bigint(numerator);
    denominator = ρσ_integer_bigint(denominator);
    if (denominator === 0n) {
        throw new ZeroDivisionError("rational division by zero");
    }
    if (denominator < 0n) {
        numerator = -numerator;
        denominator = -denominator;
    }
    const common = ρσ_bigint_gcd(numerator, denominator);
    this._numerator = numerator / common;
    this._denominator = denominator / common;
    this._parent = QQ;
    Object.freeze(this);
}

Rational.prototype = Object.create(Element.prototype);
Rational.prototype.constructor = Rational;
Object.defineProperty(Rational, "__repr__", {
    value: function() { return "<class 'Rational'>"; }
});

Rational.prototype.numerator = function() {
    return ρσ_normalize_integer(this._numerator);
};
Rational.prototype.denominator = function() {
    return ρσ_normalize_integer(this._denominator);
};
Rational.prototype.__float__ = function() {
    return Number(this._numerator) / Number(this._denominator);
};
Rational.prototype._add_ = function(other) {
    const a = this._numerator;
    const b = this._denominator;
    const c = other._numerator;
    const d = other._denominator;
    const g = ρσ_bigint_gcd(b, d);
    const bg = b / g;
    const dg = d / g;
    return new Rational(a * dg + c * bg, bg * d);
};
Rational.prototype._sub_ = function(other) {
    const a = this._numerator;
    const b = this._denominator;
    const c = other._numerator;
    const d = other._denominator;
    const g = ρσ_bigint_gcd(b, d);
    const bg = b / g;
    const dg = d / g;
    return new Rational(a * dg - c * bg, bg * d);
};
Rational.prototype._mul_ = function(other) {
    const g1 = ρσ_bigint_gcd(this._numerator, other._denominator);
    const g2 = ρσ_bigint_gcd(other._numerator, this._denominator);
    return new Rational(
        (this._numerator / g1) * (other._numerator / g2),
        (this._denominator / g2) * (other._denominator / g1));
};
Rational.prototype._truediv_ = function(other) {
    if (other._numerator === 0n) {
        throw new ZeroDivisionError("rational division by zero");
    }
    const g1 = ρσ_bigint_gcd(this._numerator, other._numerator);
    const g2 = ρσ_bigint_gcd(other._denominator, this._denominator);
    return new Rational(
        (this._numerator / g1) * (other._denominator / g2),
        (this._denominator / g2) * (other._numerator / g1));
};
Rational.prototype._eq_ = function(other) {
    return this._numerator === other._numerator &&
        this._denominator === other._denominator;
};
Rational.prototype.__neg__ = function() {
    return new Rational(-this._numerator, this._denominator);
};
Rational.prototype.__abs__ = function() {
    return this._numerator < 0n
        ? new Rational(-this._numerator, this._denominator)
        : this;
};
Rational.prototype.__pow__ = function(exponent) {
    exponent = ρσ_integer_bigint(exponent);
    if (exponent === 0n) return new Rational(1n, 1n);
    if (exponent < 0n) {
        if (this._numerator === 0n) {
            throw new ZeroDivisionError("rational division by zero");
        }
        return new Rational(
            this._denominator ** (-exponent),
            this._numerator ** (-exponent));
    }
    return new Rational(
        this._numerator ** exponent,
        this._denominator ** exponent);
};
Rational.prototype.__repr__ = function() {
    if (this._denominator === 1n) return this._numerator.toString();
    return this._numerator.toString() + "/" + this._denominator.toString();
};
Rational.prototype.__str__ = Rational.prototype.__repr__;
Rational.prototype.toString = Rational.prototype.__repr__;

var QQ = ρσ_make_parent("Rational Field", function(numerator, denominator) {
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

function FiniteFieldElement(parent, value) {
    if (value instanceof FiniteFieldElement) {
        if (value._parent !== parent) {
            throw new TypeError(
                "no canonical conversion between distinct finite fields");
        }
        return value;
    }
    let residue;
    if (value instanceof Rational) {
        let numerator = value._numerator % parent._modulus;
        let denominator = value._denominator % parent._modulus;
        if (numerator < 0n) numerator += parent._modulus;
        if (denominator < 0n) denominator += parent._modulus;
        residue = numerator * ρσ_modular_inverse(
            denominator, parent._modulus);
    } else {
        residue = ρσ_integer_bigint(value);
    }
    residue %= parent._modulus;
    if (residue < 0n) residue += parent._modulus;
    Element.call(this, parent);
    this._value = residue;
    Object.freeze(this);
}
FiniteFieldElement.prototype = Object.create(Element.prototype);
FiniteFieldElement.prototype.constructor = FiniteFieldElement;
Object.defineProperty(FiniteFieldElement, "__repr__", {
    value: function() { return "<class 'FiniteFieldElement'>"; }
});
FiniteFieldElement.prototype._add_ = function(other) {
    return new FiniteFieldElement(
        this._parent, this._value + other._value);
};
FiniteFieldElement.prototype._sub_ = function(other) {
    return new FiniteFieldElement(
        this._parent, this._value - other._value);
};
FiniteFieldElement.prototype._mul_ = function(other) {
    return new FiniteFieldElement(
        this._parent, this._value * other._value);
};
FiniteFieldElement.prototype._truediv_ = function(other) {
    return new FiniteFieldElement(
        this._parent,
        this._value * ρσ_modular_inverse(
            other._value, this._parent._modulus));
};
FiniteFieldElement.prototype._eq_ = function(other) {
    return this._value === other._value;
};
FiniteFieldElement.prototype.__add__ = function(other) {
    return ρσ_coercion_model.binOp("add", this, other);
};
FiniteFieldElement.prototype.__sub__ = function(other) {
    return ρσ_coercion_model.binOp("sub", this, other);
};
FiniteFieldElement.prototype.__mul__ = function(other) {
    return ρσ_coercion_model.binOp("mul", this, other);
};
FiniteFieldElement.prototype.__truediv__ = function(other) {
    return ρσ_coercion_model.binOp("truediv", this, other);
};
FiniteFieldElement.prototype.__eq__ = function(other) {
    return ρσ_coercion_model.equals(this, other);
};
FiniteFieldElement.prototype.__neg__ = function() {
    return new FiniteFieldElement(this._parent, -this._value);
};
FiniteFieldElement.prototype.__pow__ = function(exponent) {
    exponent = ρσ_integer_bigint(exponent);
    let value = this._value;
    if (exponent < 0n) {
        value = ρσ_modular_inverse(value, this._parent._modulus);
        exponent = -exponent;
    }
    return new FiniteFieldElement(
        this._parent,
        ρσ_modular_power(value, exponent, this._parent._modulus));
};
FiniteFieldElement.prototype.lift = function() {
    return ρσ_normalize_integer(this._value);
};
FiniteFieldElement.prototype.integer_representation =
    FiniteFieldElement.prototype.lift;
FiniteFieldElement.prototype.is_zero = function() {
    return this._value === 0n;
};
FiniteFieldElement.prototype.is_one = function() {
    return this._value === 1n;
};
FiniteFieldElement.prototype.__repr__ = function() {
    return this._value.toString();
};
FiniteFieldElement.prototype.__str__ = FiniteFieldElement.prototype.__repr__;
FiniteFieldElement.prototype.toString = FiniteFieldElement.prototype.__repr__;

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

function FiniteField_prime_modn() {}
Object.defineProperty(FiniteField_prime_modn, "__repr__", {
    value: function() {
        return "<class 'sage.rings.finite_rings.finite_field_prime_modn." +
            "FiniteField_prime_modn_with_category'>";
    }
});

var ρσ_prime_fields = new Map();
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
    if (modulus !== undefined && modulus !== null &&
            modulus !== "primitive") {
        throw new NotImplementedError(
            "only the default and primitive prime-field moduli " +
            "are implemented");
    }
    const primitive = modulus === "primitive";
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
        throw new NotImplementedError(
            "finite fields of non-prime order are not implemented yet");
    }
    field = ρσ_make_parent(
        "Finite Field of size " + order,
        function(value) {
            return new FiniteFieldElement(field, value);
        });
    Object.defineProperty(field, "constructor", {
        value: FiniteField_prime_modn
    });
    Object.defineProperty(field, "_kind", {value: "GF"});
    Object.defineProperty(field, "_modulus", {value: order});
    Object.defineProperty(field, "_generator", {
        value: primitive ? backend.wordPrimitiveRootPrime(order) : 1n
    });
    field.order = function() {
        return ρσ_normalize_integer(order);
    };
    field.cardinality = field.order;
    field.characteristic = field.order;
    field.degree = function() { return 1; };
    field.is_field = function() { return true; };
    field.is_finite = function() { return true; };
    field.is_prime_field = function() { return true; };
    field.zero = function() { return new FiniteFieldElement(field, 0n); };
    field.one = function() { return new FiniteFieldElement(field, 1n); };
    field.gen = function(index) {
        if (index === undefined) index = 0;
        index = ρσ_integer_bigint(index);
        if (index !== 0n) {
            throw new IndexError("only one generator");
        }
        return new FiniteFieldElement(field, field._generator);
    };
    field._first_ngens = function(count) {
        count = ρσ_integer_bigint(count);
        if (count !== 1n) {
            throw new ValueError("prime fields have exactly one generator");
        }
        return [field.gen()];
    };
    field.gens = function() {
        return ρσ_math_tuple([field.gen()]);
    };
    field.variable_name = function() { return "x"; };
    field.polynomial = function(variable) {
        if (variable === undefined) variable = "x";
        return PolynomialRing(field, variable).gen();
    };
    field.construction = function() {
        return ρσ_math_tuple([QuotientFunctor, ZZ]);
    };
    field[ρσ_iterator_symbol] = function() {
        let value = 0n;
        const iterator = {
            "next": function() {
                if (value >= order) return {"done": true};
                const result = {
                    "done": false,
                    "value": new FiniteFieldElement(field, value)
                };
                value += 1n;
                return result;
            }
        };
        iterator[ρσ_iterator_symbol] = function() { return this; };
        return iterator;
    };
    field.__iter__ = field[ρσ_iterator_symbol];
    field.prime_subfield = function() { return field; };
    ρσ_prime_fields.set(key, field);
    ρσ_coercion_model.register(ZZ, field, function(value) {
        return new FiniteFieldElement(field, value);
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

Rational.prototype.__add__ = function(other) {
    return ρσ_coercion_model.binOp("add", this, other);
};
Rational.prototype.__sub__ = function(other) {
    return ρσ_coercion_model.binOp("sub", this, other);
};
Rational.prototype.__mul__ = function(other) {
    return ρσ_coercion_model.binOp("mul", this, other);
};
Rational.prototype.__truediv__ = function(other) {
    return ρσ_coercion_model.binOp("truediv", this, other);
};
Rational.prototype.__eq__ = function(other) {
    return ρσ_coercion_model.equals(this, other);
};

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

function PolynomialElement(parent, nativeValue) {
    Element.call(this, parent);
    this._native = nativeValue;
    Object.freeze(this);
}
PolynomialElement.prototype = Object.create(Element.prototype);
PolynomialElement.prototype.constructor = PolynomialElement;
Object.defineProperty(PolynomialElement, "__repr__", {
    value: function() { return "<class 'PolynomialElement'>"; }
});
PolynomialElement.prototype._add_ = function(other) {
    return new PolynomialElement(
        this._parent,
        ρσ_flint_backend().polyAdd(this._native, other._native));
};
PolynomialElement.prototype._sub_ = function(other) {
    return new PolynomialElement(
        this._parent,
        ρσ_flint_backend().polySub(this._native, other._native));
};
PolynomialElement.prototype._mul_ = function(other) {
    return new PolynomialElement(
        this._parent,
        ρσ_flint_backend().polyMul(this._native, other._native));
};
PolynomialElement.prototype.__add__ = function(other) {
    return ρσ_coercion_model.binOp("add", this, other);
};
PolynomialElement.prototype.__sub__ = function(other) {
    return ρσ_coercion_model.binOp("sub", this, other);
};
PolynomialElement.prototype.__mul__ = function(other) {
    return ρσ_coercion_model.binOp("mul", this, other);
};
PolynomialElement.prototype.__neg__ = function() {
    return new PolynomialElement(
        this._parent, ρσ_flint_backend().polyNeg(this._native));
};
PolynomialElement.prototype.__pow__ = function(exponent) {
    exponent = ρσ_integer_bigint(exponent);
    if (exponent < 0n) {
        throw new ValueError("negative polynomial exponent");
    }
    return new PolynomialElement(
        this._parent,
        ρσ_flint_backend().polyPow(this._native, exponent));
};
PolynomialElement.prototype._eq_ = function(other) {
    return ρσ_flint_backend().polyEqual(this._native, other._native);
};
PolynomialElement.prototype.__eq__ = function(other) {
    return ρσ_coercion_model.equals(this, other);
};
PolynomialElement.prototype.gcd = function(other) {
    const operands = ρσ_coercion_model.coercePair(this, other);
    if (!(operands.left instanceof PolynomialElement) ||
            operands.parent.base_ring()._kind !== "GF") {
        throw new TypeError(
            "polynomial gcd is currently implemented over finite fields");
    }
    return new PolynomialElement(
        operands.parent,
        ρσ_flint_backend().nmodPolyGcd(
            operands.left._native, operands.right._native));
};
PolynomialElement.prototype.is_irreducible = function() {
    if (this._parent.base_ring()._kind !== "GF") {
        throw new TypeError(
            "irreducibility testing is currently implemented " +
            "over finite fields");
    }
    return ρσ_flint_backend().nmodPolyIsIrreducible(this._native);
};
PolynomialElement.prototype.factor = function() {
    if (this._parent.base_ring()._kind !== "GF") {
        throw new TypeError(
            "polynomial factorization is currently implemented " +
            "over finite fields");
    }
    const result = ρσ_flint_backend().nmodPolyFactor(this._native);
    const parent = this._parent;
    const factors = result.factors.map(function(pair) {
        return [new PolynomialElement(parent, pair[0]), pair[1]];
    });
    return new Factorization(
        factors, parent.base_ring()(result.unit), false, true, false);
};
PolynomialElement.prototype.roots = function(multiplicities) {
    if (multiplicities !== null && typeof multiplicities === "object" &&
            multiplicities[ρσ_kwargs_symbol]) {
        multiplicities = multiplicities.multiplicities;
    }
    if (multiplicities === undefined) multiplicities = true;
    if (this._parent.base_ring()._kind !== "GF") {
        throw new TypeError(
            "polynomial roots are currently implemented over finite fields");
    }
    const field = this._parent.base_ring();
    return ρσ_flint_backend().nmodPolyRoots(this._native).map(
        function(pair) {
            const root = field(pair[0]);
            return multiplicities
                ? ρσ_factor_pair(root, pair[1])
                : root;
        });
};
PolynomialElement.prototype.__repr__ = function() {
    const raw = ρσ_flint_backend().polyToString(
        this._native, this._parent.variable_name());
    return raw.replace(/\+/g, " + ").replace(/([^-])-+/g, "$1 - ");
};
PolynomialElement.prototype.__str__ = PolynomialElement.prototype.__repr__;
PolynomialElement.prototype.toString = PolynomialElement.prototype.__repr__;
PolynomialElement.prototype._factorization_repr = function() {
    const value = this.__repr__();
    return value.includes(" + ") || value.includes(" - ")
        ? "(" + value + ")"
        : value;
};

function PolynomialRingParent(base, variable) {
    Parent.call(
        this,
        "Univariate Polynomial Ring in " + variable + " over " + base);
    this._base = base;
    this._variable = variable;
    this._construction = {
        kind: "polynomial", base: base, variable: variable
    };
}
PolynomialRingParent.prototype = Object.create(Parent.prototype);
PolynomialRingParent.prototype.constructor = PolynomialRingParent;
Object.defineProperty(PolynomialRingParent, "__repr__", {
    value: function() { return "<class 'PolynomialRingParent'>"; }
});
PolynomialRingParent.prototype.base_ring = function() {
    return this._base;
};
PolynomialRingParent.prototype.variable_name = function() {
    return this._variable;
};
PolynomialRingParent.prototype.gen = function() {
    const backend = ρσ_flint_backend();
    let nativeValue;
    if (this._base === ZZ) {
        nativeValue = backend.zzPolyGen();
    } else if (this._base === QQ) {
        nativeValue = backend.qqPolyGen();
    } else {
        nativeValue = backend.nmodPolyGen(this._base._modulus);
    }
    return new PolynomialElement(this, nativeValue);
};
PolynomialRingParent.prototype._first_ngens = function(count) {
    if (count !== 1) {
        throw new ValueError(
            "a univariate polynomial ring has exactly one generator");
    }
    return [this.gen()];
};
PolynomialRingParent.prototype._constant = function(value) {
    const backend = ρσ_flint_backend();
    if (this._base === ZZ) {
        return new PolynomialElement(
            this, backend.zzPolyConstant(ρσ_integer_bigint(value)));
    }
    if (this._base === QQ && value instanceof Rational) {
        return new PolynomialElement(
            this,
            backend.qqPolyConstant(
                value._numerator, value._denominator));
    }
    if (this._base._kind === "GF" &&
            value instanceof FiniteFieldElement &&
            value._parent === this._base) {
        return new PolynomialElement(
            this,
            backend.nmodPolyConstant(
                value._value, this._base._modulus));
    }
    throw new TypeError("unsupported polynomial coefficient parent");
};
PolynomialRingParent.prototype._coercePolynomial = function(value) {
    if (!(value instanceof PolynomialElement)) {
        throw new TypeError("expected a polynomial");
    }
    if (value._parent === this) return value;
    const source = value._parent;
    if (source._construction === undefined ||
            source._construction.kind !== "polynomial" ||
            source.variable_name() !== this.variable_name()) {
        throw new TypeError("incompatible polynomial rings");
    }
    if (source.base_ring() === ZZ && this._base === QQ) {
        return new PolynomialElement(
            this, ρσ_flint_backend().zzPolyToQQ(value._native));
    }
    if (source.base_ring() === ZZ && this._base._kind === "GF") {
        return new PolynomialElement(
            this,
            ρσ_flint_backend().zzPolyToNmod(
                value._native, this._base._modulus));
    }
    throw new TypeError(
        "unsupported polynomial coefficient coercion from " +
        source.base_ring() + " to " + this._base);
};
PolynomialRingParent.prototype.__call__ = function(value) {
    if (value instanceof PolynomialElement) {
        return this._coercePolynomial(value);
    }
    const plan = ρσ_coercion_model.resolveParents(
        ρσ_coercion_model.parentOf(value), this._base);
    if (plan.parent !== this._base) {
        throw new TypeError("coefficient does not canonically coerce");
    }
    return this._constant(plan.leftMap(value));
};

var ρσ_polynomial_ring_cache = new Map();
function PolynomialRing(base, variable) {
    if (variable !== null && typeof variable === "object" &&
            variable[ρσ_kwargs_symbol]) {
        variable = variable.names;
    }
    if (Array.isArray(variable)) {
        if (variable.length !== 1) {
            throw new TypeError(
                "multivariate polynomial rings are not implemented yet");
        }
        variable = variable[0];
    }
    if (base !== ZZ && base !== QQ && base._kind !== "GF") {
        throw new TypeError(
            "the prototype currently supports polynomial rings over " +
            "ZZ, QQ, and prime finite fields");
    }
    if (typeof variable !== "string" ||
            !/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable)) {
        throw new TypeError(
            "the polynomial variable must be a valid identifier");
    }
    let byVariable = ρσ_polynomial_ring_cache.get(base);
    if (byVariable === undefined) {
        byVariable = new Map();
        ρσ_polynomial_ring_cache.set(base, byVariable);
    }
    let parent = byVariable.get(variable);
    if (parent === undefined) {
        parent = new PolynomialRingParent(base, variable);
        byVariable.set(variable, parent);
    }
    return parent;
}

var parent = ρσ_parent;
"""
