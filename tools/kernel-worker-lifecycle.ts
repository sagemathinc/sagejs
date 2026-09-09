import type { Worker } from "node:worker_threads";

/** Let an idle evaluator dispose its resources before shutting down its isolate.
 * Busy or otherwise unresponsive workers still have a bounded shutdown.
 */
export function closeKernelWorker(worker: Worker, graceMs = 1000): Promise<void> {
  if (worker.threadId === -1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    let terminating = false;
    const cleanup = () => {
      clearTimeout(timer);
      worker.removeListener("exit", exited);
    };
    const exited = () => {
      cleanup();
      resolve();
    };
    const terminate = () => {
      if (terminating) return;
      terminating = true;
      void worker.terminate().then(exited, (error) => {
        cleanup();
        reject(error);
      });
    };
    worker.once("exit", exited);
    timer = setTimeout(terminate, graceMs);
    try {
      worker.postMessage({ type: "close" });
    } catch {
      terminate();
    }
  });
}
