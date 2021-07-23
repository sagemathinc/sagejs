sample.js:
	export PACKAGES=`pwd`/../../../
	emcc sample.c -o sample.js -I${PACKAGES}/mpfr/dist/local/include -L${PACKAGES}/mpfr/dist/local/lib -I${PACKAGES}/gmp/dist/local/include -L${PACKAGES}/gmp/dist/local/lib -lmpfr -lgmp

clean:
	rm sample.js sample.wasm

run: sample.js
	node sample.js

all: sample.js