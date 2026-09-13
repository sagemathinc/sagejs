/*
 * Host-independent exact integer fallbacks used by the WebAssembly kernel.
 *
 * The desktop backend supplies these operations through FLINT.  Keeping the
 * modest portable implementations here prevents public Sage operations from
 * accidentally depending on a Node-API method merely because the native host
 * has one.  Larger prime-counting inputs retain an explicit capability limit
 * instead of silently rounding through a JavaScript Number.
 */

function factorial(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("factorial input must be a nonnegative safe integer");
  }
  let answer = 1n;
  for (let factor = 2; factor <= value; factor += 1) {
    answer *= BigInt(factor);
  }
  return answer;
}

function binomial(upper, lower) {
  if (
    !Number.isSafeInteger(upper) ||
    !Number.isSafeInteger(lower) ||
    upper < 0 ||
    lower < 0
  ) {
    throw new RangeError("binomial inputs must be nonnegative safe integers");
  }
  if (lower > upper) return 0n;
  lower = Math.min(lower, upper - lower);
  let answer = 1n;
  for (let index = 1; index <= lower; index += 1) {
    answer = (answer * BigInt(upper - lower + index)) / BigInt(index);
  }
  return answer;
}

export function createPortableExactBackend({ primePi, recordCapability = () => {} } = {}) {
  const trace = (
    name,
    ingressBytes,
    egressBytes,
    route = "portable-fallback",
  ) => {
    recordCapability(
      `napi:@sagemath/sagejs-flint:${name}`,
      route,
      {
        executionTarget: route === "receipt-backed-wasm-artifact"
          ? "wasm-artifact"
          : "portable-python",
        ingressBytes,
        egressBytes,
      },
    );
  };
  const backend = {
    binomial(upper, lower) {
      const answer = binomial(upper, lower);
      trace("binomial", 16, 8);
      return answer;
    },
    factorial(value) {
      const answer = factorial(value);
      trace("factorial", 8, 8);
      return answer;
    },
  };
  if (primePi !== undefined) {
    backend.primePi = (value) => {
      const answer = primePi(value);
      trace("primePi", 8, 8, "receipt-backed-wasm-artifact");
      return answer;
    };
  }
  return Object.freeze(backend);
}
