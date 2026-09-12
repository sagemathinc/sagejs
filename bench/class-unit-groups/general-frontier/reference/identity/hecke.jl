# Identity only: no class/unit group calls or supplied maximal-order hints.
using Hecke
include("../hecke/transport.jl")

# Emit the one canonical rational format consumed by the independent checker.
identity_rational(q) = denominator(q) == 1 ? string(numerator(q)) :
    string(numerator(q)) * "/" * string(denominator(q))

fields = split(readline(stdin), '\t')
length(fields) == 3 || error("expected label, coefficients, marker")
label, coefficient_text, marker = fields
occursin(r"\A[0-9a-z.-]+\z", label) || error("invalid label")
occursin(r"\AIDENTITY_DONE\|[0-9a-f]{32}\z", marker) || error("invalid marker")
coefficients = split(coefficient_text, ',')
all(c -> occursin(r"\A-?(0|[1-9][0-9]*)\z", c), coefficients) || error("invalid coefficients")
3 <= length(coefficients) <= 11 || error("invalid degree")
coefficients[end] == "1" || error("polynomial must be monic")
R, x = polynomial_ring(QQ, "x")
P = R([QQ(parse(BigInt, c)) for c in coefficients])
K, a = number_field(P, "a"; cached=false)
O = maximal_order(K)
result = (schema="sagejs.reference-order-identity.v1", engine="hecke", label=String(label),
    coefficients=String.(coefficients), signature=collect(signature(K)),
    discriminant=string(discriminant(O)), index=string(index(O)),
    basis=[[identity_rational(coeff(K(b), i)) for i in 0:degree(K)-1] for b in basis(O)],
    maximality=(method="hecke-maximal-order-no-hints", unresolved=String[]),
    independent_maximality_replay=false)
println(frontier_json(result))
println(marker)
flush(stdout)
# Keep the process alive until the supervisor has drained its final frame.
readline(stdin)
