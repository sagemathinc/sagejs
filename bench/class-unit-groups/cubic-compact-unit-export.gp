/* Reproduce the large-regulator compact-unit research input with PARI/GP. */
/* Discovery may vary with PARI version; the Python replay trusts no answer. */
default(parisizemax,536870912);
setrand(1);
f=x^3-x+10^12+7;
n=nfinit(f);
if(n.index!=1,error("export requires power basis maximal order"));
if(n.pol!=f,error("unexpected defining equation"));
B=matrix(3,3,i,j,polcoef(n.zk[j],i-1));
ideal_columns(p)={my(H=mathnf(B*idealhnf(n,p)));return([Vec(H[,1]),Vec(H[,2]),Vec(H[,3])]);}
b=bnfinit(n,1);
u=bnfunits(b)[1][1];
/* Each row exports rational power-basis coordinates, exponent, and ideal factors. */
print("COMPACT_BEGIN");
print(vector(4,i,polcoef(f,i-1)));
for(i=1,matsize(u)[1],a=lift(nfbasistoalg(n,u[i,1])); F=idealfactor(n,u[i,1]); print([vector(3,j,[numerator(polcoef(a,j-1)),denominator(polcoef(a,j-1))]),u[i,2],vector(matsize(F)[1],j,concat(ideal_columns(F[j,1]),[F[j,2]]))]));
print("COMPACT_END");
quit;
