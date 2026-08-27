import SageSemantics.Model.Integers

/-!
# What a value means

`denote` is the abstraction function: the mathematical integer a JavaScript
value stands for, when it stands for one.  It is deliberately partial, and its
domain is exactly the runtime's own `exactIntegerPrimitive` -- a value the
runtime does not count as an integer has no integer meaning here either.

Every theorem about the arithmetic is stated through this function, so it says
nothing about which representation was chosen.  That is the point: the runtime
is free to store `5` as a number or a bigint, and correctness should not
depend on which.
-/

namespace SageSemantics

/-- The integer a value denotes, if it denotes one. -/
def denote (value : JsValue) : Option Int :=
  match value with
  | .bigint value => some value
  | .num (.ofInt value) =>
    if minSafeInteger ≤ value && value ≤ maxSafeInteger then some value else none
  | .num .nonIntegral => none
  | .bool value => some (if value then 1 else 0)
  | .boxedFloat _ => none
  | .str _ => none
  | .obj => none

@[inherit_doc] notation "⟦" value "⟧" => denote value

/-- The abstraction is defined exactly where the runtime says an exact integer
is, so the two notions of "is an integer" cannot drift apart. -/
theorem denote_isSome_iff_exactIntegerPrimitive (value : JsValue) :
    (denote value).isSome = exactIntegerPrimitive value := by
  cases value with
  | num double =>
    cases double with
    | ofInt n =>
      simp [denote, exactIntegerPrimitive, Num.isSafeInteger]
      split <;> simp_all
    | nonIntegral => simp [denote, exactIntegerPrimitive, Num.isSafeInteger]
  | bigint => simp [denote, exactIntegerPrimitive]
  | bool => simp [denote, exactIntegerPrimitive]
  | str => simp [denote, exactIntegerPrimitive]
  | boxedFloat => simp [denote, exactIntegerPrimitive]
  | obj => simp [denote, exactIntegerPrimitive]

/-- A value is a Python float exactly when it is not an exact integer, on the
fragment where it is one of the two.  This is the invariant that makes a stray
out-of-range `number` dangerous: it does not become a wrong integer, it stops
being an integer. -/
theorem isPythonFloat_of_num_not_denoting {double : Num}
    (h : denote (.num double) = none) : isPythonFloat (.num double) = true := by
  cases double with
  | ofInt n =>
    simp [denote] at h
    simp [isPythonFloat, Num.isSafeInteger]
    omega
  | nonIntegral => simp [isPythonFloat, Num.isSafeInteger]

end SageSemantics
