import {fetchSpecialistBytes, validateSpecialistReceipt, specialistByteProtocol} from "./specialist-bytes.mjs";

self.onmessage = ({data}) => {
  if (data?.type !== "specialist-load" || !(data.transfer instanceof SharedArrayBuffer)) return;
  let receipt;
  try { receipt = validateSpecialistReceipt(data.receipt); } catch { return; }
  const {headerBytes, errorBytes} = specialistByteProtocol;
  if (data.transfer.byteLength !== headerBytes + receipt.bytes + errorBytes) return;
  const state = new Int32Array(data.transfer, 0, 4);
  function finish(status, length) {
    Atomics.store(state, 1, length);
    Atomics.store(state, 0, status);
    Atomics.notify(state, 0);
  }
  void fetchSpecialistBytes(data.url, receipt).then((bytes) => {
    new Uint8Array(data.transfer, headerBytes, receipt.bytes).set(bytes);
    finish(1, bytes.length);
  }).catch((error) => {
    const bytes = new TextEncoder().encode(error?.message || String(error)).subarray(0, errorBytes);
    new Uint8Array(data.transfer, headerBytes + receipt.bytes, errorBytes).set(bytes);
    finish(2, bytes.length);
  });
};
self.postMessage({type: "specialist-worker-ready"});
