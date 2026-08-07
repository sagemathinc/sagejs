/** Project-local JavaScript module loading for public Sage.js programs. */

import { createRequire, isBuiltin } from "node:module";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const loaders = new Map<string, NodeJS.Require>();
const wrappedValues = new WeakMap<object, object>();
const rawValues = new WeakMap<object, object>();
const wrappedMembers = new WeakMap<
  object,
  Map<PropertyKey, { raw: Function; wrapped: Function }>
>();

function unwrapJavaScriptValue<T>(value: T): T {
  if (
    (typeof value === "object" && value !== null) ||
    typeof value === "function"
  ) {
    return (rawValues.get(value as object) ?? value) as T;
  }
  return value;
}

function wrappedMember(
  receiver: object,
  property: PropertyKey,
  value: unknown,
): unknown {
  if (typeof value !== "function") return wrapJavaScriptValue(value);
  let members = wrappedMembers.get(receiver);
  if (!members) {
    members = new Map();
    wrappedMembers.set(receiver, members);
  }
  const cached = members.get(property);
  if (cached?.raw === value) return cached.wrapped;
  const wrapped = createInteropProxy(value, receiver) as Function;
  members.set(property, { raw: value, wrapped });
  return wrapped;
}

function createInteropProxy(target: object, forcedThis?: object): object {
  const proxy = new Proxy(target, {
    get(raw, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(raw, property);
      if (
        descriptor && !descriptor.configurable &&
        "value" in descriptor && !descriptor.writable
      ) {
        // Proxy invariants require the exact stored value here. Function
        // ``prototype``, ``caller``, and ``arguments`` are common examples.
        return descriptor.value;
      }
      return wrappedMember(raw, property, Reflect.get(raw, property, raw));
    },
    set(raw, property, value) {
      return Reflect.set(raw, property, unwrapJavaScriptValue(value), raw);
    },
    apply(raw, thisValue, args) {
      return wrapJavaScriptValue(Reflect.apply(
        raw as Function,
        forcedThis ?? unwrapJavaScriptValue(thisValue),
        args.map(unwrapJavaScriptValue),
      ));
    },
    construct(raw, args) {
      return wrapJavaScriptValue(Reflect.construct(
        raw as Function,
        args.map(unwrapJavaScriptValue),
        raw as Function,
      )) as object;
    },
  });
  rawValues.set(proxy, target);
  return proxy;
}

/**
 * Present native objects with Python-friendly method receiver semantics.
 *
 * JavaScript methods frequently depend on ``this``. Python attribute lookup
 * returns a callable and invokes it separately, so a transparent boundary
 * proxy binds callable properties to the object from which they were read.
 */
export function wrapJavaScriptValue(value: unknown): unknown {
  if (
    (typeof value !== "object" || value === null) &&
    typeof value !== "function"
  ) return value;
  if (rawValues.has(value as object)) return value;
  const cached = wrappedValues.get(value as object);
  if (cached) return cached;
  const proxy = createInteropProxy(value as object);
  wrappedValues.set(value as object, proxy);
  return proxy;
}

function projectDirectory(directory?: unknown): string {
  if (directory === undefined || directory === null || directory === "") {
    return process.cwd();
  }
  if (typeof directory !== "string") {
    throw new TypeError("JavaScript module directory must be a string or None");
  }
  return isAbsolute(directory) ? directory : resolve(process.cwd(), directory);
}

function projectLoader(directory?: unknown): NodeJS.Require {
  const base = projectDirectory(directory);
  let loader = loaders.get(base);
  if (!loader) {
    // The anchor need not exist. Node uses its containing directory as the
    // beginning of the ordinary package/node_modules search.
    loader = createRequire(join(base, ".sagejs-require.cjs"));
    loaders.set(base, loader);
  }
  return loader;
}

function validateSpecifier(specifier: unknown): string {
  if (typeof specifier !== "string" || specifier.length === 0) {
    throw new TypeError("JavaScript module specifier must be a non-empty string");
  }
  return specifier;
}

/** Load CommonJS or synchronously-requireable ESM from a project directory. */
export function requireJavaScriptModule(
  specifier: unknown,
  directory?: unknown,
): unknown {
  return wrapJavaScriptValue(
    projectLoader(directory)(validateSpecifier(specifier)),
  );
}

/** Resolve a Node module exactly as requireJavaScriptModule would load it. */
export function resolveJavaScriptModule(
  specifier: unknown,
  directory?: unknown,
): string {
  const name = validateSpecifier(specifier);
  if (isBuiltin(name)) return name;
  return projectLoader(directory).resolve(name);
}

/**
 * Dynamically import a project-local module.
 *
 * This returns the native Promise produced by import(). Resolution starts in
 * the requested project directory instead of in Sage.js's own installation.
 * Node's synchronous resolver selects the concrete entry point first; this is
 * deterministic for ordinary packages and relative/absolute module paths.
 */
export function importJavaScriptModule(
  specifier: unknown,
  directory?: unknown,
): Promise<unknown> {
  const name = validateSpecifier(specifier);
  const resolved = resolveJavaScriptModule(name, directory);
  const url = isBuiltin(name) ? resolved : pathToFileURL(resolved).href;
  return import(url).then(wrapJavaScriptValue);
}
