# Modular newform oracle provenance

`modular-newform-lmfdb.json` pins two small, network-free acceptance rows.
The source records are the LMFDB newform pages linked in the JSON.  The
rational row is copied directly.  For `23.2.a.a`, LMFDB writes
$q-\beta q^2+(-1+2\beta)q^3+\cdots$ with
$\beta^2-\beta-1=0$; Sage.js uses $a=-\beta$, hence
$a^2+a-1=0$ and the power-basis coordinates stored in the fixture.

The independent SageMath replay is:

```sage
for N in [11, 23]:
    forms = CuspForms(N, 2).newforms(names="a")
    print(N, [f.base_ring().defining_polynomial() if
              f.base_ring() is not QQ else None for f in forms])
    print([f.q_expansion(8) for f in forms])
```

The checked certificate does not trust either presentation: it reconstructs
every $T_n$ through the Sturm bound as a polynomial in a primitive Hecke
operator and verifies the exact matrix identity on the modular-symbol
constituent.
