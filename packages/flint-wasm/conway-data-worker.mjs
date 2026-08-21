import {
  conwayDataReceipt,
  conwayDataTransferProtocol,
  fetchAuthenticatedConwayData,
} from "./conway-data.mjs";

function finish(state, status, length = 0, errorLength = 0) {
  Atomics.store(state, 1, length);
  Atomics.store(state, 2, errorLength);
  Atomics.store(state, 0, status);
  Atomics.notify(state, 0);
}

self.onmessage = ({ data }) => {
  if (data?.type !== "load-conway-table" ||
      typeof data.url !== "string" ||
      !(data.transfer instanceof SharedArrayBuffer)) {
    return;
  }
  const state = new Int32Array(data.transfer, 0, 4);
  const payload = new Uint8Array(
    data.transfer,
    conwayDataTransferProtocol.headerBytes,
  );
  void fetchAuthenticatedConwayData(data.url).then((resource) => {
    const source = resource.loadFile(
      conwayDataReceipt.virtualPath,
      (value) => value,
    );
    const bytes = new TextEncoder().encode(source);
    payload.set(bytes, 0);
    finish(state, 1, bytes.byteLength);
  }, (error) => {
    const bytes = new TextEncoder().encode(error?.message ?? String(error));
    const length = Math.min(bytes.byteLength, conwayDataTransferProtocol.errorBytes);
    payload.set(
      bytes.subarray(0, length),
      conwayDataTransferProtocol.maximumBytes,
    );
    finish(state, 2, 0, length);
  });
};

self.postMessage({ type: "conway-data-worker-ready" });
