"""Shared host adapters for both compiler and Sage/Python bootstrap runtimes.

Native ABI, interruption, and handled-exception ownership initialize before
builtins. This module has no mathematical implementation.
"""

ρσ_handled_state = r"""%js (() => {
    let current = null;
    const states = new WeakMap();
    const wrappers = new WeakMap();
    const prototypes = new WeakMap();
    function value() {
        for (let node = current; node; node = node.parent) {
            if (Object.hasOwn(node, "error")) return node.error;
        }
        return null;
    }
    function resumeMethod(native) {
        if (wrappers.has(native)) return wrappers.get(native);
        function resume(...args) {
            const state = states.get(this);
            // Preserve native receiver validation and reentrancy rejection.
            if (!state || state.running) return Reflect.apply(native, this, args);
            const caller = current;
            state.root.parent = caller;
            current = state.top;
            state.running = true;
            let complete = true;
            try {
                const result = Reflect.apply(native, this, args);
                complete = result.done;
                return result;
            } finally {
                state.top = complete ? state.root : current;
                state.root.parent = null;
                state.running = false;
                current = caller;
            }
        }
        wrappers.set(native, resume);
        return resume;
    }
    Object.defineProperty(globalThis, "__sagejs_last_exception__", {
        get: value, configurable: true
    });
    return Object.freeze({
        enter(error) {
            const node = {error, parent: current};
            current = node;
            return node;
        },
        leave(node) { current = node.parent; },
        reraise() {
            const error = value();
            if (error === null) throw new RuntimeError("No active exception to reraise");
            return error;
        },
        wrap(iterator) {
            if (states.has(iterator)) return iterator;
            const root = {parent: null};
            states.set(iterator, {root, top: root, running: false});
            const prototype = Object.getPrototypeOf(iterator);
            let adapter = prototypes.get(prototype);
            if (!adapter) {
                adapter = Object.create(prototype);
                for (const name of ["next", "throw", "return"]) {
                    const native = iterator[name];
                    if (typeof native === "function") {
                        Object.defineProperty(adapter, name, {
                            value: resumeMethod(native), writable: true, configurable: true
                        });
                    }
                }
                prototypes.set(prototype, adapter);
            }
            Object.setPrototypeOf(iterator, adapter);
            return iterator;
        }
    });
})()"""


def ρσ_copy_method_metadata(method, target_function):
    """Copy ordered adapter metadata without evaluating live getter properties."""
    return r"""%js (() => {
        for (const name of [
            "__annotations__",
            "__annotations_text__",
            "__code__",
            "__defaults__",
            "__doc__",
            "__globals__",
            "__handles_kwarg_interpolation__",
            "__kwdefaults__",
            "__kwonly__",
            "__module__",
            "__name__",
            "__positional_only__",
            "__python_type__",
            "__qualname__",
            "__varargs__",
            "__varkw__",
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
    })()"""


def ρσ_native_method_adapter(target_function):
    return r"""%js (() => {
        function method(...args) {
            args.unshift(this);
            return Reflect.apply(target_function, undefined, args);
        }
        if (target_function.__argnames__) {
            method.__argnames__ = target_function.__argnames__.slice(1);
        }
        ρσ_copy_method_metadata(method, target_function);
        method.__sagejs_native_method__ = true;
        return method;
    })()"""


def ρσ_unbound_method_adapter(target_function):
    """Expose a JavaScript-receiver method as `method(self, *args)`."""
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
        ρσ_copy_method_metadata(method, target_function);
        method.__func__ = target_function;
        // The adapter still represents an ordinary Python function.  Mark it
        // as a descriptor so aliases assigned back onto a class (for example
        // ``C.__rtruediv__ = C.__rdiv__``) bind their eventual instance
        // before receiving the operator's other operand.
        method.__python_descriptor__ = true;
        target_function.__sagejs_unbound_adapter__ = method;
        return method;
    })()"""


def ρσ_check_interrupt():
    return r"""%js (() => {
        const state = globalThis.__sagejs_interrupt_state__;
        if (
            state !== undefined
            && Atomics.exchange(state, 0, 0) !== 0
        ) {
            throw ρσ_exception_value(new KeyboardInterrupt());
        }
    })()"""


def ρσ_normalize_exception(error):
    return r"""%js (() => {
        if (error?.code !== "ERR_SCRIPT_EXECUTION_INTERRUPTED") {
            return error;
        }
        const state = globalThis.__sagejs_interrupt_state__;
        if (state !== undefined) {
            Atomics.store(state, 0, 0);
        }
        return ρσ_exception_value(new KeyboardInterrupt());
    })()"""
