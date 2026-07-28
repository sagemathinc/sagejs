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

function ρσ_string_primitive(value) {
    return String(value);
}

function ρσ_string_find(value, needle) {
    return value.indexOf(needle);
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

"""

parent = ρσ_parent
