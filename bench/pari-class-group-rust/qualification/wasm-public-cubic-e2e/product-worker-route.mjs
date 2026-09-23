import { createClassGroupCore } from "/packages/flint-wasm/class-group-core.mjs";

const parameters = new URL(location.href).searchParams;
const artifact = parameters.get("artifact");
const bytes = Number(parameters.get("bytes"));
const sha256 = parameters.get("sha256");
const status = document.querySelector("#status");
let service;

window.__sagejsRustClassGroupWorker = {
  async run(request) {
    const before = await service.diagnostics();
    const started = performance.now();
    const result = await service.invoke(request);
    const elapsedMilliseconds = performance.now() - started;
    const after = await service.diagnostics();
    return { result, elapsedMilliseconds, before, after };
  },
  diagnostics() {
    return service.diagnostics();
  },
  async cancellationProbe(request) {
    const controller = new AbortController();
    const computation = service.invoke(request, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const started = performance.now();
    controller.abort();
    let errorName;
    try {
      await computation;
    } catch (error) {
      errorName = error?.name;
    }
    const latencyMilliseconds = performance.now() - started;
    await service.ready();
    return {
      errorName,
      latencyMilliseconds,
      diagnostics: await service.diagnostics(),
    };
  },
  close() {
    return service.close();
  },
};

window.__sagejsRustClassGroupWorkerReady = (async () => {
  service = await createClassGroupCore({ artifact, receipt: { bytes, sha256 } });
  status.textContent = "ready";
  return true;
})().catch((error) => {
  status.textContent = String(error?.stack ?? error);
  throw error;
});
