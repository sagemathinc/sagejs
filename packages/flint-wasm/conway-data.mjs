const CONWAY_TABLE_SCHEMA = "sagejs.conway-table-resource/v1";
const CONWAY_TABLE_PATH =
  "/__sagejs_lazy_modules__/conway_polynomials/conway_polynomials.json";
const CONWAY_TABLE_BYTES = 1_114_459;
const CONWAY_TABLE_MAXIMUM_BYTES = 1_200_000;
const CONWAY_TABLE_SHA256 =
  "43a555093e65ac1eed877c7bb79e6e8d44ad63285dc52fb227e64e2e7aa298ea";
const CONWAY_TRANSFER_HEADER_BYTES = 4 * Int32Array.BYTES_PER_ELEMENT;
const CONWAY_TRANSFER_ERROR_BYTES = 4096;

function hexadecimal(bytes) {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function assertPackagedPath(filename) {
  if (typeof filename !== "string" || filename.includes("\0")) {
    throw new TypeError("Conway table path is invalid");
  }
  const normalized = `/${filename.replaceAll("\\", "/")}`
    .replace(/\/{2,}/g, "/")
    .replace(/^\/\//, "/");
  if (normalized !== CONWAY_TABLE_PATH) {
    throw new Error(
      `packaged Conway data does not provide ${JSON.stringify(filename)}`,
    );
  }
}

/**
 * Fetch and authenticate the one bounded Conway table asset.
 *
 * Fetching is asynchronous inside the private data worker. Python's
 * filename-style host call never sees a filesystem or network handle: it can
 * only materialize the authenticated bytes retained by this resource.
 */
export async function fetchAuthenticatedConwayData(
  url,
  {
    fetchImpl = globalThis.fetch,
    subtle = globalThis.crypto?.subtle,
  } = {},
) {
  if (typeof fetchImpl !== "function") {
    throw new Error("the Conway table asset loader requires fetch");
  }
  if (subtle === undefined || typeof subtle.digest !== "function") {
    throw new Error("the Conway table asset loader requires SHA-256");
  }
  const response = await fetchImpl(String(url));
  if (!response?.ok) {
    throw new Error(
      `unable to load authenticated Conway table (${response?.status ?? "failed"})`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > CONWAY_TABLE_MAXIMUM_BYTES) {
    throw new RangeError(
      `Conway table exceeds its ${CONWAY_TABLE_MAXIMUM_BYTES}-byte limit`,
    );
  }
  if (bytes.byteLength !== CONWAY_TABLE_BYTES) {
    throw new Error(
      `Conway table size differs: expected ${CONWAY_TABLE_BYTES}, got ${bytes.byteLength}`,
    );
  }
  const digest = hexadecimal(
    new Uint8Array(await subtle.digest("SHA-256", bytes)),
  );
  if (digest !== CONWAY_TABLE_SHA256) {
    throw new Error("Conway table SHA-256 differs from its packaged receipt");
  }
  return createPreparedConwayData(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
}

function createPreparedConwayData(initialSource) {
  let source = initialSource;
  let table;
  let materializations = 0;
  return Object.freeze({
    loadFile(filename, materialize) {
      assertPackagedPath(filename);
      if (typeof materialize !== "function") {
        throw new TypeError("Conway table materializer must be callable");
      }
      if (table !== undefined) return table;
      table = materialize(source);
      materializations += 1;
      source = undefined;
      return table;
    },
    receipt: conwayDataReceipt,
    status() {
      return Object.freeze({
        authenticated: true,
        materialized: table !== undefined,
        materializations,
      });
    },
  });
}

/**
 * Create an on-demand table resource for the synchronous Python host call.
 *
 * The evaluator itself is already an isolated worker. A private nested worker
 * fetches and authenticates the packaged asset on first use, then copies at
 * most the reviewed byte ceiling into shared transfer storage. No evaluated
 * object can select a URL, obtain the transfer buffer, or invoke this loader.
 */
export function createLazyAuthenticatedConwayData(
  url,
  {
    WorkerConstructor = globalThis.Worker,
    worker = new URL("./conway-data-worker.mjs", import.meta.url),
    timeoutMilliseconds = 30_000,
    fetchImpl = globalThis.fetch,
    subtle = globalThis.crypto?.subtle,
  } = {},
) {
  if (typeof WorkerConstructor !== "function" ||
      typeof SharedArrayBuffer !== "function" ||
      typeof Atomics?.wait !== "function") {
    let prepared;
    let closed = false;
    const ready = fetchAuthenticatedConwayData(url, {
      fetchImpl,
      subtle,
    }).then((value) => {
      prepared = value;
    });
    return Object.freeze({
      loadFile(filename, materialize) {
        assertPackagedPath(filename);
        if (closed) throw new Error("the Conway table loader is closed");
        if (prepared === undefined) {
          throw new Error("the Conway table fallback loader is not ready");
        }
        return prepared.loadFile(filename, materialize);
      },
      close() {
        closed = true;
      },
      ready,
      receipt: conwayDataReceipt,
      status() {
        return prepared === undefined
          ? Object.freeze({
              authenticated: false,
              materialized: false,
              materializations: 0,
            })
          : prepared.status();
      },
    });
  }
  let prepared;
  let workerReady = false;
  let closed = false;
  const loader = new WorkerConstructor(worker, { type: "module" });
  const ready = new Promise((resolve, reject) => {
    loader.onmessage = ({ data }) => {
      if (data?.type !== "conway-data-worker-ready") return;
      workerReady = true;
      resolve();
    };
    loader.onerror = (event) => {
      reject(event?.error ?? new Error(
        event?.message ?? "the Conway table worker failed to initialize",
      ));
    };
  });
  const ensurePrepared = () => {
    if (prepared !== undefined) return prepared;
    if (closed) throw new Error("the Conway table loader is closed");
    if (!workerReady) {
      throw new Error("the Conway table worker is not ready");
    }
    const transfer = new SharedArrayBuffer(
      CONWAY_TRANSFER_HEADER_BYTES +
      CONWAY_TABLE_MAXIMUM_BYTES +
      CONWAY_TRANSFER_ERROR_BYTES,
    );
    const state = new Int32Array(transfer, 0, 4);
    try {
      loader.postMessage({
        type: "load-conway-table",
        url: String(url),
        transfer,
      });
      const waited = Atomics.wait(
        state,
        0,
        0,
        timeoutMilliseconds,
      );
      if (waited === "timed-out") {
        throw new Error("authenticated Conway table load timed out");
      }
      const status = Atomics.load(state, 0);
      const length = Atomics.load(state, 1);
      const payload = new Uint8Array(transfer, CONWAY_TRANSFER_HEADER_BYTES);
      if (status === 2) {
        const errorLength = Atomics.load(state, 2);
        if (errorLength < 0 || errorLength > CONWAY_TRANSFER_ERROR_BYTES) {
          throw new Error("authenticated Conway table worker returned an invalid error");
        }
        const error = new TextDecoder().decode(
          Uint8Array.from(payload.subarray(
            CONWAY_TABLE_MAXIMUM_BYTES,
            CONWAY_TABLE_MAXIMUM_BYTES + errorLength,
          )),
        );
        throw new Error(error || "authenticated Conway table load failed");
      }
      if (status !== 1 || length !== CONWAY_TABLE_BYTES) {
        throw new Error("authenticated Conway table worker returned invalid data");
      }
      prepared = createPreparedConwayData(
        new TextDecoder("utf-8", { fatal: true }).decode(
          Uint8Array.from(payload.subarray(0, length)),
        ),
      );
      return prepared;
    } finally {
      closed = true;
      loader.terminate();
    }
  };
  return Object.freeze({
    loadFile(filename, materialize) {
      assertPackagedPath(filename);
      return ensurePrepared().loadFile(filename, materialize);
    },
    close() {
      if (closed) return;
      closed = true;
      loader.terminate();
    },
    ready,
    receipt: conwayDataReceipt,
    status() {
      return prepared === undefined
        ? Object.freeze({
            authenticated: false,
            materialized: false,
            materializations: 0,
          })
        : prepared.status();
    },
  });
}

export const conwayDataReceipt = Object.freeze({
  schema: CONWAY_TABLE_SCHEMA,
  path: "src/lib/conway_polynomials/conway_polynomials.json",
  virtualPath: CONWAY_TABLE_PATH,
  bytes: CONWAY_TABLE_BYTES,
  maximumBytes: CONWAY_TABLE_MAXIMUM_BYTES,
  sha256: CONWAY_TABLE_SHA256,
});

export const conwayDataTransferProtocol = Object.freeze({
  headerBytes: CONWAY_TRANSFER_HEADER_BYTES,
  maximumBytes: CONWAY_TABLE_MAXIMUM_BYTES,
  errorBytes: CONWAY_TRANSFER_ERROR_BYTES,
});
