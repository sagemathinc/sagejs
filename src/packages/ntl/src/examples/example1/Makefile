PACKAGES = $(shell pwd)/../../../../

example.wasm: example.cc
	em++ ./example.cc -lntl -L${PACKAGES}/ntl/dist/local/lib -I${PACKAGES}/ntl/dist/local/include/ -lgmp -L${PACKAGES}/gmp/dist/local/lib/ -o example.wasm

run: example.wasm
	wasmer ./example.wasm