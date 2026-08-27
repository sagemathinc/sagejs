# Semantics models

Lean models of the number systems Sage.js works in, and proofs that the
runtime's arithmetic agrees with them. There is no computation here: these are
models and theorems about the algorithms, not another implementation of them.

## Why

The bugs worth finding in this runtime have all been *representation or
rounding bugs at a boundary* — integer division rounding twice past `2^53`,
`round(2.675, 2)` landing on the wrong decimal, a boolean losing its
integer-ness. Differential corpora find those by sampling, which is why each
took thousands of cases, and why the next one hides wherever the corpus did
not look.

An arithmetic boundary is where a proof beats a corpus: the input space is
infinite, the dangerous region is a thin edge, and the property is simple to
state.

## Build

```console
$ cd semantics && lake build
```

No mathlib. Everything rests on core `Int`, `Rat`, `omega` and `decide`, so the
build takes seconds and downloads nothing. Nothing here is wired into CI yet.

The project is expected to stay free of `sorry`, and free of `native_decide`
— the axiom footprint of every theorem should be the standard
`propext, Classical.choice, Quot.sound` and nothing else:

```console
$ grep -rn sorry SageSemantics/          # must be empty
$ LEAN_PATH=.lake/build/lib/lean lean -e '#print axioms SageSemantics.addExact_not_sound'
```

## Layout

| File | What it holds |
| --- | --- |
| `SageSemantics/Js/Value.lean` | The JavaScript fragment: storage kinds, safe integers, what `+` does to two doubles, and the binary64 grid that decides when an integer sum stops being exact |
| `SageSemantics/Model/Integers.lean` | The runtime's own algorithms, transliterated branch for branch from `src/baselib/builtins.py` and `src/baselib/algebra.py`, with each source function named above its model |
| `SageSemantics/Spec/Abstraction.lean` | `⟦·⟧`, the integer a value denotes — partial, and defined exactly where the runtime's own `exactIntegerPrimitive` is |
| `SageSemantics/Spec/Theorems.lean` | Agreement between the two |

## The representation being modeled

A Python integer is stored as *either* a JavaScript `number` or a `bigint`, and
a `number` counts as an integer only while `Number.isSafeInteger` holds. The
consequence is sharp, and it is what the model is built around:

> a `number` outside the safe range is not a *wrong integer* — it is a **float**.

So a single arithmetic path that returns an out-of-range `number` does not
produce an off-by-one integer. It silently changes the type of the value, and
the error appears one operation later.

## What is proved

- `denote_isSome_iff_exactIntegerPrimitive` — the abstraction is defined
  exactly where the runtime says an integer is, so the two cannot drift.
- `isPythonFloat_of_num_not_denoting` — the invariant above, stated and proved.
- `roundIntToDouble_eq_self` — below `2^53` a double holds an integer exactly.
  Every fast path rests on this.
- `addExact_bigint_sound` — two bigints add exactly, at any size.
- `addExact_not_sound` — **the current `ρσ_operator_add_exact` is not sound**,
  with the witness. See below.

## The first bug this found

`ρσ_operator_add_exact` (`src/baselib/builtins.py:918`) recovers exactness in
BigInt when a sum of two `number`s leaves the safe range — but only on the
branch where *both* operands are numbers. An operand that is a **boolean**
takes a different branch, which returns the raw sum of two doubles with no
recovery at all.

```console
$ printf 'a = 9007199254740991\nprint(repr(True + a), type(True + a) is int)\nprint(repr((True + a) + a))\n' > b.py

$ npx -y @sagemath/sagejs@0.3.0 --python b.py
9007199254740992 False
1.8014398509481984e+16

$ python3 b.py
9007199254740992 True
18014398509481983
```

The first sum still prints correctly, because `2^53` is representable. It has
already stopped being an integer, and the *second* addition is where the value
goes wrong.

This is the same species as the multiplication bug in #42 and adjacent to it,
found here from the proof obligation rather than from a corpus.

## Next

- Discharge soundness for the `number + number` branch, which needs: a sum that
  lands inside the safe window was never rounded. The argument is that rounding
  cannot carry a value from `≥ 2^53` down below it.
- The same treatment for `sub`, `mul`, `pow`, `floordiv`, `mod` and the
  comparisons, and for `int()`.
- Extract the model to a CLI and diff it against the runtime over boundary
  vectors, so that transliteration drift becomes visible rather than silent.
