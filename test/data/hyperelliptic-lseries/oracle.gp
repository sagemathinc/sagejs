\\p 50
x='x;

L713=lfungenus2([x,x^3-x+1]);
print([lfunparams(L713),lfunrootres(L713),lfun(L713,1),lfun(L713,2)]);

L13223=lfungenus2([x,x^3-3*x+1]);
print([lfunparams(L13223),lfunrootres(L13223),lfun(L13223,1,1)]);

E11=ellinit([0,-1,1,-10,-20]);
E33=ellinit([1,1,0,-11,0]);
print([11^2*33,lfunrootres(E11)[3]^2*lfunrootres(E33)[3],lfun(E11,1)^2*lfun(E33,1),lfun(E11,2)^2*lfun(E33,2)]);
