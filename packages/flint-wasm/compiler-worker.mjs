import {
  createBrowserCompiler,
  createBrowserDynamicCompiler,
} from "./dynamic-compiler.mjs";

function outputJavaScript(
  compiler,
  ast,
  baselib,
  includeBaselib,
  language = "sage",
) {
  const output = new compiler.OutputStream({
    omit_baselib: !includeBaselib,
    write_name: false,
    private_scope: false,
    beautify: true,
    keep_docstrings: true,
    exact_integers: true,
    rational_division: language === "sage",
    python_tuples: true,
    python_truthiness: true,
    python_attributes: true,
    baselib_plain: includeBaselib ? baselib : undefined,
  });
  ast.print(output);
  return output.get();
}

function serializeError(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    sagejsErrorName: error?.sagejsErrorName,
  };
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`could not fetch ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`could not fetch ${url}: HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

let compiler;
let sageFrontend;
let pythonFrontend;
let dynamicCompiler;
let baselib;
let toplevel;
let foreignFrontendUrl;
let treeSitterRuntimeUrl;
let foreignGrammarUrls;
let foreignFrontendModulePromise;
const configuredForeignGrammars = new Set();
const foreignFrontends = new Map();
const configuredOptimizationLevel = new URL(
  typeof self.location?.href === "string" ? self.location.href : import.meta.url,
).searchParams.get("sagejsOptimizationLevel") ?? undefined;
if (
  configuredOptimizationLevel !== undefined &&
  !["O0", "O1", "O2", "O3", "Os"].includes(configuredOptimizationLevel)
) {
  throw new TypeError("invalid Sage.js compiler-worker optimization level");
}

function compileWithFrontend(source, filename, frontend, language) {
  const classes = toplevel?.classes;
  const scopedFlags = toplevel?.scoped_flags ?? {
    dict_literals: true,
    overload_getitem: true,
    bound_methods: true,
    sequential_definitions: true,
  };
  toplevel = frontend.parse(source, {
    filename,
    basedir: "__stdlib__",
    libdir: "__stdlib__",
    import_dirs: ["__stdlib__"],
    precompiled_module_cache_dir: "__module_cache__",
    classes,
    scoped_flags: scopedFlags,
    jsage: language === "sage",
    exact_integer_literals: true,
    strict_python_scopes: true,
    optimization_level: configuredOptimizationLevel,
  });
  const javascript = outputJavaScript(
    compiler,
    toplevel,
    baselib,
    false,
    language,
  );

  if (classes) {
    const exported = new Set(toplevel.exports);
    for (const name of Object.getOwnPropertyNames(classes)) {
      if (!exported.has(name) && !toplevel.classes[name]) {
        toplevel.classes[name] = classes[name];
      }
    }
  }
  const imports = Object.values(toplevel.imports ?? {});
  const moduleImports = [...new Set(
    imports
      .map((module) => module?.module_id)
      .filter((moduleId) => typeof moduleId === "string"),
  )].sort();
  const dynamicImports = imports
    .filter((module) => module?.dynamic === true)
    .map((module) => module.module_id);
  return { javascript, dynamicImports, moduleImports };
}

async function foreignModule() {
  if (!foreignFrontendUrl) {
    throw new Error("Sage.js browser foreign frontends are not configured");
  }
  foreignFrontendModulePromise ??= import(foreignFrontendUrl);
  return foreignFrontendModulePromise;
}

async function configureForeignGrammar(language, module) {
  if (configuredForeignGrammars.has(language)) return;
  const grammarUrl = foreignGrammarUrls?.[language];
  if (typeof grammarUrl !== "string") {
    throw new Error(`Sage.js browser grammar ${language} is not configured`);
  }
  const [treeSitterRuntime, grammar] = await Promise.all([
    fetchBytes(treeSitterRuntimeUrl),
    fetchBytes(grammarUrl),
  ]);
  module.configureBrowserForeignResources({
    treeSitterRuntime,
    grammar,
    grammarFilename: `tree-sitter-${language}.wasm`,
  });
  configuredForeignGrammars.add(language);
}

async function compile(source, filename) {
  if (!/^[\t ]*%%[A-Za-z]/.test(source)) {
    return compileWithFrontend(source, filename, sageFrontend, "sage");
  }
  const module = await foreignModule();
  const cell = module.prepareSubmittedPolyglotCell(
    module.parsePolyglotCell(source),
  );
  if (cell.language === "sage") {
    return compileWithFrontend(cell.source, filename, sageFrontend, "sage");
  }
  if (cell.language === "python") {
    return compileWithFrontend(cell.source, filename, pythonFrontend, "python");
  }
  await configureForeignGrammar(cell.language, module);
  let frontend = foreignFrontends.get(cell.language);
  if (!frontend) {
    frontend = await module.createForeignFrontend(cell.language);
    foreignFrontends.set(cell.language, frontend);
  }
  const lowering = frontend.lower(cell.source, {
    filename,
    captureResult: true,
  });
  return compileWithFrontend(lowering.source, filename, sageFrontend, "sage");
}

function sendResponse(data, response) {
  if (data.sync === undefined) {
    self.postMessage({ id: data.id, ...response });
    return;
  }
  const state = new Int32Array(data.sync.state);
  const destination = new Uint8Array(data.sync.response);
  let encoded = new TextEncoder().encode(JSON.stringify(response));
  if (encoded.byteLength > destination.byteLength) {
    encoded = new TextEncoder().encode(JSON.stringify({
      ok: false,
      error: serializeError(new RangeError(
        `browser compiler response exceeds ${destination.byteLength} bytes`,
      )),
    }));
  }
  destination.set(encoded);
  Atomics.store(state, 1, encoded.byteLength);
  Atomics.store(state, 0, 1);
  Atomics.notify(state, 0);
}

self.onmessage = async ({ data }) => {
  try {
    let result;
    if (data.type === "initialize") {
      compiler = undefined;
      sageFrontend = undefined;
      pythonFrontend = undefined;
      dynamicCompiler = undefined;
      baselib = undefined;
      toplevel = undefined;
      foreignFrontendModulePromise = undefined;
      configuredForeignGrammars.clear();
      foreignFrontends.clear();
      foreignFrontendUrl = data.foreignFrontend;
      treeSitterRuntimeUrl = data.treeSitterRuntime;
      foreignGrammarUrls = data.foreignGrammars;
      const [
        compilerSource,
        baselibSource,
        standardLibrary,
        compilerFrontend,
        treeSitterRuntime,
        pythonGrammar,
        sageGrammar,
      ] = await Promise.all([
        fetchText(data.compiler),
        fetchText(data.baselib),
        fetchText(data.standardLibrary).then((source) => JSON.parse(source)),
        import(data.compilerFrontend),
        fetchBytes(data.treeSitterRuntime),
        fetchBytes(data.pythonGrammar),
        fetchBytes(data.sageGrammar),
      ]);
      const nextCompiler = createBrowserCompiler(
        compilerSource,
        standardLibrary,
      );
      compilerFrontend.configureBrowserCompilerResources({
        treeSitterRuntime,
        pythonGrammar,
        sageGrammar,
        standardLibrary,
      });
      const nextFrontend = await compilerFrontend.createPythonCompilerFrontend(
        nextCompiler,
        "sage",
      );
      const nextDynamicFrontend =
        await compilerFrontend.createPythonCompilerFrontend(
          nextCompiler,
          "python",
        );
      const initializationSource = (standardLibrary.preload ?? [])
        .map((name) => `import ${name}`)
        .join("\n");
      const initialization = nextFrontend.parse(initializationSource, {
        filename: "<browser-init>",
        basedir: "__stdlib__",
        libdir: "__stdlib__",
        import_dirs: ["__stdlib__"],
        precompiled_module_cache_dir: "__module_cache__",
      });
      const bootstrap = outputJavaScript(
        nextCompiler,
        initialization,
        baselibSource,
        true,
      );
      // The baselib bootstrap deliberately publishes Sage's public names on
      // the worker global.  Keep the generated strict directive out of the
      // directive prologue for this one initialization program; ordinary
      // compiled user programs below remain strict.
      result = `void 0;\n${bootstrap}`;
      compiler = nextCompiler;
      baselib = baselibSource;
      sageFrontend = nextFrontend;
      pythonFrontend = nextDynamicFrontend;
      dynamicCompiler = createBrowserDynamicCompiler(
        nextCompiler,
        nextDynamicFrontend,
      );
    } else if (data.type === "compile") {
      if (!compiler) {
        throw new Error("Sage.js browser compiler is not initialized");
      }
      result = await compile(data.source, data.filename);
    } else if (data.type === "compileDynamic") {
      if (!dynamicCompiler) {
        throw new Error("Sage.js browser compiler is not initialized");
      }
      result = dynamicCompiler.compile(data.source, data.filename, data.mode);
    } else if (data.type === "runDynamic") {
      if (!dynamicCompiler) {
        throw new Error("Sage.js browser compiler is not initialized");
      }
      result = dynamicCompiler.run(
        data.handle,
        data.names,
        data.undefinedNames,
      );
    } else {
      throw new Error(`unknown compiler request ${JSON.stringify(data.type)}`);
    }
    sendResponse(data, { ok: true, result });
  } catch (error) {
    if (data.type === "initialize") {
      compiler = undefined;
      sageFrontend = undefined;
      pythonFrontend = undefined;
      dynamicCompiler = undefined;
      baselib = undefined;
      toplevel = undefined;
    }
    sendResponse(data, {
      ok: false,
      error: serializeError(error),
    });
  }
};
