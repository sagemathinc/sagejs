# TODO

- [ ] need to unset NODE in all build-env.sh, or have a base build-env.sh that they all use... to get rid of that annoying warning.
- [ ] create a Dockerfile and image on dockerhub that has everything installed to be able to automate the build.
- [ ] the libpari.a is maybe wrong due to ar instead of emar.
- [ ] for sympow we should make pari/build have a native version, so sympow can use that to generate scripts.  OR use the wasm version and filesystem mapping!
