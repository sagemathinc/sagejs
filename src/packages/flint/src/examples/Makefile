PACKAGES = $(shell pwd)/../../..

LIB = -L${PACKAGES}/flint/dist/local/lib -L${PACKAGES}/gmp/dist/local/lib  -L${PACKAGES}/mpfr/dist/local/lib
INCLUDE = -I${PACKAGES}/flint/dist/local/include/flint -I${PACKAGES}/gmp/dist/local/include -I${PACKAGES}/mpfr/dist/local/include

all: run-primegen run-partitions

primegen.js: primegen.c
	emcc -O3 primegen.c -o primegen.js ${INCLUDE} ${LIB} -lflint -lmpfr -lgmp -s ALLOW_MEMORY_GROWTH=1

run-primegen: primegen.js
	node ./primegen.js 20

partitions.js: partitions.cpp
	em++ -O3 partitions.cpp -o partitions.js ${INCLUDE} ${LIB} -lflint -lmpfr -lgmp -s ALLOW_MEMORY_GROWTH=1

run-partitions: partitions.js
	node ./partitions.js 2021

clean:
	rm *.js *.wasm