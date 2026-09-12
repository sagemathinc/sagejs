import { randomUUID } from "node:crypto";
import { Script } from "node:vm";
import { PythonSourceMap, PythonSourceMapRegistry } from "./source-map";

const registry = new PythonSourceMapRegistry();
// An executable may leave live closures after its top-level evaluation returns.
// Keep these identities for the lifetime of this Node runtime, not just a cell.
const executables = new Map<string, Script>();
const captureHook = "__sagejs_capture_python_frames__";

function capture(error: Error | null, boundary?: Function): readonly unknown[] {
  const currentStack = error === null;
  if (currentStack) {
    error = new Error();
    Error.captureStackTrace(error, boundary ?? capture);
  }
  const frames: unknown[] = [];
  for (const raw of String(error?.stack ?? "").split("\n").slice(1)) {
    const text = raw.trim().replace(/^at\s+/, "");
    const paren = text.lastIndexOf(" (");
    const name = paren >= 0 ? text.slice(0, paren) : null;
    const location = paren >= 0 && text.endsWith(")") ? text.slice(paren + 2, -1) : text;
    const match = /^(.*):(\d+):(\d+)$/.exec(location);
    // Keyword invocation of extract_stack has this known bootstrap trampoline
    // immediately outside the excluded capture boundary. It is not a Python
    // caller. This exemption applies ONLY to current-stack collection, never
    // to an exception stack (where dropping helpers could hide a body failure).
    if (currentStack && frames.length === 0 &&
        (name === "ρσ_interpolate_kwargs" || name === "ρσ_invoke_prepared_method" ||
         name === "_internal_bind_kwargs" || name === "ρσ_invoke_prepared_keywords") &&
        match && /^sagejs\/runtime-bootstrap-(python|sage)\.js$/.test(match[1])) continue;
    const executable = match ? executables.get(match[1]) : undefined;
    if (executable && match) {
      const found = registry.lookup(executable, Number(match[2]), Number(match[3]) - 1);
      if (found.status === "mapped") {
        frames.push(Object.freeze({
          filename: found.source.filename, lineno: found.source.start.line,
          name: found.source.name, line: found.line, provenance: "python-source", raw,
        }));
        continue;
      }
    }
    // Unmapped, ambiguous, and explicitly excluded source ranges retain their
    // generated frame. Exclusion is not proof that an execution frame is safe
    // to erase. Only the current-capture trampolines above can disappear.
    // An unmapped body operation must remain distinguishable from its mapped
    // caller. Dropping it can turn a genuine callback TypeError into an apparent
    // argument-binding failure in traceback-sensitive libraries.
    frames.push(Object.freeze({ filename: match ? match[1] : location,
      lineno: match ? Number(match[2]) : 0, name, line: null,
      provenance: executable ? "generated" : "native-stack", raw }));
  }
  return Object.freeze(frames.reverse());
}

export function mappedPythonScript(javascript: string, sourceText: string, map: PythonSourceMap,
  cachedData?: Buffer): Script {
  const url = `sagejs-python://${randomUUID()}`;
  // V8 compiles the source when bytecode is rejected; preserve the rejection
  // flag so the cache owner can refresh it without losing executable identity.
  const script = new Script(javascript, { filename: url, cachedData });
  registry.register(script, javascript, sourceText, map);
  executables.set(url, script);
  if (!Object.prototype.hasOwnProperty.call(globalThis, captureHook)) {
    Object.defineProperty(globalThis, captureHook, { value: capture,
      writable: false, configurable: false, enumerable: false });
  }
  return script;
}
