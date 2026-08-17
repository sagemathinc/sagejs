#!/usr/bin/env python3
"""Extract canonical exact fixtures from PARI's public Round-4 corpus.

This developer tool is deliberately not part of the normal test suite. It
requires a PARI source checkout and `gp` and writes JSON Lines to stdout.
The checked fixture is subsequently structural-tested without PARI.
"""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path


GP_HELPERS = r"""
jsonvec(v)=my(s="[");for(i=1,#v,if(i>1,s=concat(s,","));s=concat(s,concat("\"",concat(Str(v[i]),"\""))));concat(s,"]");
jsonmat(M)=my(s="[");for(i=1,matsize(M)[1],if(i>1,s=concat(s,","));s=concat(s,jsonvec(Vec(M[i,]))));concat(s,"]");
jsonfac(F)=my(s="[");for(i=1,matsize(F)[1],if(i>1,s=concat(s,","));s=concat(s,concat("[\"",concat(Str(F[i,1]),concat("\",",concat(Str(F[i,2]),concat(",\"",concat(if(F[i,1]<80000,"proven-prime",if(ispseudoprime(F[i,1]),"probable-prime","composite-unresolved")),"\"]"))))))));concat(s,"]");
integralmodel(T)=my(Q=T/pollead(T),n=poldegree(T),scale=1);for(i=0,n,scale=lcm(scale,denominator(polcoef(Q,i))));subst(Q,x,x/scale)*scale^n;
emitcase(i,T,hint)=my(B,n,M,D,H,pd,fd,idx);B=nfbasis([T,hint]);n=poldegree(T);M=matrix(n,n,r,c,polcoef(B[r],c-1));D=denominator(M);H=mathnf((D*M)~)~;pd=poldisc(T);fd=nfdisc([T,hint]);idx=sqrtint(abs(pd/fd));print("{\"ordinal\":",i,",\"coefficients\":",jsonvec(Vecrev(T)),",\"equation_discriminant\":\"",pd,"\",\"field_discriminant\":\"",fd,"\",\"index\":\"",idx,"\",\"local_index_factors\":",jsonfac(factor(idx,80000)),",\"basis_denominator\":\"",D,"\",\"basis_numerator\":",jsonmat(H),"}");
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("round4", type=Path)
    parser.add_argument("--gp", default="/usr/bin/gp")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    source = args.round4.read_text(encoding="utf-8")
    start = source.index("{ v = [")
    end = source.index("]; }", start) + len("]; }")
    program = (
        "default(parisizemax, 4G);\n"
        + source[start:end]
        + "\n"
        + GP_HELPERS
        + "for(i=1,#v,emitcase(i,integralmodel(Pol(v[i])),80000));\n"
        + "quit;\n"
    )
    result = subprocess.run(
        [args.gp, "-fq"],
        input=program,
        text=True,
        stdout=subprocess.PIPE,
        check=True,
    )
    if args.output is None:
        print(result.stdout, end="")
    else:
        args.output.write_text(result.stdout, encoding="utf-8")


if __name__ == "__main__":
    main()
