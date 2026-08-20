\\ PARI/GP 2.18 development oracle for certified bad-prime regression rows.
\\ Run with: gp -q bench/hyperelliptic/bad-reduction-oracles.gp

check(label, f, p, expected) =
{
  my(got = genus2charpoly(f, p));
  if (got != expected,
    error(Str(label, ": expected ", expected, ", got ", got)));
  print(label, " p=", p, " : ", got);
};

check("ordinary-node", x^5+x^2+19, 19, x^3-9*x^2+27*x-19);
check("one-node", (x-1)^2*(x^3+x+1)+5*x, 5, x^3+4*x^2+8*x+5);
check("two-nodes", (x^2+1)^2*(x+1)+7*x, 7, x^2-1);

q = x^3+x+1;
check("two-components-split", q^2 + 19*x, 19, x^2+x+1);
check("two-components-nonsplit", 2*q^2 + 19*x, 19, x^2-x+1);

p = 5;
f = (x-1)*(x-(1+p^2))*(x-(1-p^2))*x*(x-p);
check("nested-split", f, p, x^3+x^2+3*x-5);
check("nested-split-twist", 2*f, p, x^3-x^2+3*x+5);

f = x*(x-p)*(x-1)*(x-1-p)*(x-2)*(x-2-p);
check("ubereven-split", f, p, (x-1)^2);
check("ubereven-split-twist", 2*f, p, (x+1)^2);

print("bad-reduction PARI oracle rows passed");
