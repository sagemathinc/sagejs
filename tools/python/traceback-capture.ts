/** Explicit capture selection; native remains the unqualified-path default. */
export type PythonTracebackCapture = "native" | "guarded";

export function resolveTracebackCapture(
  value: unknown = process.env.SAGEJS_TRACEBACK_CAPTURE ?? "native",
): PythonTracebackCapture {
  if (value === "native" || value === "guarded") return value;
  throw new TypeError("tracebackCapture must be 'native' or 'guarded'");
}
