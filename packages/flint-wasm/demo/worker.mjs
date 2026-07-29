import {
  formatFactorization,
  instantiateFlintFactor,
} from "../index.mjs";

const flintPromise = instantiateFlintFactor(
  new URL("../dist/flint-factor.wasm", import.meta.url),
);

self.onmessage = async ({ data }) => {
  if (data.type !== "factor") {
    return;
  }
  try {
    const flint = await flintPromise;
    const result = flint.factor(data.value);
    self.postMessage({
      id: data.id,
      ok: true,
      result: formatFactorization(result),
    });
  } catch (error) {
    self.postMessage({
      id: data.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
