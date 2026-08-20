const PACK_SCHEMA = "sagejs.native-wasm-pack/v1";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("a Wasm pack loader must return bytes or a module");
}

async function digestHex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

function integerLimbs(value) {
  let magnitude = value < 0n ? -value : value;
  const limbs = [];
  while (magnitude !== 0n) {
    limbs.push(magnitude & ((1n << 64n) - 1n));
    magnitude >>= 64n;
  }
  return limbs;
}

function integerFromLimbs(sign, limbs) {
  let value = 0n;
  for (let index = limbs.length - 1; index >= 0; index -= 1) {
    value = (value << 64n) + limbs[index];
  }
  return sign < 0 ? -value : value;
}

function valuesAndCapacity(argument) {
  const values = Array.isArray(argument) || ArrayBuffer.isView(argument)
    ? argument
    : argument?.values;
  if (values === undefined || typeof values.length !== "number") {
    throw new TypeError("IntegerBuffer arguments require an array of integers");
  }
  const integers = Array.from(values, (value) => BigInt(value));
  const needed = integers.reduce(
    (maximum, value) => Math.max(maximum, integerLimbs(value).length),
    1,
  );
  const requested = argument?.wordCapacity ?? needed;
  if (!Number.isInteger(requested) || requested < needed || requested > 0xffff) {
    throw new RangeError("invalid IntegerBuffer wordCapacity");
  }
  return { target: values, values: integers, wordCapacity: requested };
}

function setTarget(target, index, value) {
  if (target === undefined) return;
  target[index] = value;
}

function cString(memory, address) {
  if (address === 0) return "source-transparent Wasm kernel failed";
  const bytes = new Uint8Array(memory.buffer);
  let stop = address;
  while (stop < bytes.length && bytes[stop] !== 0) stop += 1;
  return textDecoder.decode(bytes.subarray(address, stop));
}

function makeMarshaller(instance, runtime) {
  const exports = instance.exports;
  const allocate = exports[runtime.allocate];
  const deallocate = exports[runtime.deallocate];
  if (typeof allocate !== "function" || typeof deallocate !== "function") {
    throw new Error("Wasm kernel pack lacks its declared allocator exports");
  }
  const allocations = [];
  const copybacks = [];
  function alloc(bytes) {
    const address = Number(allocate(bytes));
    if (address === 0) throw new RangeError("Wasm kernel allocation failed");
    allocations.push(address);
    return address;
  }
  function encodeBuffer(type, argument) {
    if (type === "IntegerBuffer") {
      const { target, values, wordCapacity } = valuesAndCapacity(argument);
      const sizesAddress = alloc(values.length * 4);
      const limbsAddress = alloc(values.length * wordCapacity * 8);
      const sizes = new Int32Array(instance.exports.memory.buffer,
        sizesAddress, values.length);
      const limbs = new BigUint64Array(instance.exports.memory.buffer,
        limbsAddress, values.length * wordCapacity);
      values.forEach((value, index) => {
        const words = integerLimbs(value);
        sizes[index] = value < 0n ? -words.length : words.length;
        words.forEach((word, offset) => {
          limbs[index * wordCapacity + offset] = word;
        });
      });
      copybacks.push(() => {
        const currentSizes = new Int32Array(instance.exports.memory.buffer,
          sizesAddress, values.length);
        const currentLimbs = new BigUint64Array(instance.exports.memory.buffer,
          limbsAddress, values.length * wordCapacity);
        for (let index = 0; index < values.length; index += 1) {
          const size = currentSizes[index];
          if (Math.abs(size) > wordCapacity) {
            throw new RangeError("Wasm kernel exceeded IntegerBuffer capacity");
          }
          const words = Array.from(currentLimbs.subarray(
            index * wordCapacity,
            index * wordCapacity + Math.abs(size),
          ));
          setTarget(target, index, integerFromLimbs(Math.sign(size), words));
        }
      });
      return [sizesAddress, limbsAddress, values.length, wordCapacity];
    }
    const signed = type === "Int64Buffer";
    const values = Array.from(argument, (value) => BigInt(value));
    const address = alloc(values.length * 8);
    const view = signed
      ? new BigInt64Array(instance.exports.memory.buffer, address, values.length)
      : new BigUint64Array(instance.exports.memory.buffer, address, values.length);
    view.set(values);
    copybacks.push(() => {
      const current = signed
        ? new BigInt64Array(instance.exports.memory.buffer, address, values.length)
        : new BigUint64Array(instance.exports.memory.buffer, address, values.length);
      for (let index = 0; index < values.length; index += 1) {
        setTarget(argument, index, current[index]);
      }
    });
    return [address, values.length];
  }
  function encode(parameter, argument) {
    if (parameter.type === "Integer") {
      const bytes = textEncoder.encode(`${BigInt(argument)}\0`);
      const address = alloc(bytes.length);
      new Uint8Array(instance.exports.memory.buffer, address, bytes.length)
        .set(bytes);
      return [address];
    }
    if (["uint64", "PrimeModulusValue"].includes(parameter.type)) {
      return [BigInt(argument)];
    }
    if (["IntegerBuffer", "Int64Buffer", "UInt64Buffer"].includes(
      parameter.type,
    )) return encodeBuffer(parameter.type, argument);
    if (parameter.type.startsWith("Record:")) {
      if (argument === null || typeof argument !== "object") {
        throw new TypeError(`${parameter.type} argument must be an object`);
      }
      return parameter.fields.flatMap((field) =>
        encode({ name: field.name, type: field.type }, argument[field.name])
      );
    }
    throw new TypeError(`unsupported Wasm kernel argument ${parameter.type}`);
  }
  function finish() {
    let copybackError;
    try {
      for (const copyback of copybacks) copyback();
    } catch (error) {
      copybackError = error;
    }
    for (const address of allocations.reverse()) deallocate(address);
    if (copybackError !== undefined) throw copybackError;
  }
  return { encode, finish };
}

function decodeResults(instance, runtime, resultTypes) {
  const values = resultTypes.map((type, index) => {
    if (type === "bool" || type === "uint64") {
      const value = instance.exports[runtime.resultU64](index);
      return type === "bool" ? value !== 0n : value;
    }
    if (type === "Integer") {
      const length = Number(instance.exports[runtime.resultLength](index));
      const sign = Number(instance.exports[runtime.resultSign](index));
      const address = Number(instance.exports[runtime.resultLimbs](index));
      const limbs = length === 0
        ? []
        : Array.from(new BigUint64Array(
          instance.exports.memory.buffer,
          address,
          length,
        ));
      return integerFromLimbs(sign, limbs);
    }
    throw new Error(`unsupported Wasm kernel result ${type}`);
  });
  return values.length === 1 ? values[0] : values;
}

function callable(instance, kernel, fn) {
  const bridge = fn.bridge;
  const target = instance.exports[bridge.export];
  if (typeof target !== "function") {
    throw new Error(`Wasm pack omitted declared export ${bridge.export}`);
  }
  const result = (...arguments_) => {
    if (arguments_.length !== bridge.parameters.length) {
      throw new TypeError(
        `${fn.name} takes ${bridge.parameters.length} arguments, ` +
          `not ${arguments_.length}`,
      );
    }
    const marshaller = makeMarshaller(instance, kernel.runtime);
    let answer;
    try {
      const wasmArguments = bridge.parameters.flatMap((parameter, index) =>
        marshaller.encode(parameter, arguments_[index])
      );
      const status = Number(target(...wasmArguments));
      if (status !== 0) {
        const address = Number(
          instance.exports[kernel.runtime.lastMessage](),
        );
        const error = status === 2 ? TypeError : status === 3
          ? RangeError : Error;
        throw new error(cString(instance.exports.memory, address));
      }
      answer = decodeResults(instance, kernel.runtime, bridge.results);
    } finally {
      marshaller.finish();
    }
    return answer;
  };
  Object.defineProperties(result, {
    nativeAvailable: { value: true },
    sourceTransparent: { value: true },
    executionTarget: { value: "wasm" },
    portableIdentity: { value: kernel.identityHash },
    sourceHash: { value: kernel.sourceHash },
    abiHash: { value: kernel.abiHash },
    declarationHash: { value: fn.declarationHash },
    oracleIdentity: { value: kernel.oracleIdentity },
  });
  return result;
}

async function instantiateModule(pack, options) {
  let source = await options.load(pack);
  let module;
  if (source instanceof WebAssembly.Module) {
    module = source;
  } else {
    const bytes = bytesOf(source);
    if (pack.sha256 !== undefined) {
      const actual = await digestHex(bytes);
      if (actual !== pack.sha256) {
        throw new Error(`Wasm pack digest mismatch for ${pack.domain}`);
      }
    }
    module = await WebAssembly.compile(bytes);
  }
  const host = await options.host(pack, module);
  if (host?.instance instanceof WebAssembly.Instance) return host.instance;
  const imports = host?.imports ?? host ?? {};
  const instance = await WebAssembly.instantiate(module, imports);
  if (typeof host?.initialize === "function") host.initialize(instance);
  else if (typeof instance.exports._initialize === "function") {
    instance.exports._initialize();
  }
  return instance;
}

export async function instantiateWasmKernelPacks(options) {
  const manifest = options?.manifest;
  if (manifest?.schema !== PACK_SCHEMA) {
    throw new TypeError(`expected a ${PACK_SCHEMA} manifest`);
  }
  if (typeof options.load !== "function" || typeof options.host !== "function") {
    throw new TypeError("Wasm kernel loading requires load and host callbacks");
  }
  const instances = new Map();
  for (const pack of manifest.packs.filter((item) => item.status === "built")) {
    instances.set(pack.domain, await instantiateModule(pack, options));
  }
  const functions = new Map();
  for (const kernel of manifest.kernels) {
    const instance = instances.get(kernel.domain);
    if (instance === undefined || kernel.runtime === undefined) continue;
    for (const fn of kernel.functions) {
      if (fn.status !== "compiled-source" || fn.bridge === undefined) continue;
      functions.set(`${kernel.logicalSource}:${fn.name}`,
        callable(instance, kernel, fn));
    }
  }
  function resolve(logicalSource, name, expected = {}) {
    const result = functions.get(`${logicalSource}:${name}`);
    if (result === undefined) return null;
    const checks = [
      ["sourceHash", result.sourceHash],
      ["abiHash", result.abiHash],
      ["declarationHash", result.declarationHash],
      ["portableIdentity", result.portableIdentity],
    ];
    for (const [key, actual] of checks) {
      if (expected[key] !== undefined && expected[key] !== actual) return null;
    }
    return result;
  }
  return Object.freeze({
    manifest,
    domains: Object.freeze(Array.from(instances.keys()).sort()),
    available(logicalSource, name) {
      return resolve(logicalSource, name) !== null;
    },
    resolve(logicalSource, name, expected) {
      return resolve(logicalSource, name, expected);
    },
    function(logicalSource, name) {
      const result = resolve(logicalSource, name);
      if (result === null) {
        throw new Error(`Wasm kernel is unavailable: ${logicalSource}:${name}`);
      }
      return result;
    },
  });
}

export { PACK_SCHEMA };
