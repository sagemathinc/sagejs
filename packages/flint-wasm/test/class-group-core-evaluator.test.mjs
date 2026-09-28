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

const artifact = resolve(process.env.SAGEJS_CLASS_GROUP_WASM_ARTIFACT ||
  fileURLToPath(new URL("../../class-groups/dist/class-group-core.wasm", import.meta.url)));

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

test("the product Wasm core serves verified lazy quadratic groups through Sage.js", {
  skip: !existsSync(artifact) && "build the class-group Wasm reactor first",
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
    evaluator = await instantiateSageEvaluator({
      ...resources,
      classGroup: {
        artifact: pathToFileURL(artifact),
        receipt: {
          bytes: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      },
    });
    const tiny = await evaluator.evaluate([
      "R.<x> = QQ[]",
      "K.<a> = NumberField(x^2 + 23)",
      "G = K.class_group(algorithm='rust')",
      "I = G.gen().ideal()",
      "[G.order(), G.invariants(), G.proof_status,",
      " G(I).coordinates(), G(I*I).coordinates(),",
      " len(G.certificate['reducedForms'])]",
    ].join("\n"));
    assert.equal(tiny.repr, "[3, (3,), 'exact-unconditional', (1,), (2,), 3]");

    const large = await evaluator.evaluate([
      "K.<a> = NumberField(x^2-x+3750000079)",
      "G = K.class_group(algorithm='rust')",
      "I, J = [generator.ideal() for generator in G.gens()]",
      "[G.order(), G.invariants(), G(I*J).coordinates(),",
      " len(G.certificate['reducedForms'])]",
    ].join("\n"));
    assert.equal(large.repr, "[33768, (2, 16884), (1, 1), 33768]");
  } finally {
    evaluator?.terminate();
    await session?.close();
    restoreFetch();
  }
});
