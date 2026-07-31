import { existsSync } from "fs";
import { join, resolve } from "path";

import { createSage } from "./kernel";
import {
  documentationCoverage,
  DocumentationCatalog,
  DocumentationEntry,
  renderDocumentationMarkdown,
  searchDocumentation,
} from "./documentation";

interface DocumentationCliArguments {
  files: string[];
  json?: boolean;
  jsonl?: boolean;
  markdown?: boolean;
  regex?: boolean;
  ignore_case?: boolean;
  case_sensitive?: boolean;
  kind?: string;
  backend?: string;
  tag?: string;
}

interface DocumentationCliOptions {
  pathAvailable?: boolean;
  catalog?: DocumentationCatalog;
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function writeJsonLines(entries: DocumentationEntry[]): void {
  for (const entry of entries) {
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }
}

function writeJsonLine(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function formatSearchResult(entry: DocumentationEntry): string {
  const signature =
    entry.kind === "function" || entry.kind === "method"
      ? entry.signature
      : entry.name;
  return `${signature} — ${entry.summary || "(documentation pending)"}`;
}

function formatShow(entry: DocumentationEntry): string {
  const lines = [
    `# ${entry.name}`,
    "",
    "```sage",
    entry.signature,
    "```",
  ];
  if (entry.doc) {
    lines.push("", entry.doc);
  }
  const metadata = [
    `- Kind: \`${entry.kind}\``,
    entry.module ? `- Module: \`${entry.module}\`` : "",
    entry.tags.length ? `- Tags: ${entry.tags.join(", ")}` : "",
    entry.backends.length ? `- Backends: ${entry.backends.join(", ")}` : "",
    `- Sage compatibility: ${entry.sage_compatibility.status}`,
    entry.provenance.length
      ? `- Provenance: ${entry.provenance
          .map((item) => `\`${item.kind}\``)
          .join(", ")}`
      : "",
  ].filter(Boolean);
  if (metadata.length) lines.push("", "## Metadata", "", ...metadata);
  return `${lines.join("\n")}\n`;
}

function exactEntry(
  catalog: DocumentationCatalog,
  requestedName: string,
): DocumentationEntry | undefined {
  const lowered = requestedName.toLowerCase();
  return catalog.entries.find(
    (entry) =>
      entry.name.toLowerCase() === lowered ||
      entry.aliases.some((alias) => alias.toLowerCase() === lowered),
  );
}

function documentationPath(basePath: string): string {
  const candidates = [
    join(basePath, "docs"),
    resolve(__dirname, "..", "..", "docs"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export async function runDocumentationCli(
  argv: DocumentationCliArguments,
  basePath: string,
  {
    pathAvailable = true,
    catalog: providedCatalog,
  }: DocumentationCliOptions = {},
): Promise<void> {
  const [action = "search", ...terms] = argv.files;
  if (action === "path") {
    if (!pathAvailable) {
      throw new Error(
        "the single-executable build has no filesystem documentation path; " +
          "use `sagejs docs export --markdown`",
      );
    }
    process.stdout.write(`${documentationPath(basePath)}\n`);
    return;
  }

  const session = providedCatalog ? undefined : await createSage();
  try {
    const catalog = providedCatalog ?? await session!.documentation();
    if (action === "export") {
      if (argv.markdown) {
        process.stdout.write(renderDocumentationMarkdown(catalog));
      } else if (argv.jsonl) {
        writeJsonLines(catalog.entries);
      } else {
        writeJson(catalog);
      }
      return;
    }
    if (action === "coverage") {
      const coverage = documentationCoverage(catalog);
      if (argv.jsonl) {
        writeJsonLine(coverage);
      } else if (argv.json) {
        writeJson(coverage);
      } else {
        process.stdout.write(
          [
            `DocSpec v${coverage.schema_version} registry coverage`,
            `  entries: ${coverage.registry_entries}`,
            `  with docstrings: ${coverage.with_docstring}`,
            `  with tags: ${coverage.with_tags}`,
            `  with backends: ${coverage.with_backend}`,
            `  with provenance: ${coverage.with_provenance}`,
            `  Markdown docstrings: ${coverage.markdown_docstrings}`,
            `  invalid Markdown: ${coverage.invalid_markdown_entries.length}`,
            `  incomplete: ${coverage.incomplete_entries.length}`,
            ...(coverage.incomplete_entries.length
              ? [
                  "",
                  "Incomplete entries:",
                  ...coverage.incomplete_entries.map((name) => `  ${name}`),
                ]
              : []),
            "",
          ].join("\n"),
        );
      }
      return;
    }

    const query = terms.join(" ").trim();
    if (!query) {
      throw new Error(`sagejs docs ${action} requires a name or query`);
    }
    if (action === "show") {
      const entry = exactEntry(catalog, query);
      if (!entry) throw new Error(`no documentation entry named ${query}`);
      if (argv.jsonl) writeJsonLine(entry);
      else if (argv.json) writeJson(entry);
      else if (argv.markdown) {
        process.stdout.write(
          renderDocumentationMarkdown(
            { schema_version: 1, entries: [entry] },
            entry.name,
          ),
        );
      } else {
        process.stdout.write(formatShow(entry));
      }
      return;
    }
    if (action !== "search") {
      throw new Error(
        `unknown docs action ${JSON.stringify(action)}; ` +
          "expected search, show, export, path, or coverage",
      );
    }
    const entries = searchDocumentation(catalog, query, {
      regex: argv.regex,
      caseSensitive: argv.ignore_case
        ? false
        : argv.case_sensitive
          ? true
          : undefined,
      kind: argv.kind || undefined,
      backend: argv.backend || undefined,
      tag: argv.tag || undefined,
    });
    if (argv.json) writeJson({ schema_version: 1, query, entries });
    else if (argv.jsonl) writeJsonLines(entries);
    else if (argv.markdown) {
      process.stdout.write(
        renderDocumentationMarkdown(
          { schema_version: 1, entries },
          `Sage.js documentation matching ${query}`,
        ),
      );
    } else if (!entries.length) {
      process.stdout.write(`No documentation matching ${JSON.stringify(query)}.\n`);
    } else {
      process.stdout.write(`${entries.map(formatSearchResult).join("\n")}\n`);
    }
  } finally {
    await session?.close();
  }
}
