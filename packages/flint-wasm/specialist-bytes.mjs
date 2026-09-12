// Private authenticated byte transport for synchronous calls in evaluator workers.
// This does not evaluate, replay, or otherwise take ownership of user programs.
const HEADER = 16;
const ERROR_BYTES = 4096;
const MAX_BYTES = 32 * 1024 * 1024;

export function validateSpecialistReceipt(receipt) {
  if (!receipt || !Number.isSafeInteger(receipt.bytes) || receipt.bytes < 8 ||
      receipt.bytes > MAX_BYTES || !/^[a-f0-9]{64}$/.test(receipt.sha256)) {
    throw new TypeError("invalid bounded specialist byte receipt");
  }
  return Object.freeze({bytes: receipt.bytes, sha256: receipt.sha256});
}

export async function fetchSpecialistBytes(url, input, {
  fetchImpl = globalThis.fetch, subtle = globalThis.crypto?.subtle,
  signal,
} = {}) {
  const receipt = validateSpecialistReceipt(input);
  const response = await fetchImpl(String(url), {signal});
  if (!response?.ok) throw new Error(`specialist download failed (${response?.status})`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("specialist download requires a bounded response stream");
  const bytes = new Uint8Array(receipt.bytes);
  let offset = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || value.length > bytes.length - offset) {
        throw new RangeError("specialist download exceeds its authenticated size");
      }
      bytes.set(value, offset);
      offset += value.length;
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (offset !== receipt.bytes) throw new Error("specialist download has incorrect size");
  if (!subtle?.digest) throw new Error("specialist authentication requires SHA-256");
  const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
  const hex = [...digest].map((n) => n.toString(16).padStart(2, "0")).join("");
  if (hex !== receipt.sha256) throw new Error("specialist SHA-256 mismatch");
  return bytes;
}

export function createSpecialistBytes(url, input, {
  WorkerConstructor = globalThis.Worker,
  worker = new URL("./specialist-bytes-worker.mjs", import.meta.url),
  timeoutMilliseconds = 30000,
  shared = typeof SharedArrayBuffer === "function" && typeof Atomics.wait === "function",
  fetchImpl, subtle,
} = {}) {
  const receipt = validateSpecialistReceipt(input);
  if (!Number.isFinite(timeoutMilliseconds) || timeoutMilliseconds <= 0 || timeoutMilliseconds > 120000) {
    throw new TypeError("invalid specialist loader timeout");
  }
  let bytes, failure, closed = false, requests = 0;
  let loader;
  let cancelInitialization = () => {};
  function ensureOpen() {
    if (closed) throw new Error("specialist byte loader is closed");
    if (failure) throw failure;
  }
  function close() {
    closed = true;
    bytes = undefined;
    loader?.terminate();
    cancelInitialization();
  }
  if (!shared || typeof WorkerConstructor !== "function") {
    // No synchronous worker transport: load before executing any user code.
    requests++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMilliseconds);
    cancelInitialization = () => {clearTimeout(timer); controller.abort();};
    const ready = fetchSpecialistBytes(url, receipt, {fetchImpl, subtle, signal: controller.signal}).then((result) => {
      if (!closed) bytes = result;
    }, (error) => {failure = error; throw error;}).finally(() => clearTimeout(timer));
    return Object.freeze({ready, close, get() {
      ensureOpen();
      if (!bytes) throw new Error("specialist preload is not ready");
      return bytes;
    }, status: () => ({loaded: bytes !== undefined, requests, mode: "preload"})});
  }
  loader = new WorkerConstructor(worker, {type: "module"});
  let initialized = false;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      failure = new Error("specialist worker initialization timed out");
      loader.terminate();
      reject(failure);
    }, timeoutMilliseconds);
    cancelInitialization = () => {
      clearTimeout(timer);
      if (!initialized) reject(new Error("specialist loader closed before initialization"));
    };
    loader.onmessage = ({data}) => {
      if (data?.type !== "specialist-worker-ready") return;
      clearTimeout(timer);
      initialized = true;
      resolve();
    };
    loader.onerror = (event) => {
      clearTimeout(timer);
      failure = new Error(event?.message || "specialist worker failed");
      loader.terminate();
      reject(failure);
    };
  });
  return Object.freeze({ready, close, get() {
    ensureOpen();
    if (bytes) return bytes;
    if (!initialized) throw new Error("specialist worker is not ready");
    const transfer = new SharedArrayBuffer(HEADER + receipt.bytes + ERROR_BYTES);
    const state = new Int32Array(transfer, 0, 4);
    requests++;
    try {
      loader.postMessage({type: "specialist-load", url: String(url), receipt, transfer});
      if (Atomics.wait(state, 0, 0, timeoutMilliseconds) === "timed-out") {
        throw new Error("specialist byte load timed out");
      }
      const status = Atomics.load(state, 0), length = Atomics.load(state, 1);
      if (status === 2) {
        if (length < 0 || length > ERROR_BYTES) throw new Error("invalid specialist error length");
        throw new Error(new TextDecoder().decode(new Uint8Array(transfer, HEADER + receipt.bytes, length)));
      }
      if (status !== 1 || length !== receipt.bytes) throw new Error("invalid specialist byte response");
      bytes = Uint8Array.from(new Uint8Array(transfer, HEADER, length));
      return bytes;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      loader.terminate();
    }
  }, status: () => ({loaded: bytes !== undefined, requests, mode: "on-demand"})});
}

export const specialistByteProtocol = Object.freeze({headerBytes: HEADER, errorBytes: ERROR_BYTES});
