const pythonKeywords = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await",
  "break", "class", "continue", "def", "del", "elif", "else", "except",
  "finally", "for", "from", "global", "if", "import", "in", "is",
  "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try",
  "while", "with", "yield",
]);

export function canSeedDynamicName(name) {
  return (
    /^[_\p{ID_Start}][\p{ID_Continue}]*$/u.test(name) &&
    !pythonKeywords.has(name) &&
    name !== "__name__" &&
    name !== "__file__"
  );
}

export function createBrowserCompiler(compilerSource, standardLibrary) {
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
    if (files.has(filename)) return files.get(filename);
    throw new Error(`browser compiler file not found: ${filename}`);
  };
  const sha1sum = (source) => {
    const signature = signatures.get(source);
    if (signature) return signature;
    throw new Error("browser compiler cannot hash an unknown source");
  };
  const loadCompiler = new Function(
    "exports",
    "console",
    "readfile",
    "writefile",
    "sha1sum",
    "require",
    "__sagejs_runtime_require__",
    compilerSource,
  );
  loadCompiler(
    compiler,
    console,
    readfile,
    unavailable("compiler file writes"),
    sha1sum,
    unavailable("compiler module loading"),
    unavailable("compiler runtime module loading"),
  );
  return compiler;
}

function dynamicSource(source, mode) {
  if (mode === "eval") {
    return `__sagejs_eval_result__ = (\n${source}\n)\n`;
  }
  return source.endsWith("\n") ? source : `${source}\n`;
}

function dynamicDirectory(filename) {
  if (!filename || filename.startsWith("<")) return "__stdlib__";
  const normalized = filename.replaceAll("\\", "/");
  const separator = normalized.lastIndexOf("/");
  return separator < 0 ? "." : normalized.slice(0, separator) || "/";
}

function dynamicSyntaxError(error) {
  const result = new SyntaxError(
    error instanceof Error ? error.message : String(error),
  );
  const constructorName = error?.constructor?.name ?? "";
  if (
    constructorName === "IndentationError" ||
    result.message.includes("Inconsistent indentation") ||
    result.message.includes("Unexpected indent")
  ) {
    result.sagejsErrorName = "IndentationError";
  }
  return result;
}

/**
 * Create the synchronous half of Python's compile/eval/exec contract.
 *
 * The authoritative frontend and ASTs remain owned by this object. Callers
 * pass only the execution namespace's names and undefined-name shape; runtime
 * values never cross into the compiler realm.
 */
export function createBrowserDynamicCompiler(compiler, frontend) {
  let nextProgramId = 0;
  const programs = new Map();

  function compile(source, filename, mode) {
    if (typeof source !== "string" || typeof filename !== "string") {
      throw new TypeError("dynamic source and filename must be strings");
    }
    if (!new Set(["exec", "eval", "single"]).has(mode)) {
      throw new TypeError(
        `unsupported dynamic compilation mode ${JSON.stringify(mode)}`,
      );
    }
    const id = ++nextProgramId;
    const moduleId = `__dynamic_browser_${id}__`;
    let ast;
    try {
      ast = frontend.parse(dynamicSource(source, mode), {
        filename,
        module_id: moduleId,
        basedir: dynamicDirectory(filename),
        libdir: "__stdlib__",
        import_dirs: ["__stdlib__"],
        precompiled_module_cache_dir: "__module_cache__",
        exact_integer_literals: true,
        strict_python_scopes: true,
        scoped_flags: {
          dict_literals: true,
          overload_getitem: true,
          bound_methods: true,
          sequential_definitions: true,
        },
      });
    } catch (error) {
      throw dynamicSyntaxError(error);
    }
    programs.set(id, { ast, moduleId, outputs: new Map() });
    return Object.freeze({ id, moduleId, mode });
  }

  function run(handle, names, undefinedNames) {
    if (
      handle === null ||
      typeof handle !== "object" ||
      !Number.isSafeInteger(handle.id) ||
      !Array.isArray(names) ||
      !Array.isArray(undefinedNames) ||
      names.some(
        (name) => typeof name !== "string" || !canSeedDynamicName(name),
      ) ||
      undefinedNames.some((name) => !names.includes(name))
    ) {
      throw new TypeError("invalid browser dynamic-code request");
    }
    const program = programs.get(handle.id);
    if (!program || program.moduleId !== handle.moduleId) {
      throw new TypeError("unknown browser dynamic-code program");
    }
    const sortedNames = [...new Set(names)].sort();
    const sortedUndefinedNames = [...new Set(undefinedNames)].sort();
    const signature = JSON.stringify([sortedNames, sortedUndefinedNames]);
    const cached = program.outputs.get(signature);
    if (cached !== undefined) {
      return { javascript: cached, moduleId: program.moduleId };
    }

    const originalAnnotatedLocals = program.ast.annotated_locals;
    try {
      program.ast.annotated_locals = [...(originalAnnotatedLocals ?? [])];
      for (const name of sortedUndefinedNames) {
        if (!program.ast.annotated_locals.includes(name)) {
          program.ast.annotated_locals.push(name);
        }
      }
      const output = new compiler.OutputStream({
        omit_baselib: true,
        private_scope: false,
        write_name: true,
        beautify: true,
        exact_integers: true,
        python_tuples: true,
        python_truthiness: true,
        python_attributes: true,
        pool_numeric_literals: true,
        numeric_literal_pool_prefix: `${program.moduleId}_`,
      });
      program.ast.print(output);
      const prelude = sortedNames.map((name) =>
        `var ${output.make_name(name)} = ` +
        `__sagejs_input_namespace__[${JSON.stringify(name)}];`
      ).join("\n");
      const javascript = prelude ? `${prelude}\n${output.get()}` : output.get();
      program.outputs.set(signature, javascript);
      return { javascript, moduleId: program.moduleId };
    } catch (error) {
      throw dynamicSyntaxError(error);
    } finally {
      program.ast.annotated_locals = originalAnnotatedLocals;
    }
  }

  function close() {
    programs.clear();
    frontend.close?.();
  }

  return Object.freeze({ close, compile, run });
}

function rotateRight(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

/** Synchronous SHA-256 for the tiny dynamic-source/cache identity boundary. */
function sha256(value) {
  const source = new TextEncoder().encode(value);
  const bitLength = source.byteLength * 8;
  const paddedLength = Math.ceil((source.byteLength + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(source);
  bytes[source.byteLength] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 2 ** 32));
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < bytes.byteLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15];
      const right = words[index - 2];
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    for (const [index, value] of [a, b, c, d, e, f, g, h].entries()) {
      hash[index] = (hash[index] + value) >>> 0;
    }
  }
  return [...hash].map((word) => word.toString(16).padStart(8, "0")).join("");
}

export function createPrecompiledDynamicCompiler(bundle) {
  if (
    bundle === null ||
    typeof bundle !== "object" ||
    bundle.schema !== "sagejs.browser-dynamic-programs/v1" ||
    !Array.isArray(bundle.programs)
  ) {
    throw new TypeError("invalid authenticated dynamic-program bundle");
  }
  const programsBySource = new Map();
  const programsByIdentity = new Map();
  for (const program of bundle.programs) {
    if (
      program === null ||
      typeof program !== "object" ||
      !/^[a-f0-9]{64}$/.test(program.identity) ||
      !/^[a-f0-9]{64}$/.test(program.sourceHash) ||
      typeof program.filename !== "string" ||
      !["exec", "eval", "single"].includes(program.mode) ||
      program.outputs === null ||
      typeof program.outputs !== "object"
    ) {
      throw new TypeError("invalid authenticated dynamic-program record");
    }
    const key = JSON.stringify([
      program.sourceHash,
      program.filename,
      program.mode,
    ]);
    if (programsBySource.has(key) || programsByIdentity.has(program.identity)) {
      throw new TypeError("duplicate authenticated dynamic-program record");
    }
    programsBySource.set(key, program);
    programsByIdentity.set(program.identity, program);
  }

  function compile(source, filename, mode) {
    const key = JSON.stringify([sha256(source), filename, mode]);
    const program = programsBySource.get(key);
    if (!program) {
      throw new Error(
        "this dynamic program is not in the authenticated portable cache; " +
        "unrestricted compile/eval/exec requires a cross-origin-isolated host",
      );
    }
    return Object.freeze({
      identity: program.identity,
      moduleId: `__dynamic_${program.identity.slice(0, 24)}__`,
      mode,
    });
  }

  function run(handle, names, undefinedNames) {
    const program = programsByIdentity.get(handle?.identity);
    if (!program || handle.moduleId !== `__dynamic_${program.identity.slice(0, 24)}__`) {
      throw new TypeError("unknown authenticated dynamic program");
    }
    const signature = sha256(JSON.stringify([
      [...new Set(names)].sort(),
      [...new Set(undefinedNames)].sort(),
    ]));
    const javascript = program.outputs[signature];
    if (typeof javascript !== "string") {
      throw new Error(
        "this dynamic namespace shape is not in the authenticated portable cache; " +
        "unrestricted compile/eval/exec requires a cross-origin-isolated host",
      );
    }
    return { javascript, moduleId: handle.moduleId };
  }

  return Object.freeze({ compile, run });
}
