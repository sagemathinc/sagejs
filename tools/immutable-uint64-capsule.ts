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
}
