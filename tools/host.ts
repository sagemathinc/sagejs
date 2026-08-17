/**
 * Host operating-system services exposed to the CPython-compatible library.
 *
 * Keep this module Node-only.  Browser and WASM evaluators deliberately do
 * not install the adapter; their pure path operations still work and their
 * filesystem operations fail when called with a useful NotImplementedError.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as nodeOs from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { Worker } from "node:worker_threads";

import type { SageLanguageMode } from "./kernel-evaluator";
import { NodeMultiprocessingAdapter } from "./multiprocessing-host";

interface HostFailure {
  code?: string;
  errno?: number;
  name?: string;
  remoteName?: string;
  remoteMessage?: string;
  remoteStack?: string;
  message: string;
  syscall?: string;
  path?: string;
  dest?: string;
}

type HostResult =
  | { ok: true; value: unknown }
  | { ok: false; error: HostFailure };

const synchronousWorkerPrelude = String.raw`
const { workerData } = require("node:worker_threads");
const control = new Int32Array(workerData.shared, 0, 2);
const output = new Uint8Array(workerData.shared, 8);
function finish(value) {
  let encoded;
  try { encoded = Buffer.from(JSON.stringify({ ok: true, value })); }
  catch (error) { encoded = Buffer.from(JSON.stringify({ ok: false, error: { code: error.code, message: error.message } })); }
  if (encoded.length > output.length) encoded = Buffer.from(JSON.stringify({ ok: false, error: { code: "ENOBUFS", message: "synchronous host response exceeded buffer" } }));
  output.set(encoded.subarray(0, output.length));
  Atomics.store(control, 1, Math.min(encoded.length, output.length));
  Atomics.store(control, 0, 1);
  Atomics.notify(control, 0);
}
function fail(error) { finish({ __sagejs_error__: { code: error && error.code, message: error && error.message ? error.message : String(error) } }); }
`;

function synchronousWorkerRequest(
  source: string,
  data: Record<string, unknown>,
  timeout = 30_000,
): unknown {
  const maximum = 64 * 1024 * 1024;
  const shared = new SharedArrayBuffer(8 + maximum);
  const control = new Int32Array(shared, 0, 2);
  const worker = new Worker(synchronousWorkerPrelude + source, {
    eval: true,
    workerData: { ...data, shared },
  });
  const result = Atomics.wait(control, 0, 0, timeout);
  void worker.terminate();
  if (result === "timed-out") {
    const error = new Error("synchronous host operation timed out") as NodeJS.ErrnoException;
    error.code = "ETIMEDOUT";
    throw error;
  }
  const length = Atomics.load(control, 1);
  const encoded = Buffer.from(new Uint8Array(shared, 8, length)).toString("utf8");
  const payload = JSON.parse(encoded) as {
    ok: boolean;
    value?: unknown;
    error?: { code?: string; message?: string };
  };
  if (!payload.ok) {
    const error = new Error(payload.error?.message ?? "host worker failed") as NodeJS.ErrnoException;
    error.code = payload.error?.code;
    throw error;
  }
  const value = payload.value as { __sagejs_error__?: { code?: string; message?: string } };
  if (value?.__sagejs_error__) {
    const error = new Error(value.__sagejs_error__.message ?? "host worker failed") as NodeJS.ErrnoException;
    error.code = value.__sagejs_error__.code;
    throw error;
  }
  return value;
}

const httpWorkerSource = String.raw`
const http = require("node:http");
const https = require("node:https");
function perform(url, redirects) {
  const target = new URL(url);
  const transport = target.protocol === "https:" ? https : http;
  const headers = Object.fromEntries(workerData.headers || []);
  const request = transport.request(target, { method: workerData.method, headers }, response => {
    const chunks = [];
    response.on("data", chunk => chunks.push(chunk));
    response.on("end", () => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if (location && status >= 300 && status < 400 && redirects < 10) {
        perform(new URL(location, target).href, redirects + 1);
        return;
      }
      const responseHeaders = [];
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) for (const item of value) responseHeaders.push([name, item]);
        else if (value !== undefined) responseHeaders.push([name, String(value)]);
      }
      finish({ status, reason: response.statusMessage || "", url: target.href, headers: responseHeaders, body: Buffer.concat(chunks).toString("base64") });
    });
  });
  request.on("error", fail);
  request.setTimeout(workerData.timeout, () => { const error = new Error("request timed out"); error.code = "ETIMEDOUT"; request.destroy(error); });
  if (workerData.body) request.write(Buffer.from(workerData.body));
  request.end();
}
perform(workerData.url, 0);
`;

const dnsWorkerSource = String.raw`
require("node:dns").lookup(workerData.hostname, { family: workerData.family || 0 }, (error, address, family) => {
  if (error) fail(error); else finish({ address, family });
});
`;

const tcpWorkerSource = String.raw`
const net = require("node:net");
const chunks = [];
let total = 0;
let completed = false;
const socket = net.createConnection({ host: workerData.host, port: workerData.port }, () => {
  if (workerData.payload) socket.write(Buffer.from(workerData.payload));
});
function done() {
  if (completed) return;
  completed = true;
  const body = Buffer.concat(chunks, total).subarray(0, workerData.maximum);
  finish({ body: body.toString("base64") });
  socket.destroy();
}
socket.on("data", chunk => { chunks.push(chunk); total += chunk.length; if (total >= workerData.maximum) done(); else setImmediate(done); });
socket.on("end", done);
socket.on("error", fail);
socket.setTimeout(workerData.timeout, () => { const error = new Error("socket timed out"); error.code = "ETIMEDOUT"; socket.destroy(error); });
`;

function failure(error: unknown): HostResult {
  const value = error as NodeJS.ErrnoException & {
    dest?: string;
    remoteName?: string;
    remoteMessage?: string;
    remoteStack?: string;
  };
  return {
    ok: false,
    error: {
      code: value?.code,
      name: value?.name,
      remoteName: value?.remoteName,
      remoteMessage: value?.remoteMessage,
      remoteStack: value?.remoteStack,
      errno: typeof value?.errno === "number" ? Math.abs(value.errno) : undefined,
      message: value?.message ?? String(error),
      syscall: value?.syscall,
      path: typeof value?.path === "string" ? value.path : undefined,
      dest: typeof value?.dest === "string" ? value.dest : undefined,
    },
  };
}

function statValue(value: fs.BigIntStats) {
  return {
    mode: value.mode,
    ino: value.ino,
    dev: value.dev,
    nlink: value.nlink,
    uid: value.uid,
    gid: value.gid,
    size: value.size,
    atime: Number(value.atimeNs) / 1e9,
    mtime: Number(value.mtimeNs) / 1e9,
    ctime: Number(value.ctimeNs) / 1e9,
    birthtime: Number(value.birthtimeNs) / 1e9,
    atimeNs: value.atimeNs,
    mtimeNs: value.mtimeNs,
    ctimeNs: value.ctimeNs,
    birthtimeNs: value.birthtimeNs,
    isFile: value.isFile(),
    isDirectory: value.isDirectory(),
    isSymbolicLink: value.isSymbolicLink(),
  };
}

export class NodeHostAdapter {
  private currentDirectory = process.cwd();
  private readonly environment: Record<string, string> = Object.create(null);
  private readonly multiprocessing: NodeMultiprocessingAdapter;

  constructor(mode: SageLanguageMode = "sage") {
    this.multiprocessing = new NodeMultiprocessingAdapter(mode);
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) this.environment[key] = value;
    }
  }

  private resolve(filename: unknown): string {
    const value = String(filename);
    return path.isAbsolute(value)
      ? path.normalize(value)
      : path.resolve(this.currentDirectory, value);
  }

  private environmentKey(name: unknown): string {
    const key = String(name);
    if (process.platform !== "win32") return key;
    const normalized = key.toUpperCase();
    return Object.keys(this.environment).find(
      (candidate) => candidate.toUpperCase() === normalized,
    ) ?? key;
  }

  call(method: string, args: unknown[] = []): HostResult {
    try {
      switch (method) {
        case "describe":
          return {
            ok: true,
            value: {
              name: process.platform === "win32" ? "nt" : "posix",
              sep: path.sep,
              altsep: process.platform === "win32" ? "/" : null,
              pathsep: path.delimiter,
              linesep: process.platform === "win32" ? "\r\n" : "\n",
              devnull: process.platform === "win32" ? "nul" : "/dev/null",
              curdir: ".",
              pardir: "..",
              tempdir: nodeOs.tmpdir(),
              executable: process.execPath,
            },
          };
        case "uname":
          return {
            ok: true,
            value: [
              nodeOs.type(),
              nodeOs.hostname(),
              nodeOs.release(),
              nodeOs.version(),
              nodeOs.machine(),
            ],
          };
        case "getcwd":
          return { ok: true, value: this.currentDirectory };
        case "chdir": {
          const destination = this.resolve(args[0]);
          const metadata = fs.statSync(destination);
          if (!metadata.isDirectory()) {
            const error = new Error(
              `not a directory, chdir '${destination}'`,
            ) as NodeJS.ErrnoException;
            error.code = "ENOTDIR";
            error.errno = -20;
            error.path = destination;
            error.syscall = "chdir";
            throw error;
          }
          this.currentDirectory = fs.realpathSync(destination);
          return { ok: true, value: null };
        }
        case "listdir":
          return {
            ok: true,
            value: fs.readdirSync(this.resolve(args[0] ?? ".")),
          };
        case "scandir":
          return {
            ok: true,
            value: fs.readdirSync(this.resolve(args[0] ?? "."), {
              withFileTypes: true,
            }).map((entry) => ({
              name: entry.name,
              isFile: entry.isFile(),
              isDirectory: entry.isDirectory(),
              isSymbolicLink: entry.isSymbolicLink(),
            })),
          };
        case "stat":
          return {
            ok: true,
            value: statValue(fs.statSync(this.resolve(args[0]), { bigint: true })),
          };
        case "lstat":
          return {
            ok: true,
            value: statValue(fs.lstatSync(this.resolve(args[0]), { bigint: true })),
          };
        case "mkdir":
          fs.mkdirSync(this.resolve(args[0]), {
            mode: args[1] === undefined ? 0o777 : Number(args[1]),
          });
          return { ok: true, value: null };
        case "makedirs": {
          const destination = this.resolve(args[0]);
          if (fs.existsSync(destination)) {
            const error = new Error(
              `file already exists, mkdir '${destination}'`,
            ) as NodeJS.ErrnoException;
            error.code = "EEXIST";
            error.errno = -17;
            error.path = destination;
            error.syscall = "mkdir";
            throw error;
          }
          fs.mkdirSync(destination, {
            mode: args[1] === undefined ? 0o777 : Number(args[1]),
            recursive: true,
          });
          return { ok: true, value: null };
        }
        case "unlink":
          fs.unlinkSync(this.resolve(args[0]));
          return { ok: true, value: null };
        case "rmdir":
          fs.rmdirSync(this.resolve(args[0]));
          return { ok: true, value: null };
        case "rename":
        case "replace":
          fs.renameSync(this.resolve(args[0]), this.resolve(args[1]));
          return { ok: true, value: null };
        case "readlink":
          return { ok: true, value: fs.readlinkSync(this.resolve(args[0])) };
        case "symlink":
          fs.symlinkSync(
            String(args[0]),
            this.resolve(args[1]),
            args[2] === undefined ? undefined : String(args[2]) as fs.symlink.Type,
          );
          return { ok: true, value: null };
        case "link":
          fs.linkSync(this.resolve(args[0]), this.resolve(args[1]));
          return { ok: true, value: null };
        case "chmod":
          fs.chmodSync(this.resolve(args[0]), Number(args[1]));
          return { ok: true, value: null };
        case "utime":
          fs.utimesSync(
            this.resolve(args[0]), Number(args[1]), Number(args[2]));
          return { ok: true, value: null };
        case "statfs": {
          const value = fs.statfsSync(this.resolve(args[0] ?? "."), {
            bigint: true,
          });
          return {
            ok: true,
            value: {
              blocks: value.blocks,
              bfree: value.bfree,
              bavail: value.bavail,
              bsize: value.bsize,
            },
          };
        }
        case "realpath":
          return { ok: true, value: fs.realpathSync(this.resolve(args[0])) };
        case "access":
          fs.accessSync(
            this.resolve(args[0]),
            Number(args[1] ?? fs.constants.F_OK),
          );
          return { ok: true, value: true };
        case "openFd":
          return {
            ok: true,
            value: fs.openSync(
              this.resolve(args[0]),
              String(args[1] ?? "r"),
              args[2] === undefined ? 0o666 : Number(args[2]),
            ),
          };
        case "closeFd":
          fs.closeSync(Number(args[0]));
          return { ok: true, value: null };
        case "readFile": {
          const filename = this.resolve(args[0]);
          if (Boolean(args[1])) {
            return {
              ok: true,
              value: fs.readFileSync(filename),
            };
          }
          return {
            ok: true,
            value: fs.readFileSync(filename, {
              encoding: String(args[2] ?? "utf8") as BufferEncoding,
            }),
          };
        }
        case "writeFile": {
          const filename = this.resolve(args[0]);
          const binary = Boolean(args[2]);
          const exclusive = Boolean(args[3]);
          const data = binary
            ? Buffer.from(args[1] as number[])
            : String(args[1]);
          fs.writeFileSync(filename, data, {
            encoding: String(args[4] ?? "utf8") as BufferEncoding,
            flag: exclusive ? "wx" : "w",
          });
          return { ok: true, value: null };
        }
        case "compressData": {
          const format = String(args[0]);
          const data = Buffer.from(args[1] as number[]);
          const level = Number(args[2] ?? -1);
          const options = level < 0 ? undefined : { level };
          let compressed: Buffer;
          if (format === "gzip") compressed = zlib.gzipSync(data, options);
          else if (format === "deflate") {
            compressed = zlib.deflateSync(data, options);
          } else if (format === "deflateRaw") {
            compressed = zlib.deflateRawSync(data, options);
          } else if (format === "brotli") {
            compressed = zlib.brotliCompressSync(data);
          } else {
            throw new Error(`unsupported compression format: ${format}`);
          }
          return { ok: true, value: Array.from(compressed) };
        }
        case "decompressData": {
          const format = String(args[0]);
          const data = Buffer.from(args[1] as number[]);
          let decompressed: Buffer;
          if (format === "gzip") decompressed = zlib.gunzipSync(data);
          else if (format === "deflate") {
            decompressed = zlib.inflateSync(data);
          } else if (format === "deflateRaw") {
            decompressed = zlib.inflateRawSync(data);
          } else if (format === "brotli") {
            decompressed = zlib.brotliDecompressSync(data);
          } else {
            throw new Error(`unsupported compression format: ${format}`);
          }
          return { ok: true, value: Array.from(decompressed) };
        }
        case "hashData": {
          const requested = String(args[0]).replaceAll("_", "-");
          const algorithm = requested === "blake2b"
            ? "blake2b512"
            : requested === "blake2s"
              ? "blake2s256"
              : requested;
          const data = Buffer.from(args[1] as number[]);
          const length = args[2] === undefined ? undefined : Number(args[2]);
          const hash = length === undefined
            ? crypto.createHash(algorithm)
            : crypto.createHash(algorithm, { outputLength: length });
          hash.update(data);
          const digest = hash.digest();
          return { ok: true, value: Array.from(digest) };
        }
        case "subprocessRun": {
          const command = (args[0] as unknown[]).map(String);
          if (command.length === 0) {
            throw new TypeError("subprocess command must not be empty");
          }
          const cwd = args[1] == null ? this.currentDirectory : this.resolve(args[1]);
          const environment = args[2] == null
            ? { ...this.environment }
            : Object.fromEntries(args[2] as [string, string][]);
          const input = args[3] == null
            ? undefined
            : Buffer.from(args[3] as number[]);
          const timeout = args[4] == null ? undefined : Number(args[4]);
          const shell = Boolean(args[5]);
          const executable = args[6] == null ? undefined : String(args[6]);
          const maxBuffer = args[7] == null ? 64 * 1024 * 1024 : Number(args[7]);
          const result = spawnSync(executable ?? command[0], command.slice(1), {
            cwd,
            env: environment,
            input,
            timeout,
            shell,
            encoding: null,
            maxBuffer,
            windowsHide: true,
          });
          return {
            ok: true,
            value: {
              pid: result.pid,
              status: result.status,
              signal: result.signal,
              errorCode: (result.error as NodeJS.ErrnoException | undefined)?.code,
              errorMessage: result.error?.message,
              stdout: Array.from(
                Buffer.isBuffer(result.stdout)
                  ? result.stdout
                  : Buffer.from(result.stdout ?? ""),
              ),
              stderr: Array.from(
                Buffer.isBuffer(result.stderr)
                  ? result.stderr
                  : Buffer.from(result.stderr ?? ""),
              ),
            },
          };
        }
        case "httpRequest": {
          const timeout = Number(args[4] ?? 30_000);
          return {
            ok: true,
            value: synchronousWorkerRequest(
              httpWorkerSource,
              {
                method: String(args[0] ?? "GET"),
                url: String(args[1]),
                headers: args[2] ?? [],
                body: args[3] ?? null,
                timeout,
              },
              timeout + 1_000,
            ),
          };
        }
        case "dnsLookup": {
          return {
            ok: true,
            value: synchronousWorkerRequest(
              dnsWorkerSource,
              { hostname: String(args[0]), family: Number(args[1] ?? 0) },
            ),
          };
        }
        case "tcpExchange": {
          const timeout = Number(args[4] ?? 30_000);
          return {
            ok: true,
            value: synchronousWorkerRequest(
              tcpWorkerSource,
              {
                host: String(args[0]),
                port: Number(args[1]),
                payload: args[2] ?? [],
                maximum: Number(args[3] ?? 65_536),
                timeout,
              },
              timeout + 1_000,
            ),
          };
        }
        case "environmentEntries":
          return { ok: true, value: Object.entries(this.environment) };
        case "setEnv": {
          const key = this.environmentKey(args[0]);
          this.environment[key] = String(args[1]);
          return { ok: true, value: null };
        }
        case "deleteEnv": {
          const key = this.environmentKey(args[0]);
          delete this.environment[key];
          return { ok: true, value: null };
        }
        case "getpid":
          return { ok: true, value: process.pid };
        case "cpuCount":
          return { ok: true, value: nodeOs.availableParallelism() };
        case "urandom":
          return { ok: true, value: Array.from(crypto.randomBytes(Number(args[0]))) };
        case "serializationDumps": {
          const serializer = require("./serialization") as typeof import("./serialization");
          return { ok: true, value: serializer.dumps(args[0]) };
        }
        case "serializationLoads": {
          const serializer = require("./serialization") as typeof import("./serialization");
          return { ok: true, value: serializer.loads(String(args[0])) };
        }
        case "serializationLoadsIntegerTupleTable": {
          const serializer = require("./serialization") as typeof import("./serialization");
          return {
            ok: true,
            value: serializer.loadsIntegerTupleTable(String(args[0])),
          };
        }
        case "serializationLoadIntegerTupleTable": {
          const serializer = require("./serialization") as typeof import("./serialization");
          return {
            ok: true,
            value: serializer.loadsIntegerTupleTable(
              fs.readFileSync(this.resolve(args[0]), "utf8"),
            ),
          };
        }
        case "serializationIntegerTupleTableView": {
          const serializer = require("./serialization") as typeof import("./serialization");
          return {
            ok: true,
            value: serializer.integerTupleTableView(
              args[0],
              String(args[1]) as "keys" | "values" | "items",
            ),
          };
        }
        case "serializationPack": {
          const serializer = require("./serialization") as typeof import("./serialization");
          return { ok: true, value: serializer.pack(args[0]) };
        }
        case "serializationUnpack": {
          const serializer = require("./serialization") as typeof import("./serialization");
          const source = args[0] === null || args[0] === undefined
            ? args[0]
            : Reflect.get(Object(args[0]), "_values") ?? args[0];
          return { ok: true, value: serializer.unpack(source as number[]) };
        }
        case "multiprocessingCreatePool":
          return {
            ok: true,
            value: this.multiprocessing.createPool(
              Number(args[0]),
              args[1],
              (args[2] as unknown[] | undefined) ?? [],
            ),
          };
        case "multiprocessingMap":
          return {
            ok: true,
            value: this.multiprocessing.map(
              Number(args[0]),
              args[1],
              args[2] as unknown[],
              Boolean(args[3]),
            ),
          };
        case "multiprocessingClosePool":
          this.multiprocessing.closePool(Number(args[0]));
          return { ok: true, value: null };
        case "multiprocessingJoinPool":
          this.multiprocessing.joinPool(Number(args[0]));
          return { ok: true, value: null };
        case "multiprocessingSubmitMap":
          return {
            ok: true,
            value: this.multiprocessing.submitMap(
              Number(args[0]),
              args[1],
              args[2] as unknown[],
              Boolean(args[3]),
            ),
          };
        case "multiprocessingJobResult":
          return {
            ok: true,
            value: this.multiprocessing.jobResult(
              Number(args[0]),
              Number(args[1]),
              args[2] === null || args[2] === undefined
                ? undefined
                : Number(args[2]),
            ),
          };
        case "multiprocessingForgetJob":
          this.multiprocessing.forgetJob(
            Number(args[0]), Number(args[1]),
          );
          return { ok: true, value: null };
        case "multiprocessingTerminatePool":
          this.multiprocessing.terminatePool(Number(args[0]));
          return { ok: true, value: null };
        case "multiprocessingCloseAllPools":
          this.multiprocessing.close();
          return { ok: true, value: null };
        default:
          return {
            ok: false,
            error: {
              code: "ENOSYS",
              errno: 38,
              message: `unknown Sage.js host operation: ${method}`,
            },
          };
      }
    } catch (error) {
      return failure(error);
    }
  }
}

export function installNodeHost(
  target: object = globalThis,
  mode: SageLanguageMode = "sage",
): () => void {
  const property = "__sagejs_host__";
  const hadPrevious = Reflect.has(target, property);
  const previous = Reflect.get(target, property);
  const adapter = new NodeHostAdapter(mode);
  Reflect.set(target, property, adapter);
  return () => {
    adapter.call("multiprocessingCloseAllPools");
    if (hadPrevious) Reflect.set(target, property, previous);
    else Reflect.deleteProperty(target, property);
  };
}
