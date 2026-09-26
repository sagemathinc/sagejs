import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { instantiateSageEvaluator } from "../evaluator.mjs";
import { SageSession } from "../kernel.mjs";
import { installNodeWorkerHost } from "../node-worker.mjs";

const artifact = resolve(process.env.SAGEJS_QUADRATIC_WASM_ARTIFACT ||
  fileURLToPath(new URL("../../imaginary-quadratic-core/target/wasm32-wasip1/release/" +
    "sagejs_imaginary_quadratic_core.wasm", import.meta.url)));

function installFileFetch() {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.protocol !== "file:") return original(input, init);
    const method = String(init.method ?? input?.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") return new Response(null, { status: 405 });
    try {
      const bytes = await readFile(fileURLToPath(url));
      return new Response(method === "HEAD" ? null : bytes, {
        status: 200,
        headers: { "content-type": {
          ".wasm": "application/wasm",
          ".json": "application/json",
          ".js": "text/javascript",
          ".mjs": "text/javascript",
        }[extname(url.pathname)] ?? "application/octet-stream" },
      });
    } catch (error) {
      if (error?.code === "ENOENT") return new Response(null, { status: 404 });
      throw error;
    }
  };
  return () => { globalThis.fetch = original; };
}

test("the isolated quadratic reactor serves Sage-mode ideal classes in Wasm", {
  skip: !existsSync(artifact) && "build the standalone quadratic development reactor first",
  timeout: 120_000,
}, async () => {
  installNodeWorkerHost();
  const restoreFetch = installFileFetch();
  let session;
  let evaluator;
  try {
    session = new SageSession();
    const resources = { ...session.resources };
    await session.ready();
    await session.close();
    const bytes = await readFile(artifact);
    const receipt = {
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    evaluator = await instantiateSageEvaluator({
      ...resources,
      classGroup: { artifact: pathToFileURL(artifact), receipt },
    });
    const tiny = await evaluator.evaluate([
      "from sagejs.number_fields import rust_class_group_runtime as rust_runtime",
      "R.<x> = QQ[]",
      "K.<a> = NumberField(x^2-x+6)",
      "G = K.class_group(algorithm='rust')",
      "w = (1+a)/2",
      "I = K.ideal(2, w)",
      "[G.order(), G.invariants(), G.proof_status,",
      " G(G.gen().ideal()).coordinates(), G(I).coordinates(),",
      " K.class_number(algorithm='rust'), K.class_group().algorithm,",
      " 'completeClassMapCorePacked' in rust_runtime.rust_imaginary_result(",
      " K, operation='imaginary-class-group', algorithm='rust')]",
    ].join("\n"));
    assert.equal(tiny.repr,
      "[3, (3,), 'exact-unconditional', (1,), (1,), 3, 'rust', True]");

    const large = await evaluator.evaluate([
      "K.<a> = NumberField(x^2-x+3750000079)",
      "G = K.class_group(algorithm='rust')",
      "I = G.gen(0).ideal()",
      "J = G.gen(1).ideal()",
      "[G.order(), G.invariants(), G.proof_status,",
      " G(I).coordinates(), G(J).coordinates(),",
      " G(I*J).coordinates(), G(2*I).coordinates(),",
      " K.class_number(algorithm='rust')]",
    ].join("\n"));
    assert.equal(large.repr,
      "[33768, (2, 16884), 'exact-unconditional', " +
      "(1, 0), (0, 1), (1, 1), (1, 0), 33768]");
  } finally {
    evaluator?.terminate();
    await session?.close();
    restoreFetch();
  }
});
