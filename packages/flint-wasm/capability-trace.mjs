const CAPABILITY_TRACE_ROUTES = new Set([
  "receipt-backed-wasm-artifact",
  "shared-runtime-js",
  "portable-fallback",
]);
const CAPABILITY_TRACE_TARGETS = new Set([
  "wasm-artifact",
  "host-runtime-js",
  "portable-python",
]);
const DEFAULT_TARGET = Object.freeze({
  "receipt-backed-wasm-artifact": "wasm-artifact",
  "shared-runtime-js": "host-runtime-js",
  "portable-fallback": "portable-python",
});
const MAX_DISTINCT_ROUTES = 512;

function byteCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

export function createCapabilityDispatchTrace() {
  const counts = new Map();
  return Object.freeze({
    clear() {
      counts.clear();
    },
    record(capabilityId, selectedRoute, options = {}) {
      if (typeof capabilityId !== "string" || capabilityId.length === 0) {
        throw new TypeError("capability trace ID must be a nonempty string");
      }
      if (!CAPABILITY_TRACE_ROUTES.has(selectedRoute)) {
        throw new TypeError(`unknown capability trace route ${String(selectedRoute)}`);
      }
      const executionTarget = options.executionTarget ?? DEFAULT_TARGET[selectedRoute];
      if (!CAPABILITY_TRACE_TARGETS.has(executionTarget)) {
        throw new TypeError(`unknown capability execution target ${String(executionTarget)}`);
      }
      const ingressBytes = byteCount(options.ingressBytes ?? 0, "trace ingress_bytes");
      const egressBytes = byteCount(options.egressBytes ?? 0, "trace egress_bytes");
      const key = `${capabilityId}\0${selectedRoute}\0${executionTarget}`;
      const previous = counts.get(key);
      if (!previous && counts.size >= MAX_DISTINCT_ROUTES) {
        throw new RangeError("capability trace exceeds its bounded route count");
      }
      counts.set(key, {
        capability_id: capabilityId,
        selected_route: selectedRoute,
        execution_target: executionTarget,
        call_count: byteCount((previous?.call_count ?? 0) + 1, "trace call_count"),
        ingress_bytes: byteCount(
          (previous?.ingress_bytes ?? 0) + ingressBytes,
          "trace ingress_bytes",
        ),
        egress_bytes: byteCount(
          (previous?.egress_bytes ?? 0) + egressBytes,
          "trace egress_bytes",
        ),
      });
    },
    snapshot() {
      return Object.freeze([...counts.values()]
        .sort((left, right) =>
          left.capability_id.localeCompare(right.capability_id) ||
          left.selected_route.localeCompare(right.selected_route) ||
          left.execution_target.localeCompare(right.execution_target)
        )
        .map((record) => Object.freeze({ ...record })));
    },
  });
}

export function capabilityTraceInstrumentation(trace) {
  const routes = trace.snapshot();
  return Object.freeze({
    routes,
    boundary_crossings: routes.reduce((total, record) => total + record.call_count, 0),
    copied_bytes: routes.reduce(
      (total, record) => total + record.ingress_bytes + record.egress_bytes,
      0,
    ),
  });
}
