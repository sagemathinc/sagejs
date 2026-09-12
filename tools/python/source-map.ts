/** Exact emission coordinates, independent of a stack-capture transport.
 *
 * Offsets/columns are UTF-16 code units; lines are one-based, columns zero-based.
 * A host must supply the actual executable identity, not a user-visible filename.
 * Unmapped means only that this collector has no attribution for that position.
 */
export interface EmissionPosition { line: number; column: number; offset: number }
export interface SourceLocation {
  filename: string;
  name: string | null;
  start: { line: number; column: number };
  end: { line: number; column: number };
}
export interface EmissionSpan {
  kind: "execution" | "exclusion" | "scope";
  start: number;
  end: number;
  depth: number;
  source: SourceLocation | null;
}
export interface PythonSourceMap {
  schema: "sagejs.python-source-map/v1";
  source: { filename: string; text: string };
  generated: string;
  spans: readonly EmissionSpan[];
}
export type SourceLookup =
  | { status: "mapped"; source: SourceLocation; line: string }
  | { status: "unmapped" }
  | { status: "excluded" }
  | { status: "ambiguous" };

function integer(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let offset = 0; offset < text.length; offset++) {
    if (text[offset] === "\n") starts.push(offset + 1);
  }
  return starts;
}

function offsetAt(text: string, line: number, column: number, starts: readonly number[]): number {
  if (!integer(line) || line < 1 || !integer(column)) {
    throw new TypeError("invalid source-map position");
  }
  const start = starts[line - 1];
  if (start === undefined) throw new RangeError("source-map line exceeds text");
  const end = line === starts.length ? text.length : starts[line] - 1;
  if (start + column > end) throw new RangeError("source-map column exceeds line");
  return start + column;
}

function freezeMap(map: PythonSourceMap): PythonSourceMap {
  if (map.schema !== "sagejs.python-source-map/v1" ||
      typeof map.source?.filename !== "string" || typeof map.source.text !== "string" ||
      typeof map.generated !== "string" || !Array.isArray(map.spans)) {
    throw new TypeError("invalid Python source map");
  }
  const sourceLines = lineStarts(map.source.text);
  const spans = map.spans.map((span): EmissionSpan => {
    if (!integer(span.start) || !integer(span.end) || !integer(span.depth) ||
        span.end <= span.start || span.end > map.generated.length) {
      throw new RangeError("invalid emission span");
    }
    if (!["execution", "exclusion", "scope"].includes(span.kind) ||
        (span.kind === "execution") !== (span.source !== null)) {
      throw new TypeError("invalid emission span kind");
    }
    let source: SourceLocation | null = null;
    if (span.source !== null) {
      const value = span.source;
      if (value.filename !== map.source.filename ||
          (value.name !== null && typeof value.name !== "string")) {
        throw new TypeError("invalid source location");
      }
      const start = offsetAt(map.source.text, value.start.line, value.start.column, sourceLines);
      const end = offsetAt(map.source.text, value.end.line, value.end.column, sourceLines);
      if (end < start) throw new RangeError("reversed source span");
      source = Object.freeze({ filename: value.filename, name: value.name,
        start: Object.freeze({ ...value.start }), end: Object.freeze({ ...value.end }) });
    }
    return Object.freeze({ kind: span.kind, start: span.start, end: span.end, depth: span.depth, source });
  });
  return Object.freeze({ schema: map.schema,
    source: Object.freeze({ ...map.source }), generated: map.generated,
    spans: Object.freeze(spans) });
}

/** Validate serialized cache input before accepting any accompanying code. */
export function validatePythonSourceMap(map: PythonSourceMap, javascript: string,
  sourceText: string): PythonSourceMap {
  const snapshot = freezeMap(map);
  if (snapshot.generated !== javascript) throw new Error("generated source does not match map");
  if (snapshot.source.text !== sourceText) throw new Error("Python source does not match map");
  return snapshot;
}

/** Conservative execution sites: argument/literal ranges are not call sites.
 * Additional emission kinds require explicit semantics, not nearest-line guesses.
 */
const EXECUTION_NODES = new Set(["Call", "New", "Throw"]);
const FUNCTION_NODES = new Set(["Function", "Method", "Lambda"]);

export class PythonSourceMapCollector {
  private readonly stack: Array<{ node: any; start: EmissionPosition; name: string | null; scopeBoundary: boolean }> = [];
  private readonly completed: EmissionSpan[] = [];
  private readonly positions: EmissionPosition[] = [];
  private finished = false;
  private readonly sourceLines: number[];

  constructor(private readonly sourceText: string, private readonly filename: string) {
    this.sourceLines = lineStarts(sourceText);
  }

  push(node: any, start: EmissionPosition): void {
    if (this.finished) throw new Error("source-map collector already finished");
    const parent = this.stack.at(-1);
    let name = parent ? parent.name : "<module>";
    const owner = parent?.node;
    const ownerKind = String(owner?.constructor?.name ?? "").replace(/^AST_/, "");
    if (FUNCTION_NODES.has(ownerKind)) {
      // Function emission includes defaults/decorators, which execute in the
      // enclosing scope. Only entering an actual body child changes co_name.
      // A lambda has one expression body, ordinary functions a statement list.
      const isBody = Array.isArray(owner.body) ? owner.body.includes(node) : owner.body === node;
      if (isBody) {
        const declaredName = owner?.name?.name ?? owner?.name;
        name = ownerKind === "Lambda" || owner.is_lambda === true
          ? "<lambda>" : typeof declaredName === "string" ? declaredName : null;
      } else if (owner.body === undefined || owner.body === null) {
        name = null;
      }
    }
    const kind = String(node?.constructor?.name ?? "").replace(/^AST_/, "");
    // These scopes need separate execution-ownership modeling (including
    // definition-time bases/decorators and outermost comprehension iterables).
    // Keep precise call coordinates without inventing their Python co_name.
    const unmodeledScope = kind === "Class" || kind.endsWith("Comprehension");
    if (unmodeledScope) name = null;
    this.positions.push({ ...start });
    this.stack.push({ node, start: { ...start }, name,
      scopeBoundary: FUNCTION_NODES.has(kind) || unmodeledScope });
  }

  pop(node: any, end: EmissionPosition): void {
    const active = this.stack.at(-1);
    if (!active || active.node !== node) throw new Error("unbalanced source-map emission");
    if (end.offset < active.start.offset) throw new Error("reversed emission coordinates");
    this.stack.pop();
    this.positions.push({ ...end });
    const kind = String(node?.constructor?.name ?? "").replace(/^AST_/, "");
    if (EXECUTION_NODES.has(kind) && end.offset > active.start.offset) {
      // Transform-created nodes may have no original position. They must not
      // inherit a surrounding call's attribution or reject an otherwise valid
      // module. A null span explicitly prevents that enclosing attribution.
      let source: SourceLocation | null = null;
      try {
        const startOffset = offsetAt(this.sourceText, node.start?.line, node.start?.col, this.sourceLines);
        const endOffset = offsetAt(this.sourceText, node.end?.line, node.end?.col, this.sourceLines);
        if (endOffset >= startOffset) source = {
          filename: this.filename, name: active.name,
          start: { line: node.start.line, column: node.start.col },
          end: { line: node.end.line, column: node.end.col },
        };
      } catch (_error) {}
      this.completed.push({ kind: source ? "execution" : "exclusion",
        start: active.start.offset, end: end.offset, depth: this.stack.length, source });
    }
    if (active.scopeBoundary && end.offset > active.start.offset) {
      // A function/class/comprehension can be emitted inside an enclosing Call.
      // Include its binder/prologue, not just original body children. Deeper
      // default/decorator and body sites remain eligible, with their separately
      // established co_name; no outer call may claim any generated scaffolding.
      this.completed.push({ kind: "scope", start: active.start.offset, end: end.offset,
        depth: this.stack.length, source: null });
    }
  }

  /** Exclude only a compiler/host range known by its emitter to be scaffolding. */
  exclude(start: number, end: number): void {
    if (this.finished) throw new Error("source-map collector already finished");
    this.completed.push({ kind: "exclusion", start, end, depth: 0, source: null });
  }

  finish(generated: string): PythonSourceMap {
    if (this.finished || this.stack.length) throw new Error("unfinished or reused source-map collector");
    const generatedLines = lineStarts(generated);
    for (const position of this.positions) {
      if (offsetAt(generated, position.line, position.column, generatedLines) !== position.offset) {
        throw new Error("emission coordinates do not match generated text");
      }
    }
    const map = freezeMap({ schema: "sagejs.python-source-map/v1",
      source: { filename: this.filename, text: this.sourceText }, generated,
      spans: this.completed });
    this.finished = true;
    return map;
  }
}

export interface GeneratedEdit { start: number; end: number; text: string }

/** Apply ordered nonoverlapping edits in old UTF-16 coordinates.
 * Replaced/inserted text has no attribution; surviving text retains its exact
 * original source. This also handles wrappers without magic line offsets.
 */
export function relocatePythonSourceMap(map: PythonSourceMap, edits: readonly GeneratedEdit[]): PythonSourceMap {
  map = freezeMap(map);
  const chunks: string[] = [];
  const spans: EmissionSpan[] = [];
  let cursor = 0;
  let generatedOffset = 0;
  const retain = (end: number): void => {
    for (const span of map.spans) {
      const start = Math.max(cursor, span.start);
      const stop = Math.min(end, span.end);
      if (start < stop) spans.push({ kind: span.kind, start: generatedOffset + start - cursor,
        end: generatedOffset + stop - cursor, depth: span.depth, source: span.source });
    }
    chunks.push(map.generated.slice(cursor, end));
    generatedOffset += end - cursor;
  };
  for (const edit of edits) {
    if (!integer(edit.start) || !integer(edit.end) || edit.start < cursor ||
        edit.end < edit.start || edit.end > map.generated.length || typeof edit.text !== "string") {
      throw new TypeError("invalid or overlapping generated edits");
    }
    retain(edit.start);
    chunks.push(edit.text);
    generatedOffset += edit.text.length;
    cursor = edit.end;
  }
  retain(map.generated.length);
  return freezeMap({ ...map, generated: chunks.join(""), spans });
}

/** Weak keys preserve old executable mappings without retaining dead scripts.
 * The embedding owns lifetime: if closures outlive its Script, it must retain
 * that executable identity with the closures. No filename-based fallback exists.
 */
export class PythonSourceMapRegistry {
  private readonly maps = new WeakMap<object, {
    map: PythonSourceMap; lines: number[]; sourceLines: number[];
  }>();

  register(executable: object, javascript: string, sourceText: string, map: PythonSourceMap): void {
    if ((typeof executable !== "object" || executable === null) && typeof executable !== "function") {
      throw new TypeError("executable identity must be an object");
    }
    if (this.maps.has(executable)) throw new Error("executable already registered");
    const snapshot = validatePythonSourceMap(map, javascript, sourceText);
    this.maps.set(executable, { map: snapshot, lines: lineStarts(javascript),
      sourceLines: lineStarts(sourceText) });
  }

  lookup(executable: object, line: number, column: number): SourceLookup {
    const registration = this.maps.get(executable);
    if (!registration) return { status: "unmapped" };
    const { map, lines } = registration;
    const offset = offsetAt(map.generated, line, column, lines);
    const spans = map.spans.filter((span) => span.start <= offset && offset < span.end);
    if (spans.some((span) => span.kind === "exclusion")) return { status: "excluded" };
    const bodyDepth = Math.max(-1, ...spans.filter((span) => span.kind === "scope").map((span) => span.depth));
    const eligible = spans.filter((span) => span.kind === "execution" && span.depth >= bodyDepth);
    if (!eligible.length) return { status: "unmapped" };
    const depth = Math.max(...eligible.map((span) => span.depth));
    const candidates = eligible.filter((span) => span.depth === depth);
    const source = candidates[0].source!;
    if (candidates.some((span) => JSON.stringify(span.source) !== JSON.stringify(source))) {
      return { status: "ambiguous" };
    }
    const sourceLine = source.start.line;
    const start = registration.sourceLines[sourceLine - 1];
    const end = sourceLine === registration.sourceLines.length
      ? map.source.text.length : registration.sourceLines[sourceLine] - 1;
    // Source is the immutable registration snapshot, never the current contents
    // of filename. Preserve indentation, but omit the physical line terminator.
    const sourceLineText = map.source.text.slice(start, end).replace(/\r$/, "");
    return { status: "mapped", source, line: sourceLineText };
  }
}
