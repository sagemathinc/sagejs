import { instantiateSageEvaluator } from "../evaluator.mjs";

const evaluatorPromise = instantiateSageEvaluator({
  compiler: new URL("../dist/compiler.js", import.meta.url),
  baselib: new URL("../dist/baselib.js", import.meta.url),
  flint: new URL("../dist/flint-factor.wasm", import.meta.url),
});

self.onmessage = async ({ data }) => {
  if (data.type !== "evaluate") {
    return;
  }
  try {
    const evaluator = await evaluatorPromise;
    const result = await evaluator.evaluate(data.source, {
      onOutput(text) {
        self.postMessage({
          id: data.id,
          type: "output",
          text,
        });
      },
    });
    self.postMessage({
      id: data.id,
      type: "result",
      ok: true,
      result: result.repr,
    });
  } catch (error) {
    self.postMessage({
      id: data.id,
      type: "result",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
