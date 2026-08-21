import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITY_ROUTES,
  buildProductionCapabilityRoutes,
  resolveCapabilityRequirements,
} from "./browser-wasm-support.mjs";

const HASH = "a".repeat(64);

function manifest(capabilities = []) {
  return { schema: "sagejs.wasm-production-artifact/v1", capabilities };
}

function report(capabilities = []) {
  return { schema: "sagejs.wasm-capability-report/v1", capabilities };
}

test("capability routes retain exact reviewed provenance", () => {
  const routes = buildProductionCapabilityRoutes(
    manifest([{
      id: "ffi:flint:demo",
      module: "flint",
      artifact: "flint.wasm",
      artifactSha256: HASH,
    }]),
    report([
      {
        id: "ffi:flint:demo",
        status: "available",
        disposition: "generated-wasm",
        wasm_module: "flint",
      },
      {
        id: "runtime:demo",
        status: "available",
        disposition: "portable-fallback",
        wasm_module: "host-runtime",
      },
      {
        id: "fallback:demo",
        status: "fallback",
        disposition: "portable-fallback",
        wasm_module: "sage-runtime",
      },
    ]),
  );
  const resolution = resolveCapabilityRequirements([
    { id: "ffi:flint:demo", route: CAPABILITY_ROUTES.WASM_ARTIFACT },
    { id: "runtime:demo", route: CAPABILITY_ROUTES.SHARED_RUNTIME_JS },
    { id: "fallback:demo", route: CAPABILITY_ROUTES.PORTABLE_FALLBACK },
  ], routes);
  assert.deepEqual(resolution.missing, []);
  assert.deepEqual(
    resolution.selected.map(({ route, provenance }) => [route, provenance]),
    [
      [CAPABILITY_ROUTES.WASM_ARTIFACT, "production-artifact-manifest"],
      [CAPABILITY_ROUTES.SHARED_RUNTIME_JS, "reviewed-public-capability-report"],
      [CAPABILITY_ROUTES.PORTABLE_FALLBACK, "reviewed-public-capability-report"],
    ],
  );
});

test("a report fallback cannot satisfy an artifact-required workflow", () => {
  const routes = buildProductionCapabilityRoutes(
    manifest(),
    report([{
      id: "analytic:demo",
      status: "fallback",
      disposition: "portable-fallback",
      wasm_module: "sage-runtime",
    }]),
  );
  const resolution = resolveCapabilityRequirements([
    { id: "analytic:demo", route: CAPABILITY_ROUTES.WASM_ARTIFACT },
  ], routes);
  assert.deepEqual(resolution.selected, []);
  assert.deepEqual(resolution.missing, [{
    id: "analytic:demo",
    route: CAPABILITY_ROUTES.WASM_ARTIFACT,
    available_routes: [CAPABILITY_ROUTES.PORTABLE_FALLBACK],
  }]);
});

test("report availability cannot manufacture artifact provenance", () => {
  const routes = buildProductionCapabilityRoutes(
    manifest(),
    report([{
      id: "ffi:flint:demo",
      status: "available",
      disposition: "generated-wasm",
      wasm_module: "flint",
    }]),
  );
  const resolution = resolveCapabilityRequirements([
    { id: "ffi:flint:demo", route: CAPABILITY_ROUTES.WASM_ARTIFACT },
  ], routes);
  assert.equal(resolution.selected.length, 0);
  assert.equal(resolution.missing.length, 1);
  assert.deepEqual(resolution.missing[0].available_routes, []);
});

test("route construction and resolution fail closed", () => {
  assert.throws(
    () => buildProductionCapabilityRoutes(
      manifest([{ id: "x", module: "m", artifact: "m.wasm", artifactSha256: "bad" }]),
      report(),
    ),
    /malformed capability provenance/,
  );
  assert.throws(
    () => resolveCapabilityRequirements([{ id: "x", route: "anything" }], new Map()),
    /exact reviewed capability ID and route/,
  );
  assert.throws(
    () => buildProductionCapabilityRoutes(
      manifest(),
      report([
        { id: "x", status: "fallback", disposition: "portable-fallback" },
        { id: "x", status: "fallback", disposition: "portable-fallback" },
      ]),
    ),
    /duplicate ID/,
  );
});
