import SageSemantics.Spec.Abstraction

/-!
# Agreement between the runtime and the integers

The property wanted of every exact-integer operation: whatever representation
the operands arrived in, the result denotes the mathematical answer.

What is proved here is stated in Lean's `Int`, which is nobody's integers in
particular.  It is the lemma the real claims rest on; `Spec/Systems.lean` names
the system -- Python's `int`, Sage's `ZZ` -- and states soundness there.
-/

namespace SageSemantics

/-- The integer a result denotes, if it denotes one. -/
def Result.denote : Result → Option Int
  | .ok value => SageSemantics.denote value
  | .typeError _ => none
  | .unsupported _ => none

/-- Normalizing a boolean does not change what it means. -/
theorem denote_normalizeBool (value : JsValue) :
    denote (normalizeBool value) = denote value := by
  cases value with
  | bool flag => cases flag <;> decide
  | _ => rfl

/-- Normalizing leaves no booleans, which is what lets the branches treat what
comes out as a number. -/
theorem normalizeBool_ne_bool (value : JsValue) (flag : Bool) :
    normalizeBool value ≠ .bool flag := by
  cases value <;> simp [normalizeBool]

/-- A value that denotes an integer and is not a boolean is a bigint, or a
number holding that integer inside the safe window. -/
theorem denote_cases {value : JsValue} {x : Int} (h : denote value = some x)
    (notBool : ∀ flag, value ≠ .bool flag) :
    value = .bigint x ∨
      (value = .num (.ofInt x) ∧ minSafeInteger ≤ x ∧ x ≤ maxSafeInteger) := by
  cases value with
  | bigint value => simp [denote] at h; simp [h]
  | num double =>
    cases double with
    | ofInt n =>
      simp only [denote] at h
      split at h
      · rename_i window
        simp only [Option.some.injEq] at h
        subst h
        simp only [decide_eq_true_eq, Bool.and_eq_true] at window
        exact Or.inr ⟨rfl, window.1, window.2⟩
      · exact absurd h (by simp)
    | nonIntegral => simp [denote] at h
  | bool flag => exact absurd rfl (notBool flag)
  | str => simp [denote] at h
  | boxedFloat => simp [denote] at h
  | obj => simp [denote] at h

/-- Two bigints add exactly, at any size. -/
theorem core_sound_bigint_bigint (a b : Int) :
    (operatorAddExactCore (.bigint a) (.bigint b)).denote = some (a + b) := by
  simp [operatorAddExactCore, JsValue.pythonJstype, JsValue.jstype, nativeAdd,
    Result.denote, denote]

/-- A bigint and a number add through the conversion branch, also exactly. -/
theorem core_sound_bigint_num {a b : Int}
    (hb : minSafeInteger ≤ b) (hb' : b ≤ maxSafeInteger) :
    (operatorAddExactCore (.bigint a) (.num (.ofInt b))).denote = some (a + b) := by
  simp [operatorAddExactCore, JsValue.pythonJstype, JsValue.jstype, nativeAdd,
    Result.denote, denote, exactIntegerPrimitive, Num.isSafeInteger, bigintOf,
    JsValue.toBigInt, hb, hb']

theorem core_sound_num_bigint {a b : Int}
    (ha : minSafeInteger ≤ a) (ha' : a ≤ maxSafeInteger) :
    (operatorAddExactCore (.num (.ofInt a)) (.bigint b)).denote = some (a + b) := by
  simp [operatorAddExactCore, JsValue.pythonJstype, JsValue.jstype, nativeAdd,
    Result.denote, denote, exactIntegerPrimitive, Num.isSafeInteger, bigintOf,
    JsValue.toBigInt, ha, ha']

/--
What the addition reduces to on two safe integers held as numbers.

Both branches of the runtime's own test appear on the right: the number it
computed when the window test passes, and the BigInt sum when it does not.  The
zero case it tests separately coincides with the first, since zero is inside the
window.
-/
theorem addExactCore_num_num {a b : Int}
    (ha : minSafeInteger ≤ a) (ha' : a ≤ maxSafeInteger)
    (hb : minSafeInteger ≤ b) (hb' : b ≤ maxSafeInteger) :
    operatorAddExactCore (.num (.ofInt a)) (.num (.ofInt b))
      = if withinSafeWindow (Num.ofInt (roundIntToDouble (a + b)))
        then .ok (.num (.ofInt (roundIntToDouble (a + b))))
        else .ok (.bigint (a + b)) := by
  have hsafeA : (Num.ofInt a).isSafeInteger = true := by
    simp only [Num.isSafeInteger, Bool.and_eq_true, decide_eq_true_eq]
    exact ⟨ha, ha'⟩
  have hsafeB : (Num.ofInt b).isSafeInteger = true := by
    simp only [Num.isSafeInteger, Bool.and_eq_true, decide_eq_true_eq]
    exact ⟨hb, hb'⟩
  by_cases zero : roundIntToDouble (a + b) = 0
  · simp [operatorAddExactCore, JsValue.pythonJstype, JsValue.jstype, nativeAdd,
      JsValue.toDouble, Num.add, isPythonFloat, hsafeA, hsafeB, zero, withinSafeWindow,
      minSafeInteger, maxSafeInteger]
  · simp [operatorAddExactCore, JsValue.pythonJstype, JsValue.jstype, nativeAdd,
      JsValue.toDouble, Num.add, isPythonFloat, hsafeA, hsafeB, bigintOf,
      JsValue.toBigInt, zero]

/--
Two safe integers held as numbers add exactly.

The two cases are the whole of the argument.  Inside the window the double never
rounded, by `roundIntToDouble_eq_self_of_safe_result`, so the number returned is
the sum.  Outside it, rounding cannot have brought the sum back inside, so the
window test fails and the branch that redoes the addition in BigInt is taken.
-/
theorem core_sound_num_num {a b : Int}
    (ha : minSafeInteger ≤ a) (ha' : a ≤ maxSafeInteger)
    (hb : minSafeInteger ≤ b) (hb' : b ≤ maxSafeInteger) :
    (operatorAddExactCore (.num (.ofInt a)) (.num (.ofInt b))).denote = some (a + b) := by
  have bound : (a + b).natAbs < 2 * twoPow53 := by
    simp only [minSafeInteger, maxSafeInteger] at ha ha' hb hb'
    simp only [twoPow53]
    omega
  rw [addExactCore_num_num ha ha' hb hb']
  by_cases win : withinSafeWindow (Num.ofInt (roundIntToDouble (a + b))) = true
  · have bounds : minSafeInteger ≤ roundIntToDouble (a + b) ∧
        roundIntToDouble (a + b) ≤ maxSafeInteger := by
      simp only [withinSafeWindow, Bool.and_eq_true, decide_eq_true_eq] at win
      exact win
    have exact := roundIntToDouble_eq_self_of_safe_result bound bounds.1 bounds.2
    rw [exact] at bounds ⊢
    have win' : withinSafeWindow (Num.ofInt (a + b)) = true := by
      simp only [withinSafeWindow, Bool.and_eq_true, decide_eq_true_eq]
      exact bounds
    simp [win', Result.denote, denote, bounds.1, bounds.2]
  · simp [win, Result.denote, denote]

/-- The body is sound on every pair of denoting values that are not booleans. -/
theorem core_sound {left right : JsValue} {x y : Int}
    (hleft : denote left = some x) (hright : denote right = some y)
    (leftNotBool : ∀ flag, left ≠ .bool flag)
    (rightNotBool : ∀ flag, right ≠ .bool flag) :
    (operatorAddExactCore left right).denote = some (x + y) := by
  rcases denote_cases hleft leftNotBool with hl | ⟨hl, hlmin, hlmax⟩
  · subst hl
    rcases denote_cases hright rightNotBool with hr | ⟨hr, hrmin, hrmax⟩
    · subst hr; exact core_sound_bigint_bigint x y
    · subst hr; exact core_sound_bigint_num hrmin hrmax
  · subst hl
    rcases denote_cases hright rightNotBool with hr | ⟨hr, hrmin, hrmax⟩
    · subst hr; exact core_sound_num_bigint hlmin hlmax
    · subst hr; exact core_sound_num_num hlmin hlmax hrmin hrmax

/--
The addition is faithful to the abstraction.

For any two values that denote integers -- in either representation, in either
order, booleans included, at any magnitude -- the sum denotes the integer sum.

This is the lemma, not the claim: it is stated in Lean's `Int`, which is nobody
in particular.  `Spec/Systems.lean` says which number system is meant, and the
theorems worth quoting are the ones there.
-/
theorem addExact_denote (left right : JsValue) (x y : Int)
    (hleft : ⟦left⟧ = some x) (hright : ⟦right⟧ = some y) :
    (operatorAddExact left right).denote = some (x + y) := by
  unfold operatorAddExact
  exact core_sound
    (by rw [denote_normalizeBool]; exact hleft)
    (by rw [denote_normalizeBool]; exact hright)
    (normalizeBool_ne_bool left) (normalizeBool_ne_bool right)

end SageSemantics
