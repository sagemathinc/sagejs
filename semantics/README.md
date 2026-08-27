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
| `SageSemantics/Spec/Theorems.lean` | Agreement between the two, stated in Lean's `Int` |
| `SageSemantics/Spec/Systems.lean` | The number systems kept apart — `PythonInt`, `SageZZ`, and why the real fields cannot be collapsed the same way |

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
- `roundHalfEven_two_abs` — rounding to the grid above `2^53` cannot bring a value back below it.
- `roundIntToDouble_eq_self_of_safe_result` — **a sum that lands inside the safe window was never
  rounded**, which is what makes the runtime's window test a sound test.
- `core_sound_bigint_bigint`, `core_sound_bigint_num`, `core_sound_num_bigint` — those pairings add
  exactly, at any size.
- `addExact_denote` — the addition is faithful to the abstraction, for any two values that denote
  integers, in either representation, in either order, booleans included, at any magnitude.
- **`addExact_sound_python` and `addExact_sound_sageZZ` — the addition is sound, in each system.**
  These are the claims worth quoting: `Sound` is parameterized by *which* number system is being
  read into, so a theorem has to name it. `addExact_denote` is stated in Lean's `Int`, which is
  nobody's integers in particular, and is the lemma these rest on.

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

This is the same species as the multiplication bug in #42 and adjacent to it, found here from the
proof obligation rather than from a corpus — writing out the branches in order to state what
soundness would mean left the boolean operand with no recovery branch to state. Fixed in #66 by
normalizing a boolean operand ahead of the branches, which is the `normalizeBool` in the model.

The model tracks the runtime as it is, so it no longer carries the broken version. What that bug
looked like is still checkable, and not by taking anyone's word for it: point the oracle below at
the published release.

## The model as an oracle

A model never run against the thing it models is a claim, not a check. `Oracle.lean` prints what the
model says the runtime must do, for cases the model itself chooses — the boundaries its theorems are
about — and `tools/check-oracle.cjs` puts the same cases to a real Sage.js and compares.

```console
$ lake build oracle

$ node tools/check-oracle.cjs
compared 100 sums against the model; 0 disagree

$ node tools/check-oracle.cjs --runtime "npx -y @sagemath/sagejs@0.3.0"
  True + 9007199254740991
      model   int 9007199254740992
      runtime float -
  9007199254740991 + True
      model   int 9007199254740992
      runtime float -
compared 100 sums against the model; 2 disagree
```

The second run is the published release, before the fix. The oracle finds the bug on its own, without
reference to the proof — which is the point of having both. The proof says what must hold for every
input; the oracle says whether the code in front of you actually does it, and would catch the model
drifting away from the runtime it claims to describe.

What it compares is *whether the sum is an integer at all*, not just its digits. At these magnitudes
a wrong answer does not look wrong: `True + (2**53-1)` printed the right number while having already
become a float.

## Next

- The same treatment for `sub`, `mul`, `pow`, `floordiv` and `mod`, and for the comparisons. `mul`
  is the one to take next: #42 shows it raises on a boolean operand, and the same model would say
  whether the fix is complete.
- The same treatment for `sub`, `mul`, `pow`, `floordiv`, `mod` and the
  comparisons, and for `int()`.
- Extract the model to a CLI and diff it against the runtime over boundary
  vectors, so that transliteration drift becomes visible rather than silent.
