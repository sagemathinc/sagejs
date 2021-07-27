PACKAGES = $(shell pwd)/../../..

program = example

MPFR = -I${PACKAGES}/mpfr/dist/local/include -L${PACKAGES}/mpfr/dist/local/lib -lmpfr

MPC = -I${PACKAGES}/mpc/dist/local/include -L${PACKAGES}/mpc/dist/local/lib -lmpc

GMP = -I${PACKAGES}/gmp/dist/local/include -L${PACKAGES}/gmp/dist/local/lib -lgmp

${program}.js: ${program}.c
	emcc -O3 ${program}.c -o ${program}.js ${MPFR} ${MPC} ${GMP}

clean:
	rm -f ${program}.js ${program}.wasm

run: ${program}.js
	node ${program}.js

install: ${program}.js
	mkdir -p $(shell pwd)/../../dist/example
	cp ${program}.js ${program}.wasm $(shell pwd)/../../dist/example

all: ${program}.js
