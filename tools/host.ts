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
        case "realpath":
          return { ok: true, value: fs.realpathSync(this.resolve(args[0])) };
        case "access":
          fs.accessSync(
            this.resolve(args[0]),
            Number(args[1] ?? fs.constants.F_OK),
          );
          return { ok: true, value: true };
        case "readFile": {
          const filename = this.resolve(args[0]);
          if (Boolean(args[1])) {
            return {
              ok: true,
              value: Array.from(fs.readFileSync(filename)),
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
        case "multiprocessingCreatePool":
          return {
            ok: true,
            value: this.multiprocessing.createPool(Number(args[0])),
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
