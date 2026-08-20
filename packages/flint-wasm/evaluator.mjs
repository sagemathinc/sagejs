import { instantiateFlintFactor } from "./index.mjs";
import { instantiateM4ri } from "./m4ri.mjs";
import { createWasiHost } from "./dist/wasi-runtime.mjs";
import { instantiateWasmKernelPacks } from "./dist/wasm-pack-loader.mjs";
import {
  dumps as serializationDumps,
  loads as serializationLoads,
  pack as serializationPack,
  unpack as serializationUnpack,
} from "./dist/serialization.mjs";
import { createSagejsCapabilityAPI } from "./dist/wasm-capability-api.mjs";

function deserializeError(serialized) {
  const error = new Error(serialized.message);
  error.name = serialized.name;
  if (serialized.stack) {
    error.stack = serialized.stack;
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

class CompilerWorker {
  constructor(url) {
    this.worker = new Worker(url, { type: "module" });
    this.nextId = 0;
    this.pending = new Map();
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

  terminate() {
    this.worker.terminate();
  }
}

/**
 * Create a persistent Sage.js evaluator in the current isolated worker.
 *
 * A nested worker hosts the self-compiled language compiler. This mirrors the
 * separate VM realm used by the Node REPL and prevents the compiler's Python
 * compatibility runtime from colliding with the evaluated program's runtime.
 */
export async function instantiateSageEvaluator({
  compiler,
  baselib,
  standardLibrary,
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
}) {
  const language = new CompilerWorker(compilerWorker);
  let initializationResult;
  let flintBackend;
  let m4riBackend;
  let symbolicBackendModule;
  let wasmNativeResolver;
  let capabilityApi;
  let capabilityReportResponse;
  try {
    [
      initializationResult,
      flintBackend,
      m4riBackend,
      symbolicBackendModule,
      capabilityReportResponse,
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
      instantiateFlintFactor(flint, { algebraicSource: algebraic }),
      instantiateM4ri(m4ri),
      import(String(symbolic)),
      fetch(String(capabilityReport)),
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
    }
  } catch (error) {
    language.terminate();
    throw error;
  }
  if (
    initializationResult === null ||
    typeof initializationResult !== "object" ||
    typeof initializationResult.javascript !== "string" ||
    initializationResult.lazyModules === null ||
    typeof initializationResult.lazyModules !== "object"
  ) {
    language.terminate();
    throw new TypeError("browser compiler returned an invalid initialization bundle");
  }
  const initialization = initializationResult.javascript;
  const lazyModules = initializationResult.lazyModules;
  const globalEvaluate = globalThis.eval;
  let outputHandler = (text) => console.log(text);

  const runtimeRequire = (name) => {
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
  const browserEnvironment = new Map();
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
          return { ok: true, value: [...browserEnvironment.entries()] };
        }
        if (operation === "setEnv") {
          browserEnvironment.set(String(args[0]), String(args[1]));
          return { ok: true, value: null };
        }
        if (operation === "deleteEnv") {
          browserEnvironment.delete(String(args[0]));
          return { ok: true, value: null };
        }
        if (operation === "getcwd" || operation === "realpath") {
          return { ok: true, value: operation === "getcwd" ? "/" : String(args[0]) };
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
          return { ok: true, value: serializationDumps(args[0]) };
        }
        if (operation === "serializationLoads") {
          return { ok: true, value: serializationLoads(String(args[0])) };
        }
        if (operation === "serializationPack") {
          return { ok: true, value: serializationPack(args[0]) };
        }
        if (operation === "serializationUnpack") {
          const source = args[0] === null || args[0] === undefined
            ? args[0]
            : Reflect.get(Object(args[0]), "_values") ?? args[0];
          return { ok: true, value: serializationUnpack(source) };
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
  globalThis.require = runtimeRequire;
  globalThis.__sagejs_runtime_require__ = runtimeRequire;
  globalThis.__sagejs_host__ = serializationHost;
  globalThis.__sagejs_capability_api__ = capabilityApi;
  if (wasmNativeResolver !== undefined) {
    globalThis.__sagejs_wasm_native_resolver__ = wasmNativeResolver;
  }
  globalThis.__sagejs_output_write__ = (text) => {
    outputHandler(String(text));
  };
  globalThis.__sagejs_sage_mode__ = true;
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
    throw error;
  }
  delete globalThis.__sagejs_sage_mode__;
  const builtinsNamespace = globalThis.ρσ_modules?.builtins;
  if (builtinsNamespace) {
    for (const name of ["compile", "eval", "exec"]) {
      if (globalThis[name] !== undefined) {
        builtinsNamespace[name] = globalThis[name];
      }
    }
  }
  const browserStream = Object.freeze({
    isTTY: false,
    write(value) {
      outputHandler(String(value));
      return true;
    },
  });
  globalThis.process = Object.freeze({
    argv: Object.freeze([]),
    cwd: () => "/",
    env: Object.freeze(Object.create(null)),
    execPath: "",
    platform: "browser",
    versions: Object.freeze(Object.create(null)),
    stdin: browserStream,
    stdout: browserStream,
    stderr: browserStream,
  });
  const lazyModuleName = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
  const precompiledFilenameMarker = "__sagejs_precompiled_module_filename__";
  const loadingLazyModules = new Set();
  globalThis.__sagejs_load_module__ = function loadBrowserModule(name) {
    if (typeof name !== "string" || !lazyModuleName.test(name)) {
      throw new TypeError(`invalid lazy module name ${JSON.stringify(name)}`);
    }
    const registry = globalThis.ρσ_modules;
    if (registry && Object.prototype.hasOwnProperty.call(registry, name)) {
      return registry[name];
    }
    const record = lazyModules[name];
    if (
      record === null ||
      typeof record !== "object" ||
      record.module !== name ||
      typeof record.javascriptTemplate !== "string" ||
      !record.javascriptTemplate.includes(JSON.stringify(precompiledFilenameMarker))
    ) {
      const ImportErrorClass = globalThis.ImportError;
      const message = `No module named '${name}'`;
      if (typeof ImportErrorClass === "function") {
        throw new ImportErrorClass(message);
      }
      throw Object.assign(new Error(message), { name: "ImportError" });
    }
    const separator = name.lastIndexOf(".");
    const parentName = separator < 0 ? "" : name.slice(0, separator);
    const childName = separator < 0 ? "" : name.slice(separator + 1);
    const parent = parentName ? loadBrowserModule(parentName) : undefined;
    if (Object.prototype.hasOwnProperty.call(registry, name)) {
      return registry[name];
    }
    const namespace = Object.create(null);
    registry[name] = namespace;
    if (parent !== undefined && childName) parent[childName] = namespace;
    loadingLazyModules.add(name);
    const previous = globalThis.__sagejs_current_module_namespace__;
    globalThis.__sagejs_current_module_namespace__ = namespace;
    const filename = `/__sagejs_browser_modules__/${name.replaceAll(".", "/")}.py`;
    try {
      const javascript = record.javascriptTemplate.replaceAll(
        JSON.stringify(precompiledFilenameMarker),
        JSON.stringify(filename),
      );
      globalEvaluate(`(function(){\n${javascript}\n}).call(globalThis);`);
    } catch (error) {
      delete registry[name];
      if (parent !== undefined && childName) delete parent[childName];
      throw error;
    } finally {
      loadingLazyModules.delete(name);
      if (previous === undefined) {
        delete globalThis.__sagejs_current_module_namespace__;
      } else {
        globalThis.__sagejs_current_module_namespace__ = previous;
      }
    }
    if (!Object.prototype.hasOwnProperty.call(registry, name)) {
      throw new Error(`lazy module ${name} did not register itself`);
    }
    return registry[name];
  };
  globalEvaluate('var __name__ = "__repl__";');

  async function evaluateNow(
    source,
    {
      filename = "<browser>",
      onOutput = (text) => console.log(text),
    } = {},
  ) {
    const javascript = await language.request("compile", {
      source,
      filename,
    });
    const previousOutputHandler = outputHandler;
    const saveRequests = [];
    outputHandler = onOutput;
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
      const value = globalEvaluate(javascript);
      return {
        value,
        repr: value === undefined || value === null
          ? ""
          : globalThis.ρσ_repr(value),
        display: value === undefined || value === null
          ? undefined
          : richDisplay(value),
        saveRequests,
      };
    } finally {
      outputHandler = previousOutputHandler;
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
  }

  return Object.freeze({ evaluate, terminate });
}
