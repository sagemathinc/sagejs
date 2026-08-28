# Guarded modular recurrence proof obligations

The compiler currently specializes exactly this source shape:

```python
for index in range(count):
    value = value * multiplier + increment
```

This is intentionally a tiny intermediate language, not a general claim that
field-looking Python is safe to lower to JavaScript numbers. Its grammar is:

```text
Loop ::= for Local in builtin-range(Local-or-Literal): Assign
Assign ::= Accumulator = Accumulator * StableLocal + StableLocal
```

The loop target, accumulator, multiplier, and increment must be four distinct
locals. The body has exactly one statement, there is no loop `else`, and the
count expression cannot call code. The recognizer in `tools/python/lowerer.ts`
constructs metadata only after checking that complete syntax tree.

## Reference and machine semantics

For an accepted parent with modulus `p`, the source recurrence is

```text
x(0)   = lift(value)
x(k+1) = (x(k) * lift(multiplier) + lift(increment)) mod p.
```

The machine loop uses JavaScript Number values with the identical recurrence.
The parent admits this representation only when

```text
p * (p - 1) <= Number.MAX_SAFE_INTEGER.
```

Since all canonical residues are in `[0, p)`, the largest intermediate is
`(p - 1)^2 + (p - 1) = p * (p - 1)`. Every multiplication, addition, and
remainder input is therefore an exactly represented integer. IEEE-754 binary64
and mathematical integer operations agree at each step.

An induction on the iteration count then proves that the machine residue after
every iteration equals the canonical source residue. Materialization creates
one object with the same canonical prototype, parent identity, and final
residue that the last source `_add_` call would have produced.

## Static premises

The compiler proves structurally that:

1. `range` is the unshadowed builtin;
2. `count` is a side-effect-free direct local or literal;
3. the accumulator is read once as the left multiplicand and assigned once;
4. multiplier and increment are stable locals and do not alias the accumulator;
5. the loop target aliases none of those values;
6. no call, attribute access, extra assignment, branch, exception handler,
   `break`, `continue`, or loop `else` occurs in the body.

Negative compiler tests ratchet each excluded shape.

## Dynamic premises

The emitted helper accepts the scalar path only when:

1. count is a nonnegative safe integer;
2. all three elements have the same parent identity;
3. that parent advertises the reviewed machine-residue and closed-arithmetic
   contracts;
4. every element has the canonical prototype captured by that parent;
5. the prototype's multiply, add, and materializer functions are unchanged
   since parent construction;
6. modulus and all three residues are canonical safe Number integers.

If any premise is false, the helper returns `null` and the generated `else`
branch executes the original operator-dispatch loop. Errors from the source
loop are not caught or converted into fallback results. A regression test
patches `_mul_` after parent construction and proves that the generic method is
observed once per iteration until the original method is restored.

The fast branch also preserves the visible loop target: a nonempty loop leaves
it equal to `count - 1`, while a zero-length loop leaves its prior binding
unchanged.

## Mechanization boundary

The proof above is small enough to mechanize later without formalizing Python
or V8. A useful Lean development would define:

- the tiny loop grammar;
- reference modular-step and binary64-safe integer-step relations;
- the safe-modulus inequality;
- an induction theorem equating all iterations; and
- a materialization theorem for the public value abstraction.

The production compiler should still use translation validation: emit a
machine-readable certificate containing the matched AST identities, alias
facts, modulus-bound requirement, and fallback source identity, then validate
that certificate independently before code generation. Lean would prove the
validator sound; ordinary differential, mutation, generated-code, browser,
and performance tests would continue to check the implementation around that
trusted core.

## Performance contract

`pnpm bench:finite-field-compiler --check` runs nine warmed ten-million-step
public `GF(65521)` recurrences, checks the exact final residue, and enforces a
reviewed 50 ns/step ceiling. The first Linux x64 measurement was 5.32 ns/step,
versus 4.66 ns for the matched Sage.js `@native` typed `uint64` loop, 107.6 ns
for the public object path, 88 ns in Magma 2.18, and 154 ns for PARI/GP 2.17
`Mod` on the same dependency chain. `pnpm bench:finite-field-native --check`
also requires an actual machine-code backend and records compile, load, cold,
and warm costs separately.
