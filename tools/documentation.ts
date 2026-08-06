/**
 * Sage.js DocSpec v1 extraction, search, and rendering.
 *
 * Runtime entries retain the actual callable/class object.  This module is
 * the one boundary that converts those live objects into structured-clone-
 * safe records for CLIs, notebooks, static docs, and agents.
 */

export const DOCSPEC_VERSION = 1 as const;

export type DocumentationKind =
  | "class"
  | "constant"
  | "function"
  | "method"
  | "object";

export interface DocumentationCompatibility {
  status: "compatible" | "extension" | "partial" | "incompatible";
  notes?: string;
}

export interface DocumentationProvenance {
  kind:
    | "sage-derived"
    | "software-derived"
    | "library-backed"
    | "literature-implemented"
    | "sagejs-original";
  source?: string;
  revision?: string;
  url?: string;
  license?: string;
}

export interface DocumentationReference {
  id: string;
  type?: "article" | "book" | "manual" | "paper" | "software" | "web";
  title: string;
  authors?: string[];
  year?: number;
  doi?: string;
  url?: string;
  relevant_sections?: string[];
}

export interface DocumentationEntry {
  schema_version: typeof DOCSPEC_VERSION;
  name: string;
  aliases: string[];
  kind: DocumentationKind;
  module: string;
  signature: string;
  summary: string;
  doc: string;
  tags: string[];
  backends: string[];
  sage_compatibility: DocumentationCompatibility;
  provenance: DocumentationProvenance[];
  references: DocumentationReference[];
  implementation?: {
    algorithm?: string;
    notes?: string;
  };
  limitations: string[];
}

export interface DocumentationCatalog {
  schema_version: typeof DOCSPEC_VERSION;
  entries: DocumentationEntry[];
}

export interface DocumentationSearchOptions {
  regex?: boolean;
  caseSensitive?: boolean;
  kind?: string;
  backend?: string;
  tag?: string;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.filter((item): item is string => typeof item === "string")),
  ];
}

function plainValue(
  value: unknown,
  seen = new Set<object>(),
): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number.isSafeInteger(Number(value)) ? Number(value) : String(value);
  }
  if (typeof value !== "object") return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => plainValue(item, seen));
  }
  if (value instanceof Map) {
    const answer: Record<string, unknown> = {};
    for (const [key, item] of value) {
      answer[String(key)] = plainValue(item, seen);
    }
    return answer;
  }

  // SageDict keeps original keys separately from normalized lookup keys.
  const possibleSageDict = value as {
    jsmap?: unknown;
    keymap?: unknown;
  };
  if (
    possibleSageDict.jsmap instanceof Map &&
    possibleSageDict.keymap instanceof Map
  ) {
    const answer: Record<string, unknown> = {};
    for (const [normalizedKey, item] of possibleSageDict.jsmap) {
      answer[String(possibleSageDict.keymap.get(normalizedKey))] =
        plainValue(item, seen);
    }
    return answer;
  }

  const answer: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const item = Reflect.get(value, key);
    if (typeof item !== "function") answer[key] = plainValue(item, seen);
  }
  return answer;
}

function objectValue(value: unknown): Record<string, any> {
  const converted = plainValue(value);
  return converted && typeof converted === "object" && !Array.isArray(converted)
    ? converted as Record<string, any>
    : {};
}

function callableName(value: unknown): string {
  if (typeof value !== "function") return "";
  const raw = Reflect.get(value, "__name__") ?? value.name;
  return typeof raw === "string" ? raw.replace(/^ρσ_/, "") : "";
}

function inferKind(
  name: string,
  value: unknown,
  requested: unknown,
): DocumentationKind {
  if (
    requested === "class" ||
    requested === "constant" ||
    requested === "function" ||
    requested === "method" ||
    requested === "object"
  ) {
    return requested;
  }
  if (typeof value !== "function") return "object";
  const prototype = Reflect.get(value, "prototype");
  if (
    prototype &&
    (Reflect.has(prototype, "__bases__") || Reflect.has(prototype, "__mro__"))
  ) {
    return "class";
  }
  return name.includes(".") ? "method" : "function";
}

function defaultRepr(value: unknown): string {
  try {
    const repr = Reflect.get(globalThis, "ρσ_repr");
    return typeof repr === "function" ? String(repr(value)) : String(value);
  } catch (_error) {
    return String(value);
  }
}

function signature(value: unknown, fallbackName: string): string {
  if (typeof value !== "function") return fallbackName;
  const name = callableName(value) || fallbackName.split(".").at(-1) || fallbackName;
  const argumentNames = Reflect.get(value, "__argnames__");
  const defaults = Reflect.get(value, "__defaults__");
  const annotationText = Reflect.get(value, "__annotations_text__");
  const annotations = Reflect.get(value, "__annotations__");
  const annotation = (argument: string): string => {
    for (const source of [annotationText, annotations]) {
      if (
        source &&
        (typeof source === "object" || typeof source === "function") &&
        Object.prototype.hasOwnProperty.call(source, argument)
      ) {
        const item = Reflect.get(source, argument);
        if (typeof item === "string") return item;
        return callableName(item) || defaultRepr(item);
      }
    }
    return "";
  };
  const argumentPart = (argument: string): string => {
    let part = argument;
    const typeName = annotation(argument);
    if (typeName) part += `: ${typeName}`;
    if (
      defaults &&
      (typeof defaults === "object" || typeof defaults === "function") &&
      Object.prototype.hasOwnProperty.call(defaults, argument)
    ) {
      const item = Reflect.get(defaults, argument);
      part += `=${item === undefined ? "None" : defaultRepr(item)}`;
    }
    return part;
  };
  const parts = (Array.isArray(argumentNames) ? argumentNames : []).map(
    (argument) => argumentPart(String(argument)),
  );
  if (Reflect.get(value, "__positional_only__") === true && parts.length) {
    parts.push("/");
  }
  const varargs = Reflect.get(value, "__varargs__");
  if (typeof varargs === "string") {
    parts.push(`*${varargs}${annotation(varargs) ? `: ${annotation(varargs)}` : ""}`);
  }
  const keywordOnly = Reflect.get(value, "__kwonly__");
  if (Array.isArray(keywordOnly) && keywordOnly.length) {
    if (typeof varargs !== "string") parts.push("*");
    parts.push(...keywordOnly.map((argument) => argumentPart(String(argument))));
  }
  const varkw = Reflect.get(value, "__varkw__");
  if (typeof varkw === "string") {
    parts.push(`**${varkw}${annotation(varkw) ? `: ${annotation(varkw)}` : ""}`);
  }
  const result = `${name}(${parts.join(", ")})`;
  const returnType = annotation("return");
  return returnType ? `${result} -> ${returnType}` : result;
}

function firstNonemptyLine(text: string): string {
  return text.split("\n").find((line) => line.trim())?.trim() ?? "";
}

function compatibility(value: unknown): DocumentationCompatibility {
  const raw = objectValue(value);
  const status =
    raw.status === "extension" ||
    raw.status === "partial" ||
    raw.status === "incompatible"
      ? raw.status
      : "compatible";
  return {
    status,
    ...(typeof raw.notes === "string" && raw.notes
      ? { notes: raw.notes }
      : {}),
  };
}

function provenance(value: unknown): DocumentationProvenance[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const raw = objectValue(item);
    if (
      raw.kind !== "sage-derived" &&
      raw.kind !== "software-derived" &&
      raw.kind !== "library-backed" &&
      raw.kind !== "literature-implemented" &&
      raw.kind !== "sagejs-original"
    ) {
      return [];
    }
    const entry: DocumentationProvenance = { kind: raw.kind };
    for (const field of ["source", "revision", "url", "license"] as const) {
      if (typeof raw[field] === "string" && raw[field]) {
        entry[field] = raw[field];
      }
    }
    return [entry];
  });
}

function references(value: unknown): DocumentationReference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const raw = objectValue(item);
    if (typeof raw.id !== "string" || typeof raw.title !== "string") return [];
    const entry: DocumentationReference = {
      id: raw.id,
      title: raw.title,
    };
    if (
      raw.type === "article" ||
      raw.type === "book" ||
      raw.type === "manual" ||
      raw.type === "paper" ||
      raw.type === "software" ||
      raw.type === "web"
    ) {
      entry.type = raw.type;
    }
    if (Array.isArray(raw.authors)) entry.authors = stringArray(raw.authors);
    if (typeof raw.year === "number") entry.year = raw.year;
    for (const field of ["doi", "url"] as const) {
      if (typeof raw[field] === "string" && raw[field]) {
        entry[field] = raw[field];
      }
    }
    if (Array.isArray(raw.relevant_sections)) {
      entry.relevant_sections = stringArray(raw.relevant_sections);
    }
    return [entry];
  });
}

export function documentationCatalogFromRegistry(
  registry: unknown,
): DocumentationCatalog {
  const byName = new Map<string, DocumentationEntry>();
  if (!Array.isArray(registry)) {
    return { schema_version: DOCSPEC_VERSION, entries: [] };
  }
  for (const rawEntry of registry) {
    if (!Array.isArray(rawEntry) || typeof rawEntry[0] !== "string") continue;
    const [name, value, rawMetadata] = rawEntry;
    const metadata = objectValue(rawMetadata);
    const docValue =
      value === null || value === undefined
        ? undefined
        : Reflect.get(Object(value), "__doc__");
    const metadataDoc =
      typeof metadata.doc === "string" ? metadata.doc : "";
    const doc =
      (metadataDoc || (typeof docValue === "string" ? docValue : "")).trim();
    const moduleValue =
      typeof metadata.module === "string"
        ? metadata.module
        : value === null || value === undefined
          ? ""
          : Reflect.get(Object(value), "__module__");
    const implementation = objectValue(metadata.implementation);
    const kind = inferKind(name, value, metadata.kind);
    const normalized: DocumentationEntry = {
      schema_version: DOCSPEC_VERSION,
      name,
      aliases: stringArray(metadata.aliases),
      kind,
      module: typeof moduleValue === "string" ? moduleValue : "",
      signature:
        typeof metadata.signature === "string" && metadata.signature
          ? metadata.signature
          : kind === "constant" || kind === "object"
            ? name
            : signature(value, name),
      summary: firstNonemptyLine(doc),
      doc,
      tags: stringArray(metadata.tags),
      backends: stringArray(metadata.backends),
      sage_compatibility: compatibility(metadata.sage_compatibility),
      provenance: provenance(metadata.provenance),
      references: references(metadata.references),
      ...(Object.keys(implementation).length
        ? {
            implementation: {
              ...(typeof implementation.algorithm === "string"
                ? { algorithm: implementation.algorithm }
                : {}),
              ...(typeof implementation.notes === "string"
                ? { notes: implementation.notes }
                : {}),
            },
          }
        : {}),
      limitations: stringArray(metadata.limitations),
    };
    byName.set(name, normalized);
  }
  return {
    schema_version: DOCSPEC_VERSION,
    entries: [...byName.values()].sort((left, right) =>
      left.name.localeCompare(right.name)),
  };
}

function normalizedText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[`'"]/g, "")
    .replace(/[_\-\s]+/g, " ")
    .trim();
}

function searchableText(entry: DocumentationEntry): string {
  return [
    entry.name,
    ...entry.aliases,
    entry.kind,
    entry.module,
    entry.signature,
    entry.summary,
    entry.doc,
    ...entry.tags,
    ...entry.backends,
    entry.sage_compatibility.status,
    entry.sage_compatibility.notes ?? "",
    ...entry.provenance.flatMap((item) => Object.values(item)),
    ...entry.references.flatMap((item) => Object.values(item).flat()),
    entry.implementation?.algorithm ?? "",
    entry.implementation?.notes ?? "",
    ...entry.limitations,
  ].join("\n");
}

export function searchDocumentation(
  catalog: DocumentationCatalog,
  query: string,
  options: DocumentationSearchOptions = {},
): DocumentationEntry[] {
  if (!query) throw new TypeError("documentation query must not be empty");
  const caseSensitive =
    options.caseSensitive ?? (query.toLowerCase() !== query);
  const matcher = options.regex
    ? new RegExp(query, caseSensitive ? "" : "i")
    : undefined;
  const literal = caseSensitive ? query : query.toLowerCase();
  const normalizedLiteral = normalizedText(literal);
  const fieldMatch = (candidate: string, requested?: string): boolean => {
    if (!requested) return true;
    return candidate.toLowerCase() === requested.toLowerCase();
  };
  const matches = catalog.entries.filter((entry) => {
    if (!fieldMatch(entry.kind, options.kind)) return false;
    if (
      options.backend &&
      !entry.backends.some((item) => fieldMatch(item, options.backend))
    ) {
      return false;
    }
    if (
      options.tag &&
      !entry.tags.some((item) => fieldMatch(item, options.tag))
    ) {
      return false;
    }
    const text = searchableText(entry);
    if (matcher) return matcher.test(text);
    const candidate = caseSensitive ? text : text.toLowerCase();
    return (
      candidate.includes(literal) ||
      normalizedText(candidate).includes(normalizedLiteral)
    );
  });
  const exact = caseSensitive ? query : query.toLowerCase();
  const score = (entry: DocumentationEntry): number => {
    const name = caseSensitive ? entry.name : entry.name.toLowerCase();
    const aliases = caseSensitive
      ? entry.aliases
      : entry.aliases.map((item) => item.toLowerCase());
    if (name === exact || aliases.includes(exact)) return 0;
    if (name.startsWith(exact)) return 1;
    if (name.includes(exact)) return 2;
    return 3;
  };
  return matches.sort(
    (left, right) =>
      score(left) - score(right) || left.name.localeCompare(right.name),
  );
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function docstringToMarkdown(doc: string): string {
  return doc
    .replace(/:meth:`([^`]+)`/g, "`$1`")
    .replace(/``([^`\n]+)``/g, "`$1`")
    .replace(/^([A-Z][A-Z ]+):{1,2}$/gm, (_match, heading: string) =>
      `### ${heading.charAt(0)}${heading.slice(1).toLowerCase()}`)
    .replace(/([^:\n])::$/gm, "$1:");
}

function markdownEntry(entry: DocumentationEntry): string {
  const lines = [
    `## \`${entry.name}\``,
    "",
    "```sage",
    entry.signature,
    "```",
    "",
  ];
  if (entry.doc) lines.push(docstringToMarkdown(entry.doc), "");
  lines.push("### Metadata", "");
  lines.push(`- Kind: \`${entry.kind}\``);
  if (entry.module) lines.push(`- Module: \`${entry.module}\``);
  if (entry.aliases.length) {
    lines.push(`- Aliases: ${entry.aliases.map((item) => `\`${item}\``).join(", ")}`);
  }
  if (entry.tags.length) lines.push(`- Tags: ${entry.tags.join(", ")}`);
  if (entry.backends.length) lines.push(`- Backends: ${entry.backends.join(", ")}`);
  lines.push(
    `- Sage compatibility: ${entry.sage_compatibility.status}` +
      (entry.sage_compatibility.notes
        ? ` — ${entry.sage_compatibility.notes}`
        : ""),
  );
  if (entry.implementation?.algorithm) {
    lines.push(`- Algorithm: ${entry.implementation.algorithm}`);
  }
  if (entry.limitations.length) {
    lines.push(`- Limitations: ${entry.limitations.join(" ")}`);
  }
  if (entry.provenance.length) {
    lines.push("", "### Provenance", "");
    for (const item of entry.provenance) {
      const source = item.source
        ? item.url
          ? `[${item.source}](${item.url})`
          : item.source
        : "";
      const details = [
        source,
        item.revision ? `revision ${item.revision}` : "",
        item.license ? `license ${item.license}` : "",
      ].filter(Boolean);
      lines.push(
        `- \`${item.kind}\`${details.length ? ` — ${details.join("; ")}` : ""}`,
      );
    }
  }
  if (entry.references.length) {
    lines.push("", "### References", "");
    for (const reference of entry.references) {
      const title = reference.url
        ? `[${reference.title}](${reference.url})`
        : reference.title;
      const authors = reference.authors?.join(", ");
      lines.push(
        `- ${authors ? `${authors}, ` : ""}${title}` +
          `${reference.year ? ` (${reference.year})` : ""}.`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function renderDocumentationMarkdown(
  catalog: DocumentationCatalog,
  title = "Sage.js API reference",
): string {
  const markdown = [
    "---",
    `title: ${yamlString(title)}`,
    `docspec_version: ${DOCSPEC_VERSION}`,
    "generated: true",
    "---",
    "",
    `# ${title}`,
    "",
    "This file is generated from the runtime DocSpec registry. Edit the",
    "adjacent public docstring and registration metadata, then regenerate it.",
    "",
    ...catalog.entries.map(markdownEntry),
    "",
  ].join("\n");
  return `${markdown.trimEnd()}\n`;
}

export function documentationMarkdownIssues(doc: string): string[] {
  const issues: string[] = [];
  if (/(^|[^`])``([^`]|$)/m.test(doc)) {
    issues.push("reStructuredText doubled-backtick literal");
  }
  if (/^\s*(?:EXAMPLES|INPUT|OUTPUT|IMPLEMENTATION)::?\s*$/m.test(doc)) {
    issues.push("reStructuredText section marker");
  }
  if (/:[a-zA-Z][a-zA-Z0-9_-]*:`/.test(doc)) {
    issues.push("reStructuredText interpreted-text role");
  }
  if (/^\s*\.\.\s+[a-zA-Z][a-zA-Z0-9_-]*::/m.test(doc)) {
    issues.push("reStructuredText directive");
  }
  if (/(^|[^:]):{2}\s*$/m.test(doc)) {
    issues.push("reStructuredText literal-block marker");
  }
  return issues;
}

export function documentationCoverage(catalog: DocumentationCatalog) {
  const entries = catalog.entries.length;
  const count = (predicate: (entry: DocumentationEntry) => boolean) =>
    catalog.entries.filter(predicate).length;
  const invalidMarkdownEntries = catalog.entries
    .filter((entry) => documentationMarkdownIssues(entry.doc).length > 0)
    .map((entry) => entry.name);
  return {
    schema_version: DOCSPEC_VERSION,
    registry_entries: entries,
    with_docstring: count((entry) => Boolean(entry.doc)),
    with_summary: count((entry) => Boolean(entry.summary)),
    with_tags: count((entry) => entry.tags.length > 0),
    with_backend: count((entry) => entry.backends.length > 0),
    with_provenance: count((entry) => entry.provenance.length > 0),
    with_compatibility_notes: count(
      (entry) => Boolean(entry.sage_compatibility.notes),
    ),
    with_references: count((entry) => entry.references.length > 0),
    markdown_docstrings: entries - invalidMarkdownEntries.length,
    invalid_markdown_entries: invalidMarkdownEntries,
    incomplete_entries: catalog.entries
      .filter(
        (entry) =>
          !entry.doc ||
          !entry.tags.length ||
          !entry.provenance.length ||
          !entry.backends.length ||
          documentationMarkdownIssues(entry.doc).length > 0,
      )
      .map((entry) => entry.name),
  };
}
