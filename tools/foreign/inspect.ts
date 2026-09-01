import { basename } from "path";
import { readFile } from "fs/promises";
import {
  createForeignFrontend,
  ForeignLanguage,
} from "./index";

export const FOREIGN_LOWERING_INSPECTION_SCHEMA =
  "sagejs.foreign-lowering-inspection/v1";

const FOREIGN_LANGUAGES = new Set<ForeignLanguage>([
  "magma",
  "macaulay2",
  "maple",
  "matlab",
  "wolfram",
]);

export interface ForeignInspectionCliArguments {
  files: string[];
  language?: string;
  source?: string;
  usageError?: string;
}

interface InspectionInput {
  kind: "source" | "file" | "stdin";
  filename: string | null;
}

interface InspectionError {
  name: string;
  message: string;
  line: number | null;
  column: number | null;
  incomplete: boolean;
}

interface InspectionLowering {
  source: string;
  has_result: boolean;
  loaded_files: string[];
  attached_files: string[];
}

export interface ForeignLoweringInspection {
  schema: typeof FOREIGN_LOWERING_INSPECTION_SCHEMA;
  schema_version: 1;
  success: boolean;
  language: ForeignLanguage | null;
  input: InspectionInput;
  lowering: InspectionLowering | null;
  error: InspectionError | null;
}

class ForeignInspectionUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForeignInspectionUsageError";
  }
}

function logicalPaths(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => basename(value)))].sort();
}

function errorRecord(error: unknown): InspectionError {
  const value = error as {
    name?: unknown;
    message?: unknown;
    line?: unknown;
    column?: unknown;
    incomplete?: unknown;
  };
  return {
    name: typeof value?.name === "string" ? value.name : "Error",
    message: typeof value?.message === "string"
      ? value.message
      : "foreign-language inspection failed",
    line: Number.isInteger(value?.line) && Number(value.line) >= 1
      ? Number(value.line)
      : null,
    column: Number.isInteger(value?.column) && Number(value.column) >= 1
      ? Number(value.column)
      : null,
    incomplete: value?.incomplete === true,
  };
}

function language(value: string | undefined): ForeignLanguage {
  if (!value || !FOREIGN_LANGUAGES.has(value as ForeignLanguage)) {
    throw new ForeignInspectionUsageError(
      "--language must be one of magma, macaulay2, maple, matlab, or wolfram",
    );
  }
  return value as ForeignLanguage;
}

async function stdinSource(): Promise<string> {
  const chunks: string[] = [];
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) chunks.push(String(chunk));
  return chunks.join("");
}

async function input(
  argv: ForeignInspectionCliArguments,
): Promise<{ input: InspectionInput; source: string }> {
  if (argv.files.length > 1) {
    throw new ForeignInspectionUsageError("inspect-foreign accepts at most one file");
  }
  if (argv.source !== undefined && argv.files.length !== 0) {
    throw new ForeignInspectionUsageError(
      "choose exactly one of --source, a file, or standard input",
    );
  }
  if (argv.source !== undefined) {
    return {
      input: { kind: "source", filename: null },
      source: argv.source,
    };
  }
  const filename = argv.files[0];
  if (filename === undefined || filename === "-") {
    return {
      input: { kind: "stdin", filename: null },
      source: await stdinSource(),
    };
  }
  const logicalFilename = basename(filename);
  try {
    return {
      input: { kind: "file", filename: logicalFilename },
      source: (await readFile(filename)).toString(),
    };
  } catch (_error) {
    throw new ForeignInspectionUsageError(
      `unable to read foreign-language input file ${JSON.stringify(logicalFilename)}`,
    );
  }
}

function base(
  selectedLanguage: ForeignLanguage | null,
  inspectedInput: InspectionInput,
): Omit<ForeignLoweringInspection, "success" | "lowering" | "error"> {
  return {
    schema: FOREIGN_LOWERING_INSPECTION_SCHEMA,
    schema_version: 1,
    language: selectedLanguage,
    input: inspectedInput,
  };
}

export async function inspectForeignLowering(
  argv: ForeignInspectionCliArguments,
): Promise<{ report: ForeignLoweringInspection; exitCode: 0 | 1 | 2 }> {
  let selectedLanguage: ForeignLanguage | null = null;
  let inspectedInput: InspectionInput = { kind: "stdin", filename: null };
  try {
    if (argv.usageError !== undefined) {
      throw new ForeignInspectionUsageError(argv.usageError);
    }
    selectedLanguage = language(argv.language);
    const resolved = await input(argv);
    inspectedInput = resolved.input;
    const frontend = await createForeignFrontend(selectedLanguage);
    try {
      const lowering = frontend.lower(resolved.source, {
        captureResult: true,
        filename: inspectedInput.filename ?? "<stdin>",
      });
      return {
        report: {
          ...base(selectedLanguage, inspectedInput),
          success: true,
          lowering: {
            source: lowering.source,
            has_result: lowering.hasResult === true,
            loaded_files: logicalPaths(lowering.loadedFiles),
            attached_files: logicalPaths(lowering.attachedFiles),
          },
          error: null,
        },
        exitCode: 0,
      };
    } catch (error) {
      return {
        report: {
          ...base(selectedLanguage, inspectedInput),
          success: false,
          lowering: null,
          error: errorRecord(error),
        },
        exitCode: 1,
      };
    }
  } catch (error) {
    const usageError = error instanceof ForeignInspectionUsageError;
    return {
      report: {
        ...base(selectedLanguage, inspectedInput),
        success: false,
        lowering: null,
        error: errorRecord(error),
      },
      exitCode: usageError ? 2 : 1,
    };
  }
}

export async function runForeignInspectionCli(
  argv: ForeignInspectionCliArguments,
): Promise<void> {
  const { report, exitCode } = await inspectForeignLowering(argv);
  process.stdout.write(JSON.stringify(report) + "\n");
  process.exitCode = exitCode;
}
