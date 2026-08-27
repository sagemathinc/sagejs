import { createInterface } from "node:readline";

import { createSage, SageSession } from "./kernel";

type SageLanguageMode = "sage" | "python";

const PROTOCOL = 1;

interface KernelRequest {
  id: number;
  type:
    | "evaluate"
    | "complete"
    | "inspect"
    | "isComplete"
    | "documentation"
    | "interrupt"
    | "reset"
    | "close";
  source?: string;
  filename?: string;
  timeout?: number;
  cursorPosition?: number;
  language?: string;
}

function serializedError(error: unknown): {
  name: string;
  message: string;
  stack?: string;
} {
  const value = error as { name?: string; message?: string; stack?: string };
  return {
    name: value?.name ?? "Error",
    message: value?.message ?? String(error),
    stack: value?.stack,
  };
}

function write(message: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ protocol: PROTOCOL, ...message })}\n`);
}

function checkedRequest(line: string): KernelRequest {
  const request = JSON.parse(line) as Partial<KernelRequest>;
  if (
    request === null ||
    typeof request !== "object" ||
    !Number.isSafeInteger(request.id) ||
    typeof request.type !== "string"
  ) {
    throw new TypeError("invalid Sage.js embedded-kernel request");
  }
  return request as KernelRequest;
}

async function dispatch(
  session: SageSession,
  request: KernelRequest,
): Promise<unknown> {
  switch (request.type) {
    case "evaluate":
      return session.evaluate(request.source ?? "", {
        filename: request.filename,
        timeout: request.timeout,
        language: request.language as any,
        onOutput(text) {
          write({ type: "stdout", id: request.id, text });
        },
      });
    case "complete":
      return session.complete(request.source ?? "", request.cursorPosition ?? 0);
    case "inspect":
      return session.inspect(request.source ?? "", request.cursorPosition ?? 0);
    case "isComplete":
      return session.isComplete(request.source ?? "", {
        language: request.language as any,
      });
    case "documentation":
      return session.documentation();
    case "interrupt":
      await session.interrupt();
      return null;
    case "reset":
      await session.reset();
      return null;
    case "close":
      return null;
    default:
      throw new TypeError(`unknown Sage.js embedded-kernel request ${request.type}`);
  }
}

/** Serve one persistent Sage session over newline-delimited JSON on stdio. */
export async function runStdioKernel(
  mode: SageLanguageMode = "sage",
): Promise<void> {
  const session = await createSage({ mode });
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let closing = false;
  let queue = Promise.resolve();

  const handle = async (request: KernelRequest): Promise<void> => {
    try {
      const result = await dispatch(session, request);
      write({ type: "result", id: request.id, ok: true, result });
      if (request.type === "close") {
        closing = true;
        input.close();
        await session.close();
      }
    } catch (error) {
      write({
        type: "result",
        id: request.id,
        ok: false,
        error: serializedError(error),
      });
    }
  };

  write({ type: "ready", mode });
  input.on("line", (line) => {
    if (!line.trim() || closing) return;
    let request: KernelRequest;
    try {
      request = checkedRequest(line);
    } catch (error) {
      write({ type: "protocol-error", error: serializedError(error) });
      return;
    }

    // Evaluations and namespace-sensitive requests preserve submission order.
    // Interrupt and reset must bypass that queue so they can stop an active
    // synchronous evaluation rather than waiting behind it.
    if (request.type === "interrupt" || request.type === "reset") {
      void handle(request);
    } else {
      queue = queue.then(() => handle(request), () => handle(request));
    }
  });

  await new Promise<void>((resolve, reject) => {
    input.once("close", resolve);
    input.once("error", reject);
  });
  await queue;
  if (!closing) await session.close();
}
