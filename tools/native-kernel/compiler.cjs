"use strict";

const { createHash } = require("node:crypto");
const {
  closeSync,
  existsSync,
  openSync,
  mkdirSync,
  readSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { homedir } = require("node:os");
const { dirname, join, relative, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { lowerSource } = require("./ir.cjs");
const {
  NATIVE_ABI_VERSION,
  generateArtifacts,
} = require("./c-backend.cjs");
const { generateJavaScript } = require("./js-backend.cjs");
const { generateExceptionShims } = require("./ffi-codegen.cjs");
const { declarationFiles } = require("../ffi/declarations.cjs");
const { macosDeploymentTarget } = require("../../scripts/darwin-native.cjs");

const root = resolve(__dirname, "..", "..");
const windowsTriplet = "x64-windows-static-md-release";
const nativePrefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    (process.platform === "win32"
      ? join(
          root,
          "packages",
          "flint",
          ".native",
          "vcpkg-installed",
          windowsTriplet,
        )
      : join(root, "packages", "flint", ".native", "prefix")),
);
const nativeInclude = join(root, "packages", "flint", "include");
const header = join(nativeInclude, "sagejs", "native.h");
const mpcVersion = process.platform === "win32" ? "1.3.1" : "1.4.1";
const nativeMpcLibrary = join(
  nativePrefix,
  "lib",
  process.platform === "win32" ? "mpc.lib" : "libmpc.a",
);
const nativeFlintLibrary = join(
  nativePrefix,
  "lib",
  process.platform === "win32" ? "flint.lib" : "libflint.a",
);

const GENERATED_CXX_LANGUAGE_STANDARD = Object.freeze({
  compilerFlag: "-std=c++17",
  msvc: "stdcpp17",
  xcode: "c++17",
});

const NATIVE_PATH_POLICY = Object.freeze({
  schema: "sagejs.native-path-policy/v1",
  sourceRoot: "sagejs-source",
  buildRoot: "sagejs-native-build",
  nativeSupportRoot: "sagejs-native-support",
  foreignRoot: "sagejs-foreign",
  sourceDateEpoch: "0",
});

let nativeBuildAliasSerial = 0;

function nativeBuildWorkspace(outputPath, options = {}) {
  const platform = options.platform || process.platform;
  if (platform !== "win32") {
    return Object.freeze({
      directory: outputPath,
      close() {},
    });
  }

  // MSBuild still has path-length limits in code paths used by node-gyp, even
  // when Windows long-path support is enabled.  A source-local cache under
  // %TEMP% can therefore fail only because its content-addressed directory is
  // long.  Build through a short, disposable junction while keeping the real
  // artifact and discovery index in the caller-selected cache.
  const environment = options.environment || process.env;
  const homeDirectory = options.homeDirectory || homedir();
  const aliasRoot = resolve(
    environment.SAGEJS_NATIVE_WINDOWS_BUILD_ROOT ||
      join(homeDirectory, ".sagejs-native-build"),
  );
  mkdirSync(aliasRoot, { recursive: true });
  const targetIdentity = sha256(portablePath(outputPath)).slice(0, 12);
  let aliasPath;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    nativeBuildAliasSerial += 1;
    const name = [
      targetIdentity,
      process.pid.toString(36),
      nativeBuildAliasSerial.toString(36),
    ].join("-");
    const candidate = join(aliasRoot, name);
    try {
      symlinkSync(outputPath, candidate, "junction");
      aliasPath = candidate;
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  if (aliasPath === undefined) {
    throw new Error(
      `unable to allocate a short Windows native-build path in ${aliasRoot}`,
    );
  }
  let closed = false;
  return Object.freeze({
    directory: aliasPath,
    close() {
      if (closed) return;
      closed = true;
      rmSync(aliasPath, { recursive: true, force: true });
    },
  });
}

function generatedCxxLanguageSettings(platform) {
  return Object.freeze({
    compilerFlag:
      platform === "win32"
        ? null
        : GENERATED_CXX_LANGUAGE_STANDARD.compilerFlag,
    msvc:
      platform === "win32" ? GENERATED_CXX_LANGUAGE_STANDARD.msvc : null,
    xcode:
      platform === "darwin" ? GENERATED_CXX_LANGUAGE_STANDARD.xcode : null,
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(filename) {
  const digest = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const descriptor = openSync(filename, "r");
  try {
    for (;;) {
      const length = readSync(descriptor, buffer, 0, buffer.length, null);
      if (length === 0) break;
      digest.update(buffer.subarray(0, length));
    }
  } finally {
    closeSync(descriptor);
  }
  return digest.digest("hex");
}

const foreignInputDigestCache = new Map();
const foreignInputDigestStores = new Map();

function portablePath(filename) {
  return resolve(filename).replaceAll("\\", "/");
}

function validatedSourceKey(sourceKey) {
  if (sourceKey === undefined) return undefined;
  const components = typeof sourceKey === "string"
    ? sourceKey.split("/")
    : [];
  const windowsReserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
  if (
    typeof sourceKey !== "string" ||
    !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(sourceKey) ||
    /^[A-Za-z]:/.test(sourceKey) ||
    components.some((component) =>
      component === "." ||
      component === ".." ||
      component.endsWith(".") ||
      component.endsWith(" ") ||
      windowsReserved.test(component)
    )
  ) {
    throw new TypeError(`invalid native kernel source key ${sourceKey}`);
  }
  return sourceKey;
}

function sourceIdentity(sourcePath, sourceKey) {
  const key = validatedSourceKey(sourceKey);
  return key === undefined ? portablePath(sourcePath) : `src/lib/${key}`;
}

function statIdentity(stat) {
  return [
    stat.dev,
    stat.ino,
    stat.size,
    stat.mtimeNs,
    stat.ctimeNs,
  ].map((value) => String(value)).join(":");
}

function foreignInputDigestStore(cacheRoot) {
  const filename = join(cacheRoot, "foreign-input-digests.json");
  const cached = foreignInputDigestStores.get(filename);
  if (cached !== undefined) return cached;
  let files = {};
  try {
    const current = JSON.parse(readFileSync(filename, "utf8"));
    if (current?.schema === "sagejs.foreign-input-digests/v1" &&
        current.files !== null && typeof current.files === "object") {
      files = current.files;
    }
  } catch (_error) {}
  const store = {
    filename,
    files,
    dirty: false,
    save() {
      if (!this.dirty) return;
      mkdirSync(dirname(this.filename), { recursive: true });
      writeFileSync(this.filename, `${JSON.stringify({
        schema: "sagejs.foreign-input-digests/v1",
        files: this.files,
      }, null, 2)}\n`);
      this.dirty = false;
    },
  };
  foreignInputDigestStores.set(filename, store);
  return store;
}

function contentAddressedFile(
  filename,
  description,
  digestStore,
  logicalPath = portablePath(filename),
) {
  const absolute = resolve(filename);
  let before;
  try {
    before = statSync(absolute, { bigint: true });
  } catch (error) {
    throw new Error(
      `unable to resolve ${description} at ${portablePath(absolute)}: ` +
        (error?.message || String(error)),
    );
  }
  if (!before.isFile()) {
    throw new Error(`${description} is not a file: ${portablePath(absolute)}`);
  }
  const resolved = realpathSync(absolute);
  const identity = statIdentity(before);
  const cached = foreignInputDigestCache.get(resolved);
  if (cached?.identity === identity) {
    return Object.freeze({
      path: logicalPath,
      bytes: cached.bytes,
      sha256: cached.sha256,
    });
  }
  const persisted = digestStore?.files[portablePath(resolved)];
  const persistedDigest = persisted?.identity === identity &&
      typeof persisted.sha256 === "string" &&
      /^[a-f0-9]{64}$/.test(persisted.sha256)
    ? persisted.sha256
    : undefined;
  const digest = persistedDigest || sha256File(absolute);
  const after = statSync(absolute, { bigint: true });
  if (statIdentity(after) !== identity) {
    throw new Error(
      `${description} changed while its native cache identity was computed: ` +
        portablePath(absolute),
    );
  }
  const value = Object.freeze({
    path: logicalPath,
    bytes: String(before.size),
    sha256: digest,
  });
  foreignInputDigestCache.set(resolved, {
    identity,
    bytes: value.bytes,
    sha256: value.sha256,
  });
  if (digestStore !== undefined && persistedDigest === undefined) {
    digestStore.files[portablePath(resolved)] = {
      identity,
      bytes: String(before.size),
      sha256: digest,
    };
    digestStore.dirty = true;
  }
  return value;
}

function uniquePaths(paths) {
  const seen = new Set();
  const answer = [];
  for (const filename of paths) {
    const absolute = resolve(filename);
    const key = process.platform === "win32"
      ? absolute.toLowerCase()
      : absolute;
    if (seen.has(key)) continue;
    seen.add(key);
    answer.push(absolute);
  }
  return answer;
}

function relativeWithin(filename, directory) {
  const candidate = relative(resolve(directory), resolve(filename))
    .replaceAll("\\", "/");
  if (
    candidate === "" ||
    candidate === ".." ||
    candidate.startsWith("../")
  ) {
    return candidate === "" ? "." : undefined;
  }
  return candidate;
}

function logicalCompilationPath(filename, ir) {
  const libraries = [...(ir.foreignLibraries || [])]
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const library of libraries) {
    const within = relativeWithin(filename, foreignPrefix(library));
    if (within !== undefined) return `foreign/${library.id}/${within}`;
  }
  const withinNativeSupport = relativeWithin(filename, nativePrefix);
  if (withinNativeSupport !== undefined) {
    return `foreign/native-support/${withinNativeSupport}`;
  }
  const withinSource = relativeWithin(filename, root);
  if (withinSource !== undefined) return `source/${withinSource}`;
  throw new Error(
    "declared foreign compilation input has no reproducible logical role: " +
      portablePath(filename),
  );
}

function nativePathMappings(ir, outputPath, buildDirectory = outputPath) {
  const entries = [
    [outputPath, NATIVE_PATH_POLICY.buildRoot],
    [buildDirectory, NATIVE_PATH_POLICY.buildRoot],
    ...(ir.foreignLibraries || []).map((library) => [
      foreignPrefix(library),
      `${NATIVE_PATH_POLICY.foreignRoot}/${library.id}`,
    ]),
    [nativePrefix, NATIVE_PATH_POLICY.nativeSupportRoot],
    [root, NATIVE_PATH_POLICY.sourceRoot],
  ];
  const seen = new Set();
  return entries
    .map(([physical, logical]) => [resolve(physical), logical])
    // GCC and Clang apply the last matching prefix map. Emit broad physical
    // roots first and their more specific semantic roles last.
    .sort((left, right) => left[0].length - right[0].length)
    .filter(([physical]) => {
      const key = process.platform === "win32"
        ? physical.toLowerCase()
        : physical;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function unixPrefixMapFlags(pathMappings) {
  return pathMappings.flatMap(([physical, logical]) => [
    `-ffile-prefix-map=${physical}=${logical}`,
    `-fdebug-prefix-map=${physical}=${logical}`,
    `-fmacro-prefix-map=${physical}=${logical}`,
  ]);
}

function windowsPathMapFlags(pathMappings) {
  return [
    "/Brepro",
    // Generated Windows kernels use the ClangCL MSBuild toolset. `/pathmap`
    // is an MSVC-only option: clang-cl treats it as an input filename and the
    // build fails before compiling anything. Forward Clang's three prefix-map
    // options explicitly so source macros, diagnostics, and debug records all
    // share the same checkout-independent identity as Unix builds.
    ...pathMappings.flatMap(([physical, logical]) => [
      `/clang:-ffile-prefix-map=${physical}=${logical}`,
      `/clang:-fdebug-prefix-map=${physical}=${logical}`,
      `/clang:-fmacro-prefix-map=${physical}=${logical}`,
    ]),
  ];
}

function writeDiscoveryIndex(
  cacheRoot,
  sourcePath,
  sourceHash,
  cacheKey,
  sourceKey,
  compatibility,
) {
  const indexPath = join(cacheRoot, "index.json");
  let index = {
    schema: "sagejs.native-cache/v3",
    sources: {},
    logicalSources: {},
  };
  try {
    const current = JSON.parse(readFileSync(indexPath, "utf8"));
    if (
      current?.schema === index.schema &&
      current.sources !== null &&
      typeof current.sources === "object"
    ) {
      index.sources = current.sources;
      if (
        current.logicalSources !== null &&
        typeof current.logicalSources === "object"
      ) {
        index.logicalSources = current.logicalSources;
      }
    }
  } catch (_error) {}
  const record = {
    cacheKey,
    sourceHash,
    nativeAbi: compatibility.nativeAbi,
    foreignDeclarations: compatibility.foreignDeclarations,
  };
  index.sources[sourcePath] = record;
  if (sourceKey !== undefined) {
    index.logicalSources[validatedSourceKey(sourceKey)] = record;
  }
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}

function nativeCompatibility(ir, foreignInputs) {
  const inputsByLibrary = new Map(
    foreignInputs.map((input) => [input.id, input]),
  );
  return Object.freeze({
    nativeAbi: NATIVE_ABI_VERSION,
    foreignDeclarations: Object.freeze(
      (ir.foreignLibraries || [])
        .map((library) => {
          const input = inputsByLibrary.get(library.id);
          return Object.freeze({
            id: library.id,
            declarationIdentity: library.declarationIdentity,
            dynamicPackage: library.dynamic.package,
            nativeInputFingerprint: input.fingerprint,
          });
        })
        .sort((left, right) => left.id.localeCompare(right.id)),
    ),
    foreignInputs,
  });
}

function backendFingerprint() {
  return sha256(
    [
      readFileSync(__filename),
      readFileSync(join(__dirname, "ir.cjs")),
      readFileSync(join(__dirname, "integer-ir.cjs")),
      readFileSync(join(__dirname, "float64-ir.cjs")),
      readFileSync(join(__dirname, "exact-analysis.cjs")),
      readFileSync(join(__dirname, "prime-field-ir.cjs")),
      readFileSync(join(__dirname, "prime-field-backend.cjs")),
      readFileSync(join(__dirname, "prime-source-ir.cjs")),
      readFileSync(join(__dirname, "prime-source-optimize.cjs")),
      readFileSync(join(__dirname, "prime-source-backend.cjs")),
      readFileSync(join(__dirname, "uint64-operations.cjs")),
      readFileSync(join(__dirname, "provenance.cjs")),
      readFileSync(join(__dirname, "word-backend.cjs")),
      readFileSync(join(__dirname, "tagged-backend.cjs")),
      readFileSync(join(__dirname, "core-abi.cjs")),
      readFileSync(join(__dirname, "exact-runtime.cjs")),
      readFileSync(join(__dirname, "c-backend.cjs")),
      readFileSync(join(__dirname, "js-backend.cjs")),
      readFileSync(join(__dirname, "ffi-codegen.cjs")),
      ...declarationFiles(root).map((filename) => readFileSync(filename)),
      readFileSync(header),
    ].join("\0"),
  );
}

function toolchainFingerprint() {
  const compiler = process.env.CC ||
    (process.platform === "win32" ? "ClangCL" : "cc");
  const version = process.platform === "win32"
    ? "selected by node-gyp"
    : spawnSync(compiler, ["--version"], { encoding: "utf8" })
      .stdout?.split("\n", 1)[0] || "unknown";
  return {
    compiler,
    version,
    cflags: process.env.CFLAGS || "",
    cxx: process.env.CXX || "",
    cxxflags: process.env.CXXFLAGS || "",
    ldflags: process.env.LDFLAGS || "",
  };
}

function primeFieldTuning() {
  const specifications = [
    ["blockThresholdU32", "SAGEJS_NATIVE_PRIME_BLOCK_THRESHOLD_U32", 32, 1, 4096],
    ["blockThresholdU64", "SAGEJS_NATIVE_PRIME_BLOCK_THRESHOLD_U64", 320, 1, 4096],
    ["panelU32", "SAGEJS_NATIVE_PRIME_PANEL_U32", 20, 1, 128],
    ["panelU64", "SAGEJS_NATIVE_PRIME_PANEL_U64", 48, 1, 128],
    ["columnTile", "SAGEJS_NATIVE_PRIME_COLUMN_TILE", 512, 1, 4096],
    ["shoupThreshold", "SAGEJS_NATIVE_PRIME_SHOUP_THRESHOLD", 4, 1, 128],
  ];
  return Object.fromEntries(specifications.map(
    ([name, environment, fallback, minimum, maximum]) => {
      const text = process.env[environment];
      const value = text === undefined ? fallback : Number(text);
      if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new RangeError(
          `${environment} must be an integer from ${minimum} through ${maximum}`,
        );
      }
      return [name, value];
    },
  ));
}

function sourceBoundsCheck() {
  const text = process.env.SAGEJS_NATIVE_SOURCE_BOUNDS_CHECK;
  if (text === undefined) return true;
  if (text === "0") return false;
  if (text === "1") return true;
  throw new RangeError(
    "SAGEJS_NATIVE_SOURCE_BOUNDS_CHECK must be 0 or 1",
  );
}

function windowsClangBuiltins() {
  const result = spawnSync(process.execPath, [
    join(root, "packages", "flint", "scripts", "windows-clang-builtins.cjs"),
  ], { encoding: "utf8" });
  const library = result.stdout?.trim();
  if (result.status !== 0 || !library) {
    throw new Error(
      "unable to resolve Windows Clang compiler builtins for declared FFI: " +
      (result.stderr?.trim() || `status ${result.status}`),
    );
  }
  return library;
}

function foreignPrefix(library, platform = process.platform) {
  const toolchain = library.native.toolchain;
  return resolve(
    process.env[toolchain.prefix_environment] ||
      join(root, platform === "win32"
        ? toolchain.windows_default : toolchain.unix_default),
  );
}

function foreignIncludeDirectories(ir, platform = process.platform) {
  return uniquePaths(
    (ir.foreignLibraries || []).flatMap((library) => {
      const prefix = foreignPrefix(library, platform);
      return [
        ...library.native.toolchain.source_include_dirs.map((directory) =>
          join(root, directory)),
        ...library.native.toolchain.include_dirs.map((directory) =>
          join(prefix, directory)),
      ];
    }),
  );
}

function compilationIncludeDirectories(ir, platform = process.platform) {
  return uniquePaths([
    // A declared library owns the headers that describe its selected ABI.
    // Keep them ahead of the global FLINT support prefix so a library-specific
    // CBLAS provider cannot accidentally compile against another provider.
    ...foreignIncludeDirectories(ir, platform),
    join(nativePrefix, "include"),
    nativeInclude,
  ]);
}

function foreignLinkedLibraries(library, platform = process.platform) {
  const prefix = foreignPrefix(library, platform);
  const link = library.native.link;
  const platformLink = platform === "win32"
    ? link.windows
    : link[platform] ?? link.unix;
  return platformLink.map((name) => ({
    name,
    path: join(prefix, "lib", name),
  }));
}

function resolveDeclaredHeader(
  library,
  name,
  includeDirectories,
  digestStore,
  ir,
) {
  if (typeof name !== "string" || name.length === 0 || name.includes("\0")) {
    throw new Error(`${library.id} declares an invalid native header name`);
  }
  for (const directory of includeDirectories) {
    const candidate = join(directory, name);
    try {
      if (statSync(candidate).isFile()) {
        return {
          name,
          ...contentAddressedFile(
            candidate,
            `${library.id} declared native header ${name}`,
            digestStore,
            logicalCompilationPath(candidate, ir),
          ),
        };
      }
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error;
    }
  }
  throw new Error(
    `${library.id} declared native header ${name} does not resolve in ` +
      `compiler include order: ` +
      includeDirectories.map(portablePath).join(", "),
  );
}

function resolveForeignCompilationInputs(ir, digestStore) {
  const includeDirectories = compilationIncludeDirectories(ir);
  return Object.freeze(
    (ir.foreignLibraries || [])
      .map((library) => {
        const headers = Object.freeze(
          [...library.native.headers]
            .sort()
            .map((name) => Object.freeze(
              resolveDeclaredHeader(
                library,
                name,
                includeDirectories,
                digestStore,
                ir,
              ),
            )),
        );
        const libraries = Object.freeze(
          foreignLinkedLibraries(library)
            .map(({ name, path }) => Object.freeze({
              name,
              ...contentAddressedFile(
                path,
                `${library.id} declared native library ${name}`,
                digestStore,
                `foreign/${library.id}/lib/${name}`,
              ),
            })),
        );
        const value = {
          id: library.id,
          prefix: `foreign/${library.id}`,
          includeOrder: Object.freeze(
            includeDirectories.map((directory) =>
              logicalCompilationPath(directory, ir)
            ),
          ),
          headers,
          libraries,
        };
        return Object.freeze({
          ...value,
          fingerprint: sha256(JSON.stringify(value)),
        });
      })
      .sort((left, right) => left.id.localeCompare(right.id)),
  );
}

function foreignCompilationInputs(ir, options = {}) {
  const digestStore = options.cacheRoot === undefined
    ? undefined
    : foreignInputDigestStore(resolve(options.cacheRoot));
  const inputs = resolveForeignCompilationInputs(ir, digestStore);
  digestStore?.save();
  return inputs;
}

function bindingGyp(
  ir,
  sourceBoundsChecked,
  hasExceptionShims = false,
  platform = process.platform,
  pathMappings = [],
) {
  const usesPrimeField = ir.functions.some(
    (fn) => ["prime-field-matrix", "prime-field-source"].includes(fn.kernelKind),
  );
  const usesSpecializedPrimeField = ir.functions.some(
    (fn) => fn.kernelKind === "prime-field-matrix",
  );
  const usesExplicitPrimeModulus = ir.functions.some((fn) =>
    fn.kernelKind === "prime-field-source" &&
    (fn.params.some((param) => param.type === "PrimeModulusValue") ||
      (fn.records || []).some((record) =>
        record.fields.some((field) => field.type === "PrimeModulusValue")
      ))
  );
  const matrixOnly = ir.functions.every(
    (fn) => ["prime-field-matrix", "prime-field-source"].includes(fn.kernelKind),
  );
  const tuning = usesSpecializedPrimeField ? primeFieldTuning() : null;
  const foreignLibraries = Array.from(new Set(
    (ir.foreignLibraries || []).flatMap((library) =>
      foreignLinkedLibraries(library, platform).map(({ path }) => path)
    ),
  ));
  const usesForeignLibraries = foreignLibraries.length > 0;
  const cxxLanguage = generatedCxxLanguageSettings(platform);
  const target = {
    target_name: "sagejs_native_kernel",
    win_delay_load_hook: "false",
    sources: ["kernel.c", ...(hasExceptionShims ? ["ffi_shims.cc"] : [])],
    include_dirs: compilationIncludeDirectories(ir, platform),
    defines: [
      "NAPI_VERSION=8",
      ...(usesSpecializedPrimeField
        ? [
          `SAGEJS_PRIME_BLOCK_THRESHOLD_U32=${tuning.blockThresholdU32}`,
          `SAGEJS_PRIME_BLOCK_THRESHOLD_U64=${tuning.blockThresholdU64}`,
          `SAGEJS_PRIME_PANEL_U32=${tuning.panelU32}`,
          `SAGEJS_PRIME_PANEL_U64=${tuning.panelU64}`,
          `SAGEJS_PRIME_COLUMN_TILE=${tuning.columnTile}`,
          `SAGEJS_PRIME_SHOUP_THRESHOLD=${tuning.shoupThreshold}`,
        ]
        : []),
      ...(sourceBoundsChecked === null
        ? []
        : [`SAGEJS_NATIVE_SOURCE_BOUNDS_CHECK=${sourceBoundsChecked ? 1 : 0}`]),
    ],
  };
  if (platform === "win32") {
    target.libraries = [
      ...foreignLibraries,
      ...(usesExplicitPrimeModulus ? [nativeFlintLibrary] : []),
      ...(!matrixOnly
        ? [
          nativeMpcLibrary,
          join(nativePrefix, "lib", "mpfr.lib"),
          join(nativePrefix, "lib", "gmp.lib"),
        ]
        : []),
      ...(usesForeignLibraries
        ? [windowsClangBuiltins()]
        : []),
    ];
    target.configurations = {
      Release: {
        // Generated kernels share the FLINT/GMP representation headers even
        // when their particular body has no direct foreign call.  Compile all
        // Windows kernels with the same modern C frontend as the host addon;
        // MSVC's C frontend cannot parse the C11 declarations in those headers.
        msbuild_toolset: "ClangCL",
        msvs_settings: {
          VCCLCompilerTool: { RuntimeLibrary: 2 },
        },
      },
    };
    target.msvs_settings = {
      VCCLCompilerTool: {
        Optimization: 3,
        WarningLevel: 3,
        AdditionalOptions: windowsPathMapFlags(pathMappings),
        ...(hasExceptionShims
          ? {
            ExceptionHandling: 1,
            LanguageStandard: cxxLanguage.msvc,
            // GYP files are evaluated as Python dictionaries.  Keep this as
            // the MSBuild string value rather than emitting JSON's `true`,
            // which is not valid Python syntax on Windows.
            RuntimeTypeInfo: "true",
          }
          : {}),
      },
      VCLinkerTool: { AdditionalOptions: ["/Brepro"] },
    };
  } else {
    target.libraries = [
      ...foreignLibraries,
      ...(usesExplicitPrimeModulus ? [nativeFlintLibrary] : []),
      ...(!matrixOnly
        ? [
          nativeMpcLibrary,
          join(nativePrefix, "lib", "libmpfr.a"),
          join(nativePrefix, "lib", "libgmp.a"),
        ]
        : []),
      "-lm",
      ...((ir.foreignLibraries || []).length > 0 ? ["-lpthread"] : []),
    ];
    target.cflags = [
      "-O3",
      "-fPIC",
      "-Wall",
      "-Wextra",
      "-ffunction-sections",
      "-fdata-sections",
      ...unixPrefixMapFlags(pathMappings),
    ];
    if (hasExceptionShims) {
      target["cflags_cc!"] = ["-fno-exceptions", "-fno-rtti"];
      target.cflags_cc = [
        cxxLanguage.compilerFlag,
        "-fexceptions",
        "-frtti",
      ];
    }
    if (platform === "darwin") {
      target.xcode_settings = {
        GCC_OPTIMIZATION_LEVEL: "3",
        MACOSX_DEPLOYMENT_TARGET: macosDeploymentTarget(),
        ...(hasExceptionShims
          ? {
            CLANG_CXX_LANGUAGE_STANDARD: cxxLanguage.xcode,
            GCC_ENABLE_CPP_EXCEPTIONS: "YES",
            GCC_ENABLE_CPP_RTTI: "YES",
          }
          : {}),
      };
    } else {
      target.ldflags = [
        "-Wl,--gc-sections",
        "-Wl,--exclude-libs,ALL",
        "-Wl,--strip-all",
      ];
    }
  }
  return {
    targets: [target],
  };
}

async function compileKernel(options) {
  const sourcePath = resolve(options.sourcePath);
  const sourceKey = validatedSourceKey(options.sourceKey);
  const canonicalSource = sourceIdentity(sourcePath, sourceKey);
  const source = readFileSync(sourcePath, "utf8");
  const sourceHash = sha256(source);
  const cacheRoot = resolve(
    options.cacheRoot ||
      join(dirname(sourcePath), ".sagejs-native-kernels"),
  );
  const ir = await lowerSource(source, canonicalSource, {
    functions: options.functions,
  });
  const foreignInputs = foreignCompilationInputs(ir, { cacheRoot });
  const compatibility = nativeCompatibility(ir, foreignInputs);
  const usesSpecializedPrimeField = ir.functions.some(
    (fn) => fn.kernelKind === "prime-field-matrix",
  );
  const usesSourcePrimeField = ir.functions.some(
    (fn) => fn.kernelKind === "prime-field-source",
  );
  const tuning = usesSpecializedPrimeField ? primeFieldTuning() : null;
  const sourceBoundsChecked = usesSourcePrimeField ? sourceBoundsCheck() : null;
  const identity = {
    sourceIdentity: canonicalSource,
    source,
    ir,
    nativeAbi: NATIVE_ABI_VERSION,
    backend: backendFingerprint(),
    platform: process.platform,
    architecture: process.arch,
    nodeModulesAbi: process.versions.modules,
    toolchain: toolchainFingerprint(),
    pathPolicy: NATIVE_PATH_POLICY,
    foreignInputs,
    primeFieldTuning: tuning,
    sourceBoundsChecked,
    mpfr: "4.2.2",
    mpc: mpcVersion,
  };
  const cacheKey = sha256(JSON.stringify(identity));
  const outputPath = join(cacheRoot, cacheKey);
  const addonPath = join(
    outputPath,
    "build",
    "Release",
    "sagejs_native_kernel.node",
  );
  const modulePath = join(outputPath, "index.cjs");
  const manifestPath = join(outputPath, "manifest.json");
  const coreSourcePath = join(outputPath, "kernel_core.c");
  const coreHeaderPath = join(outputPath, "kernel_core.h");
  const exceptionShims = generateExceptionShims(ir);
  const shimSourcePath = join(outputPath, "ffi_shims.cc");
  const shimHeaderPath = join(outputPath, "ffi_shims.h");
  if (
    existsSync(addonPath) &&
    existsSync(modulePath) &&
    existsSync(manifestPath) &&
    existsSync(coreSourcePath) && existsSync(coreHeaderPath) &&
    (exceptionShims === null ||
      (existsSync(shimSourcePath) && existsSync(shimHeaderPath)))
  ) {
    const currentForeignInputs = foreignCompilationInputs(ir, { cacheRoot });
    if (JSON.stringify(currentForeignInputs) !== JSON.stringify(foreignInputs)) {
      throw new Error(
        "declared foreign compilation inputs changed while resolving a " +
          "cached native kernel; retry compilation",
      );
    }
    writeDiscoveryIndex(
      cacheRoot,
      sourcePath,
      sourceHash,
      cacheKey,
      sourceKey,
      compatibility,
    );
    return {
      addonPath,
      cacheKey,
      cached: true,
      ir,
      modulePath,
      outputPath,
      coreSourcePath,
      coreHeaderPath,
      shimSourcePath: exceptionShims === null ? null : shimSourcePath,
      shimHeaderPath: exceptionShims === null ? null : shimHeaderPath,
      nativeAbi: compatibility.nativeAbi,
      foreignDeclarations: compatibility.foreignDeclarations,
      foreignInputs,
    };
  }

  const matrixOnly = ir.functions.every(
    (fn) => ["prime-field-matrix", "prime-field-source"].includes(fn.kernelKind),
  );
  if (!matrixOnly && !existsSync(nativeMpcLibrary)) {
    throw new Error(
      "native MPC dependencies are not built; run " +
        "pnpm --dir packages/flint build",
    );
  }
  mkdirSync(outputPath, { recursive: true });
  const artifacts = generateArtifacts(ir);
  const cSource = artifacts.adapterSource;
  const { generatedCSourceMap } = require("./provenance.cjs");
  const cSourceMap = generatedCSourceMap(cSource);
  const coreSourceMap = generatedCSourceMap(artifacts.coreSource);
  writeFileSync(join(outputPath, "kernel.c"), cSource);
  writeFileSync(coreSourcePath, artifacts.coreSource);
  writeFileSync(coreHeaderPath, artifacts.coreHeader);
  if (exceptionShims !== null) {
    writeFileSync(shimSourcePath, exceptionShims.source);
    writeFileSync(shimHeaderPath, exceptionShims.header);
  }
  const buildWorkspace = nativeBuildWorkspace(outputPath);
  let build;
  try {
    writeFileSync(
      join(outputPath, "binding.gyp"),
      `${JSON.stringify(bindingGyp(
        ir,
        sourceBoundsChecked,
        exceptionShims !== null,
        process.platform,
        nativePathMappings(ir, outputPath, buildWorkspace.directory),
      ), null, 2)}\n`,
    );
    writeFileSync(
      modulePath,
      generateJavaScript(ir, {
        cacheKey,
        primeFieldTuning: tuning,
        sourceBoundsChecked,
        sourceHash,
        // A production wrapper is relocatable and is registered by the checked
        // runtime loader after source-hash and ABI validation. Development
        // wrappers retain their convenient physical-path self-registration.
        sourcePath: sourceKey === undefined ? sourcePath : "",
        sourceIdentity: canonicalSource,
        pathPolicy: NATIVE_PATH_POLICY,
        nativeAbi: compatibility.nativeAbi,
        foreignDeclarations: compatibility.foreignDeclarations,
      }),
    );
    writeFileSync(
      manifestPath,
      `${JSON.stringify(
        {
          cacheKey,
          nativeAbi: NATIVE_ABI_VERSION,
          sourceHash,
          foreignDeclarations: compatibility.foreignDeclarations,
          foreignInputs,
          primeFieldTuning: tuning,
          sourceBoundsChecked,
          sourceIdentity: canonicalSource,
          pathPolicy: NATIVE_PATH_POLICY,
          cSourceMap,
          coreSourceMap,
          hostIsolation: artifacts.hostIsolation,
          exceptionShields: exceptionShims === null ? [] :
            exceptionShims.functions.map((fn) => fn.call_plan.declaration_id),
          ir,
        },
        null,
        2,
      )}\n`,
    );

    const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js", {
      paths: [join(root, "packages", "flint")],
    });
    build = spawnSync(process.execPath, [nodeGyp, "rebuild"], {
      cwd: buildWorkspace.directory,
      encoding: "utf8",
      env: {
        ...process.env,
        LC_ALL: "C",
        SOURCE_DATE_EPOCH: NATIVE_PATH_POLICY.sourceDateEpoch,
        TZ: "UTC",
        ZERO_AR_DATE: "1",
      },
    });
  } finally {
    buildWorkspace.close();
  }
  if (build.status !== 0) {
    process.stderr.write(build.stdout);
    process.stderr.write(build.stderr);
    throw new Error(`node-gyp exited with status ${build.status}`);
  }
  const currentForeignInputs = foreignCompilationInputs(ir, { cacheRoot });
  if (JSON.stringify(currentForeignInputs) !== JSON.stringify(foreignInputs)) {
    rmSync(outputPath, { recursive: true, force: true });
    throw new Error(
      "declared foreign compilation inputs changed during native compilation; " +
        "discarded the inconsistent artifact; retry compilation",
    );
  }
  writeDiscoveryIndex(
    cacheRoot,
    sourcePath,
    sourceHash,
    cacheKey,
    sourceKey,
    compatibility,
  );
  return {
    addonPath,
    cacheKey,
    cached: false,
    ir,
    modulePath,
    outputPath,
    coreSourcePath,
    coreHeaderPath,
    shimSourcePath: exceptionShims === null ? null : shimSourcePath,
    shimHeaderPath: exceptionShims === null ? null : shimHeaderPath,
    nativeAbi: compatibility.nativeAbi,
    foreignDeclarations: compatibility.foreignDeclarations,
    foreignInputs,
  };
}

module.exports = {
  NATIVE_ABI_VERSION,
  compileKernel,
  bindingGyp,
  foreignCompilationInputs,
  generatedCxxLanguageSettings,
  nativeBuildWorkspace,
  nativePathMappings,
  NATIVE_PATH_POLICY,
};
