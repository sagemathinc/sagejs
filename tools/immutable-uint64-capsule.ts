/**
 * Opaque immutable uint64 storage shared by mathematical Python and native
 * kernel wrappers.
 *
 * The public capsule and each short-lived lease are empty frozen objects. The
 * owned typed storage and its exact binding live only in module-private
 * WeakMaps, so Python attribute/index access cannot reveal or mutate them.
 */

type CapsuleObject = object;

interface CapsuleBinding {
  owner: object;
  model: string;
  format: string;
  count: number;
}

interface CapsuleState extends CapsuleBinding {
  values: BigUint64Array;
}

const capsules = new WeakMap<CapsuleObject, CapsuleState>();
const leases = new WeakMap<CapsuleObject, CapsuleState>();
const ownerCapsules = new WeakMap<object, CapsuleObject>();
const MAX_CAPSULE_BYTES = 4 * 1024 * 1024 * 1024;
const UINT64_BYTES = 8;

function opaqueObject(): CapsuleObject {
  return Object.freeze(Object.create(null));
}

function checkedOwner(owner: unknown): object {
  if (
    (typeof owner !== "object" || owner === null) &&
    typeof owner !== "function"
  ) {
    throw new TypeError("immutable uint64 capsule owner must be an object");
  }
  return owner;
}

function checkedLabel(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`immutable uint64 capsule ${name} must be nonempty`);
  }
  return value;
}

function checkedCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new RangeError(
      "immutable uint64 capsule count must be a nonnegative safe integer",
    );
  }
  return Number(value);
}

function checkedPositiveCount(value: unknown, name: string): number {
  const count = checkedCount(value);
  if (count === 0) {
    throw new RangeError(`immutable uint64 capsule ${name} must be positive`);
  }
  return count;
}

function checkedOwnerTuple(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || !Object.isFrozen(value)) {
    throw new TypeError(
      "immutable uint64 capsule source owners must be a frozen tuple",
    );
  }
  return value;
}

function ownedValues(source: unknown): BigUint64Array {
  if (
    source === null ||
    (typeof source !== "object" && typeof source !== "function")
  ) {
    throw new TypeError("immutable uint64 capsule source must be a sequence");
  }
  const length = Number(Reflect.get(source, "length"));
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new TypeError(
      "immutable uint64 capsule source must have a safe nonnegative length",
    );
  }
  const result = new BigUint64Array(length);
  for (let index = 0; index < length; index += 1) {
    const item = Reflect.get(source, String(index));
    const value = typeof item === "bigint"
      ? item
      : Number.isSafeInteger(item)
        ? BigInt(item)
        : -1n;
    if (value < 0n || value > 0xffffffffffffffffn) {
      throw new RangeError(
        "immutable uint64 capsule value is outside unsigned 64-bit",
      );
    }
    result[index] = value;
  }
  return result;
}

function checkedBinding(
  owner: unknown,
  model: unknown,
  format: unknown,
  count: unknown,
): CapsuleBinding {
  return {
    owner: checkedOwner(owner),
    model: checkedLabel(model, "model"),
    format: checkedLabel(format, "format"),
    count: checkedCount(count),
  };
}

function stateFor(
  capsule: unknown,
  owner: unknown,
  model: unknown,
  format: unknown,
  count: unknown,
): CapsuleState {
  if (typeof capsule !== "object" || capsule === null) {
    throw new TypeError("value is not an immutable uint64 capsule");
  }
  const state = capsules.get(capsule);
  if (state === undefined) {
    throw new TypeError("value is not an immutable uint64 capsule");
  }
  if (ownerCapsules.get(state.owner) !== capsule) {
    throw new TypeError(
      "immutable uint64 capsule is not registered to its owner",
    );
  }
  const expected = checkedBinding(owner, model, format, count);
  if (
    state.owner !== expected.owner ||
    state.model !== expected.model ||
    state.format !== expected.format ||
    state.count !== expected.count
  ) {
    throw new RangeError("immutable uint64 capsule binding mismatch");
  }
  return state;
}

function stateForOwner(
  owner: unknown,
  model: string,
  format: string,
  count: number,
  itemWords: number,
): CapsuleState {
  const checked = checkedOwner(owner);
  const capsule = ownerCapsules.get(checked);
  if (capsule === undefined) {
    throw new RangeError(
      "immutable uint64 capsule source owner is not registered",
    );
  }
  const state = capsules.get(capsule);
  if (
    state === undefined ||
    state.owner !== checked ||
    ownerCapsules.get(checked) !== capsule
  ) {
    throw new TypeError(
      "immutable uint64 capsule source registry identity mismatch",
    );
  }
  if (
    state.model !== model ||
    state.format !== format ||
    state.count !== count
  ) {
    throw new RangeError("immutable uint64 capsule source binding mismatch");
  }
  if (state.values.length !== itemWords) {
    throw new RangeError(
      "immutable uint64 capsule source physical word count mismatch",
    );
  }
  return state;
}

export function createImmutableUInt64Capsule(
  source: unknown,
  owner: unknown,
  model: unknown,
  format: unknown,
  count: unknown,
): CapsuleObject {
  const binding = checkedBinding(owner, model, format, count);
  if (ownerCapsules.has(binding.owner)) {
    throw new RangeError("immutable uint64 capsule owner is already registered");
  }
  const capsule = opaqueObject();
  // Reserve the owner before inspecting an arbitrary source sequence. This
  // makes creation write-once even if a source getter reenters this boundary.
  ownerCapsules.set(binding.owner, capsule);
  try {
    capsules.set(capsule, { ...binding, values: ownedValues(source) });
    return capsule;
  } catch (error) {
    if (ownerCapsules.get(binding.owner) === capsule) {
      ownerCapsules.delete(binding.owner);
    }
    throw error;
  }
}

export function authorizeImmutableUInt64Capsule(
  capsule: unknown,
  owner: unknown,
  model: unknown,
  format: unknown,
  count: unknown,
): CapsuleObject {
  const state = stateFor(capsule, owner, model, format, count);
  const lease = opaqueObject();
  leases.set(lease, state);
  return lease;
}

export function copyImmutableUInt64Capsule(
  capsule: unknown,
  owner: unknown,
  model: unknown,
  format: unknown,
  count: unknown,
): BigUint64Array {
  return new BigUint64Array(
    stateFor(capsule, owner, model, format, count).values,
  );
}

/**
 * Concatenate privately registered capsules into one new opaque capsule.
 *
 * The destination owner is reserved before the source tuple is inspected, so
 * getters or proxies cannot reenter and publish a competing destination. The
 * reservation is removed on every failure before a capsule escapes.
 */
export function gatherImmutableUInt64Capsules(
  destinationOwner: unknown,
  sourceOwners: unknown,
  sourceModel: unknown,
  sourceFormat: unknown,
  sourceCount: unknown,
  itemWords: unknown,
  destinationModel: unknown,
  destinationFormat: unknown,
  destinationCount: unknown,
): CapsuleObject {
  const destination = checkedOwner(destinationOwner);
  const expectedSourceModel = checkedLabel(sourceModel, "source model");
  const expectedSourceFormat = checkedLabel(sourceFormat, "source format");
  const expectedSourceCount = checkedCount(sourceCount);
  const wordsPerItem = checkedPositiveCount(itemWords, "item word count");
  const binding = checkedBinding(
    destination,
    destinationModel,
    destinationFormat,
    destinationCount,
  );
  if (ownerCapsules.has(destination)) {
    throw new RangeError("immutable uint64 capsule owner is already registered");
  }

  const capsule = opaqueObject();
  ownerCapsules.set(destination, capsule);
  try {
    const owners = checkedOwnerTuple(sourceOwners);
    if (owners.length !== binding.count) {
      throw new RangeError(
        "immutable uint64 capsule destination count does not match source owners",
      );
    }
    if (
      binding.count > Math.floor(MAX_CAPSULE_BYTES / UINT64_BYTES / wordsPerItem)
    ) {
      throw new RangeError(
        "immutable uint64 capsule gather exceeds the 4 GiB runtime limit",
      );
    }
    const totalWords = binding.count * wordsPerItem;
    if (!Number.isSafeInteger(totalWords)) {
      throw new RangeError(
        "immutable uint64 capsule gathered word count is not a safe integer",
      );
    }
    let values: BigUint64Array;
    try {
      values = new BigUint64Array(totalWords);
    } catch (error) {
      if (error instanceof RangeError) {
        throw new RangeError(
          "immutable uint64 capsule gather allocation failed",
        );
      }
      throw error;
    }
    for (let index = 0; index < binding.count; index += 1) {
      const state = stateForOwner(
        Reflect.get(owners, String(index)),
        expectedSourceModel,
        expectedSourceFormat,
        expectedSourceCount,
        wordsPerItem,
      );
      values.set(state.values, index * wordsPerItem);
    }
    capsules.set(capsule, { ...binding, values });
    return capsule;
  } catch (error) {
    if (ownerCapsules.get(destination) === capsule) {
      ownerCapsules.delete(destination);
    }
    throw error;
  }
}

/** Private capability passed directly to authenticated generated wrappers. */
function borrowImmutableUInt64Lease(
  lease: unknown,
): BigUint64Array | null {
  if (typeof lease !== "object" || lease === null) return null;
  return leases.get(lease)?.values ?? null;
}

export function configureImmutableUInt64KernelWrapper(
  wrapper: unknown,
): unknown {
  if (wrapper === null || typeof wrapper !== "object") return wrapper;
  const configure = Reflect.get(
    wrapper,
    "__sagejsConfigureImmutableUInt64Capsules",
  );
  if (typeof configure === "function") {
    Reflect.apply(configure, wrapper, [borrowImmutableUInt64Lease]);
  }
  return wrapper;
}

/** Install only capsule creation/binding operations, never the borrow key. */
export function installImmutableUInt64CapsuleRuntime(): void {
  Reflect.set(
    globalThis,
    "__sagejs_create_immutable_uint64_capsule__",
    createImmutableUInt64Capsule,
  );
  Reflect.set(
    globalThis,
    "__sagejs_authorize_immutable_uint64_capsule__",
    authorizeImmutableUInt64Capsule,
  );
  Reflect.set(
    globalThis,
    "__sagejs_copy_immutable_uint64_capsule__",
    copyImmutableUInt64Capsule,
  );
  Reflect.set(
    globalThis,
    "__sagejs_gather_immutable_uint64_capsules__",
    gatherImmutableUInt64Capsules,
  );
}
