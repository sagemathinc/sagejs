# Note that only linux/amd64 as a build host is fully
# supported by emscripten right now though this should change
# soon, so even on arm (e.g., # apple silicon) we explicitly 
# use amd64).

if [[ `uname -m` == 'arm64' ]]; then
  sudo docker build  --platform linux/amd64 -t sagejs .
else
  sudo docker build -t sagejs .
fi
