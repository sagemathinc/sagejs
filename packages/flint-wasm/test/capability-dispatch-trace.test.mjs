import assert from "node:assert/strict";
import test from "node:test";

import {
  capabilityTraceInstrumentation,
  createCapabilityDispatchTrace,
} from "../capability-trace.mjs";
import { unobservedCapabilityRequirements } from "./browser-wasm-support.mjs";

test("dispatch traces count exact capability routes and clear between evaluations", () => {
  const trace = createCapabilityDispatchTrace();
  trace.record("analytic:zeta", "receipt-backed-wasm-artifact", {
    ingressBytes: 8,
    egressBytes: 16,
  });
  trace.record("analytic:zeta", "receipt-backed-wasm-artifact");
  trace.record("elliptic:coefficients", "portable-fallback");
  assert.deepEqual(trace.snapshot(), [
    {
      capability_id: "analytic:zeta",
      selected_route: "receipt-backed-wasm-artifact",
      execution_target: "wasm-artifact",
      call_count: 2,
      ingress_bytes: 8,
      egress_bytes: 16,
    },
    {
      capability_id: "elliptic:coefficients",
      selected_route: "portable-fallback",
      execution_target: "portable-python",
      call_count: 1,
      ingress_bytes: 0,
      egress_bytes: 0,
    },
  ]);
  assert.deepEqual(capabilityTraceInstrumentation(trace), {
    routes: trace.snapshot(),
    boundary_crossings: 3,
    copied_bytes: 24,
  });
  assert.throws(
    () => trace.record("analytic:zeta", "portable-ish"),
    /unknown capability trace route/,
  );
  trace.clear();
  assert.deepEqual(trace.snapshot(), []);
});

test("an observed fallback cannot satisfy an artifact requirement", () => {
  const requirement = [{
    id: "analytic:zeta",
    route: "receipt-backed-wasm-artifact",
  }];
  assert.deepEqual(unobservedCapabilityRequirements(requirement, [{
    capability_id: "analytic:zeta",
    selected_route: "portable-fallback",
    call_count: 1,
  }]), requirement);
  assert.deepEqual(unobservedCapabilityRequirements(requirement, [{
    capability_id: "analytic:zeta",
    selected_route: "receipt-backed-wasm-artifact",
    call_count: 1,
  }]), []);
});

test("malformed trace records fail closed", () => {
  assert.throws(
    () => unobservedCapabilityRequirements([], [{
      capability_id: "x",
      selected_route: "portable-fallback",
      call_count: 0,
    }]),
    /malformed runtime capability route observation/,
  );
});
