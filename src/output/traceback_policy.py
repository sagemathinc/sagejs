"""Optional generated runtime for guarded synchronous traceback capture."""

TRACEBACK_POLICY_RUNTIME = r"""
var ρσ_traceback_policy = (function () {
    var key = Symbol.for("sagejs.traceback-policy/v1");
    if (globalThis[key]) return globalThis[key];
    var entries = new WeakMap(), implementations = new WeakSet();
    var constructors = new WeakMap(), active = null, permit = null;
    function sameDescriptor(left, right) {
        if (!left || !right) return left === right;
        return left.value === right.value && left.get === right.get &&
            left.set === right.set && left.writable === right.writable &&
            left.enumerable === right.enumerable && left.configurable === right.configurable;
    }
    function snapshot(ctor, base) {
        var chain = [], prototype = ctor.prototype, found = false;
        var baseInit = Object.getOwnPropertyDescriptor(base.prototype, "__init__");
        var canonicalInit = baseInit && (baseInit.value ||
            (baseInit.get && baseInit.get.__sagejs_lazy_method_getter__ === true &&
                baseInit.get.__sagejs_unbound_method__));
        if (typeof canonicalInit !== "function") return null;
        for (var current = prototype; current; current = Object.getPrototypeOf(current)) {
            var init = Object.getOwnPropertyDescriptor(current, "__init__");
            var initializer = init && (init.value ||
                (init.get && init.get.__sagejs_lazy_method_getter__ === true &&
                    init.get.__sagejs_unbound_method__));
            if (init && typeof initializer !== "function") return null;
            // Only compiler-owned pass-through initializers may precede the
            // canonical initializer. Custom Python initializers stay native.
            var delegate = initializer, seen = new Set();
            while (delegate && delegate !== canonicalInit) {
                if (seen.has(delegate)) return null;
                seen.add(delegate);
                var marker = Object.getOwnPropertyDescriptor(delegate, "__sagejs_synthetic_init__");
                var target = Object.getOwnPropertyDescriptor(delegate, "__sagejs_synthetic_init_target__");
                if (!marker || marker.value !== true || !target || typeof target.value !== "function") return null;
                delegate = target.value;
            }
            if (initializer && Object.getOwnPropertyDescriptor(initializer, "apply")) return null;
            chain.push([current, Object.getPrototypeOf(current), init,
                Object.getOwnPropertyDescriptor(current, "__new__"), initializer]);
            if (current === base.prototype) found = true;
        }
        if (!found || Object.getOwnPropertyDescriptor(ctor, Symbol.hasInstance)) return null;
        return {prototype: prototype, chain: chain,
            parent: Object.getPrototypeOf(ctor),
            call: Object.getOwnPropertyDescriptor(ctor, "__call__"),
            alloc: Object.getOwnPropertyDescriptor(ctor, "__new__")};
    }
    function unchanged(ctor, saved) {
        if (ctor.prototype !== saved.prototype || Object.getPrototypeOf(ctor) !== saved.parent ||
            Object.getOwnPropertyDescriptor(ctor, Symbol.hasInstance) ||
            !sameDescriptor(Object.getOwnPropertyDescriptor(ctor, "__call__"), saved.call) ||
            !sameDescriptor(Object.getOwnPropertyDescriptor(ctor, "__new__"), saved.alloc)) return false;
        for (var i = 0; i < saved.chain.length; i++) {
            var item = saved.chain[i];
            if (Object.getPrototypeOf(item[0]) !== item[1] ||
                !sameDescriptor(Object.getOwnPropertyDescriptor(item[0], "__init__"), item[2]) ||
                !sameDescriptor(Object.getOwnPropertyDescriptor(item[0], "__new__"), item[3]) ||
                (item[4] && Object.getOwnPropertyDescriptor(item[4], "apply"))) return false;
        }
        return true;
    }
    function wrap(implementation) {
        function publicEntry() {
            var previous = active, previousPermit = permit;
            active = {opaque: true, backstop: previous && previous.backstop,
                boundary: publicEntry, implementation: implementation};
            permit = null;
            try { return Reflect.apply(implementation, this, arguments); }
            finally { active = previous; permit = previousPermit; }
        }
        if (typeof implementation.__name__ === "string")
            Object.defineProperty(implementation, "name", {value: implementation.__name__, configurable: true});
        Object.defineProperties(publicEntry, Object.getOwnPropertyDescriptors(implementation));
        // The named implementation closes over itself, not the mutable global
        // binding. Forward replacement defaults to the stable public object.
        ["__defaults__", "__kwdefaults__"].forEach(function (name) {
            var descriptor = Object.getOwnPropertyDescriptor(implementation, name);
            if (descriptor && descriptor.configurable && descriptor.writable)
                Object.defineProperty(implementation, name, {
                    get: function () { return publicEntry[name]; },
                    set: function (value) { publicEntry[name] = value; },
                    configurable: true, enumerable: descriptor.enumerable
                });
        });
        entries.set(publicEntry, implementation);
        implementations.add(implementation);
        return publicEntry;
    }
    function target(value) { return entries.get(value) || value; }
    function registerConstructor(ctor, base) {
        if (constructors.has(ctor)) return;
        var saved = snapshot(ctor, base);
        if (!saved) return;
        function qualifiedConstructor() {
            if (!active || active.opaque || !unchanged(ctor, saved))
                return Reflect.construct(ctor, Array.prototype.slice.call(arguments));
            var previous = permit;
            permit = ctor;
            try { return Reflect.construct(ctor, Array.prototype.slice.call(arguments)); }
            finally { permit = previous; }
        }
        constructors.set(ctor, qualifiedConstructor);
    }
    function constructorTarget(ctor) { return constructors.get(ctor) || ctor; }
    function enter() {
        var backstop = null;
        if (typeof Error.captureStackTrace === "function") {
            backstop = Object.create(Error.prototype);
            Error.captureStackTrace(backstop, enter);
        }
        var previous = {active: active, permit: permit};
        active = {opaque: backstop === null, backstop: backstop};
        permit = null;
        return previous;
    }
    function leave(previous) { active = previous.active; permit = previous.permit; }
    function initialize(error) {
        var allowedConstructor = permit;
        // Consume before argument conversion or user callbacks can execute.
        permit = null;
        var binding = error.__sagejs_argument_error__;
        var bindingTarget = typeof binding === "function" &&
            (entries.get(binding) || (implementations.has(binding) && binding));
        if (bindingTarget) error.__sagejs_argument_error__ =
            active && active.implementation === bindingTarget ? active.boundary : bindingTarget;
        if (!active || active.opaque ||
            (!bindingTarget && (!allowedConstructor || error.constructor !== allowedConstructor))) {
            if (error.__sagejs_logical_exception__ === true)
                Reflect.deleteProperty(error, "__sagejs_native_tb__");
            return false;
        }
        Object.defineProperty(error, "__sagejs_native_tb__", {
            value: active.backstop, writable: true, configurable: true, enumerable: true
        });
        return true;
    }
    var policy = Object.freeze({wrap: wrap, target: target,
        registerConstructor: registerConstructor, constructorTarget: constructorTarget,
        enter: enter, leave: leave, initialize: initialize});
    Object.defineProperty(globalThis, key, {value: policy});
    return policy;
})();
"""


def print_traceback_policy(output):
    if not output.options.python_traceback_records:
        raise ValueError("Guarded capture requires compiler traceback records")
    output.print(TRACEBACK_POLICY_RUNTIME)
    output.end_statement()
    output.print(
        "[BaseException,Exception,ValueError,RuntimeError,ArithmeticError,"
        "LookupError,IndexError,KeyError,AssertionError].forEach(function(ctor){"
        "ρσ_traceback_policy.registerConstructor(ctor,BaseException);});"
        "globalThis.__sagejs_traceback_records_enabled__=ρσ_traceback_policy.initialize;"
    )
