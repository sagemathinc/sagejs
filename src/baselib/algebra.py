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
PolynomialElement.prototype.__repr__ = function() {
    const raw = ρσ_flint_backend().polyToString(
        this._native, this._parent.variable_name());
    return raw.replace(/\+/g, " + ").replace(/([^-])-+/g, "$1 - ");
};
PolynomialElement.prototype.__str__ = PolynomialElement.prototype.__repr__;
PolynomialElement.prototype.toString = PolynomialElement.prototype.__repr__;

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
PolynomialRingParent.prototype.base_ring = function() {
    return this._base;
};
PolynomialRingParent.prototype.variable_name = function() {
    return this._variable;
};
PolynomialRingParent.prototype.gen = function() {
    const backend = ρσ_flint_backend();
    const nativeValue = this._base === ZZ
        ? backend.zzPolyGen()
        : backend.qqPolyGen();
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
    if (base !== ZZ && base !== QQ) {
        throw new TypeError(
            "the prototype currently supports polynomial rings over ZZ and QQ");
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
