import type { WriteStream } from "node:tty";

const installedStreams = new WeakSet<object>();

/**
 * Treat a downstream reader closing stdout as normal CLI termination.
 *
 * Unix pipelines routinely stop reading before a producer has finished. For
 * example, `sagejs cache prune --json | head` closes the pipe after the first
 * few lines. Node reports that condition as an `EPIPE` error event on stdout;
 * without a listener it prints an exception even though the command worked.
 *
 * Only the broken-pipe condition is handled. Other stream failures are thrown
 * so genuine output errors retain their usual nonzero failure behavior.
 */
export function installCliOutputHandler(
  stream: Pick<WriteStream, "on"> = process.stdout,
  exit: (code: number) => never | void = process.exit,
): void {
  const identity = stream as object;
  if (installedStreams.has(identity)) return;
  installedStreams.add(identity);
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") {
      exit(0);
      return;
    }
    throw error;
  });
}
