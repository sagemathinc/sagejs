import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";
import zlib from "node:zlib";

import {
  conwayDataReceipt,
  createLazyAuthenticatedConwayData,
  fetchAuthenticatedConwayData,
} from "../conway-data.mjs";
import { NodeWebWorker } from "../node-worker.mjs";

const tableUrl = new URL(
  "../../../src/lib/conway_polynomials/conway_polynomials.json",
  import.meta.url,
);
const tableBytes = await fs.readFile(tableUrl);

function response(bytes = tableBytes, status = 200) {
  return new Response(bytes, {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("authenticates and materializes the packaged Conway table once", async () => {
  let fetches = 0;
  let materializations = 0;
  const resource = await fetchAuthenticatedConwayData("packaged://conway", {
    fetchImpl: async () => {
      fetches += 1;
      return response();
    },
    subtle: webcrypto.subtle,
  });
  assert.deepEqual(resource.status(), {
    authenticated: true,
    materialized: false,
    materializations: 0,
  });
  const materialize = (source) => {
    materializations += 1;
    return JSON.parse(source);
  };
  const filename = conwayDataReceipt.virtualPath;
  const first = resource.loadFile(filename, materialize);
  const second = resource.loadFile(filename, materialize);
  assert.strictEqual(second, first);
  assert.deepEqual(first[3][4], [2, 0, 0, 2, 1]);
  assert.equal(fetches, 1);
  assert.equal(materializations, 1);
  assert.deepEqual(resource.status(), {
    authenticated: true,
    materialized: true,
    materializations: 1,
  });
  assert.throws(
    () => resource.loadFile("/tmp/conway_polynomials.json", materialize),
    /packaged Conway data does not provide/,
  );
});

test("defers the authenticated asset fetch until the synchronous first lookup", async () => {
  const resource = createLazyAuthenticatedConwayData(tableUrl, {
    WorkerConstructor: NodeWebWorker,
  });
  await resource.ready;
  assert.deepEqual(resource.status(), {
    authenticated: false,
    materialized: false,
    materializations: 0,
  });
  let materializations = 0;
  const materialize = (source) => {
    materializations += 1;
    return JSON.parse(source);
  };
  const first = resource.loadFile(conwayDataReceipt.virtualPath, materialize);
  const second = resource.loadFile(conwayDataReceipt.virtualPath, materialize);
  assert.strictEqual(first, second);
  assert.deepEqual(first[3][4], [2, 0, 0, 2, 1]);
  assert.equal(materializations, 1);
  assert.deepEqual(resource.status(), {
    authenticated: true,
    materialized: true,
    materializations: 1,
  });
});

test("uses an authenticated eager fallback without shared-memory workers", async () => {
  const resource = createLazyAuthenticatedConwayData("packaged://fallback", {
    WorkerConstructor: null,
    fetchImpl: async () => response(),
    subtle: webcrypto.subtle,
  });
  await resource.ready;
  assert.deepEqual(resource.status(), {
    authenticated: true,
    materialized: false,
    materializations: 0,
  });
  assert.deepEqual(
    resource.loadFile(conwayDataReceipt.virtualPath, JSON.parse)[3][4],
    [2, 0, 0, 2, 1],
  );
});

test("fails closed on Conway data mutation and oversized input", async () => {
  const mutated = Buffer.from(tableBytes);
  mutated[mutated.length - 2] ^= 1;
  await assert.rejects(
    fetchAuthenticatedConwayData("packaged://mutated", {
      fetchImpl: async () => response(mutated),
      subtle: webcrypto.subtle,
    }),
    /SHA-256 differs from its packaged receipt/,
  );
  await assert.rejects(
    fetchAuthenticatedConwayData("packaged://oversized", {
      fetchImpl: async () => response(new Uint8Array(1_200_001)),
      subtle: webcrypto.subtle,
    }),
    /exceeds its 1200000-byte limit/,
  );
});

test("records a bounded compressed artifact delta", () => {
  const gzipBytes = zlib.gzipSync(tableBytes, { level: 9 }).byteLength;
  const brotliBytes = zlib.brotliCompressSync(tableBytes, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  }).byteLength;
  assert.deepEqual(conwayDataReceipt, {
    schema: "sagejs.conway-table-resource/v1",
    path: "src/lib/conway_polynomials/conway_polynomials.json",
    virtualPath:
      "/__sagejs_lazy_modules__/conway_polynomials/conway_polynomials.json",
    bytes: 1_114_459,
    maximumBytes: 1_200_000,
    sha256: "43a555093e65ac1eed877c7bb79e6e8d44ad63285dc52fb227e64e2e7aa298ea",
  });
  assert.deepEqual(
    { rawBytes: tableBytes.byteLength, gzipBytes, brotliBytes },
    { rawBytes: 1_114_459, gzipBytes: 213_599, brotliBytes: 156_326 },
  );
});
