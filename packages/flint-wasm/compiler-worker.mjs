function createCompiler(compilerSource, standardLibrary) {
  const compiler = {};
  const unavailable = (operation) => () => {
    throw new Error(`${operation} is unavailable in the browser compiler`);
  };
  const files = new Map();
  const signatures = new Map();
  for (const [name, module] of Object.entries(standardLibrary.modules)) {
    const modulePath = name.replaceAll(".", "/");
    files.set(
      module.package
        ? `__stdlib__/${modulePath}/__init__.py`
        : `__stdlib__/${modulePath}.py`,
      module.source,
    );
    files.set(
      `__module_cache__/${name.replaceAll(".", "-")}.json`,
      JSON.stringify(module.cache),
    );
    signatures.set(module.source, module.cache.signature);
  }
  const readfile = (filename) => {
    if (files.has(filename)) {
      return files.get(filename);
    }
    throw new Error(`browser compiler file not found: ${filename}`);
  };
  const sha1sum = (source) => {
    const signature = signatures.get(source);
    if (signature) {
      return signature;
    }
    throw new Error("browser compiler cannot hash an unknown source");
  };
  const loadCompiler = new Function(
    "exports",
    "console",
    "readfile",
    "writefile",
    "sha1sum",
    "require",
    compilerSource,
  );
  loadCompiler(
    compiler,
    console,
    readfile,
    unavailable("compiler file writes"),
    sha1sum,
    unavailable("compiler module loading"),
  );
  return compiler;
}

function outputJavaScript(compiler, ast, baselib, includeBaselib) {
  const output = new compiler.OutputStream({
    omit_baselib: !includeBaselib,
    write_name: false,
    private_scope: false,
    beautify: true,
    keep_docstrings: true,
    exact_integers: true,
    rational_division: true,
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
let frontend;
let baselib;
let toplevel;

function compile(source, filename) {
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
    jsage: true,
    exact_integer_literals: true,
    strict_python_scopes: true,
  });
  const javascript = outputJavaScript(compiler, toplevel, baselib, false);

  if (classes) {
    const exported = new Set(toplevel.exports);
    for (const name of Object.getOwnPropertyNames(classes)) {
      if (!exported.has(name) && !toplevel.classes[name]) {
        toplevel.classes[name] = classes[name];
      }
    }
  }
  return javascript;
}

self.onmessage = async ({ data }) => {
  try {
    let result;
    if (data.type === "initialize") {
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
      compiler = createCompiler(compilerSource, standardLibrary);
      baselib = baselibSource;
      compilerFrontend.configureBrowserCompilerResources({
        treeSitterRuntime,
        pythonGrammar,
        sageGrammar,
        standardLibrary,
      });
      frontend = await compilerFrontend.createPythonCompilerFrontend(
        compiler,
        "sage",
      );
      const initialization = frontend.parse("", {
        filename: "<browser-init>",
        basedir: "__stdlib__",
        libdir: "__stdlib__",
        import_dirs: ["__stdlib__"],
        precompiled_module_cache_dir: "__module_cache__",
      });
      result = outputJavaScript(compiler, initialization, baselib, true);
    } else if (data.type === "compile") {
      if (!compiler) {
        throw new Error("Sage.js browser compiler is not initialized");
      }
      result = compile(data.source, data.filename);
    } else {
      throw new Error(`unknown compiler request ${JSON.stringify(data.type)}`);
    }
    self.postMessage({ id: data.id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id: data.id,
      ok: false,
      error: serializeError(error),
    });
  }
};
