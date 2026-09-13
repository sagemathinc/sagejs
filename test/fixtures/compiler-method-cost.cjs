"use strict";
const fs = require("node:fs");
const { join } = require("node:path");
const { createHash } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const root = process.argv[2];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const compilerPath = join(root, "dist/compiler/compiler.js");
const beforeHash = hash(fs.readFileSync(compilerPath));
const { default: createCompiler } = require(join(root, "dist/tools/compiler.js"));
const { createPythonCompilerFrontend } = require(join(root, "dist/tools/python/compiler-frontend.js"));
async function main() {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  const source = "class Holder:\n    def read(self):\n        return self.value\n\n" +
    Array.from({length: 200}, (_, i) => `value_${i} = (${i} + 2) * 3`).join("\n");
  let checksum = 0;
  let outputHash;
  const workloads = {
    tokens_5000() {
      for (let i = 0; i < 5000; ++i) checksum += new compiler.AST_Token({value:i}).value;
    },
    numbers_3000() {
      for (let i = 0; i < 3000; ++i) checksum += new compiler.AST_Number({value:i}).value;
    },
    parse_print_200() {
      const ast = frontend.parse(source, {filename:"<compiler-method-cost>", exact_integer_literals:true});
      const out = new compiler.OutputStream({omit_baselib:true, write_name:false, beautify:true,
        exact_integers:true, python_attributes:true, python_truthiness:true, python_tuples:true});
      ast.print(out);
      const generated = out.get();
      const current = hash(generated);
      if (outputHash !== undefined && current !== outputHash) throw Error("non-repeatable compiler output");
      outputHash = current;
      checksum += generated.length;
    },
  };
  const timings = {};
  try {
    for (const [name, run] of Object.entries(workloads)) {
      for (let i = 0; i < 3; ++i) run();
      timings[name] = [];
      for (let i = 0; i < 7; ++i) {
        const start = performance.now(); run(); timings[name].push(performance.now() - start);
      }
    }
    const afterHash = hash(fs.readFileSync(compilerPath));
    if (afterHash !== beforeHash) throw Error("compiler changed during measurement");
    console.log(JSON.stringify({qualification:"local diagnostic, not cross-platform or CPython evidence",
      node:process.version, platform:process.platform, arch:process.arch, compilerSha256:beforeHash,
      compilerBytes:fs.statSync(compilerPath).size, driverSha256:hash(fs.readFileSync(__filename)),
      sourceSha256:hash(source), outputSha256:outputHash, checksum,
      eagerClone:Object.hasOwn(new compiler.AST_Token({}), "clone"), timings}, null, 2));
  } finally { frontend.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
