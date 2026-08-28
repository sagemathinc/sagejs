/** Stable identities owned by the fixed-extension optimizer plugin. */
export const FIXED_EXTENSION_REGION_PASS = "math.fixed-extension-region.v1";
export const FIXED_EXTENSION_DOMAIN = "fixed-extension";
export const FIXED_EXTENSION_LOWERING = "v8.fixed-extension-loop.v1";
export const FIXED_EXTENSION_VERIFIER = "verify.fixed-extension-plan.v1";
export const FIXED_EXTENSION_CONSTRUCTION_CONTEXT =
  "finite-field-extension-construction-context.v1";
export const FIXED_EXTENSION_CONSTRUCTION_CONTEXT_PROPERTY =
  "_machineExtensionImmutableContext";
export const FIXED_EXTENSION_MODULUS_IDENTITY_AUTHENTICATION =
  "construction-time-modulus-identity.v1";
export const FIXED_EXTENSION_CONTEXT_RUNTIME_HELPER =
  "runtime.machine_extension_context_matches";
export const FIXED_EXTENSION_CONTEXT_INTRINSIC =
  "ρσ_machine_extension_context_matches";

export type FixedExtensionDegree = 2 | 3 | 4;

export const FIXED_EXTENSION_DEGREES: readonly FixedExtensionDegree[] =
  Object.freeze([2, 3, 4] as const);

// This is the reviewed runtime representation boundary currently established
// by finite_fields.py and the machine-field entry guard.  The mathematical
// Number-exactness ceilings below are substantially larger; retaining the
// narrower runtime ceiling makes admission agree with the same-source fallback.
export const FIXED_EXTENSION_RUNTIME_MAX_PRIME = 200_000;
export const FIXED_EXTENSION_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

export interface FixedExtensionExactnessProof {
  readonly degree: FixedExtensionDegree;
  readonly coefficientMinimum: 0;
  readonly coefficientMaximum: number;
  readonly convolutionTermCount: number;
  readonly reductionCorrectionCount: number;
  readonly exactIntermediateMaximum: number;
  readonly theoreticalMaximumPrime: number;
  readonly admittedMaximumPrime: number;
  readonly derivation: string;
}

function integerSquareRoot(value: bigint): bigint {
  if (value < 0n) throw new RangeError("integer square root requires a nonnegative value");
  if (value < 2n) return value;
  let current = 1n << (BigInt(value.toString(2).length) + 1n) / 2n;
  while (true) {
    const next = (current + value / current) / 2n;
    if (next >= current) return current;
    current = next;
  }
}

/**
 * Return the largest modulus whose worst emitted multiplication intermediate
 * is an exact JavaScript `Number` for this degree.
 *
 * Every input and modulus coefficient is canonical in `[0, p - 1]`.  The
 * unreduced coefficient with the most convolution terms is therefore bounded
 * by `degree * (p - 1)^2`.  Reduction products and add/subtract temporaries are
 * no larger for `degree >= 2` and `p >= 2`.
 */
export function theoreticalMaximumPrime(
  degree: FixedExtensionDegree,
): number {
  const safe = BigInt(Number.MAX_SAFE_INTEGER);
  return Number(integerSquareRoot(safe / BigInt(degree)) + 1n);
}

export function exactIntermediateMaximum(
  degree: FixedExtensionDegree,
  prime: number,
): number {
  if (!FIXED_EXTENSION_DEGREES.includes(degree) ||
      !Number.isSafeInteger(prime) || prime < 2) {
    throw new RangeError("invalid fixed-extension exactness inputs");
  }
  const width = BigInt(prime - 1);
  const maximum = BigInt(degree) * width * width;
  if (maximum > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("fixed-extension intermediate exceeds exact Number range");
  }
  return Number(maximum);
}

export function fixedExtensionExactnessProof(
  degree: FixedExtensionDegree,
): FixedExtensionExactnessProof {
  const admittedMaximumPrime = Math.min(
    FIXED_EXTENSION_RUNTIME_MAX_PRIME,
    theoreticalMaximumPrime(degree),
  );
  return Object.freeze({
    degree,
    coefficientMinimum: 0,
    coefficientMaximum: admittedMaximumPrime - 1,
    convolutionTermCount: degree,
    reductionCorrectionCount: degree * (degree - 1),
    exactIntermediateMaximum: exactIntermediateMaximum(
      degree,
      admittedMaximumPrime,
    ),
    theoreticalMaximumPrime: theoreticalMaximumPrime(degree),
    admittedMaximumPrime,
    derivation: "degree * (prime - 1)^2 <= Number.MAX_SAFE_INTEGER",
  });
}

export const FIXED_EXTENSION_EXACTNESS_PROOFS: readonly FixedExtensionExactnessProof[] =
  Object.freeze(FIXED_EXTENSION_DEGREES.map(fixedExtensionExactnessProof));

interface FixedExtensionConstructionContext {
  readonly id: string;
  readonly degree: unknown;
  readonly prime: unknown;
  readonly sourceModulusCoefficients: unknown;
  readonly machineModulusCoefficients: unknown;
}

interface PreparedFixedExtensionContext {
  readonly degree: unknown;
  readonly modulus: unknown;
  readonly modulusCoefficients: unknown;
  readonly constructionContext: unknown;
  readonly modulusIdentityAuthentication: unknown;
}

/**
 * Reference predicate for the shared runtime guard interface.
 *
 * The integration layer mirrors this check inside
 * `ρσ_prepare_machine_field_region`.  In particular, a frozen/branded tuple
 * with the right width is not enough: both mutable parent mirrors must still
 * be the exact objects captured in a non-replaceable construction context.
 */
export function authenticatesFixedExtensionConstructionContext(
  parent: Record<string, any>,
  prepared: PreparedFixedExtensionContext,
): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(
    parent,
    FIXED_EXTENSION_CONSTRUCTION_CONTEXT_PROPERTY,
  );
  const context = descriptor?.value as
    FixedExtensionConstructionContext | undefined;
  return descriptor !== undefined &&
    "value" in descriptor && descriptor.writable === false &&
    descriptor.configurable === false &&
    context !== undefined && context !== null && Object.isFrozen(context) &&
    context.id === FIXED_EXTENSION_CONSTRUCTION_CONTEXT &&
    context.degree === prepared.degree && context.prime === prepared.modulus &&
    context.sourceModulusCoefficients === parent._modulusCoefficients &&
    context.machineModulusCoefficients ===
      parent._machineExtensionModulusCoefficients &&
    context.machineModulusCoefficients === prepared.modulusCoefficients &&
    Object.isFrozen(context.sourceModulusCoefficients) &&
    Object.isFrozen(context.machineModulusCoefficients) &&
    prepared.constructionContext === context &&
    prepared.modulusIdentityAuthentication ===
      FIXED_EXTENSION_MODULUS_IDENTITY_AUTHENTICATION;
}
