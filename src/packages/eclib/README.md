# ECLIB: mwrank (for 2-descent on elliptic curves over **Q**) and modular symbol code used to create the elliptic curve database

This is a cross-platform Web Assembly build that make the functionality of ECLIB
available to web assembly.

Upstream: https://github.com/JohnCremona/eclib

## Try it out

Let's install @sagemath/eclib and run our WASM mwrank on the 
elliptic curve with a-invariants `[1,2,3,4,5]`.  Start with
any computer with [node.js and npm installed](https://nodejs.org/en/download/).
Then:
```sh
$ mkdir x; cd x; npm init -y
$ npm install @sagemath/eclib
$ echo '1 2 3 4 5' | node node_modules/@sagemath/eclib/dist/local/bin/mwrank
Program mwrank: uses 2-descent (via 2-isogeny if possible) to
determine the rank of an elliptic curve E over Q, and list a
set of points that generate E(Q) modulo 2E(Q).
and finally saturate to obtain generating points on the curve.
For more details see the mwrank documentation.
For details of algorithms see the author's book.

Please acknowledge use of this program in published work, 
and send problems to john.cremona@gmail.com.

eclib version 20210625, using NTL bigints and NTL real and complex multiprecision floating point
Using multiprecision floating point with 50 bits precision.
Curve [1,2,3,4,5] :     Working with minimal curve [1,-1,0,4,3] via [u,r,s,t] = [1,-1,0,-1]
Basic pair: I=-183, J=-6858
disc=-71546112
2-adic index bound = 2
By Lemma 5.1(b), 2-adic index = 1
2-adic index = 1
One (I,J) pair
*** BSD give two (I,J) pairs
Looking for quartics with I = -183, J = -6858
Looking for Type 3 quartics:
Trying positive a from 1 up to 6 (square a first...)
(1,2,-9,22,-11) --nontrivial...(x:y:z) = (1 : 1 : 0)
Point = [2:3:1]
        height = 1.2653937917645
Rank of B=im(eps) increases to 1
(4,3,6,3,-4)    --trivial
Trying positive a from 1 up to 6 (...then non-square a)
Trying negative a from -1 down to -5
(-4,3,6,3,4)    --trivial
Finished looking for Type 3 quartics.
Mordell rank contribution from B=im(eps) = 1
Selmer  rank contribution from B=im(eps) = 1
Sha     rank contribution from B=im(eps) = 0
Mordell rank contribution from A=ker(eps) = 0
Selmer  rank contribution from A=ker(eps) = 0
Sha     rank contribution from A=ker(eps) = 0

Used full 2-descent via multiplication-by-2 map
Rank = 1
Rank of S^2(E)  = 1

warning: unsupported syscall: __sys_prlimit64
warning: unsupported syscall: __sys_mprotect
warning: unsupported syscall: __sys_prlimit64
warning: unsupported syscall: __sys_getrusage
sigaction: signal type not supported: this is a no-op.
sigaction: signal type not supported: this is a no-op.
sigaction: signal type not supported: this is a no-op.
sigaction: signal type not supported: this is a no-op.
sigaction: signal type not supported: this is a no-op.
Searching for points (bound = 8)...done:
  found points which generate a subgroup of rank 1
  and regulator 1.2653937917645
Processing points found during 2-descent...done:
  now regulator = 1.2653937917645
Saturating (with bound = 1000)...done:
  points were already saturated.
Transferring points from minimal curve [1,-1,0,4,3] back to original curve [1,2,3,4,5]

Generator 1 is [1:2:1]; height 1.2653937917645

Regulator = 1.2653937917645

The rank and full Mordell-Weil basis have been determined unconditionally.
Enter curve:  (2.411 seconds)

stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the FAQ), or make sure to emit a newline when you printf etc.
~/sagejs/src/packages/eclib$ 
```