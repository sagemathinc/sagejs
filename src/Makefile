all: packages/gmp/dist/local packages/gf2x/dist/local packages/pari/dist/local packages/python/dist/local packages/mpfr/dist/local packages/mpir/dist/local packages/ntl/dist/local packages/flint/dist/local packages/sympow/dist/local packages/eclib/dist/local

packages/gmp/dist/local:
	cd packages/gmp && npm run build

packages/python/dist/local:
	cd packages/python && npm run build

packages/mpir/dist/local:
	cd packages/mpir && npm run build

packages/sympow/dist/local:
	cd packages/sympow && npm run build

packages/gf2x/dist/local:
	cd packages/gf2x && npm run build

packages/pari/dist/local: packages/gmp/dist/local
	cd packages/pari && npm run build

packages/mpfr/dist/local: packages/gmp/dist/local
	cd packages/mpfr && npm run build

packages/mpc/dist/local: packages/gmp/dist/local packages/mpfr/dist/local
	cd packages/mpc && npm run build

packages/ntl/dist/local: packages/gmp/dist/local packages/gf2x/dist/local
	cd packages/ntl && npm run build

packages/flint/dist/local: packages/gmp/dist/local packages/mpfr/dist/local packages/mpir/dist/local packages/ntl/dist/local
	cd packages/flint && npm run build

packages/eclib/dist/local: packages/gmp/dist/local packages/mpfr/dist/local packages/mpir/dist/local packages/ntl/dist/local packages/flint/dist/local
	cd packages/eclib && npm run build

clean:
	rm -rf packages/*/build packages/*/dist

