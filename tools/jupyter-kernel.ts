import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  createSage,
  SageSession,
  SageSessionInterruptedError,
} from "./kernel";
import { SageLanguageMode } from "./kernel-evaluator";
import {
  parsePolyglotCell,
  prepareSubmittedPolyglotCell,
  rewriteQuestionMarkHelp,
} from "./polyglot";
import { Publisher, Reply, Router } from "./zeromq-runtime";

const DELIMITER = Buffer.from("<IDS|MSG>");
const PROTOCOL_VERSION = "5.4";
const PLOTLY_MIME = "application/vnd.plotly.v1+json";
const PLOTLY_CDN = "https://cdn.plot.ly/plotly-3.7.0.min.js";

interface ConnectionInfo {
  transport: string;
  ip: string;
  shell_port: number;
  iopub_port: number;
  stdin_port: number;
  control_port: number;
  hb_port: number;
  key: string;
  signature_scheme: string;
}

interface MessageHeader {
  msg_id: string;
  username: string;
  session: string;
  date: string;
  msg_type: string;
  version: string;
}

interface JupyterMessage {
  identities: Buffer[];
  signature: string;
  header: MessageHeader;
  parentHeader: Record<string, unknown>;
  metadata: Record<string, unknown>;
  content: Record<string, any>;
  buffers: Buffer[];
}

interface KernelOptions {
  connectionFile: string;
  mode?: SageLanguageMode;
}

class SocketSendQueue {
  private tail = Promise.resolve();

  constructor(
    private socket: {
      send(message: Array<Buffer | string>): Promise<void>;
    },
  ) {}

  send(frames: Array<Buffer | string>): Promise<void> {
    const result = this.tail.then(() => this.socket.send(frames));
    this.tail = result.catch(() => undefined);
    return result;
  }
}

function packageVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"),
    );
    return String(packageJson.version);
  } catch (_error) {
    return "unknown";
  }
}

function htmlJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item !== "bigint") return item;
    const numeric = Number(item);
    return Number.isSafeInteger(numeric) ? numeric : item.toString();
  })
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function plotlyLayoutDimension(
  figure: unknown,
  name: "width" | "height",
): number | undefined {
  if (figure === null || typeof figure !== "object") return undefined;
  const layout = Reflect.get(figure, "layout");
  if (layout === null || typeof layout !== "object") return undefined;
  const numeric = Number(Reflect.get(layout, name));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

export function plotlyHtmlFallback(figure: unknown): string {
  const id = `sagejs-plotly-${randomUUID()}`;
  const figureJson = htmlJson(figure);
  const width = plotlyLayoutDimension(figure, "width");
  const height = plotlyLayoutDimension(figure, "height");
  const cssWidth = width === undefined ? "100%" : `${width}px`;
  const cssHeight = height === undefined ? "450px" : `${height}px`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
html,body{width:100%;margin:0}
#${id}{width:${cssWidth};height:${cssHeight};max-width:100%}
</style>
<script src="${PLOTLY_CDN}" charset="utf-8"
  onerror="document.getElementById('${id}').textContent='Plotly.js could not be loaded from the CDN.'"></script>
</head>
<body>
<div id="${id}">Loading Plotly.js…</div>
<script>
{
  const figure = ${figureJson};
  const target = document.getElementById(${JSON.stringify(id)});
  if (globalThis.Plotly) {
    target.textContent = "";
    Promise.resolve(Plotly.newPlot(
      target,
      figure.data || [],
      figure.layout || {},
      figure.config || {}
    )).then(() => {
      if (Array.isArray(figure.frames) && figure.frames.length && Plotly.addFrames) {
        return Plotly.addFrames(target, figure.frames);
      }
    });
  }
}
</script>
</body>
</html>`;
}

function socketAddress(
  connection: ConnectionInfo,
  port: number,
): string {
  return `${connection.transport}://${connection.ip}:${port}`;
}

function jsonFrame(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value ?? {}));
}

function decodeJson(frame: Buffer): Record<string, any> {
  return JSON.parse(frame.toString("utf8"));
}

function hashName(signatureScheme: string): string {
  const prefix = "hmac-";
  if (!signatureScheme.startsWith(prefix)) {
    throw new Error(
      `unsupported Jupyter signature scheme ${signatureScheme}`,
    );
  }
  return signatureScheme.slice(prefix.length);
}

function signFrames(
  connection: ConnectionInfo,
  frames: readonly Buffer[],
): string {
  if (!connection.key) return "";
  const hmac = createHmac(hashName(connection.signature_scheme), connection.key);
  for (const frame of frames) hmac.update(frame);
  return hmac.digest("hex");
}

function validSignature(
  connection: ConnectionInfo,
  signature: string,
  frames: readonly Buffer[],
): boolean {
  const expected = Buffer.from(signFrames(connection, frames));
  const received = Buffer.from(signature);
  return (
    expected.length === received.length &&
    timingSafeEqual(expected, received)
  );
}

function parseMessage(
  connection: ConnectionInfo,
  frames: Buffer[],
): JupyterMessage {
  const delimiter = frames.findIndex((frame) => frame.equals(DELIMITER));
  if (delimiter < 0 || frames.length < delimiter + 6) {
    throw new Error("malformed Jupyter message");
  }
  const identities = frames.slice(0, delimiter);
  const signature = frames[delimiter + 1].toString("ascii");
  const signed = frames.slice(delimiter + 2, delimiter + 6);
  if (!validSignature(connection, signature, signed)) {
    throw new Error("invalid Jupyter message signature");
  }
  return {
    identities,
    signature,
    header: decodeJson(signed[0]) as unknown as MessageHeader,
    parentHeader: decodeJson(signed[1]),
    metadata: decodeJson(signed[2]),
    content: decodeJson(signed[3]),
    buffers: frames.slice(delimiter + 6),
  };
}

function makeHeader(
  msgType: string,
  parent?: MessageHeader,
): MessageHeader {
  return {
    msg_id: randomUUID(),
    username: parent?.username ?? "sagejs",
    session: parent?.session ?? randomUUID(),
    date: new Date().toISOString(),
    msg_type: msgType,
    version: PROTOCOL_VERSION,
  };
}

function encodedMessage(
  connection: ConnectionInfo,
  msgType: string,
  parent: JupyterMessage | undefined,
  content: Record<string, unknown>,
  metadata: Record<string, unknown> = {},
  buffers: Buffer[] = [],
): Buffer[] {
  const header = jsonFrame(makeHeader(msgType, parent?.header));
  const parentHeader = jsonFrame(parent?.header ?? {});
  const metadataFrame = jsonFrame(metadata);
  const contentFrame = jsonFrame(content);
  const signed = [header, parentHeader, metadataFrame, contentFrame];
  return [
    DELIMITER,
    Buffer.from(signFrames(connection, signed)),
    ...signed,
    ...buffers,
  ];
}

function traceback(error: unknown): {
  ename: string;
  evalue: string;
  traceback: string[];
} {
  const value = error as {
    name?: string;
    message?: string;
    stack?: string;
  };
  const interrupted = error instanceof SageSessionInterruptedError;
  const ename = interrupted ? "KeyboardInterrupt" : value?.name ?? "Error";
  const evalue = interrupted
    ? "Interrupted"
    : value?.message ?? String(error);
  const lines = (value?.stack ?? `${ename}: ${evalue}`)
    .split("\n")
    .filter(Boolean);
  if (interrupted) return { ename, evalue, traceback: [`${ename}: ${evalue}`] };
  return { ename, evalue, traceback: lines };
}

/**
 * A Jupyter wire-protocol server backed by one persistent SageSession.
 */
export class SageJupyterKernel {
  private readonly connection: ConnectionInfo;
  private readonly mode: SageLanguageMode;
  private readonly shell = new Router();
  private readonly control = new Router();
  private readonly stdin = new Router();
  private readonly iopub = new Publisher();
  private readonly heartbeat = new Reply();
  private readonly shellQueue = new SocketSendQueue(this.shell);
  private readonly controlQueue = new SocketSendQueue(this.control);
  private readonly iopubQueue = new SocketSendQueue(this.iopub);
  private readonly kernelId = randomUUID();
  private session?: SageSession;
  private executionCount = 0;
  private closing = false;
  private stopped!: () => void;
  private readonly stoppedPromise = new Promise<void>((resolve) => {
    this.stopped = resolve;
  });

  constructor({ connectionFile, mode = "sage" }: KernelOptions) {
    this.connection = JSON.parse(readFileSync(connectionFile, "utf8"));
    this.mode = mode;
  }

  private async sendRouterReply(
    queue: SocketSendQueue,
    request: JupyterMessage,
    msgType: string,
    content: Record<string, unknown>,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await queue.send([
      ...request.identities,
      ...encodedMessage(
        this.connection,
        msgType,
        request,
        content,
        metadata,
      ),
    ]);
  }

  private async publish(
    msgType: string,
    parent: JupyterMessage | undefined,
    content: Record<string, unknown>,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.iopubQueue.send([
      Buffer.from(`kernel.${this.kernelId}.${msgType}`),
      ...encodedMessage(
        this.connection,
        msgType,
        parent,
        content,
        metadata,
      ),
    ]);
  }

  private publishStatus(
    state: "starting" | "busy" | "idle",
    parent?: JupyterMessage,
  ): Promise<void> {
    return this.publish("status", parent, { execution_state: state });
  }

  private kernelInfo(): Record<string, unknown> {
    return {
      status: "ok",
      protocol_version: PROTOCOL_VERSION,
      implementation: "sagejs",
      implementation_version: packageVersion(),
      language_info: {
        name: this.mode === "sage" ? "sage" : "python",
        version: "3.14",
        mimetype: "text/x-python",
        file_extension: this.mode === "sage" ? ".sage" : ".py",
        pygments_lexer: "python",
        codemirror_mode: { name: "python", version: 3 },
        nbconvert_exporter: "python",
      },
      banner:
        this.mode === "sage"
          ? "Sage.js Polyglot — shared Sage, Python, Magma, MATLAB, Maple, and Wolfram cells"
          : "Sage.js Python mode",
      help_links: [
        {
          text: "Sage.js",
          url: "https://github.com/sagemathinc/sagejs",
        },
        {
          text: "SageMath documentation",
          url: "https://doc.sagemath.org/",
        },
      ],
    };
  }

  private async execute(request: JupyterMessage): Promise<void> {
    const content = request.content;
    const silent = Boolean(content.silent);
    const storeHistory = content.store_history !== false;
    if (!silent && storeHistory) this.executionCount += 1;
    const executionCount = this.executionCount;

    if (!silent) {
      await this.publish("execute_input", request, {
        code: String(content.code ?? ""),
        execution_count: executionCount,
      });
    }

    let outputTail = Promise.resolve();
    try {
      const parsedCell = prepareSubmittedPolyglotCell(
        parsePolyglotCell(
          String(content.code ?? ""),
          this.mode,
        ),
      );
      const cell = {
        ...parsedCell,
        source: rewriteQuestionMarkHelp(
          parsedCell.source, parsedCell.language),
      };
      const result = await this.session!.evaluate(cell.source, {
        filename: `<jupyter-input-${executionCount}>`,
        language: cell.language,
        onOutput: (text) => {
          if (silent) return;
          outputTail = outputTail.then(() =>
            this.publish("stream", request, {
              name: "stdout",
              text,
            }),
          );
        },
      });
      await outputTail;
      if (!silent && (result.repr || result.display)) {
        const data: Record<string, unknown> = {};
        if (result.repr) data["text/plain"] = result.repr;
        if (result.display) {
          data[result.display.mime] = result.display.data;
          if (result.display.mime === PLOTLY_MIME) {
            data["text/html"] = plotlyHtmlFallback(result.display.data);
          }
        }
        await this.publish("execute_result", request, {
          execution_count: executionCount,
          data,
          metadata: {},
        }, { sagejs: { language: cell.language } });
      }
      await this.sendRouterReply(
        this.shellQueue,
        request,
        "execute_reply",
        {
          status: "ok",
          execution_count: executionCount,
          user_expressions: {},
          payload: [],
        },
      );
    } catch (error) {
      await outputTail;
      const details = traceback(error);
      if (!silent) await this.publish("error", request, details);
      await this.sendRouterReply(
        this.shellQueue,
        request,
        "execute_reply",
        {
          status: "error",
          execution_count: executionCount,
          ...details,
        },
      );
    }
  }

  private async handleShell(request: JupyterMessage): Promise<void> {
    await this.publishStatus("busy", request);
    try {
      switch (request.header.msg_type) {
        case "kernel_info_request":
          await this.sendRouterReply(
            this.shellQueue,
            request,
            "kernel_info_reply",
            this.kernelInfo(),
          );
          break;
        case "execute_request":
          await this.execute(request);
          break;
        case "complete_request": {
          const source = String(request.content.code ?? "");
          const cursorPosition = Number(
            request.content.cursor_pos ?? Array.from(source).length,
          );
          const cell = parsePolyglotCell(source, this.mode);
          if (cursorPosition < cell.cursorOffset) {
            await this.sendRouterReply(
              this.shellQueue,
              request,
              "complete_reply",
              {
                status: "ok",
                matches: [],
                cursor_start: cursorPosition,
                cursor_end: cursorPosition,
                metadata: {},
              },
            );
            break;
          }
          const completion = await this.session!.complete(
            cell.source,
            cursorPosition - cell.cursorOffset,
          );
          await this.sendRouterReply(
            this.shellQueue,
            request,
            "complete_reply",
            {
              status: "ok",
              matches: completion.matches,
              cursor_start: completion.cursorStart + cell.cursorOffset,
              cursor_end: completion.cursorEnd + cell.cursorOffset,
              metadata: {},
            },
          );
          break;
        }
        case "inspect_request": {
          const source = String(request.content.code ?? "");
          const cursorPosition = Number(
            request.content.cursor_pos ?? Array.from(source).length,
          );
          const cell = parsePolyglotCell(source, this.mode);
          const inspection = await this.session!.inspect(
            cell.source,
            Math.max(0, cursorPosition - cell.cursorOffset),
          );
          await this.sendRouterReply(
            this.shellQueue,
            request,
            "inspect_reply",
            {
              status: "ok",
              found: inspection.found,
              data: inspection.found
                ? { "text/plain": inspection.text }
                : {},
              metadata: {},
            },
          );
          break;
        }
        case "is_complete_request": {
          const cell = prepareSubmittedPolyglotCell(
            parsePolyglotCell(
              String(request.content.code ?? ""),
              this.mode,
            ),
          );
          const completeness = await this.session!.isComplete(cell.source, {
            language: cell.language,
          });
          await this.sendRouterReply(
            this.shellQueue,
            request,
            "is_complete_reply",
            {
              status: completeness.status,
              ...(completeness.indent === undefined
                ? {}
                : { indent: completeness.indent }),
            },
          );
          break;
        }
        case "history_request":
          await this.sendRouterReply(
            this.shellQueue,
            request,
            "history_reply",
            { status: "ok", history: [] },
          );
          break;
        case "comm_info_request":
          await this.sendRouterReply(
            this.shellQueue,
            request,
            "comm_info_reply",
            { status: "ok", comms: {} },
          );
          break;
        case "shutdown_request":
          await this.sendRouterReply(
            this.shellQueue,
            request,
            "shutdown_reply",
            {
              status: "ok",
              restart: Boolean(request.content.restart),
            },
          );
          setImmediate(() => void this.close());
          break;
        default:
          await this.sendRouterReply(
            this.shellQueue,
            request,
            `${request.header.msg_type.replace(/_request$/, "")}_reply`,
            {
              status: "error",
              ename: "NotImplementedError",
              evalue: `unsupported Jupyter request ${request.header.msg_type}`,
              traceback: [],
            },
          );
      }
    } finally {
      if (!this.closing) await this.publishStatus("idle", request);
    }
  }

  private async handleControl(request: JupyterMessage): Promise<void> {
    if (request.header.msg_type === "interrupt_request") {
      await this.session!.interrupt();
      await this.sendRouterReply(
        this.controlQueue,
        request,
        "interrupt_reply",
        { status: "ok" },
      );
      return;
    }
    if (request.header.msg_type === "shutdown_request") {
      await this.sendRouterReply(
        this.controlQueue,
        request,
        "shutdown_reply",
        {
          status: "ok",
          restart: Boolean(request.content.restart),
        },
      );
      setImmediate(() => void this.close());
      return;
    }
    await this.sendRouterReply(
      this.controlQueue,
      request,
      `${request.header.msg_type.replace(/_request$/, "")}_reply`,
      {
        status: "error",
        ename: "NotImplementedError",
        evalue: `unsupported Jupyter control request ${request.header.msg_type}`,
        traceback: [],
      },
    );
  }

  private async routerLoop(
    socket: Router,
    handler: (message: JupyterMessage) => Promise<void>,
  ): Promise<void> {
    try {
      for await (const frames of socket) {
        if (this.closing) return;
        try {
          await handler(
            parseMessage(this.connection, frames as unknown as Buffer[]),
          );
        } catch (error) {
          if (!this.closing) {
            process.stderr.write(
              `Sage.js Jupyter message error: ${
                (error as Error)?.stack ?? error
              }\n`,
            );
          }
        }
      }
    } catch (error) {
      if (!this.closing) throw error;
    }
  }

  private async heartbeatLoop(): Promise<void> {
    try {
      for await (const frames of this.heartbeat) {
        if (this.closing) return;
        await this.heartbeat.send(frames);
      }
    } catch (error) {
      if (!this.closing) throw error;
    }
  }

  async start(): Promise<void> {
    this.session = await createSage({ mode: this.mode });
    await Promise.all([
      this.shell.bind(
        socketAddress(this.connection, this.connection.shell_port),
      ),
      this.control.bind(
        socketAddress(this.connection, this.connection.control_port),
      ),
      this.stdin.bind(
        socketAddress(this.connection, this.connection.stdin_port),
      ),
      this.iopub.bind(
        socketAddress(this.connection, this.connection.iopub_port),
      ),
      this.heartbeat.bind(
        socketAddress(this.connection, this.connection.hb_port),
      ),
    ]);
    await this.publishStatus("starting");

    void this.routerLoop(this.shell, (message) => this.handleShell(message));
    void this.routerLoop(this.control, (message) =>
      this.handleControl(message),
    );
    void this.heartbeatLoop();
  }

  waitUntilClosed(): Promise<void> {
    return this.stoppedPromise;
  }

  interrupt(): Promise<void> {
    if (!this.session) return Promise.resolve();
    return this.session.interrupt();
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    await this.session?.close();
    this.shell.close();
    this.control.close();
    this.stdin.close();
    this.iopub.close();
    this.heartbeat.close();
    this.stopped();
  }
}

function optionValue(args: string[], names: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    if (names.includes(args[index])) return args[index + 1];
    const prefix = names.find((name) => args[index].startsWith(`${name}=`));
    if (prefix) return args[index].slice(prefix.length + 1);
  }
  return undefined;
}

export function createKernelSpec(
  mode: SageLanguageMode,
  launcher: string[],
): Record<string, unknown> {
  return {
    argv: [
      ...launcher,
      "--connection-file",
      "{connection_file}",
      "--mode",
      mode,
    ],
    display_name:
      mode === "sage" ? "Sage.js Polyglot" : "Sage.js (Python mode)",
    language: mode === "sage" ? "sage" : "python",
    interrupt_mode: "message",
    metadata: {
      debugger: false,
    },
  };
}

function defaultKernelLauncher(): string[] {
  const root = resolve(join(__dirname, "..", ".."));
  return [process.execPath, resolve(join(root, "bin", "sagejs-jupyter"))];
}

export function installKernelSpec(
  mode: SageLanguageMode,
  args: string[],
  launcher = defaultKernelLauncher(),
): void {
  const kernelName = mode === "sage" ? "sagejs" : "sagejs-python";
  const temporaryRoot = mkdtempSync(
    join(tmpdir(), "sagejs-kernelspec-"),
  );
  const specDirectory = join(temporaryRoot, kernelName);
  try {
    mkdirSync(specDirectory);
    writeFileSync(
      join(specDirectory, "kernel.json"),
      `${JSON.stringify(
        createKernelSpec(mode, launcher),
        null,
        2,
      )}\n`,
    );
    const installArgs = [
      "kernelspec",
      "install",
      specDirectory,
      "--name",
      kernelName,
      "--replace",
    ];
    const prefix = optionValue(args, ["--prefix"]);
    const requestedLocations = Number(Boolean(prefix)) +
      Number(args.includes("--sys-prefix")) + Number(args.includes("--user"));
    if (requestedLocations > 1) {
      throw new Error(
        "choose only one of --user, --sys-prefix, or --prefix",
      );
    }
    if (prefix) installArgs.push("--prefix", prefix);
    else if (args.includes("--sys-prefix")) installArgs.push("--sys-prefix");
    else installArgs.push("--user");
    const result = spawnSync("jupyter", installArgs, { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function usage(): string {
  return `Usage:
  ${basename(process.argv[1])} --connection-file FILE [--mode sage|python]
  ${basename(process.argv[1])} --install [--mode sage|python] [--user|--sys-prefix|--prefix DIR]
`;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(usage());
    return;
  }
  const mode = (optionValue(args, ["--mode"]) ?? "sage") as SageLanguageMode;
  if (mode !== "sage" && mode !== "python") {
    throw new Error(`unknown Sage.js language mode ${JSON.stringify(mode)}`);
  }
  if (args.includes("--install")) {
    installKernelSpec(mode, args);
    return;
  }
  const connectionFile = optionValue(args, ["--connection-file", "-f"]);
  if (!connectionFile) throw new Error(`missing connection file\n\n${usage()}`);

  process.title = `sagejs-jupyter-${mode}`;
  const kernel = new SageJupyterKernel({ connectionFile, mode });
  process.on("SIGINT", () => void kernel.interrupt());
  process.on("SIGTERM", () => void kernel.close());
  await kernel.start();
  await kernel.waitUntilClosed();
}

export async function runtimeSelfTest(): Promise<string> {
  const socket = new Router();
  socket.close();
  const sage = await createSage();
  try {
    const result = await sage.evaluate("2^8");
    if (result.repr !== "256") {
      throw new Error(
        `Jupyter worker returned ${JSON.stringify(result.repr)}, expected 256`,
      );
    }
  } finally {
    await sage.close();
  }
  return "Sage.js Jupyter SEA runtime passed.";
}
