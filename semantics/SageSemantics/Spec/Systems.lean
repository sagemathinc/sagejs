import SageSemantics.Spec.Theorems

/-!
# The number systems, kept apart

`denote` lands in Lean's `Int`, and a theorem stated through it says the
runtime's representation is faithful to ℤ.  That is the right property for
integers, but it leaves unsaid *whose* integers, and the answer is not always
the same one.

For the exact integers the collapse is honest and is recorded as such here:
Python's `int` and Sage's `ZZ` are both ℤ, so a single theorem covers both, and
the two wrappers below exist to say that out loud rather than to leave it as an
assumption a reader has to reconstruct.

For the floating-point systems the collapse would be **wrong**, and the last
section says why with a machine-checked example.  Sage has more than one real
field, and they disagree.
-/

namespace SageSemantics

/-! ## The exact integers -/

/-- Python's `int`: arbitrary precision, which is ℤ. -/
structure PythonInt where
  value : Int
  deriving DecidableEq, Repr

/-- Sage's `ZZ`: also ℤ.  A separate type, so that a theorem about one is not
silently taken for a theorem about the other. -/
structure SageZZ where
  value : Int
  deriving DecidableEq, Repr

def PythonInt.add (left right : PythonInt) : PythonInt := ⟨left.value + right.value⟩

def SageZZ.add (left right : SageZZ) : SageZZ := ⟨left.value + right.value⟩

/-- Reading a runtime value as a Python `int`. -/
def toPythonInt (value : JsValue) : Option PythonInt :=
  (denote value).map PythonInt.mk

/-- Reading a runtime value as an element of Sage's `ZZ`. -/
def toSageZZ (value : JsValue) : Option SageZZ :=
  (denote value).map SageZZ.mk

/--
The runtime's addition agrees with Python's `int` addition.

This is `addExact_sound` again, said in the vocabulary of the system it is
about: read the operands as Python integers, add them there, and the runtime
gives back a value that reads as the same integer.
-/
theorem addExact_agrees_with_python {left right : JsValue} {x y : PythonInt}
    (hleft : toPythonInt left = some x) (hright : toPythonInt right = some y) :
    (operatorAddExact left right).denote.map PythonInt.mk = some (x.add y) := by
  simp only [toPythonInt, Option.map_eq_some_iff] at hleft hright
  obtain ⟨a, ha, rfl⟩ := hleft
  obtain ⟨b, hb, rfl⟩ := hright
  rw [addExact_sound left right a b ha hb]
  rfl

/-- And with Sage's `ZZ` addition, which is the same statement because the two
systems really are the same ring. -/
theorem addExact_agrees_with_sageZZ {left right : JsValue} {x y : SageZZ}
    (hleft : toSageZZ left = some x) (hright : toSageZZ right = some y) :
    (operatorAddExact left right).denote.map SageZZ.mk = some (x.add y) := by
  simp only [toSageZZ, Option.map_eq_some_iff] at hleft hright
  obtain ⟨a, ha, rfl⟩ := hleft
  obtain ⟨b, hb, rfl⟩ := hright
  rw [addExact_sound left right a b ha hb]
  rfl

/-! ## The real fields, which do not collapse

Sage's `RR` is `RealField(53)`: a 53-bit significand, as binary64 has, but with
an exponent range that is effectively unbounded.  Sage's `RDF`, Python's `float`
and a JavaScript number are binary64, whose exponent stops.  Sharing a
significand width is what makes them look interchangeable; the exponent is where
they part.

Measured in SageMath 10.9:

```
RR(2)^2000            1.14813069527425e602
RDF(2)^2000           +infinity
float(2)**2000        OverflowError
RR(1e-300)*RR(1e-300) 1.00000000000000e-600
RDF(1e-300)*RDF(1e-300)  0.0
```

So a float layer that models one rounding regime would prove false things about
the other.  The two ranges are given below, and the disagreement is checked
rather than asserted.
-/

/-- The exponent of the smallest positive binary64, counting subnormals. -/
def binary64MinExponent : Int := -1074

/-- The exponent above which binary64 has nothing left to say. -/
def binary64MaxExponent : Int := 1023

/-- Whether `significand * 2 ^ exponent` is a binary64 value. -/
def inBinary64 (exponent : Int) : Bool :=
  binary64MinExponent ≤ exponent && exponent ≤ binary64MaxExponent

/-- Whether it is a value of `RealField p`, whose exponent range is not the
constraint -- only the significand is. -/
def inRealField (_exponent : Int) : Bool := true

/--
The two systems disagree, and `2 ^ 2000` is where.

It is an element of `RR`, and it is not a binary64 value: this is the
`1.14813069527425e602` against `+infinity` above.  A model that used one for the
other would be unsound for exactly the values where a program is already in
trouble.
-/
theorem realField_ne_binary64 :
    inRealField 2000 = true ∧ inBinary64 2000 = false := by
  constructor
  · rfl
  · decide

end SageSemantics
