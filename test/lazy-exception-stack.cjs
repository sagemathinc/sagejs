// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

const lazyFormatting = `
import sagejs.runtime as runtime
formatted = []
previous_formatter = runtime.reflect.get(runtime.error, 'prepareStackTrace')
previous_limit = runtime.reflect.get(runtime.error, 'stackTraceLimit')

def formatter(error, frames):
    header = runtime.reflect.get(error, 'name') + ': ' + runtime.reflect.get(error, 'message')
    formatted.append(header)
    names = []
    index = 0
    while index < runtime.reflect.get(frames, 'length'):
        frame = runtime.reflect.get(frames, index)
        function_name = runtime.reflect.apply(runtime.reflect.get(frame, 'getFunctionName'), frame, [])
        if function_name is not None:
            names.append(str(function_name))
        index += 1
    return header + '\\n' + '\\n'.join(names)

def lazy_stack_capture_origin():
    return ValueError('captured header')

runtime.reflect.set(runtime.error, 'prepareStackTrace', formatter)
runtime.reflect.set(runtime.error, 'stackTraceLimit', 40)
try:
    for index in range(30):
        try:
            next(iter([]))
        except StopIteration:
            pass
        discarded = StopIteration(index)
        assert discarded.value == index
    error = lazy_stack_capture_origin()
    assert error.args == ('captured header',)
    assert str(error) == 'captured header'
    assert formatted == []
    descriptor = runtime.object.getOwnPropertyDescriptor(error, 'stack')
    assert runtime.reflect.get(descriptor, 'enumerable') is True
    assert runtime.reflect.get(descriptor, 'configurable') is True
    error.name = 'ChangedName'
    error.message = 'changed message'
    runtime.reflect.set(runtime.error, 'stackTraceLimit', 1)
    stack = error.stack
    assert stack.startswith('ValueError: captured header')
    assert 'lazy_stack_capture_origin' in stack
    assert '_errors_read_stack' not in stack
    assert error.stack == stack
    assert formatted == ['ValueError: captured header']
    descriptor = runtime.object.getOwnPropertyDescriptor(error, 'stack')
    assert runtime.reflect.get(descriptor, 'value') == stack
    assert runtime.reflect.get(descriptor, 'writable') is True

    overridden = RuntimeError('must not format')
    overridden.stack = 'manual stack'
    assert overridden.stack == 'manual stack'
    assert formatted == ['ValueError: captured header']
    deleted = RuntimeError('deleted capture')
    del deleted.stack
    assert not hasattr(deleted, 'stack')
    assert formatted == ['ValueError: captured header']

    sealed = ValueError('sealed')
    runtime.object.seal(sealed)
    sealed.stack = 'sealed replacement'
    assert sealed.stack == 'sealed replacement'
    assert formatted == ['ValueError: captured header']
    frozen = ValueError('frozen')
    runtime.object.freeze(frozen)
    assert frozen.stack.startswith('ValueError: frozen')
    assert frozen.stack.startswith('ValueError: frozen')
    assert formatted == ['ValueError: captured header', 'ValueError: frozen']

    class StackOverride(ValueError):
        @property
        def stack(self):
            return self.observed_stack
        @stack.setter
        def stack(self, value):
            self.observed_stack = value
    explicit = StackOverride('override observed')
    assert explicit.stack.startswith('StackOverride: override observed')
    assert formatted[-1] == 'StackOverride: override observed'
    class ReadOnlyStack(ValueError):
        @property
        def stack(self):
            return 'readonly'
    try:
        ReadOnlyStack('denied')
        assert False
    except AttributeError as error:
        assert str(error) == "can't set attribute"
finally:
    runtime.reflect.set(runtime.error, 'stackTraceLimit', previous_limit)
    if previous_formatter is runtime.undefined:
        runtime.reflect.deleteProperty(runtime.error, 'prepareStackTrace')
    else:
        runtime.reflect.set(runtime.error, 'prepareStackTrace', previous_formatter)
print('lazy-stack-formatting-ok')
`;

for (const mode of ["python", "sage"]) {
  test(`iterator and exception introspection agree with CPython (${mode})`, async context => {
    const source = readFileSync(join(__dirname, "fixtures/lazy-exception-stack.py"), "utf8");
    const python = spawnSync("python3", ["-c", source], { encoding: "utf8" });
    assert.equal(python.status, 0, python.stderr);
    const session = await createSage({ mode });
    context.after(() => session.close());
    const result = await session.evaluate(source);
    assert.equal(result.stdout, python.stdout);
    assert.equal(result.stderr ?? "", "");
  });

  test(`stacks format lazily with capture-time provenance and writable overrides (${mode})`, async context => {
    const session = await createSage({ mode });
    context.after(() => session.close());
    const result = await session.evaluate(lazyFormatting);
    assert.equal(result.stdout, "lazy-stack-formatting-ok\n");
    assert.equal(result.stderr ?? "", "");
  });

  test(`surfaced exceptions retain stack diagnostics across the worker boundary (${mode})`, async context => {
    const session = await createSage({ mode });
    context.after(() => session.close());
    await assert.rejects(session.evaluate(`
def lazy_stack_surface_origin():
    raise ValueError('worker-visible failure')
lazy_stack_surface_origin()
`), error => {
      assert.equal(error.pythonDiagnostic.exceptionType, "ValueError");
      assert.equal(error.pythonDiagnostic.message, "worker-visible failure");
      assert.match(error.stack, /ValueError: worker-visible failure/u);
      assert.match(error.stack, /lazy_stack_surface_origin/u);
      return true;
    });
  });
}
