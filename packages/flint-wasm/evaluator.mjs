import { instantiateFlintFactor } from "./index.mjs";
import { instantiateM4ri } from "./m4ri.mjs";
import {
  canSeedDynamicName,
  createPrecompiledDynamicCompiler,
} from "./dynamic-compiler.mjs";
import { createWasiHost } from "./dist/wasi-runtime.mjs";
import { instantiateWasmKernelPacks } from "./dist/wasm-pack-loader.mjs";
import {
  fetchLazyModuleBundle,
  installLazyModuleLoader,
} from "./lazy-modules.mjs";
import {
  dumps as serializationDumps,
  loads as serializationLoads,
  pack as serializationPack,
  unpack as serializationUnpack,
} from "./dist/serialization.mjs";
import { createSagejsCapabilityAPI } from "./dist/wasm-capability-api.mjs";
import {
  capabilityTraceInstrumentation,
  createCapabilityDispatchTrace,
} from "./capability-trace.mjs";

function deserializeError(serialized) {
  const constructors = {
    Error,
    EvalError,
    RangeError,
    ReferenceError,
    SyntaxError,
    TypeError,
    URIError,
  };
  const Constructor = constructors[serialized.name] ?? Error;
  const error = new Constructor(serialized.message);
  error.name = serialized.name;
  if (serialized.stack) {
    error.stack = serialized.stack;
  }
  if (typeof serialized.sagejsErrorName === "string") {
    error.sagejsErrorName = serialized.sagejsErrorName;
  }
  return error;
}

function richDisplay(value) {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return undefined;
  }
  const method = Reflect.get(value, "_rich_repr_");
  if (typeof method !== "function") {
    return undefined;
  }
  const display = Reflect.apply(method, value, []);
  if (
    display === null ||
    typeof display !== "object" ||
    typeof Reflect.get(display, "mime") !== "string" ||
    !Reflect.has(display, "data")
  ) {
    throw new TypeError("_rich_repr_() must return { mime, data }");
  }
  return {
    mime: Reflect.get(display, "mime"),
    data: Reflect.get(display, "data"),
  };
}

function supportsSynchronousCompilerWorker() {
  return (
    typeof SharedArrayBuffer === "function" &&
    typeof Atomics?.wait === "function"
  );
}

const KERNEL_CAPABILITY_BY_SOURCE = new Map([
  [
    "sagejs/number_fields/field_analysis_resource.py",
    "kernel:field-analysis-fixed-point-checker-production",
  ],
  [
    "sagejs/number_fields/om_maxmin.py",
    "kernel:number-field-om-proof-production",
  ],
  [
    "sagejs/number_fields/round4_state_kernel.py",
    "kernel:number-field-round4-state-production",
  ],
  [
    "sagejs/number_fields/composite_field_analysis.py",
    "kernel:number-field-composite-analysis-production",
  ],
  [
    "sagejs/number_fields/zeta_coefficient_kernel.py",
    "kernel:number-field-zeta-coefficients-production",
  ],
]);

function transportByteLength(value) {
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (typeof value === "string") return new TextEncoder().encode(value).length;
  if (typeof value === "bigint" || typeof value === "number") return 8;
  return 0;
}

export function instrumentWasmNativeResolver(resolver, trace) {
  const wrapped = new WeakMap();
  const instrument = (logicalSource, candidate) => {
    const capabilityId = KERNEL_CAPABILITY_BY_SOURCE.get(logicalSource);
    if (capabilityId === undefined || typeof candidate !== "function") return candidate;
    let result = wrapped.get(candidate);
    if (result) return result;
    result = new Proxy(candidate, {
      apply(target, thisArgument, arguments_) {
        const value = Reflect.apply(target, thisArgument, arguments_);
        trace.record(capabilityId, "receipt-backed-wasm-artifact", {
          executionTarget: "wasm-artifact",
          ingressBytes: arguments_.reduce(
            (total, argument) => total + transportByteLength(argument),
            0,
          ),
          egressBytes: transportByteLength(value),
        });
        return value;
      },
    });
    wrapped.set(candidate, result);
    return result;
  };
  return Object.freeze({
    ...resolver,
    resolve(logicalSource, name, expected) {
      return instrument(
        logicalSource,
        resolver.resolve(logicalSource, name, expected),
      );
    },
    function(logicalSource, name) {
      return instrument(logicalSource, resolver.function(logicalSource, name));
    },
  });
}

function preservePythonCallableMetadata(wrapper, original) {
  Object.assign(wrapper, original);
  for (const name of ["__name__", "__qualname__", "__module__", "__doc__"]) {
    if (Object.hasOwn(original, name)) wrapper[name] = original[name];
  }
  return wrapper;
}

/**
 * Observe the two strict-Python elliptic fallbacks without exposing the
 * evaluator's recorder to the evaluated realm.  Calling either wrapper still
 * performs the real operation; there is no callable "claim this route" hook.
 */
export function instrumentEllipticFallbackPrototype(prototype, trace, backend) {
  if (prototype === null || typeof prototype !== "object") {
    throw new TypeError("elliptic fallback instrumentation requires a prototype");
  }
  const originalRootNumber = prototype.root_number;
  const originalAnlist = prototype.anlist;
  if (typeof originalRootNumber !== "function" || typeof originalAnlist !== "function") {
    throw new TypeError("elliptic fallback methods are unavailable");
  }
  prototype.root_number = preservePythonCallableMetadata(function (...args) {
    const uncached = this._root_number === undefined;
    const noPrecomputed = args.length === 0 || args[0] == null;
    const value = Reflect.apply(originalRootNumber, this, args);
    if (uncached && noPrecomputed && typeof backend.ecRootNumber !== "function") {
      trace.record("elliptic-root-number-semistable", "portable-fallback");
    }
    return value;
  }, originalRootNumber);
  prototype.anlist = preservePythonCallableMetadata(function (...args) {
    const originalNative = this._anlist_native;
    let usedNative = false;
    if (typeof originalNative !== "function") {
      throw new TypeError("elliptic coefficient dispatch is unavailable");
    }
    this._anlist_native = function (...nativeArgs) {
      const value = Reflect.apply(originalNative, this, nativeArgs);
      usedNative = value !== null && value !== undefined;
      return value;
    };
    let value;
    try {
      value = Reflect.apply(originalAnlist, this, args);
    } finally {
      this._anlist_native = originalNative;
    }
    if (!usedNative) {
      trace.record("elliptic-coefficients-portable", "portable-fallback");
    }
    return value;
  }, originalAnlist);
}

class CompilerWorker {
  constructor(url, WorkerConstructor = globalThis.Worker) {
    this.worker = new WorkerConstructor(url, { type: "module" });
    this.nextId = 0;
    this.pending = new Map();
    this.syncState = undefined;
    this.syncResponse = undefined;
    this.worker.onmessage = ({ data }) => {
      const handlers = this.pending.get(data.id);
      if (!handlers) {
        return;
      }
      this.pending.delete(data.id);
      if (data.ok) {
        handlers.resolve(data.result);
      } else {
        handlers.reject(deserializeError(data.error));
      }
    };
    this.worker.onerror = (event) => {
      const error = new Error(
        event.message || "Sage.js compiler worker failed",
      );
      for (const handlers of this.pending.values()) {
        handlers.reject(error);
      }
      this.pending.clear();
    };
  }

  request(type, parameters) {
    this.nextId += 1;
    const id = this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, ...parameters });
    });
  }

  requestSync(type, parameters) {
    if (!this.worker) {
      throw new Error("Sage.js compiler worker was terminated");
    }
    if (
      typeof SharedArrayBuffer !== "function" ||
      typeof Atomics?.wait !== "function"
    ) {
      throw new Error(
        "synchronous Python compile/eval/exec requires a cross-origin-isolated worker",
      );
    }
    this.syncState ??= new Int32Array(
      new SharedArrayBuffer(2 * Int32Array.BYTES_PER_ELEMENT),
    );
    this.syncResponse ??= new Uint8Array(
      new SharedArrayBuffer(8 * 1024 * 1024),
    );
    const state = this.syncState;
    const responseBytes = this.syncResponse;
    Atomics.store(state, 0, 0);
    Atomics.store(state, 1, 0);
    this.nextId += 1;
    this.worker.postMessage({
      id: this.nextId,
      type,
      ...parameters,
      sync: {
        state: state.buffer,
        response: responseBytes.buffer,
      },
    });
    const status = Atomics.wait(state, 0, 0, 120_000);
    if (status === "timed-out") {
      this.terminate();
      throw new Error(`browser compiler timed out while handling ${type}`);
    }
    const length = Atomics.load(state, 1);
    if (length <= 0 || length > responseBytes.byteLength) {
      throw new Error("browser compiler returned an invalid synchronous response");
    }
    const response = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(responseBytes.subarray(0, length))),
    );
    if (response.ok) return response.result;
    throw deserializeError(response.error);
  }

  terminate() {
    if (!this.worker) return;
    const error = new Error("Sage.js compiler worker was terminated");
    for (const handlers of this.pending.values()) handlers.reject(error);
    this.pending.clear();
    this.worker.terminate();
    this.worker = undefined;
  }
}

export function normalizeBrowserPosixPath(value, cwd = "/") {
  if (typeof value !== "string") throw new TypeError("path must be a string");
  if (value.includes("\0")) throw new TypeError("path contains null bytes");
  if (typeof cwd !== "string" || !cwd.startsWith("/")) {
    throw new TypeError("cwd must be an absolute POSIX path");
  }
  const source = value.startsWith("/") ? value : `${cwd}/${value}`;
  const components = [];
  for (const component of source.split("/")) {
    if (!component || component === ".") continue;
    if (component === "..") components.pop();
    else components.push(component);
  }
  return `/${components.join("/")}`;
}

function validateEnvironmentKey(key) {
  if (typeof key !== "string") throw new TypeError("environment key must be a string");
  if (key.length === 0) throw new TypeError("environment key must not be empty");
  if (key.includes("=")) throw new TypeError("illegal environment variable name");
  if (key.includes("\0")) throw new TypeError("environment key contains a null byte");
  return key;
}

function validateEnvironmentValue(value) {
  if (typeof value !== "string") throw new TypeError("environment value must be a string");
  if (value.includes("\0")) throw new TypeError("environment value contains a null byte");
  return value;
}

export function createBrowserEnvironment(initialEntries = []) {
  const values = new Map();
  for (const [key, value] of initialEntries) {
    values.set(validateEnvironmentKey(key), validateEnvironmentValue(value));
  }
  const proxy = new Proxy(Object.create(null), {
    get(_target, key) {
      if (typeof key !== "string") return undefined;
      return values.get(key);
    },
    set(_target, key, value) {
      values.set(validateEnvironmentKey(key), validateEnvironmentValue(value));
      return true;
    },
    deleteProperty(_target, key) {
      values.delete(validateEnvironmentKey(key));
      return true;
    },
    has(_target, key) {
      return typeof key === "string" && values.has(key);
    },
    ownKeys() {
      return [...values.keys()];
    },
    getOwnPropertyDescriptor(_target, key) {
      if (typeof key !== "string" || !values.has(key)) return undefined;
      return { configurable: true, enumerable: true, writable: true, value: values.get(key) };
    },
  });
  return Object.freeze({
    entries: () => [...values.entries()],
    set: (key, value) => values.set(validateEnvironmentKey(key), validateEnvironmentValue(value)),
    delete: (key) => values.delete(validateEnvironmentKey(key)),
    proxy,
  });
}

function createGlobalInstaller(target) {
  const baseline = new Map(
    Reflect.ownKeys(target).map((name) => [
      name,
      Object.getOwnPropertyDescriptor(target, name),
    ]),
  );
  const originals = new Map();
  return {
    set(name, value) {
      if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(target, name));
      Object.defineProperty(target, name, { configurable: true, enumerable: false, writable: true, value });
    },
    restore(name) {
      if (!originals.has(name)) return;
      const descriptor = originals.get(name);
      originals.delete(name);
      if (descriptor === undefined) delete target[name];
      else Object.defineProperty(target, name, descriptor);
    },
    restoreAll() {
      for (const name of [...originals.keys()].reverse()) this.restore(name);
      for (const name of Reflect.ownKeys(target)) {
        if (
          !baseline.has(name) &&
          Object.getOwnPropertyDescriptor(target, name)?.configurable
        ) {
          delete target[name];
        }
      }
      for (const [name, descriptor] of baseline) {
        Object.defineProperty(target, name, descriptor);
      }
    },
  };
}

/**
 * Create a persistent Sage.js evaluator in the current isolated worker.
 *
 * A nested worker hosts the self-compiled language compiler. Isolated hosts
 * use synchronous worker RPC for unrestricted `compile`/`eval`/`exec`;
 * non-isolated hosts can execute authenticated precompiled dynamic programs.
 */
export async function instantiateSageEvaluator({
  compiler,
  baselib,
  standardLibrary,
  lazyModules,
  dynamicPrograms = new URL("./dist/dynamic-programs.json", import.meta.url),
  flint,
  algebraic = undefined,
  nativeKernels = undefined,
  m4ri,
  symbolic = new URL("./dist/symbolic-backend.mjs", import.meta.url),
  compilerWorker = new URL("./compiler-worker.mjs", import.meta.url),
  compilerFrontend = new URL("./dist/compiler-frontend.mjs", import.meta.url),
  treeSitterRuntime = new URL("./dist/web-tree-sitter.wasm", import.meta.url),
  pythonGrammar = new URL("./dist/tree-sitter-python.wasm", import.meta.url),
  sageGrammar = new URL("./dist/tree-sitter-sage.wasm", import.meta.url),
  capabilityReport = new URL("./dist/wasm-capabilities-report.json", import.meta.url),
  WorkerConstructor = globalThis.Worker,
  instantiateFlint = instantiateFlintFactor,
  instantiateM4riBackend = instantiateM4ri,
  importSymbolic = (url) => import(String(url)),
  fetchLazyModules = fetchLazyModuleBundle,
  fetchDynamicPrograms = async (url) => {
    const response = await fetch(String(url));
    if (!response.ok) {
      throw new Error(
        `unable to load precompiled dynamic programs (${response.status})`,
      );
    }
    return response.json();
  },
  evaluateGlobal = globalThis.eval,
  fetchCapabilityReport = globalThis.fetch,
}) {
  const language = new CompilerWorker(compilerWorker, WorkerConstructor);
  const globals = createGlobalInstaller(globalThis);
  const capabilityDispatchTrace = createCapabilityDispatchTrace();
  const abort = (error) => {
    try {
      globals.restoreAll();
    } catch (cleanupError) {
      if (error && typeof error === "object") error.cleanupError = cleanupError;
    }
    try {
      language.terminate();
    } catch (cleanupError) {
      if (error && typeof error === "object" && !error.cleanupError) {
        error.cleanupError = cleanupError;
      }
    }
    throw error;
  };
  const installGlobal = (name, value) => {
    try {
      globals.set(name, value);
    } catch (error) {
      abort(error);
    }
  };
  let initialization;
  let lazyModuleBundle;
  let flintBackend;
  let m4riBackend;
  let symbolicBackendModule;
  let wasmNativeResolver;
  let capabilityApi;
  let capabilityReportResponse;
  let dynamicProgramBundle;
  const useSynchronousCompilerWorker = supportsSynchronousCompilerWorker();
  try {
    [
      initialization,
      lazyModuleBundle,
      flintBackend,
      m4riBackend,
      symbolicBackendModule,
      capabilityReportResponse,
      dynamicProgramBundle,
    ] = await Promise.all([
      language.request("initialize", {
        compiler: String(compiler),
        baselib: String(baselib),
        standardLibrary: String(standardLibrary),
        compilerFrontend: String(compilerFrontend),
        treeSitterRuntime: String(treeSitterRuntime),
        pythonGrammar: String(pythonGrammar),
        sageGrammar: String(sageGrammar),
      }),
      fetchLazyModules(lazyModules),
      instantiateFlint(flint, {
        algebraicSource: algebraic,
        recordCapability: (id, route, options) =>
          capabilityDispatchTrace.record(id, route, options),
      }),
      instantiateM4riBackend(m4ri),
      importSymbolic(symbolic),
      fetchCapabilityReport(String(capabilityReport)),
      useSynchronousCompilerWorker
        ? Promise.resolve(undefined)
        : fetchDynamicPrograms(dynamicPrograms),
    ]);
    if (!capabilityReportResponse.ok) {
      throw new Error(
        `unable to load WebAssembly capability report (${capabilityReportResponse.status})`,
      );
    }
    capabilityApi = createSagejsCapabilityAPI(await capabilityReportResponse.json());
    if (nativeKernels !== undefined) {
      const manifestUrl = new URL(String(nativeKernels), import.meta.url);
      const response = await fetch(manifestUrl);
      if (!response.ok) {
        throw new Error(`unable to load native-kernel manifest (${response.status})`);
      }
      const manifest = await response.json();
      wasmNativeResolver = await instantiateWasmKernelPacks({
        manifest,
        async load(pack) {
          const asset = new URL(pack.asset, manifestUrl);
          const assetResponse = await fetch(asset);
          if (!assetResponse.ok) {
            throw new Error(`unable to load Wasm kernel pack ${pack.domain}`);
          }
          return new Uint8Array(await assetResponse.arrayBuffer());
        },
        async host() {
          const wasi = createWasiHost();
          return {
            imports: { wasi_snapshot_preview1: wasi.imports },
            initialize: (instance) => wasi.initialize(instance),
          };
        },
      });
      wasmNativeResolver = instrumentWasmNativeResolver(
        wasmNativeResolver,
        capabilityDispatchTrace,
      );
    }
  } catch (error) {
    abort(error);
  }
  if (typeof initialization !== "string") {
    abort(new TypeError("browser compiler returned invalid initialization code"));
  }
  const globalEvaluate = evaluateGlobal;
  let outputHandler = (text) => console.log(text);
  let errorHandler = (text) => console.error(text);

  const dynamicCompiler = useSynchronousCompilerWorker
    ? Object.freeze({
        compile(source, filename, mode) {
          return language.requestSync("compileDynamic", {
            source,
            filename,
            mode,
          });
        },
        run(handle, names, undefinedNames) {
          return language.requestSync("runDynamic", {
            handle,
            names,
            undefinedNames,
          });
        },
      })
    : createPrecompiledDynamicCompiler(dynamicProgramBundle);
  const dynamicCodeHelper = Object.freeze({
    compile(source, filename, mode) {
      return dynamicCompiler.compile(source, filename, mode);
    },
    run(handle, namespace) {
      const names = Object.keys(namespace)
        .filter(canSeedDynamicName)
        .sort();
      return dynamicCompiler.run(
        handle,
        names,
        names.filter((name) => namespace[name] === undefined),
      );
    },
  });
  const runtimeRequire = (name) => {
    if (name === "./dynamic-code.js") {
      return { default: dynamicCodeHelper };
    }
    if (name === "@sagemath/sagejs-flint") {
      return flintBackend;
    }
    if (name === "@sagemath/sagejs-m4ri") {
      return m4riBackend;
    }
    if (name === "@sagemath/sagejs-symbolic") {
      return symbolicBackendModule;
    }
    throw new Error(`module ${JSON.stringify(name)} is unavailable in browser`);
  };
  const browserEnvironment = createBrowserEnvironment();
  const traceByteLength = (value) => {
    if (typeof value === "string") return new TextEncoder().encode(value).length;
    if (typeof value === "bigint" || typeof value === "number") {
      return new TextEncoder().encode(String(value)).length;
    }
    if (ArrayBuffer.isView(value)) return value.byteLength;
    if (value instanceof ArrayBuffer) return value.byteLength;
    return 0;
  };
  const traceSagePack = (args, value) => capabilityDispatchTrace.record(
    "specialist:sagepack",
    "shared-runtime-js",
    {
      ingressBytes: args.reduce((total, item) => total + traceByteLength(item), 0),
      egressBytes: traceByteLength(value),
    },
  );
  const serializationHost = Object.freeze({
    call(operation, args) {
      try {
        if (operation === "describe") {
          return {
            ok: true,
            value: {
              name: "posix",
              sep: "/",
              altsep: null,
              pathsep: ":",
              linesep: "\n",
              devnull: "/dev/null",
              curdir: ".",
              pardir: "..",
              tempdir: "/tmp",
            },
          };
        }
        if (operation === "environmentEntries") {
          return { ok: true, value: browserEnvironment.entries() };
        }
        if (operation === "setEnv") {
          browserEnvironment.set(args[0], args[1]);
          return { ok: true, value: null };
        }
        if (operation === "deleteEnv") {
          browserEnvironment.delete(args[0]);
          return { ok: true, value: null };
        }
        if (operation === "getcwd" || operation === "realpath") {
          return { ok: true, value: operation === "getcwd" ? "/" : normalizeBrowserPosixPath(args[0]) };
        }
        if (operation === "cpuCount") {
          return { ok: true, value: navigator.hardwareConcurrency || 1 };
        }
        if (operation === "getpid") {
          return { ok: true, value: 1 };
        }
        if (operation === "urandom") {
          const length = Number(args[0]);
          if (!Number.isSafeInteger(length) || length < 0 || length > 65536) {
            throw new RangeError("browser urandom request is out of range");
          }
          const bytes = new Uint8Array(length);
          crypto.getRandomValues(bytes);
          return { ok: true, value: [...bytes] };
        }
        if (operation === "serializationDumps") {
          const value = serializationDumps(args[0]);
          traceSagePack(args, value);
          return { ok: true, value };
        }
        if (operation === "serializationLoads") {
          const value = serializationLoads(String(args[0]));
          traceSagePack(args, value);
          return { ok: true, value };
        }
        if (operation === "serializationPack") {
          const value = serializationPack(args[0]);
          traceSagePack(args, value);
          return { ok: true, value };
        }
        if (operation === "serializationUnpack") {
          const source = args[0] === null || args[0] === undefined
            ? args[0]
            : Reflect.get(Object(args[0]), "_values") ?? args[0];
          const value = serializationUnpack(source);
          traceSagePack(args, value);
          return { ok: true, value };
        }
        return {
          ok: false,
          error: {
            code: "ENOSYS",
            message: `host operation ${operation} is unavailable in browser`,
          },
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "EINVAL",
            message: error?.message ?? String(error),
            stack: error?.stack,
          },
        };
      }
    },
  });
  installGlobal("require", runtimeRequire);
  installGlobal("__sagejs_runtime_require__", runtimeRequire);
  installGlobal("__sagejs_host__", serializationHost);
  const traceCapabilityApiCall = () => capabilityDispatchTrace.record(
    "specialist:capability-report-api",
    "shared-runtime-js",
  );
  const runtimeCapabilityApi = Object.freeze({
    ...capabilityApi,
    sagejs_capabilities(...args) {
      traceCapabilityApiCall();
      return capabilityApi.sagejs_capabilities(...args);
    },
    sagejsCapabilities(...args) {
      traceCapabilityApiCall();
      return capabilityApi.sagejsCapabilities(...args);
    },
    workflow(...args) {
      traceCapabilityApiCall();
      return capabilityApi.workflow(...args);
    },
  });
  installGlobal("__sagejs_capability_api__", runtimeCapabilityApi);
  if (wasmNativeResolver !== undefined) {
    installGlobal("__sagejs_wasm_native_resolver__", wasmNativeResolver);
  }
  installGlobal("__sagejs_output_write__", (text) => {
    outputHandler(String(text));
  });
  installGlobal("__sagejs_sage_mode__", true);
  try {
    globalEvaluate(initialization);
  } catch (error) {
    const match = String(error?.stack ?? "").match(/<anonymous>:(\d+):(\d+)/);
    if (match) {
      const line = Number(match[1]);
      const lines = initialization.split("\n");
      const start = Math.max(0, line - 3);
      const end = Math.min(lines.length, line + 2);
      const context = lines
        .slice(start, end)
        .map((source, index) => `${start + index + 1}: ${source}`)
        .join("\n");
      error.message = `${error.message}\nBrowser initialization context:\n${context}`;
    }
    abort(error);
  }
  const ellipticCurveParent = globalEvaluate(
    'typeof ρσ_baselib_facade === "undefined" || ρσ_baselib_facade === null ' +
      '? undefined : ' +
      'ρσ_baselib_facade["EllipticCurveParent"]',
  );
  if (typeof ellipticCurveParent === "function") {
    instrumentEllipticFallbackPrototype(
      ellipticCurveParent.prototype,
      capabilityDispatchTrace,
      flintBackend,
    );
  }
  globals.restore("__sagejs_sage_mode__");
  const builtinsNamespace = globalThis.ρσ_modules?.builtins;
  if (builtinsNamespace) {
    for (const name of ["compile", "eval", "exec"]) {
      if (globalThis[name] !== undefined) {
        builtinsNamespace[name] = globalThis[name];
      }
    }
  }
  const stdoutStream = Object.freeze({
    isTTY: false,
    write(value) {
      outputHandler(String(value));
      return true;
    },
  });
  const stderrStream = Object.freeze({
    isTTY: false,
    write(value) {
      errorHandler(String(value));
      return true;
    },
  });
  installGlobal("process", Object.freeze({
    argv: Object.freeze([]),
    cwd: () => "/",
    env: browserEnvironment.proxy,
    execPath: "",
    platform: "browser",
    versions: Object.freeze(Object.create(null)),
    stdin: stdoutStream,
    stdout: stdoutStream,
    stderr: stderrStream,
  }));
  let lazyModuleLoader;
  try {
    lazyModuleLoader = installLazyModuleLoader(lazyModuleBundle, {
      globalObject: globalThis,
      evaluate: globalEvaluate,
      install(name, value) {
        globals.set(name, value);
      },
    });
    globalEvaluate('var __name__ = "__repl__";');
  } catch (error) {
    abort(error);
  }

  async function evaluateNow(
    source,
    {
      filename = "<browser>",
      onOutput = (text) => console.log(text),
      onError = onOutput,
    } = {},
  ) {
    const compiled = await language.request("compile", {
      source,
      filename,
    });
    if (
      compiled === null ||
      typeof compiled !== "object" ||
      typeof compiled.javascript !== "string" ||
      !Array.isArray(compiled.dynamicImports) ||
      compiled.dynamicImports.some((name) => typeof name !== "string")
    ) {
      throw new TypeError("browser compiler returned an invalid program");
    }
    const previousOutputHandler = outputHandler;
    const previousErrorHandler = errorHandler;
    const saveRequests = [];
    outputHandler = onOutput;
    errorHandler = onError;
    capabilityDispatchTrace.clear();
    globalThis.__sagejs_graphics_save_hook__ = (
      graphic,
      filename,
      options,
    ) => {
      saveRequests.push({
        display: richDisplay(graphic),
        filename: String(filename),
        options: { ...(options ?? {}) },
      });
      return graphic;
    };
    try {
      for (const name of compiled.dynamicImports) lazyModuleLoader(name);
      const value = globalEvaluate(compiled.javascript);
      return {
        value,
        repr: value === undefined || value === null
          ? ""
          : globalThis.ρσ_repr(value),
        display: value === undefined || value === null
          ? undefined
          : richDisplay(value),
        saveRequests,
        instrumentation: capabilityTraceInstrumentation(capabilityDispatchTrace),
      };
    } finally {
      outputHandler = previousOutputHandler;
      errorHandler = previousErrorHandler;
      delete globalThis.__sagejs_graphics_save_hook__;
    }
  }

  let evaluationTail = Promise.resolve();
  function evaluate(source, options) {
    const result = evaluationTail.then(() => evaluateNow(source, options));
    evaluationTail = result.catch(() => {});
    return result;
  }

  function terminate() {
    language.terminate();
    globals.restoreAll();
  }

  return Object.freeze({ evaluate, terminate });
}
