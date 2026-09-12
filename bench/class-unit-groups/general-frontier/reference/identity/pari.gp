\\ Identity only: no bnf, class-group, unit-group, or supplied local-prime hints.
identity_strings(v) = Str("[", strjoin(vector(#v,j,Str("\"",v[j],"\"")),","), "]");
identity_case(label, coefficients) = {
  my(P=Polrev(coefficients), nf=nfinit(P), unresolved=nfcertify(nf), n=poldegree(P), rows);
  if(nf.pol != P, error("identity basis has a changed defining polynomial"));
  rows=vector(n,i,identity_strings(vector(n,j,polcoef(nf.zk[i],j-1))));
  print(Str("{\"schema\":\"sagejs.reference-order-identity.v1\",\"engine\":\"pari\",\"label\":\"",label,
    "\",\"coefficients\":",identity_strings(coefficients),",\"signature\":[",nf.sign[1],",",nf.sign[2],
    "],\"discriminant\":\"",nf.disc,"\",\"index\":\"",nf.index,"\",\"basis\":[",strjoin(rows,","),
    "],\"maximality\":{\"method\":\"pari-nfcertify\",\"unresolved\":",identity_strings(unresolved),
    "},\"independent_maximality_replay\":false}"));
};
