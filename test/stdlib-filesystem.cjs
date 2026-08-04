"use strict";

// Focused compatibility vectors adapted from CPython's test_pathlib,
// test_shutil, test_tempfile, test_glob, and test_fnmatch suites.
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");
const {
  createKernelEvaluator,
} = require("../dist/tools/kernel-evaluator.js");

async function testFilesystemModules() {
  const sandbox = mkdtempSync(join(tmpdir(), "sagejs-stdlib-fs-"));
  const session = await createSage({ mode: "python" });
  try {
    const result = await session.evaluate(
      [
        "import os, fnmatch, glob, tempfile, shutil",
        "from pathlib import Path, PurePosixPath, PureWindowsPath",
        `os.chdir(${JSON.stringify(sandbox)})`,
        "print(fnmatch.fnmatch('module.py', '*.py'), fnmatch.fnmatchcase('abc', 'a[!d]c'))",
        "root = Path('tree')",
        "(root / 'src' / 'nested').mkdir(parents=True)",
        "(root / 'src' / 'main.py').write_text('print(1)\\n')",
        "(root / 'src' / 'nested' / 'data.txt').write_text('data')",
        "(root / '.hidden.py').write_text('hidden')",
        "print(sorted(path.relative_to(root).as_posix() for path in root.rglob('*.py')))",
        "print([Path(path).as_posix() for path in glob.glob('**/*.txt', root_dir=root, recursive=True)])",
        "print([Path(path).as_posix() for path in glob.glob('*.py', root_dir=root)], [Path(path).as_posix() for path in glob.glob('*.py', root_dir=root, include_hidden=True)])",
        "source = root / 'src' / 'main.py'",
        "print(source.name, source.stem, source.suffix, source.parent.name, source.read_text().strip())",
        "print(source.with_suffix('.sage').name, source.relative_to(root).as_posix())",
        "destination = Path('copied')",
        "shutil.copytree(root / 'src', destination)",
        "print(sorted(path.name for path in destination.iterdir()))",
        "shutil.copy2(destination / 'main.py', destination / 'second.py')",
        "print((destination / 'second.py').read_text().strip())",
        "shutil.move(destination / 'nested' / 'data.txt', root / 'moved.txt')",
        "print((root / 'moved.txt').read_text(), (destination / 'nested').exists())",
        "print(shutil.disk_usage(root).total > 0)",
        "fd, filename = tempfile.mkstemp(dir=root, suffix='.dat')",
        "os.close(fd)",
        "print(Path(filename).exists(), Path(filename).suffix)",
        "Path(filename).unlink()",
        "with tempfile.NamedTemporaryFile(mode='w+', dir=root) as temporary:",
        "    temporary.write('temporary')",
        "    temporary.seek(0)",
        "    print(temporary.read(), Path(temporary.name).exists())",
        "print(Path(temporary.name).exists())",
        "with tempfile.TemporaryDirectory(dir=root) as directory:",
        "    Path(directory, 'inside').write_text('x')",
        "    print(Path(directory, 'inside').exists())",
        "print(Path(directory).exists())",
        "print(PurePosixPath('/a/b.txt').parts, PurePosixPath('/a/b.txt').with_suffix('.md'))",
        "windows = PureWindowsPath('C:/Users/research/data.csv')",
        "print(windows.drive, windows.name, windows.as_posix())",
        "class LocalPath:",
        "    def __fspath__(self):",
        "        return 'tree'",
        "print(os.path.join(LocalPath(), 'src'), os.fsdecode(os.fsencode(LocalPath())))",
        "try:",
        "    os.environ[1] = 'bad'",
        "except TypeError as error:",
        "    print('TypeError', str(error))",
        "try:",
        "    os.environ['BAD'] = 1",
        "except TypeError as error:",
        "    print('TypeError', str(error))",
        "Path('old/a/b').mkdir(parents=True)",
        "Path('old/a/b/value').write_text('renamed')",
        "os.renames('old/a/b/value', 'new/c/value')",
        "print(Path('new/c/value').read_text(), Path('old').exists())",
        "Path('hard-target').write_text('same inode')",
        "Path('hard-link').hardlink_to('hard-target')",
        "print(Path('hard-target').samefile('hard-link'), os.path.samefile('hard-target', 'hard-link'))",
        "if os.name != 'nt':",
        "    Path('walk-real').mkdir()",
        "    Path('walk-link').symlink_to('walk-real', target_is_directory=True)",
        "    root_dirs = []",
        "    recursed_link = False",
        "    for walked_entry in Path('.').walk():",
        "        current = walked_entry[0]",
        "        directories = walked_entry[1]",
        "        if current == Path('.'):",
        "            root_dirs = directories",
        "        if current == Path('walk-link'):",
        "            recursed_link = True",
        "    print('walk-link' in root_dirs, not recursed_link)",
        "shutil.rmtree(destination)",
        "print(destination.exists())",
      ].join("\n"),
    );
    assert.equal(
      result.stdout.trim(),
      [
        "True True",
        "['src/main.py']",
        "['src/nested/data.txt']",
        "[] ['.hidden.py']",
        "main.py main .py src print(1)",
        "main.sage src/main.py",
        "['main.py', 'nested']",
        "print(1)",
        "data True",
        "True",
        "True .dat",
        "temporary True",
        "False",
        "True",
        "False",
        "('/', 'a', 'b.txt') /a/b.md",
        "C: data.csv C:/Users/research/data.csv",
        "tree/src tree",
        "TypeError str expected, not int",
        "TypeError str expected, not int",
        "renamed False",
        "True True",
        ...(process.platform === "win32" ? [] : ["True True"]),
        "False",
      ].join("\n"),
    );
  } finally {
    await session.close();
    rmSync(sandbox, { recursive: true, force: true });
  }
}

function testUnavailableHost() {
  const output = [];
  const evaluator = createKernelEvaluator({
    mode: "python",
    onOutput: (text) => output.push(text),
  });
  Reflect.deleteProperty(globalThis, "__sagejs_host__");
  try {
    evaluator.evaluate(
      [
        "from pathlib import PurePosixPath, Path",
        "print(PurePosixPath('/a') / 'b')",
        "try:",
        "    Path('.').iterdir().__next__()",
        "except NotImplementedError:",
        "    print('unavailable')",
      ].join("\n"),
    );
    assert.equal(output.join("").trim(), "/a/b\nunavailable");
  } finally {
    evaluator.close();
  }
}

testFilesystemModules()
  .then(testUnavailableHost)
  .then(() => console.log("Sage.js high-level filesystem stdlib passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
