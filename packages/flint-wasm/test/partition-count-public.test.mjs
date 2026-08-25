import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { instantiateFlintFactor } from "../index.mjs";
import {
  createSage,
  SageSessionTimeoutError,
} from "../node-kernel.mjs";

const routeId = "ffi:flint:arith_number_of_partitions";
const wasm = await fs.readFile(
  new URL("../dist/flint-factor.wasm", import.meta.url),
);

async function json(relative) {
  return JSON.parse(await fs.readFile(new URL(relative, import.meta.url), "utf8"));
}

function route(instrumentation) {
  return instrumentation.routes.find(
    (candidate) => candidate.capability_id === routeId,
  );
}

test("direct FLINT Wasm computes the millionth partition count", async () => {
  const traces = [];
  const flint = await instantiateFlintFactor(wasm, {
    recordCapability: (...record) => traces.push(record),
  });
  assert.ok(
    flint.__sagejs_ffi_manifest__.functions.includes(
      "arith_number_of_partitions",
    ),
  );
  const value = flint.numberOfPartitions(1_000_000n);
  assert.equal(String(value).length, 1108);
  assert.equal(value % 1_000_000_000_000n, 467_104_673_818n);
  assert.deepEqual(
    traces.filter(([id]) => id === routeId),
    [[
      routeId,
      "receipt-backed-wasm-artifact",
      {
        executionTarget: "wasm-artifact",
        ingressBytes: 0,
        egressBytes: 0,
      },
    ]],
  );
  assert.throws(() => flint.numberOfPartitions(-1n), /declared uint64 value/);
  assert.throws(
    () => flint.numberOfPartitions(1n << 64n),
    /declared uint64 value/,
  );
});

test("public partitions use one authenticated Wasm count boundary", async () => {
  const sage = await createSage();
  try {
    const result = await sage.evaluate([
      "value = number_of_partitions(10^6)",
      "cls = Partitions(100, max_part=20)",
      "part = cls.unrank(12345)",
      "print(len(str(value)), value % 10^12)",
      "print(cls.cardinality(), cls.rank(part), part)",
    ].join("\n"));
    assert.equal(
      result.stdout,
      "1108 467104673818\n" +
        "97132873 12345 [20, 20, 20, 12, 11, 5, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]\n",
    );
    assert.deepEqual(route(result.instrumentation), {
      capability_id: routeId,
      selected_route: "receipt-backed-wasm-artifact",
      execution_target: "wasm-artifact",
      call_count: 1,
      ingress_bytes: 0,
      egress_bytes: 0,
    });
    assert.equal(result.instrumentation.boundary_crossings, 1);
  } finally {
    await sage.close();
  }
});

test("partition table limits and interruption leave a reusable worker", async () => {
  const sage = await createSage();
  try {
    const limited = await sage.evaluate([
      "cls = Partitions(10000)",
      "try:",
      "    cls.unrank(1)",
      "except RuntimeError as error:",
      "    print(str(error), cls._table is None)",
    ].join("\n"));
    assert.equal(
      limited.stdout,
      "partition ranking table requires 50015001 cells, exceeding the reviewed maximum 1000000 True\n",
    );

    await assert.rejects(
      sage.evaluate(
        "cls=Partitions(1400)\ncls.unrank(cls.cardinality() // 2)",
        { timeout: 5 },
      ),
      SageSessionTimeoutError,
    );
    const recovered = await sage.evaluate("number_of_partitions(100)");
    assert.equal(recovered.repr, "190569292");
    assert.equal(route(recovered.instrumentation)?.selected_route,
      "receipt-backed-wasm-artifact");
  } finally {
    await sage.close();
  }
});

test("release policy cannot silently lose the fast partition route", async () => {
  const [capabilities, production, corpus, performance, budget] =
    await Promise.all([
      json("../../../architecture/wasm-capabilities.json"),
      json("../release/production-capabilities.json"),
      json("../../../test/browser-wasm-parity-corpus.json"),
      json("../../../bench/browser-wasm-performance-cases.json"),
      json("../../../bench/browser-wasm-budget.json"),
    ]);
  const capability = capabilities.capabilities.find(({ id }) => id === routeId);
  assert.equal(capability.status, "available");
  assert.equal(capability.disposition, "generated-wasm");
  assert.equal(capability.wasm_closure.status, "included");
  assert.ok(production.modules.flint.capabilities.includes(routeId));

  const required = { id: routeId, route: "receipt-backed-wasm-artifact" };
  const parityCase = corpus.cases.find(
    ({ id }) => id === "partition-count-and-ranking",
  );
  const performanceCase = performance.cases.find(
    ({ id }) => id === "partition-count-1000000",
  );
  assert.equal(parityCase.tier, "release");
  assert.deepEqual(parityCase.requires, [required]);
  assert.deepEqual(performanceCase.requires, [required]);
  for (const runtime of ["node-native", "chromium", "firefox", "webkit"]) {
    assert.ok(
      Number.isFinite(
        budget.performance_baseline[runtime]
          .operations[performanceCase.id].warm_ms.median,
      ),
      `missing partition performance baseline for ${runtime}`,
    );
  }
  for (const engine of ["chromium", "firefox", "webkit"]) {
    assert.ok(
      Number.isFinite(
        budget.native_ratio_baseline[engine]
          .operations[performanceCase.id].warm_median_ratio,
      ),
      `missing partition native ratio for ${engine}`,
    );
  }
});
