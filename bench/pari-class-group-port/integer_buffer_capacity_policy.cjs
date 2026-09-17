"use strict";

// Host-side policy for dense packed IntegerBuffer owners.  The native
// compiler publishes transitive buffer effects on every compiled entry.  A
// read-only owner can therefore use exactly the width of its prepared input;
// only owners in `effects.externalWrites` need arithmetic headroom.

function integerWordLength(value) {
  let magnitude = BigInt(value);
  if (magnitude < 0n) magnitude = -magnitude;
  return magnitude === 0n ? 1 : Math.ceil(magnitude.toString(2).length / 64);
}

function inputWordCapacity(source) {
  let words = 1;
  for (const value of source) words = Math.max(words, integerWordLength(value));
  return words;
}

function nextPowerOfTwo(value) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError("positive safe integer required");
  let result = 1;
  while (result < value) result *= 2;
  if (!Number.isSafeInteger(result)) throw new RangeError("capacity is too large");
  return result;
}

function precisionWordCapacity(precisionBits, expansionFactor) {
  if (!Number.isSafeInteger(precisionBits) || precisionBits <= 0 ||
      !Number.isSafeInteger(expansionFactor) || expansionFactor <= 0)
    throw new RangeError("positive precision and expansion factor required");
  return nextPowerOfTwo(Math.ceil(precisionBits * expansionFactor / 64));
}

function planIntegerBufferCapacities({
  entry,
  names,
  input,
  mutableWordCapacity,
  mutableMinimumWords = {},
  maximumBytes = Number.MAX_SAFE_INTEGER,
}) {
  if (!entry || !entry.effects || !Array.isArray(entry.effects.externalWrites))
    throw new TypeError("compiled entry must publish externalWrites effects");
  if (!Number.isSafeInteger(mutableWordCapacity) || mutableWordCapacity <= 0)
    throw new RangeError("positive mutable word capacity required");
  const writes = new Set(entry.effects.externalWrites);
  const capacities = {};
  const mutability = {};
  let bytes = 0;
  for (const [name, kind] of names) {
    if (kind !== "IntegerBuffer") continue;
    const source = input[name];
    if (!Array.isArray(source)) throw new TypeError(`missing IntegerBuffer input: ${name}`);
    const inputWords = inputWordCapacity(source);
    const mutable = writes.has(name);
    const declared = Object.hasOwn(mutableMinimumWords, name)
      ? mutableMinimumWords[name] : mutableWordCapacity;
    if (!Number.isSafeInteger(declared) || declared <= 0)
      throw new RangeError(`invalid mutable capacity for ${name}`);
    const words = mutable ? Math.max(inputWords, declared) : inputWords;
    const ownerBytes = source.length * (4 + 8 * words);
    if (!Number.isSafeInteger(ownerBytes) || bytes > maximumBytes - ownerBytes)
      throw new RangeError("IntegerBuffer owner plan exceeds its byte budget");
    capacities[name] = words;
    mutability[name] = mutable ? "mutable" : "read-only";
    bytes += ownerBytes;
  }
  return Object.freeze({
    capacities: Object.freeze(capacities),
    mutability: Object.freeze(mutability),
    bytes,
  });
}

function allocateIntegerBuffer(entry, source, wordCapacity) {
  return entry.createIntegerBuffer(
    source.length,
    wordCapacity,
    source.map(BigInt),
  );
}

module.exports = {
  allocateIntegerBuffer,
  inputWordCapacity,
  integerWordLength,
  nextPowerOfTwo,
  planIntegerBufferCapacities,
  precisionWordCapacity,
};
