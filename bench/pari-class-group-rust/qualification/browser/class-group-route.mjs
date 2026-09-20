import { loadClassGroupCandidate } from "./browser-loader.mjs";

const status = document.querySelector("#status");
const artifact = new URL(location.href).searchParams.get("artifact");
let candidate = null;

window.__sagejsClassGroupQualification = {
  protocol: 1,
  async run(request) {
    if (candidate === null) throw new Error("class-group candidate is not ready");
    const beforeCall = candidate.memoryPages();
    const started = performance.now();
    const result = candidate.run(request);
    return {
      route: candidate.route,
      imports: candidate.description.imports,
      exports: candidate.description.exports,
      timings_ms: {
        ...candidate.timings,
        call: performance.now() - started,
      },
      memory_pages: {
        before_call: beforeCall,
        after_call: candidate.memoryPages(),
      },
      result,
    };
  },
  diagnostics() {
    return {
      user_agent: navigator.userAgent,
      cross_origin_isolated: globalThis.crossOriginIsolated,
      shared_array_buffer: typeof SharedArrayBuffer === "function",
      hardware_concurrency: navigator.hardwareConcurrency,
    };
  },
  close() {
    candidate?.close();
    candidate = null;
  },
};

window.__sagejsClassGroupReady = (async () => {
  if (artifact === null) throw new Error("missing artifact query parameter");
  candidate = await loadClassGroupCandidate(artifact);
  status.textContent = "ready";
  return true;
})().catch((error) => {
  status.textContent = String(error?.stack ?? error);
  throw error;
});
