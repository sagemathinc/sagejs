/** Browser-safe direct-ABI oracle used after public evaluator parity executes. */

function relativeError(actual, expected) {
  const scale = Math.max(1, Math.abs(expected));
  return Math.abs(actual - expected) / scale;
}

function checkValues(id, actual, expected, tolerance) {
  if (actual.length !== expected.length) {
    throw new Error(`${id}: expected ${expected.length} values, received ${actual.length}`);
  }
  for (let index = 0; index < actual.length; index += 1) {
    const real = Number(actual[index].real);
    const imaginary = Number(actual[index].imaginary);
    const expectedReal = Number(expected[index][0]);
    const expectedImaginary = Number(expected[index][1]);
    if (
      relativeError(real, expectedReal) > tolerance ||
      relativeError(imaginary, expectedImaginary) > tolerance
    ) {
      throw new Error(
        `${id}[${index}] mismatch: ${real}+${imaginary}i versus ` +
          `${expectedReal}+${expectedImaginary}i, tolerance ${tolerance}`,
      );
    }
  }
}

/**
 * Run the checked direct Wasm transport vectors in a browser realm.
 * Public Sage source from the same vector file is separately run by the
 * evaluator corpus; keeping both catches dispatch and ABI failures distinctly.
 */
export function runAnalyticWasmParity(backend, fixture) {
  const tolerance = fixture.absolute_tolerance;
  const completed = [];
  for (const vector of fixture.vectors) {
    let packet;
    if (vector.id === "riemann-zeta-positive-reals") {
      packet = backend.riemannZetaValuesDetailed(
        vector.points, 0, fixture.precision_bits,
      );
    } else if (vector.id === "quadratic-dirichlet-l-modulus-5") {
      packet = backend.dirichletLValuesDetailed(
        BigInt(vector.modulus),
        BigInt(vector.character_index),
        vector.points,
        0,
        fixture.precision_bits,
      );
    } else if (vector.id === "quadratic-dedekind-zeta-discriminant-5") {
      packet = backend.quadraticDedekindValuesDetailed(
        BigInt(vector.discriminant),
        BigInt(vector.modulus),
        BigInt(vector.character_index),
        vector.points,
        fixture.precision_bits,
      );
    } else {
      throw new Error(`unknown analytic parity vector ${vector.id}`);
    }
    checkValues(vector.id, packet.values, vector.values, tolerance);
    if (packet.values.some((value) => !value.finite)) {
      throw new Error(`${vector.id}: nonfinite Arb/Acb result`);
    }
    completed.push(vector.id);
  }
  return Object.freeze({
    schemaVersion: fixture.schema_version,
    precisionBits: fixture.precision_bits,
    completed: Object.freeze(completed),
  });
}
