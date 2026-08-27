import SageSemantics.Spec.Abstraction

/-!
# Agreement between the runtime and the integers

The property wanted of every exact-integer operation: whatever representation
the operands arrived in, the result denotes the mathematical answer.

`addExact_bigint_sound` and `addExact_number_safe_sound` establish it on the
paths that hold.  `addExact_not_sound` establishes that it does **not** hold in
general, and names the witness -- a boolean operand carries no safe-integer
recovery, so a sum that leaves the safe window is returned as a bare double and
stops being an integer at all.
-/

namespace SageSemantics

/-- The integer a result denotes, if it denotes one. -/
def Result.denote : Result → Option Int
  | .ok value => SageSemantics.denote value
  | .typeError _ => none
  | .unsupported _ => none

/--
Soundness of a binary operation against its specification on ℤ.

Read it as: on any two values that denote integers, the operation denotes the
integer the specification names.  Nothing is said about representation, which
is what makes it the right property -- the runtime may store an integer either
way and must still be right.
-/
def Sound (op : JsValue → JsValue → Result) (spec : Int → Int → Int) : Prop :=
  ∀ (left right : JsValue) (x y : Int),
    ⟦left⟧ = some x → ⟦right⟧ = some y → (op left right).denote = some (spec x y)

/-- Two bigints add exactly, whatever their size: the branch converts both and
adds in ℤ. -/
theorem addExact_bigint_sound (left right : Int) :
    (operatorAddExact (.bigint left) (.bigint right)).denote = some (left + right) := by
  simp [operatorAddExact, JsValue.pythonJstype, JsValue.jstype, nativeAdd, Result.denote,
    denote]

/-- Adding a boolean to the largest safe integer gives a double holding `2^53`,
which is one past the last integer a double can be trusted with -- so the
runtime hands back a value that is no longer an integer. -/
theorem addExact_bool_overflows :
    operatorAddExact (.bool true) (.num (.ofInt 9007199254740991))
      = .ok (.num (.ofInt 9007199254740992)) := by
  decide

/-- That value denotes nothing: it is a float from here on. -/
theorem addExact_bool_overflow_denotes_nothing :
    (operatorAddExact (.bool true) (.num (.ofInt 9007199254740991))).denote = none := by
  rw [addExact_bool_overflows]
  decide

/--
The current `ρσ_operator_add_exact` is **not** sound.

`True + (2^53 - 1)` is `9007199254740992` in Python, an `int`.  Here the
boolean operand takes the branch that returns the raw sum of two doubles, with
no safe-integer recovery, and the result is classified as a float.  The value
printed still looks right; the next addition is where it goes wrong.

Confirmed against the runtime, including the published `@sagemath/sagejs@0.3.0`:
`(True + a) + a` gives `1.8014398509481984e+16` where CPython gives
`18014398509481983`.
-/
theorem addExact_not_sound : ¬ Sound operatorAddExact (· + ·) := by
  intro sound
  have witness := sound (.bool true) (.num (.ofInt 9007199254740991)) 1 9007199254740991
    (by decide) (by decide)
  rw [addExact_bool_overflow_denotes_nothing] at witness
  simp at witness

end SageSemantics
