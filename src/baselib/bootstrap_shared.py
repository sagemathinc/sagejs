"""Shared host adapters for both compiler and Sage/Python bootstrap runtimes.

These unchanged native ABI and interruption primitives must be initialized
before builtins. They have no private state or mathematical implementation.
"""


def ρσ_native_method_adapter(target_function):
    return r"""%js (() => {
        function method(...args) {
            args.unshift(this);
            return Reflect.apply(target_function, undefined, args);
        }
        if (target_function.__argnames__) {
            method.__argnames__ = target_function.__argnames__.slice(1);
        }
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
