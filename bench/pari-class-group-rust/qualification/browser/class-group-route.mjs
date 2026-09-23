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
  async runResumable(request, pointBudget = 1) {
    if (candidate === null) throw new Error("class-group candidate is not ready");
    const context = candidate.createContext(request);
    let status = 1;
    let steps = 0;
    let maximumStepMilliseconds = 0;
    try {
      while (status === 1) {
        const started = performance.now();
        status = context.step(pointBudget);
        maximumStepMilliseconds = Math.max(
          maximumStepMilliseconds,
          performance.now() - started,
        );
        steps += 1;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (status !== 2) throw new Error(`resumable computation ended with status ${status}`);
      return {
        status,
        steps,
        maximum_step_ms: maximumStepMilliseconds,
        result: context.result(),
        memory_pages: candidate.memoryPages(),
      };
    } finally {
      context.close();
    }
  },
  async cancellationProbe(request) {
    if (candidate === null) throw new Error("class-group candidate is not ready");
    const context = candidate.createContext(request);
    const resultBefore = context.result();
    if (context.step(8) !== 1) throw new Error("cancellation probe did not start running");
    let requestTime = null;
    let cancelCode = null;
    const cancel = new Promise((resolve) => setTimeout(() => {
      requestTime = performance.now();
      cancelCode = context.cancel();
      resolve();
    }, 0));
    let status = 1;
    while (status === 1) {
      status = context.step(1);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await cancel;
    const latency = performance.now() - requestTime;
    const resultAfter = context.result();
    const firstClose = context.close();
    const secondClose = context.close();
    return {
      status,
      cancel_code: cancelCode,
      latency_ms: latency,
      result_before: resultBefore,
      result_after: resultAfter,
      first_close: firstClose,
      second_close: secondClose,
      memory_pages: candidate.memoryPages(),
    };
  },
  async resetProbe(request) {
    if (candidate === null) throw new Error("class-group candidate is not ready");
    const context = candidate.createContext(request);
    if (context.step(8) !== 1) throw new Error("reset probe did not start running");
    const before = context.handle;
    const after = context.reset(request);
    let status = 1;
    while (status === 1) {
      status = context.step(4_096);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const result = context.result();
    const close = context.close();
    return {
      status,
      generation_changed: before !== after,
      result,
      close,
      memory_pages: candidate.memoryPages(),
    };
  },
  retiredHandleProbe(request) {
    if (candidate === null) throw new Error("class-group candidate is not ready");
    const raw = candidate.testing?.rawContext;
    if (raw === undefined) throw new Error("raw qualification context ABI is unavailable");

    const closed = candidate.createContext(request);
    if (closed.step(8) !== 1) throw new Error("retired-close probe did not start");
    const closedHandle = closed.handle;
    const firstClose = closed.close();
    const afterClose = {
      step: raw.step(closedHandle, 1),
      cancel: raw.cancel(closedHandle),
      result_error: raw.result(closedHandle).error,
      reset_zero: raw.reset(closedHandle, request) === 0n,
      close: raw.close(closedHandle),
    };

    const reset = candidate.createContext(request);
    if (reset.step(8) !== 1) throw new Error("retired-reset probe did not start");
    const beforeReset = reset.handle;
    const invalidResetZero = raw.reset(beforeReset, { ...request, expected: {} }) === 0n;
    const originalLiveAfterInvalidReset = raw.step(beforeReset, 1) === 1;
    reset.reset(request);
    const afterReset = {
      step: raw.step(beforeReset, 1),
      cancel: raw.cancel(beforeReset),
      result_error: raw.result(beforeReset).error,
      reset_zero: raw.reset(beforeReset, request) === 0n,
      close: raw.close(beforeReset),
    };
    const replacementClose = reset.close();
    return {
      first_close: firstClose,
      after_close: afterClose,
      invalid_reset_zero: invalidResetZero,
      original_live_after_invalid_reset: originalLiveAfterInvalidReset,
      generation_changed: beforeReset !== reset.handle,
      after_reset: afterReset,
      replacement_close: replacementClose,
      memory_pages: candidate.memoryPages(),
    };
  },
  async closeWithLiveContextProbe(request) {
    if (candidate === null) throw new Error("class-group candidate is not ready");
    const context = candidate.createContext(request);
    if (context.step(8) !== 1) throw new Error("live-close probe did not start running");
    const memoryPagesBeforeClose = candidate.memoryPages();
    this.close();
    let contextRejectedAfterCandidateClose = false;
    try {
      context.step(1);
    } catch {
      contextRejectedAfterCandidateClose = true;
    }
    return {
      live_context_created: true,
      api_close_called: true,
      context_rejected_after_candidate_close: contextRejectedAfterCandidateClose,
      memory_pages_before_close: memoryPagesBeforeClose,
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
