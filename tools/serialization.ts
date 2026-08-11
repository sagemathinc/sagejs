/**
 * Sage.js serialization protocol v1.
 *
 * This module is deliberately independent of Node APIs.  Packets use plain
 * structured-clone data plus out-of-band ArrayBuffers, so the same format can
 * cross worker threads without base64 expansion or be converted to canonical
 * UTF-8 JSON for durable storage.
 */

export const SAGEJS_SERIALIZATION_SCHEMA =
  "https://sagejs.org/serialization/v1";
export const SAGEJS_SERIALIZATION_VERSION = 1;

type Scalar = null | boolean | string | number;

export type WireValue =
  | Scalar
  | { $ref: number }
  | { $integer: string }
  | { $float: string }
  | { $number: "nan" | "+infinity" | "-infinity" | "-0" }
  | { $undefined: true }
  | { $buffer: number };

export interface WireRecord {
  type: string;
  version: number;
  // Container records use inline arrays of WireValues; registered codecs use
  // a WireValue (normally a reference to a plain payload object).
  payload: unknown;
}

export interface SagePacket {
  schema: typeof SAGEJS_SERIALIZATION_SCHEMA;
  version: typeof SAGEJS_SERIALIZATION_VERSION;
  root: WireValue;
  objects: WireRecord[];
  buffers: ArrayBuffer[];
}

export interface EncodeContext {
  encode(value: unknown): WireValue;
  buffer(value: ArrayBuffer | ArrayBufferView): WireValue;
  transferable<T extends ArrayBuffer | ArrayBufferView>(value: T): T;
}

export interface DecodeContext {
  decode(value: WireValue): unknown;
}

export interface SageCodec {
  /** Stable globally unique type name, normally prefixed by package name. */
  readonly type: string;
  readonly version: number;
  test(value: unknown): boolean;
  encode(value: unknown, context: EncodeContext): WireValue;
  decode(payload: WireValue, context: DecodeContext): unknown;
}

export class SageSerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SageSerializationError";
  }
}

const codecs: SageCodec[] = [];
const codecsByType = new Map<string, SageCodec>();
let builtinCodecsLoaded = false;

/**
 * Load codecs owned by the mathematical packages on first use.  Keeping this
 * edge lazy is important: importing the serialization core must never pull
 * arithmetic or linear algebra onto a CLI startup path.
 */
function ensureBuiltinCodecs(): void {
  if (builtinCodecsLoaded) return;
  builtinCodecsLoaded = true;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./serialization-codecs/arithmetic").registerArithmeticCodecs();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./serialization-codecs/linear-algebra").registerLinearAlgebraCodecs();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./serialization-codecs/number-fields").registerNumberFieldCodecs();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./serialization-codecs/polynomial").registerPolynomialCodecs();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./serialization-codecs/series").registerSeriesCodecs();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./serialization-codecs/elliptic-curves").registerEllipticCurveCodecs();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./serialization-codecs/modular-forms").registerModularFormsCodecs();
}

function isUint8Array(value: unknown): value is Uint8Array {
  return Object.prototype.toString.call(value) === "[object Uint8Array]";
}

export function registerCodec(codec: SageCodec): () => void {
  if (!codec.type || !Number.isInteger(codec.version) || codec.version < 1) {
    throw new TypeError("a serialization codec needs a stable type and version");
  }
  if (codecsByType.has(codec.type)) {
    throw new Error(`serialization codec ${codec.type} is already registered`);
  }
  codecs.push(codec);
  codecsByType.set(codec.type, codec);
  return () => {
    const index = codecs.indexOf(codec);
    if (index >= 0) codecs.splice(index, 1);
    if (codecsByType.get(codec.type) === codec) codecsByType.delete(codec.type);
  };
}

function exactBuffer(value: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  const bytes = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return bytes.slice().buffer;
}

function pythonTypeName(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  const constructor = Reflect.get(Object(value), "constructor");
  return String(
    Reflect.get(Object(value), "__name__") ??
      Reflect.get(constructor ?? {}, "__name__") ??
      Reflect.get(constructor ?? {}, "name") ??
      typeof value,
  ).replace(/^ρσ_/, "");
}

function isPythonDict(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const constructor = Reflect.get(value, "constructor");
  return (
    Reflect.get(constructor ?? {}, "__name__") === "dict" ||
    (Reflect.has(value, "jsmap") &&
      typeof Reflect.get(value, "entries") === "function" &&
      typeof Reflect.get(value, "__setitem__") === "function")
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function iterableEntries(value: unknown): [unknown, unknown][] {
  const entries = Reflect.get(Object(value), "entries");
  if (typeof entries !== "function") {
    throw new SageSerializationError("mapping has no entries() method");
  }
  return Array.from(Reflect.apply(entries, value, [])) as [unknown, unknown][];
}

function encodePacket(value: unknown, transferOwnedBuffers: boolean): SagePacket {
  const objects: WireRecord[] = [];
  const buffers: ArrayBuffer[] = [];
  const seen = new Map<object, number>();
  const transferable = new WeakSet<object>();

  const context: EncodeContext = {
    encode: encodeValue,
    buffer(bufferValue) {
      const index = buffers.length;
      const bytes = bufferValue instanceof ArrayBuffer
        ? new Uint8Array(bufferValue)
        : new Uint8Array(
            bufferValue.buffer,
            bufferValue.byteOffset,
            bufferValue.byteLength,
          );
      const owned = transferOwnedBuffers && transferable.has(bufferValue) &&
        bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 &&
        bytes.byteLength === bytes.buffer.byteLength
        ? bytes.buffer
        : exactBuffer(bufferValue);
      buffers.push(owned);
      return { $buffer: index };
    },
    transferable<T extends ArrayBuffer | ArrayBufferView>(bufferValue: T): T {
      transferable.add(bufferValue);
      return bufferValue;
    },
  };

  function record(
    valueObject: object,
    type: string,
    version: number,
    makePayload: () => WireValue,
  ): WireValue {
    const previous = seen.get(valueObject);
    if (previous !== undefined) return { $ref: previous };
    const index = objects.length;
    seen.set(valueObject, index);
    objects.push({ type: "pending", version: 0, payload: null });
    objects[index] = { type, version, payload: makePayload() };
    return { $ref: index };
  }

  function encodeValue(item: unknown): WireValue {
    if (item === null || typeof item === "boolean" || typeof item === "string") {
      return item as Scalar;
    }
    if (typeof item === "number") {
      if (Number.isNaN(item)) return { $number: "nan" };
      if (item === Infinity) return { $number: "+infinity" };
      if (item === -Infinity) return { $number: "-infinity" };
      if (Object.is(item, -0)) return { $number: "-0" };
      return item;
    }
    if (typeof item === "bigint") return { $integer: item.toString(10) };
    if (item === undefined) return { $undefined: true };
    if (typeof item === "symbol") {
      throw new SageSerializationError(
        `cannot serialize ${typeof item}; executable code is never part of the v1 data format`,
      );
    }

    if (Reflect.get(Object(item), "__sagejs_float__") === true) {
      const numeric = Number(item);
      return { $float: Object.is(numeric, -0) ? "-0" : String(numeric) };
    }

    const object = item as object;
    if (Array.isArray(item)) {
      return record(
        object,
        Object.isFrozen(item) ? "python.tuple" : "python.list",
        1,
        () => item.map((entry, index) => {
          try {
            return encodeValue(entry);
          } catch (error) {
            if (error instanceof SageSerializationError) {
              error.message += ` at sequence index ${index}`;
            }
            throw error;
          }
        }) as unknown as WireValue,
      );
    }
    if (isUint8Array(item)) {
      return record(object, "binary.uint8", 1, () => context.buffer(item));
    }
    if (
      Array.isArray(Reflect.get(Object(item), "_values")) &&
      ["bytes", "SageBytes"].includes(pythonTypeName(item))
    ) {
      const values = Reflect.get(Object(item), "_values") as number[];
      return record(object, "python.bytes", 1, () =>
        context.buffer(Uint8Array.from(values)),
      );
    }
    if (isPythonDict(item)) {
      return record(object, "python.dict", 1, () =>
          iterableEntries(item).map(([key, entry]) => [
            encodeValue(key),
            encodeValue(entry),
          ]) as unknown as WireValue,
      );
    }
    if (["SageSet", "SageFrozenSet", "set", "frozenset"].includes(pythonTypeName(item))) {
      const frozen = ["SageFrozenSet", "frozenset"].includes(pythonTypeName(item));
      return record(object, frozen ? "python.frozenset" : "python.set", 1, () =>
        Array.from(item as Iterable<unknown>, (entry) => encodeValue(entry)) as unknown as WireValue,
      );
    }
    if (item instanceof Map) {
      return record(object, "javascript.map", 1, () =>
          Array.from(item.entries()).map(([key, entry]) => [
            encodeValue(key),
            encodeValue(entry),
          ]) as unknown as WireValue,
      );
    }
    if (item instanceof Set) {
      return record(object, "javascript.set", 1, () =>
        Array.from(item, (entry) => encodeValue(entry)) as unknown as WireValue,
      );
    }

    // Sage parents are callable-instance functions.  Load their package-owned
    // codecs only after all core container types have been ruled out.
    ensureBuiltinCodecs();
    for (const codec of codecs) {
      if (codec.test(item)) {
        return record(object, codec.type, codec.version, () => {
          try {
            return codec.encode(item, context);
          } catch (error) {
            if (error instanceof SageSerializationError) {
              error.message += ` while encoding ${codec.type}`;
            }
            throw error;
          }
        });
      }
    }

    if (typeof item === "function") {
      const descriptor = construction(item);
      const representation = typeof Reflect.get(globalThis, "ρσ_repr") === "function"
        ? invoke(Reflect.get(globalThis, "ρσ_repr"), undefined, [item])
        : pythonTypeName(item);
      throw new SageSerializationError(
        `cannot serialize function ${String(representation)}` +
          ` (kind ${String(parentKind(item) ?? "unknown")}, construction ` +
          `${String(field(descriptor, "kind") ?? "unknown")})` +
          "; executable code is never part of the v1 data format",
      );
    }

    if (isPlainObject(item)) {
      return record(object, "javascript.object", 1, () =>
          Object.keys(item)
            .sort()
            .map((key) => {
              try {
                return [key, encodeValue(item[key])];
              } catch (error) {
                if (error instanceof SageSerializationError) {
                  error.message += ` at property ${key}`;
                }
                throw error;
              }
            }) as unknown as WireValue,
      );
    }
    throw new SageSerializationError(
      `no serialization codec is registered for ${pythonTypeName(item)}`,
    );
  }

  return {
    schema: SAGEJS_SERIALIZATION_SCHEMA,
    version: SAGEJS_SERIALIZATION_VERSION,
    root: encodeValue(value),
    objects,
    buffers,
  };
}

export function encode(value: unknown): SagePacket {
  return encodePacket(value, false);
}

/** Encode a worker message, moving only buffers explicitly owned by codecs. */
export function encodeForTransfer(value: unknown): SagePacket {
  return encodePacket(value, true);
}

function validatePacket(packet: SagePacket): void {
  if (
    packet === null ||
    typeof packet !== "object" ||
    packet.schema !== SAGEJS_SERIALIZATION_SCHEMA ||
    packet.version !== SAGEJS_SERIALIZATION_VERSION ||
    !Array.isArray(packet.objects) ||
    !Array.isArray(packet.buffers)
  ) {
    throw new SageSerializationError("not a Sage.js serialization v1 packet");
  }
  if (packet.objects.length > 10_000_000) {
    throw new SageSerializationError("serialization packet has too many objects");
  }
  let bytes = 0;
  for (const buffer of packet.buffers) {
    if (!(buffer instanceof ArrayBuffer)) {
      throw new SageSerializationError("serialization packet contains an invalid buffer");
    }
    bytes += buffer.byteLength;
    if (bytes > 4 * 1024 * 1024 * 1024) {
      throw new SageSerializationError("serialization packet exceeds the 4 GiB v1 limit");
    }
  }
}

function invoke(callable: unknown, thisValue: unknown, args: unknown[]): unknown {
  if (typeof callable !== "function") {
    throw new SageSerializationError("serialized mathematical constructor is unavailable");
  }
  return Reflect.apply(callable, thisValue, args);
}

function makePythonTuple(items: unknown[]): unknown {
  const factory = Reflect.get(globalThis, "ρσ_math_tuple");
  if (typeof factory === "function") {
    return invoke(factory, undefined, [items]);
  }
  return Object.freeze(items);
}

function makePythonDict(): unknown {
  const factory = Reflect.get(globalThis, "ρσ_dict");
  if (typeof factory === "function") return invoke(factory, undefined, []);
  return new Map();
}

function setMappingEntry(mapping: unknown, key: unknown, value: unknown): void {
  const setter = Reflect.get(Object(mapping), "__setitem__") ??
    Reflect.get(Object(mapping), "set");
  invoke(setter, mapping, [key, value]);
}

export function decode(packet: SagePacket): unknown {
  validatePacket(packet);
  const decoded = new Array<unknown>(packet.objects.length);
  const active = new Set<number>();

  const context: DecodeContext = { decode: decodeValue };

  function decodeValue(value: WireValue): unknown {
    if (value === null || typeof value === "boolean" || typeof value === "string" || typeof value === "number") {
      return value;
    }
    if ("$ref" in value) return decodeRecord(value.$ref);
    if ("$integer" in value) return BigInt(value.$integer);
    if ("$float" in value) {
      const numeric = Number(value.$float);
      if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
        throw new SageSerializationError("serialized integral float is invalid");
      }
      const factory = Reflect.get(globalThis, "ρσ_float");
      return typeof factory === "function"
        ? invoke(factory, undefined, [value.$float])
        : numeric;
    }
    if ("$undefined" in value) return undefined;
    if ("$buffer" in value) {
      const buffer = packet.buffers[value.$buffer];
      if (!(buffer instanceof ArrayBuffer)) {
        throw new SageSerializationError(`invalid buffer reference ${value.$buffer}`);
      }
      return new Uint8Array(buffer);
    }
    switch (value.$number) {
      case "nan": return NaN;
      case "+infinity": return Infinity;
      case "-infinity": return -Infinity;
      case "-0": return -0;
    }
  }

  function decodePairs(payload: unknown): [unknown, unknown][] {
    const pairs = payload;
    if (!Array.isArray(pairs)) {
      throw new SageSerializationError("serialized mapping payload is not a sequence");
    }
    return pairs.map((pair) => {
      if (!Array.isArray(pair) || pair.length !== 2) {
        throw new SageSerializationError("serialized mapping entry is not a pair");
      }
      return [decodeValue(pair[0] as WireValue), decodeValue(pair[1] as WireValue)];
    });
  }

  function decodeRecord(index: number): unknown {
    if (!Number.isInteger(index) || index < 0 || index >= packet.objects.length) {
      throw new SageSerializationError(`invalid object reference ${index}`);
    }
    if (decoded[index] !== undefined) return decoded[index];
    const record = packet.objects[index];
    if (!record || typeof record.type !== "string") {
      throw new SageSerializationError(`invalid object record ${index}`);
    }

    if (record.type === "python.list") {
      const result: unknown[] = [];
      decoded[index] = result;
      const items = record.payload;
      if (!Array.isArray(items)) throw new SageSerializationError("list payload is invalid");
      result.push(...items.map((item) => decodeValue(item as WireValue)));
      return result;
    }
    if (record.type === "python.dict") {
      const result = makePythonDict();
      decoded[index] = result;
      for (const [key, value] of decodePairs(record.payload)) {
        setMappingEntry(result, key, value);
      }
      return result;
    }
    if (record.type === "javascript.map") {
      const result = new Map();
      decoded[index] = result;
      for (const [key, value] of decodePairs(record.payload)) result.set(key, value);
      return result;
    }
    if (["python.set", "python.frozenset", "javascript.set"].includes(record.type)) {
      const items = record.payload;
      if (!Array.isArray(items)) throw new SageSerializationError("set payload is invalid");
      const values = items.map((item) => decodeValue(item as WireValue));
      const factoryName = record.type === "python.frozenset"
        ? "ρσ_frozenset"
        : record.type === "python.set"
          ? "ρσ_set"
          : undefined;
      const factory = factoryName === undefined
        ? undefined
        : Reflect.get(globalThis, factoryName);
      const result = typeof factory === "function"
        ? invoke(factory, undefined, [values])
        : new Set(values);
      decoded[index] = result;
      return result;
    }
    if (record.type === "javascript.object") {
      const result: Record<string, unknown> = Object.create(null);
      decoded[index] = result;
      for (const [key, value] of decodePairs(record.payload)) {
        if (typeof key !== "string") {
          throw new SageSerializationError("object property name is not a string");
        }
        result[key] = value;
      }
      return result;
    }
    if (record.type === "binary.uint8" || record.type === "python.bytes") {
      const bytes = decodeValue(record.payload as WireValue);
      if (!isUint8Array(bytes)) {
        throw new SageSerializationError("bytes payload is invalid");
      }
      const factory = record.type === "python.bytes"
        ? Reflect.get(globalThis, "ρσ_bytes")
        : undefined;
      const result = typeof factory === "function"
        ? invoke(factory, undefined, [Array.from(bytes)])
        : bytes;
      decoded[index] = result;
      return result;
    }
    if (record.type === "python.tuple") {
      if (active.has(index)) {
        throw new SageSerializationError("a tuple cannot recursively contain itself");
      }
      active.add(index);
      const items = record.payload;
      if (!Array.isArray(items)) throw new SageSerializationError("tuple payload is invalid");
      const result = makePythonTuple(items.map((item) => decodeValue(item as WireValue)));
      active.delete(index);
      decoded[index] = result;
      return result;
    }

    if (!codecsByType.has(record.type)) ensureBuiltinCodecs();
    const codec = codecsByType.get(record.type);
    if (!codec) {
      throw new SageSerializationError(`no decoder is registered for ${record.type}`);
    }
    if (codec.version !== record.version) {
      throw new SageSerializationError(
        `codec ${record.type} supports version ${codec.version}, not ${record.version}`,
      );
    }
    if (active.has(index)) {
      throw new SageSerializationError(
        `recursive ${record.type} objects are not supported by serialization v1`,
      );
    }
    active.add(index);
    const result = codec.decode(record.payload as WireValue, context);
    active.delete(index);
    decoded[index] = result;
    return result;
  }

  return decodeValue(packet.root);
}

function bytesToBase64(buffer: ArrayBuffer): string {
  const NodeBuffer = Reflect.get(globalThis, "Buffer") as
    | { from(value: ArrayBuffer): { toString(encoding: string): string } }
    | undefined;
  if (NodeBuffer) return NodeBuffer.from(buffer).toString("base64");
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  const btoaValue = Reflect.get(globalThis, "btoa");
  return invoke(btoaValue, undefined, [binary]) as string;
}

function base64ToBytes(value: string): ArrayBuffer {
  const NodeBuffer = Reflect.get(globalThis, "Buffer") as
    | { from(value: string, encoding: string): Uint8Array }
    | undefined;
  if (NodeBuffer) {
    const bytes = NodeBuffer.from(value, "base64");
    return exactBuffer(bytes);
  }
  const atobValue = Reflect.get(globalThis, "atob");
  const binary = invoke(atobValue, undefined, [value]) as string;
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

/** Return deterministic portable UTF-8 JSON text. */
export function dumps(value: unknown): string {
  const packet = encode(value);
  return JSON.stringify({
    schema: packet.schema,
    version: packet.version,
    root: packet.root,
    objects: packet.objects,
    buffers: packet.buffers.map(bytesToBase64),
  });
}

/** Load portable serialization v1 JSON without evaluating source code. */
export function loads(source: string): unknown {
  let portable: Omit<SagePacket, "buffers"> & { buffers: string[] };
  try {
    portable = JSON.parse(source);
  } catch (error) {
    throw new SageSerializationError(
      `invalid Sage.js serialization JSON: ${(error as Error).message}`,
    );
  }
  if (!Array.isArray(portable.buffers) || portable.buffers.some((item) => typeof item !== "string")) {
    throw new SageSerializationError("serialization buffers must be base64 strings");
  }
  return decode({
    ...portable,
    buffers: portable.buffers.map(base64ToBytes),
  } as SagePacket);
}

const SAGEPACK_MAGIC = Uint8Array.from([83, 65, 71, 69, 80, 75, 49, 0]);
const SAGEPACK_HEADER_BYTES = 24;
const SAGEPACK_ENVELOPE_VERSION = 1;
const SAGEPACK_MAX_BYTES = 4 * 1024 * 1024 * 1024;

function portableMetadata(packet: SagePacket): string {
  return JSON.stringify({
    schema: packet.schema,
    version: packet.version,
    root: packet.root,
    objects: packet.objects,
  });
}

function inputBytes(source: ArrayBuffer | ArrayBufferView | number[]): Uint8Array {
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (ArrayBuffer.isView(source)) {
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  }
  if (Array.isArray(source)) return Uint8Array.from(source);
  throw new TypeError("SagePack input must be bytes or an ArrayBuffer");
}

function readLength(view: DataView, offset: number): number {
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  const value = high * 0x1_0000_0000 + low;
  if (!Number.isSafeInteger(value) || value > SAGEPACK_MAX_BYTES) {
    throw new SageSerializationError("SagePack buffer exceeds the 4 GiB v1 limit");
  }
  return value;
}

function writeLength(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
  view.setUint32(offset + 4, Math.floor(value / 0x1_0000_0000), true);
}

/**
 * Pack a value into the deterministic binary SagePack v1 container.
 *
 * Object metadata is UTF-8 JSON, followed by unexpanded binary blocks.  The
 * fixed header and length table make truncation, trailing bytes, and absurd
 * allocations detectable before decoding any mathematical object.
 */
export function pack(value: unknown): Uint8Array {
  const packet = encode(value);
  const metadata = new TextEncoder().encode(portableMetadata(packet));
  if (metadata.byteLength > 0xffff_ffff || packet.buffers.length > 0xffff_ffff) {
    throw new SageSerializationError("SagePack metadata exceeds the v1 limit");
  }
  const tableBytes = packet.buffers.length * 8;
  let total = SAGEPACK_HEADER_BYTES + tableBytes + metadata.byteLength;
  for (const buffer of packet.buffers) {
    total += buffer.byteLength;
    if (!Number.isSafeInteger(total) || total > SAGEPACK_MAX_BYTES) {
      throw new SageSerializationError("SagePack exceeds the 4 GiB v1 limit");
    }
  }
  const result = new Uint8Array(total);
  result.set(SAGEPACK_MAGIC, 0);
  const view = new DataView(result.buffer);
  view.setUint32(8, SAGEPACK_ENVELOPE_VERSION, true);
  view.setUint32(12, metadata.byteLength, true);
  view.setUint32(16, packet.buffers.length, true);
  view.setUint32(20, 0, true);
  let tableOffset = SAGEPACK_HEADER_BYTES;
  for (const buffer of packet.buffers) {
    writeLength(view, tableOffset, buffer.byteLength);
    tableOffset += 8;
  }
  let offset = SAGEPACK_HEADER_BYTES + tableBytes;
  result.set(metadata, offset);
  offset += metadata.byteLength;
  for (const buffer of packet.buffers) {
    result.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  return result;
}

/** Load a binary SagePack v1 container without importing or executing code. */
export function unpack(source: ArrayBuffer | ArrayBufferView | number[]): unknown {
  const bytes = inputBytes(source);
  if (bytes.byteLength < SAGEPACK_HEADER_BYTES) {
    throw new SageSerializationError("SagePack is truncated");
  }
  for (let index = 0; index < SAGEPACK_MAGIC.length; index += 1) {
    if (bytes[index] !== SAGEPACK_MAGIC[index]) {
      throw new SageSerializationError("invalid SagePack magic");
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8, true) !== SAGEPACK_ENVELOPE_VERSION) {
    throw new SageSerializationError("unsupported SagePack envelope version");
  }
  const metadataLength = view.getUint32(12, true);
  const bufferCount = view.getUint32(16, true);
  if (view.getUint32(20, true) !== 0) {
    throw new SageSerializationError("unsupported SagePack flags");
  }
  const tableBytes = bufferCount * 8;
  const payloadOffset = SAGEPACK_HEADER_BYTES + tableBytes;
  if (!Number.isSafeInteger(payloadOffset) || payloadOffset > bytes.byteLength) {
    throw new SageSerializationError("SagePack length table is truncated");
  }
  let expected = payloadOffset + metadataLength;
  const lengths = new Array<number>(bufferCount);
  for (let index = 0; index < bufferCount; index += 1) {
    const length = readLength(view, SAGEPACK_HEADER_BYTES + index * 8);
    lengths[index] = length;
    expected += length;
    if (!Number.isSafeInteger(expected) || expected > SAGEPACK_MAX_BYTES) {
      throw new SageSerializationError("SagePack exceeds the 4 GiB v1 limit");
    }
  }
  if (expected !== bytes.byteLength) {
    throw new SageSerializationError(
      expected > bytes.byteLength ? "SagePack is truncated" : "SagePack has trailing data",
    );
  }
  let metadata: Omit<SagePacket, "buffers">;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(payloadOffset, payloadOffset + metadataLength),
    );
    metadata = JSON.parse(text);
  } catch (error) {
    throw new SageSerializationError(
      `invalid SagePack metadata: ${(error as Error).message}`,
    );
  }
  let offset = payloadOffset + metadataLength;
  const buffers = lengths.map((length) => {
    const buffer = bytes.slice(offset, offset + length).buffer;
    offset += length;
    return buffer;
  });
  return decode({ ...metadata, buffers } as SagePacket);
}

function callMethod(value: unknown, name: string, args: unknown[] = []): unknown {
  return invoke(Reflect.get(Object(value), name), value, args);
}

function callPython(value: unknown, args: unknown[]): unknown {
  const method = Reflect.get(Object(value), "__call__");
  return invoke(typeof method === "function" ? method : value, value, args);
}

function callGlobal(name: string, args: unknown[]): unknown {
  return callPython(Reflect.get(globalThis, name), args);
}

/** Trusted constructor helpers for package-owned codec implementations. */
export const codecRuntime = {
  invoke,
  callMethod,
  callPython,
  callGlobal,
};

function field(value: unknown, name: string): unknown {
  if (value === null || value === undefined) return undefined;
  const direct = Reflect.get(Object(value), name);
  if (direct !== undefined) return direct;
  const getter = Reflect.get(Object(value), "__getitem__") ??
    Reflect.get(Object(value), "get");
  if (typeof getter !== "function") return undefined;
  try {
    return invoke(getter, value, [name]);
  } catch {
    return undefined;
  }
}

function construction(value: unknown): unknown {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return undefined;
  }
  const result = Reflect.get(Object(value), "_construction");
  return result !== undefined && result !== null && typeof result === "object"
    ? result
    : undefined;
}

function parentKind(value: unknown): string | undefined {
  const kind = value === null || value === undefined
    ? undefined
    : Reflect.get(Object(value), "_kind");
  return typeof kind === "string" ? kind : undefined;
}

function isSupportedParent(value: unknown): boolean {
  const kind = parentKind(value);
  if (["ZZ", "QQ", "GF", "ZMOD"].includes(kind ?? "")) return true;
  return ["polynomial", "matrix", "vector"].includes(
    String(field(construction(value), "kind") ?? ""),
  );
}

function encodeParent(value: unknown, context: EncodeContext): WireValue {
  const kind = parentKind(value);
  if (kind === "ZZ" || kind === "QQ") return context.encode({ kind });
  if (kind === "GF" || kind === "ZMOD") {
    return context.encode({
      kind,
      order: Reflect.get(Object(value), "_order"),
    });
  }
  const descriptor = construction(value)!;
  const descriptorKind = field(descriptor, "kind");
  if (descriptorKind === "polynomial") {
    return context.encode({
      kind: "polynomial",
      base: field(descriptor, "base"),
      variable: field(descriptor, "variable"),
      sparse: Boolean(field(descriptor, "sparse")),
    });
  }
  if (descriptorKind === "matrix") {
    return context.encode({
      kind: "matrix",
      base: field(descriptor, "base"),
      rows: field(descriptor, "rows"),
      cols: field(descriptor, "cols"),
      sparse: Boolean(field(descriptor, "sparse")),
    });
  }
  if (descriptorKind === "vector") {
    return context.encode({
      kind: "vector",
      base: field(descriptor, "base"),
      degree: field(descriptor, "degree"),
    });
  }
  throw new SageSerializationError("unsupported mathematical parent");
}

function decodeParent(payload: WireValue, context: DecodeContext): unknown {
  const data = context.decode(payload) as Record<string, unknown>;
  switch (data.kind) {
    case "ZZ": return Reflect.get(globalThis, "ZZ");
    case "QQ": return Reflect.get(globalThis, "QQ");
    case "GF": return callGlobal("GF", [data.order]);
    case "ZMOD": return callGlobal("Zmod", [data.order]);
    case "polynomial":
      return callGlobal("PolynomialRing", [
        data.base,
        data.variable,
        null,
        Boolean(data.sparse),
      ]);
    case "matrix":
      return callGlobal("MatrixSpace", [
        data.base,
        data.rows,
        data.cols,
        Boolean(data.sparse),
      ]);
    case "vector":
      return callGlobal("VectorSpace", [data.base, data.degree]);
    default:
      throw new SageSerializationError(`unsupported parent kind ${String(data.kind)}`);
  }
}

function supportedElementKind(value: unknown): string | undefined {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) return undefined;
  const parent = Reflect.get(value, "_parent");
  if (parent === undefined || parent === null) return undefined;
  const kind = parentKind(parent);
  if (kind === "QQ" && Reflect.has(value, "_numerator")) return "rational";
  if ((kind === "GF" || kind === "ZMOD") && Reflect.has(value, "_value")) {
    return "residue";
  }
  const descriptor = construction(parent);
  const descriptorKind = field(descriptor, "kind");
  if (descriptorKind === "polynomial" && typeof Reflect.get(value, "coefficients") === "function") {
    return "polynomial";
  }
  if (descriptorKind === "matrix" && typeof Reflect.get(value, "list") === "function") {
    return "matrix";
  }
  if (descriptorKind === "vector" && typeof Reflect.get(value, "list") === "function") {
    return "vector";
  }
  return undefined;
}

function compactResidues(entries: unknown[], modulus: unknown): {
  width: number;
  bytes: Uint8Array;
} | undefined {
  return compactResidueValues(
    entries.length,
    (index) => Reflect.get(Object(entries[index]), "_value"),
    modulus,
  );
}

function compactResidueWidth(modulus: unknown): number | undefined {
  const modulusNumber = Number(modulus);
  if (
    !Number.isSafeInteger(modulusNumber) || modulusNumber < 2 ||
    modulusNumber > 0xffff_ffff
  ) return undefined;
  return modulusNumber <= 0x100 ? 1 : modulusNumber <= 0x1_0000 ? 2 : 4;
}

function canonicalResidue(value: unknown, modulus: number): number | undefined {
  if (typeof value === "bigint") {
    if (value < 0n || value >= BigInt(modulus)) return undefined;
    return Number(value);
  }
  const result = Number(value);
  return Number.isInteger(result) && result >= 0 && result < modulus
    ? result
    : undefined;
}

function compactResidueValues(
  count: number,
  valueAt: (index: number) => unknown,
  modulus: unknown,
): { width: number; bytes: Uint8Array } | undefined {
  const modulusNumber = Number(modulus);
  const width = compactResidueWidth(modulus);
  if (width === undefined) return undefined;
  const bytes = new Uint8Array(count * width);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < count; index += 1) {
    const value = canonicalResidue(valueAt(index), modulusNumber);
    if (value === undefined) return undefined;
    if (width === 1) view.setUint8(index, value);
    else if (width === 2) view.setUint16(index * 2, value, true);
    else view.setUint32(index * 4, value, true);
  }
  return { width, bytes };
}

function compactPrimePolynomialNative(value: unknown, base: unknown): {
  width: number;
  bytes: Uint8Array;
  count: number;
} | undefined {
  const storage = Reflect.get(Object(value), "_storage");
  if (Object.prototype.toString.call(storage) !== "[object BigUint64Array]") {
    return undefined;
  }
  const modulus = Reflect.get(Object(base), "_order");
  const modulusNumber = Number(modulus);
  if (compactResidueWidth(modulus) === undefined) return undefined;
  let count = Number(Reflect.get(Object(storage), "length"));
  while (count > 0) {
    const finalValue = canonicalResidue(
      Reflect.get(Object(storage), String(count - 1)),
      modulusNumber,
    );
    if (finalValue === undefined) return undefined;
    if (finalValue !== 0) break;
    count -= 1;
  }
  const compact = compactResidueValues(
    count,
    (index) => Reflect.get(Object(storage), String(index)),
    modulus,
  );
  return compact === undefined ? undefined : { ...compact, count };
}

function compactMatrixNative(value: unknown, base: unknown): {
  width: number;
  bytes: Uint8Array;
  count: number;
} | undefined {
  const modulusNumber = Number(Reflect.get(Object(base), "_order"));
  if (
    !Number.isSafeInteger(modulusNumber) ||
    modulusNumber < 2 ||
    modulusNumber > 0xffff_ffff
  ) return undefined;
  const width = modulusNumber <= 0x100 ? 1 : modulusNumber <= 0x1_0000 ? 2 : 4;
  const exporter = Reflect.get(Object(value), "_packed_residues");
  if (typeof exporter !== "function") return undefined;
  const rows = Number(callMethod(value, "nrows"));
  const cols = Number(callMethod(value, "ncols"));
  const bytes = invoke(exporter, value, [width]);
  if (
    !isUint8Array(bytes) ||
    Number(Reflect.get(Object(bytes), "byteLength")) !== rows * cols * width
  ) {
    throw new SageSerializationError("native compact matrix export returned invalid data");
  }
  return { width, bytes: bytes as Uint8Array, count: rows * cols };
}

function compactIntegerMatrixNative(value: unknown): {
  bytes: Uint8Array;
  count: number;
} | undefined {
  const exporter = Reflect.get(Object(value), "_packed_integers");
  if (typeof exporter !== "function") return undefined;
  const rows = Number(callMethod(value, "nrows"));
  const cols = Number(callMethod(value, "ncols"));
  const bytes = invoke(exporter, value, []);
  if (
    !isUint8Array(bytes) ||
    Number(Reflect.get(Object(bytes), "byteLength")) < rows * cols * 4
  ) {
    throw new SageSerializationError("native packed integer matrix export returned invalid data");
  }
  return { bytes: bytes as Uint8Array, count: rows * cols };
}

function compactRationalMatrixNative(value: unknown): {
  bytes: Uint8Array;
  count: number;
} | undefined {
  const exporter = Reflect.get(Object(value), "_packed_rationals");
  if (typeof exporter !== "function") return undefined;
  const rows = Number(callMethod(value, "nrows"));
  const cols = Number(callMethod(value, "ncols"));
  const bytes = invoke(exporter, value, []);
  if (
    !isUint8Array(bytes) ||
    Number(Reflect.get(Object(bytes), "byteLength")) < rows * cols * 8
  ) {
    throw new SageSerializationError("native packed rational matrix export returned invalid data");
  }
  return { bytes: bytes as Uint8Array, count: rows * cols };
}

function compactRationals(entries: unknown[]): Uint8Array | undefined {
  const records: { negative: boolean; bytes: number[] }[] = [];
  let length = 0;
  for (const entry of entries) {
    const rational = parentKind(Reflect.get(Object(entry), "_parent")) === "QQ"
      ? entry
      : undefined;
    if (rational === undefined) return undefined;
    const parts = [
      BigInt(Reflect.get(Object(rational), "_numerator")),
      BigInt(Reflect.get(Object(rational), "_denominator")),
    ];
    if (parts[1] <= 0n) return undefined;
    for (let part = 0; part < 2; part += 1) {
      const negative = part === 0 && parts[part] < 0n;
      let magnitude = parts[part] < 0n ? -parts[part] : parts[part];
      const bytes: number[] = [];
      while (magnitude !== 0n) {
        bytes.push(Number(magnitude & 255n));
        magnitude >>= 8n;
      }
      records.push({ negative, bytes });
      length += 4 + bytes.length;
    }
  }
  const result = new Uint8Array(length);
  const view = new DataView(result.buffer);
  let offset = 0;
  for (const record of records) {
    view.setUint32(
      offset,
      record.bytes.length | (record.negative ? 0x8000_0000 : 0),
      true,
    );
    offset += 4;
    result.set(record.bytes, offset);
    offset += record.bytes.length;
  }
  return result;
}

function encodeElement(value: unknown, context: EncodeContext): WireValue {
  const kind = supportedElementKind(value)!;
  const parent = Reflect.get(Object(value), "_parent");
  if (kind === "rational") {
    return context.encode({
      kind,
      numerator: Reflect.get(Object(value), "_numerator"),
      denominator: Reflect.get(Object(value), "_denominator"),
    });
  }
  if (kind === "residue") {
    return context.encode({
      kind,
      parent,
      value: Reflect.get(Object(value), "_value"),
    });
  }
  if (kind === "polynomial") {
    const base = callMethod(parent, "base_ring");
    const baseKind = parentKind(base);
    const compactPrime = baseKind === "GF"
      ? compactPrimePolynomialNative(value, base)
      : undefined;
    if (compactPrime !== undefined) {
      context.transferable(compactPrime.bytes);
      return context.encode({
        kind,
        parent,
        coefficients: compactPrime.bytes,
        coefficientEncoding: "prime-field-poly-le-v1",
        coefficientWidth: compactPrime.width,
        coefficientCount: compactPrime.count,
      });
    }
    const packedMethod = Reflect.get(Object(value), "_packed_exact_polynomial");
    const packed = ["ZZ", "QQ"].includes(baseKind ?? "") &&
        typeof packedMethod === "function"
      ? invoke(packedMethod, value, [])
      : undefined;
    if (isUint8Array(packed)) {
      context.transferable(packed);
      return context.encode({
        kind,
        parent,
        coefficients: packed,
        coefficientEncoding: baseKind === "ZZ" ? "fmpz-poly-le-v1" : "fmpq-poly-le-v1",
      });
    }
    return context.encode({
      kind,
      parent,
      coefficients: callMethod(value, "coefficients"),
    });
  }
  if (kind === "matrix") {
    const base = callMethod(value, "base_ring");
    const compactIntegers = parentKind(base) === "ZZ"
      ? compactIntegerMatrixNative(value)
      : undefined;
    const compactRationals = parentKind(base) === "QQ"
      ? compactRationalMatrixNative(value)
      : undefined;
    const compactNative = ["GF", "ZMOD"].includes(parentKind(base) ?? "")
      ? compactMatrixNative(value, base)
      : undefined;
    const entries = compactNative === undefined && compactIntegers === undefined &&
      compactRationals === undefined
      ? callMethod(value, "list") as unknown[]
      : undefined;
    const compactResidueEntries = compactNative === undefined && entries !== undefined &&
      ["GF", "ZMOD"].includes(parentKind(base) ?? "")
      ? compactResidues(entries, Reflect.get(Object(base), "_order"))
      : undefined;
    const compact = compactNative ?? (
      compactResidueEntries !== undefined
        ? { ...compactResidueEntries, count: entries!.length }
        : undefined
    );
    const encodedEntries = compactIntegers?.bytes ?? compactRationals?.bytes ??
      compact?.bytes ?? entries;
    if (encodedEntries instanceof Uint8Array) {
      context.transferable(encodedEntries);
    }
    return context.encode({
      kind,
      parent,
      entries: encodedEntries,
      entryEncoding: compactIntegers !== undefined
        ? "fmpz-le-v1"
        : compactRationals !== undefined
          ? "fmpq-le-v1"
          : "",
      entryWidth: compact?.width ?? 0,
      entryCount: compactIntegers?.count ?? compactRationals?.count ??
        compact?.count ?? entries!.length,
    });
  }
  const entries = callMethod(value, "list") as unknown[];
  if (kind === "vector" && parentKind(callMethod(value, "base_ring")) === "QQ") {
    const packed = compactRationals(entries);
    if (packed !== undefined) {
      context.transferable(packed);
      return context.encode({
        kind,
        parent,
        entries: packed,
        entryEncoding: "fmpq-le-v1",
        entryCount: entries.length,
      });
    }
  }
  return context.encode({ kind, parent, entries });
}

function polynomialFromCoefficients(parent: unknown, coefficients: unknown[]): unknown {
  const direct = Reflect.get(Object(parent), "_from_coefficients");
  if (typeof direct === "function") {
    return invoke(direct, parent, [coefficients]);
  }
  const generator = callMethod(parent, "gen");
  let result = callPython(parent, [0]);
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    result = callMethod(result, "_mul_", [generator]);
    result = callMethod(result, "_add_", [callPython(parent, [coefficients[index]])]);
  }
  return result;
}

function unpackExactPolynomial(
  bytes: Uint8Array,
  encoding: unknown,
): unknown[] {
  const rational = encoding === "fmpq-poly-le-v1";
  if (encoding !== "fmpz-poly-le-v1" && !rational) {
    throw new SageSerializationError("exact polynomial encoding is invalid");
  }
  if (bytes.byteLength < 16) {
    throw new SageSerializationError("exact polynomial data is truncated");
  }
  const expectedMagic = rational ? "SJPQ" : "SJPZ";
  for (let index = 0; index < 4; index += 1) {
    if (bytes[index] !== expectedMagic.charCodeAt(index)) {
      throw new SageSerializationError("exact polynomial magic is invalid");
    }
  }
  if (bytes[4] !== 1 || bytes[5] !== 0 || bytes[6] !== 0 || bytes[7] !== 0) {
    throw new SageSerializationError("exact polynomial version is unsupported");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const countValue = view.getBigUint64(8, true);
  if (countValue > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new SageSerializationError("exact polynomial length is too large");
  }
  const count = Number(countValue);
  const partCount = rational ? 2 * count : count;
  if (partCount > Math.floor((bytes.byteLength - 16) / 4)) {
    throw new SageSerializationError("exact polynomial data is truncated");
  }
  let offset = 16;
  function readInteger(): bigint {
    if (offset + 4 > bytes.byteLength) {
      throw new SageSerializationError("exact polynomial integer is truncated");
    }
    const header = view.getUint32(offset, true);
    offset += 4;
    const length = header & 0x7fff_ffff;
    if (offset + length > bytes.byteLength) {
      throw new SageSerializationError("exact polynomial integer is truncated");
    }
    if (length > 0 && bytes[offset + length - 1] === 0) {
      throw new SageSerializationError(
        "exact polynomial integer magnitude is not canonical",
      );
    }
    let magnitude = 0n;
    for (let byte = length - 1; byte >= 0; byte -= 1) {
      magnitude = (magnitude << 8n) | BigInt(bytes[offset + byte]);
    }
    offset += length;
    if ((header & 0x8000_0000) !== 0) {
      if (magnitude === 0n) {
        throw new SageSerializationError("exact polynomial has negative zero");
      }
      return -magnitude;
    }
    return magnitude;
  }
  const coefficients = new Array<unknown>(count);
  const rationalParts = new Array<[bigint, bigint]>(rational ? count : 0);
  function greatestCommonDivisor(left: bigint, right: bigint): bigint {
    left = left < 0n ? -left : left;
    right = right < 0n ? -right : right;
    while (right !== 0n) {
      const remainder = left % right;
      left = right;
      right = remainder;
    }
    return left;
  }
  let finalNumerator = 0n;
  for (let index = 0; index < count; index += 1) {
    const numerator = readInteger();
    finalNumerator = numerator;
    if (!rational) {
      coefficients[index] = numerator;
      continue;
    }
    const denominator = readInteger();
    if (denominator <= 0n) {
      throw new SageSerializationError(
        "exact polynomial denominator is not positive",
      );
    }
    if (greatestCommonDivisor(numerator, denominator) !== 1n) {
      throw new SageSerializationError(
        "exact polynomial rational coefficient is not reduced",
      );
    }
    rationalParts[index] = [numerator, denominator];
  }
  if (count > 0 && finalNumerator === 0n) {
    throw new SageSerializationError(
      "exact polynomial leading coefficient is zero",
    );
  }
  if (offset !== bytes.byteLength) {
    throw new SageSerializationError("exact polynomial data has trailing bytes");
  }
  if (rational) {
    const rationals = Reflect.get(globalThis, "QQ");
    for (let index = 0; index < count; index += 1) {
      coefficients[index] = callPython(rationals, rationalParts[index]);
    }
  }
  return coefficients;
}

function exactPolynomialPayload(bytes: Uint8Array): bigint {
  const buffer = Reflect.get(globalThis, "Buffer");
  const from = Reflect.get(Object(buffer), "from");
  if (typeof from === "function") {
    const copy = invoke(from, buffer, [bytes]);
    callMethod(copy, "reverse");
    const hexadecimal = String(callMethod(copy, "toString", ["hex"]));
    return hexadecimal.length === 0 ? 0n : BigInt(`0x${hexadecimal}`);
  }

  // Generated exact resources are currently Node-only. Keep a portable
  // implementation here so the stable codec does not accidentally depend on
  // Buffer if another host gains the same declared resource capability.
  const hexadecimal = new Array<string>(bytes.byteLength);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    hexadecimal[index] = bytes[bytes.byteLength - index - 1]
      .toString(16).padStart(2, "0");
  }
  const text = hexadecimal.join("");
  return text.length === 0 ? 0n : BigInt(`0x${text}`);
}

function polynomialFromExactResource(
  parent: unknown,
  bytes: Uint8Array,
  encoding: unknown,
): unknown {
  const supports = Reflect.get(
    Object(parent),
    "_supports_exact_polynomial_resource_deserialization",
  );
  const restore = Reflect.get(
    Object(parent),
    "_from_exact_polynomial_serialization",
  );
  if (typeof supports !== "function" || typeof restore !== "function" ||
      !invoke(supports, parent, [encoding])) {
    return undefined;
  }
  try {
    return invoke(restore, parent, [
      exactPolynomialPayload(bytes),
      bytes.byteLength,
      encoding,
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SageSerializationError(message);
  }
}

function unpackResidues(bytes: Uint8Array, width: number, count: number): number[] {
  if (![1, 2, 4].includes(width) || bytes.byteLength !== width * count) {
    throw new SageSerializationError("compact matrix entry buffer is invalid");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Array<number>(count);
  for (let index = 0; index < count; index += 1) {
    entries[index] = width === 1
      ? view.getUint8(index)
      : width === 2
        ? view.getUint16(index * 2, true)
        : view.getUint32(index * 4, true);
  }
  return entries;
}

function unpackPrimePolynomialResidues(
  parent: unknown,
  bytes: Uint8Array,
  widthValue: unknown,
  countValue: unknown,
): number[] {
  if (typeof countValue !== "number" || !Number.isSafeInteger(countValue) ||
      countValue < 0) {
    throw new SageSerializationError("compact polynomial length is invalid");
  }
  if (typeof widthValue !== "number" || !Number.isInteger(widthValue)) {
    throw new SageSerializationError("compact polynomial residue width is invalid");
  }
  const width = widthValue;
  const count = countValue;
  const base = callMethod(parent, "base_ring");
  if (parentKind(base) !== "GF") {
    throw new SageSerializationError(
      "compact polynomial residues require a prime-field parent",
    );
  }
  const modulus = Number(Reflect.get(Object(base), "_order"));
  const expectedWidth = compactResidueWidth(modulus);
  if (expectedWidth === undefined || width !== expectedWidth) {
    throw new SageSerializationError("compact polynomial residue width is noncanonical");
  }
  if (
    count > Math.floor(bytes.byteLength / width) ||
    bytes.byteLength !== count * width
  ) {
    throw new SageSerializationError("compact polynomial coefficient buffer is invalid");
  }
  const values = unpackResidues(bytes, width, count);
  for (const value of values) {
    if (value >= modulus) {
      throw new SageSerializationError("compact polynomial residue is outside its field");
    }
  }
  if (count > 0 && values[count - 1] === 0) {
    throw new SageSerializationError("compact polynomial has a trailing zero coefficient");
  }
  return values;
}

function unpackIntegers(bytes: Uint8Array, count: number): bigint[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Array<bigint>(count);
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    if (bytes.byteLength - offset < 4) {
      throw new SageSerializationError("packed integer matrix is truncated");
    }
    const header = view.getUint32(offset, true);
    offset += 4;
    const length = header & 0x7fff_ffff;
    if (length > bytes.byteLength - offset) {
      throw new SageSerializationError("packed integer matrix is truncated");
    }
    let magnitude = 0n;
    for (let byte = length - 1; byte >= 0; byte -= 1) {
      magnitude = (magnitude << 8n) | BigInt(bytes[offset + byte]);
    }
    entries[index] = (header & 0x8000_0000) === 0 ? magnitude : -magnitude;
    offset += length;
  }
  if (offset !== bytes.byteLength) {
    throw new SageSerializationError("packed integer matrix has trailing data");
  }
  return entries;
}

function unpackRationals(bytes: Uint8Array, count: number): unknown[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Array<unknown>(count);
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    const parts = new Array<bigint>(2);
    for (let part = 0; part < 2; part += 1) {
      if (bytes.byteLength - offset < 4) {
        throw new SageSerializationError("packed rational data is truncated");
      }
      const header = view.getUint32(offset, true);
      offset += 4;
      if (part === 1 && (header & 0x8000_0000) !== 0) {
        throw new SageSerializationError("packed rational denominator is negative");
      }
      const length = header & 0x7fff_ffff;
      if (length > bytes.byteLength - offset) {
        throw new SageSerializationError("packed rational data is truncated");
      }
      let magnitude = 0n;
      for (let byte = length - 1; byte >= 0; byte -= 1) {
        magnitude = (magnitude << 8n) | BigInt(bytes[offset + byte]);
      }
      parts[part] = part === 0 && (header & 0x8000_0000) !== 0
        ? -magnitude
        : magnitude;
      offset += length;
    }
    if (parts[1] === 0n) {
      throw new SageSerializationError("packed rational denominator is zero");
    }
    entries[index] = callPython(Reflect.get(globalThis, "QQ"), parts);
  }
  if (offset !== bytes.byteLength) {
    throw new SageSerializationError("packed rational data has trailing bytes");
  }
  return entries;
}

function decodeElement(payload: WireValue, context: DecodeContext): unknown {
  const data = context.decode(payload) as Record<string, unknown>;
  if (data.kind === "rational") {
    return callPython(Reflect.get(globalThis, "QQ"), [data.numerator, data.denominator]);
  }
  if (data.kind === "residue") return callPython(data.parent, [data.value]);
  if (data.kind === "polynomial") {
    if (
      data.coefficients instanceof Uint8Array &&
      data.coefficientEncoding === "prime-field-poly-le-v1"
    ) {
      return polynomialFromCoefficients(
        data.parent,
        unpackPrimePolynomialResidues(
          data.parent,
          data.coefficients,
          data.coefficientWidth,
          data.coefficientCount,
        ),
      );
    }
    if (data.coefficients instanceof Uint8Array) {
      const direct = polynomialFromExactResource(
        data.parent,
        data.coefficients,
        data.coefficientEncoding,
      );
      if (direct !== undefined) return direct;
    }
    const coefficients = data.coefficients instanceof Uint8Array
      ? unpackExactPolynomial(data.coefficients, data.coefficientEncoding)
      : data.coefficients as unknown[];
    return polynomialFromCoefficients(data.parent, coefficients);
  }
  if (data.kind === "matrix") {
    if (data.entries instanceof Uint8Array) {
      const parent = data.parent;
      if (data.entryEncoding === "fmpz-le-v1") {
        const fromPackedIntegers = Reflect.get(Object(parent), "_from_packed_integers");
        if (typeof fromPackedIntegers === "function") {
          return invoke(fromPackedIntegers, parent, [data.entries]);
        }
        return callPython(parent, [
          unpackIntegers(data.entries, Number(data.entryCount)),
        ]);
      }
      if (data.entryEncoding === "fmpq-le-v1") {
        const fromPackedRationals = Reflect.get(Object(parent), "_from_packed_rationals");
        if (typeof fromPackedRationals === "function") {
          return invoke(fromPackedRationals, parent, [data.entries]);
        }
        return callPython(parent, [
          unpackRationals(data.entries, Number(data.entryCount)),
        ]);
      }
      const fromPacked = Reflect.get(Object(parent), "_from_packed_residues");
      if (typeof fromPacked === "function") {
        return invoke(fromPacked, parent, [
          data.entries,
          Number(data.entryWidth),
        ]);
      }
    }
    const entries = data.entries instanceof Uint8Array
      ? unpackResidues(data.entries, Number(data.entryWidth), Number(data.entryCount))
      : data.entries as unknown[];
    return callPython(data.parent, [entries]);
  }
  if (data.kind === "vector") {
    const entries = data.entries instanceof Uint8Array &&
      data.entryEncoding === "fmpq-le-v1"
      ? unpackRationals(data.entries, Number(data.entryCount))
      : data.entries;
    return callPython(data.parent, [entries]);
  }
  throw new SageSerializationError(`unsupported mathematical element ${String(data.kind)}`);
}

export const sageArithmeticParentCodec: SageCodec = {
  type: "sage.parent",
  version: 1,
  test: (value) => {
    const kind = parentKind(value);
    return ["ZZ", "QQ", "GF", "ZMOD"].includes(kind ?? "") ||
      String(field(construction(value), "kind") ?? "") === "polynomial";
  },
  encode: encodeParent,
  decode: decodeParent,
};

export const sageArithmeticElementCodec: SageCodec = {
  type: "sage.element",
  version: 1,
  test: (value) => ["rational", "residue", "polynomial"].includes(
    supportedElementKind(value) ?? "",
  ),
  encode: encodeElement,
  decode: decodeElement,
};

export const sageLinearAlgebraParentCodec: SageCodec = {
  type: "sage.linear_algebra.parent",
  version: 1,
  test: (value) => ["matrix", "vector"].includes(
    String(field(construction(value), "kind") ?? ""),
  ),
  encode: encodeParent,
  decode: decodeParent,
};

export const sageLinearAlgebraElementCodec: SageCodec = {
  type: "sage.linear_algebra.element",
  version: 1,
  test: (value) => ["matrix", "vector"].includes(
    supportedElementKind(value) ?? "",
  ),
  encode: encodeElement,
  decode: decodeElement,
};
