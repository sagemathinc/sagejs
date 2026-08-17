# Persistent developer oracle for the frozen maximal-order corpus.
#
# Input is one tab-separated record per line: ``id<TAB>c0,c1,...,cn``.
# Coefficients are integers in ascending order. Output contains the field
# discriminant and Hecke's lower-left HNF numerator/common denominator basis.
# This adapter invokes public Hecke APIs and contains no upstream source.

using Hecke

Qx, x = polynomial_ring(QQ, "x")

function csv_matrix(M)
  rows = String[]
  for i in 1:nrows(M)
    push!(rows, join((string(M[i, j]) for j in 1:ncols(M)), ","))
  end
  return join(rows, ";")
end

for line in eachline(stdin)
  isempty(strip(line)) && continue
  id, raw_coefficients = split(line, '\t'; limit = 2)
  try
    coefficients = [parse(ZZRingElem, value) for value in split(raw_coefficients, ',')]
    polynomial = sum(coefficients[i] * x^(i - 1) for i in eachindex(coefficients))
    field, _generator = number_field(polynomial, "a"; cached = false)
    order = maximal_order(field)
    basis = basis_matrix(Hecke.FakeFmpqMat, order)
    println(
      id,
      '\t',
      discriminant(order),
      '\t',
      basis.den,
      '\t',
      csv_matrix(basis.num),
    )
  catch error
    println(id, '\t', "ERROR", '\t', typeof(error), ':', sprint(showerror, error))
  end
  flush(stdout)
end
