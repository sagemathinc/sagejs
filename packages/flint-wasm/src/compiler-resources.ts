/* Browser resource boundary for the bundled Tree-sitter compiler frontend. */

interface StandardLibraryDocument {
  modules: Record<string, {
    source: string;
    cache: Record<string, any>;
  }>;
}

const binaryResources = new Map<string, Uint8Array>();
const textResources = new Map<string, string>();
const sourceSignatures = new Map<string, string>();

function normalized(filename: string): string {
  return filename.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function configureBrowserCompilerResources({
  treeSitterRuntime,
  pythonGrammar,
  sageGrammar,
  standardLibrary,
}: {
  treeSitterRuntime: Uint8Array;
  pythonGrammar: Uint8Array;
  sageGrammar: Uint8Array;
  standardLibrary: StandardLibraryDocument;
}): void {
  binaryResources.clear();
  textResources.clear();
  sourceSignatures.clear();
  binaryResources.set("web-tree-sitter.wasm", treeSitterRuntime);
  binaryResources.set("tree-sitter-python.wasm", pythonGrammar);
  binaryResources.set("tree-sitter-sage.wasm", sageGrammar);
  for (const [name, module] of Object.entries(standardLibrary.modules)) {
    textResources.set(`__stdlib__/${name}.py`, module.source);
    textResources.set(
      `__module_cache__/${name}.json`,
      JSON.stringify(module.cache),
    );
    sourceSignatures.set(module.source, String(module.cache.signature));
  }
}

export function vendorResourcePath(filename: string): string {
  return filename;
}

export function readResourceBytes(filename: string): Uint8Array {
  const key = normalized(filename).split("/").at(-1) ?? filename;
  const value = binaryResources.get(key);
  if (!value) throw new Error(`browser compiler resource not found: ${key}`);
  return value;
}

export function readResourceText(filename: string): string {
  const key = normalized(filename);
  const value = textResources.get(key);
  if (value === undefined) {
    throw new Error(`browser compiler resource not found: ${key}`);
  }
  return value;
}

export function sha1sum(source: string): string {
  const signature = sourceSignatures.get(source);
  if (!signature) {
    throw new Error("browser compiler cannot hash an unknown module source");
  }
  return signature;
}
