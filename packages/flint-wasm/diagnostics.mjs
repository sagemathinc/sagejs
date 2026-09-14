import {
  attachPythonDiagnostic,
  renderPythonDiagnostic,
  serializeDiagnosticError,
} from "./dist/diagnostics.mjs";

/** Normalize at the worker boundary; never trust a user-assigned envelope. */
export function serializeBrowserError(error, options = { phase: "host" }) {
  let originalStack;
  try {
    const stack = error?.stack;
    if (typeof stack === "string") originalStack = stack;
  } catch {}
  const result = serializeDiagnosticError(attachPythonDiagnostic(error, options));
  // A frozen thrown value may have been wrapped. Its transport wrapper's stack
  // describes normalization, not the failure, and must never replace evidence.
  result.stack = originalStack;
  const diagnostic = result.pythonDiagnostic;
  if (options.pythonExecution) result.sagejsErrorName = diagnostic.exceptionType;
  // Native errors without logical records must retain their useful diagnostics.
  // When records exist, the shared renderer labels any preserved native carrier.
  const structured = diagnostic.frames.length || diagnostic.framesTruncated ||
    diagnostic.cause || diagnostic.context || diagnostic.nativeTraceback;
  let text = renderPythonDiagnostic(diagnostic).trimEnd();
  if (!structured && result.stack) {
    text += "\nNative capture (may overlap Python frames):\n" + result.stack;
  }
  result.traceback = text.split("\n");
  return result;
}
