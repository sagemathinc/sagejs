FROM ubuntu:20.04

MAINTAINER William Stein <wstein@sagemath.com>

USER root

RUN \
    apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y \
     dpkg-dev \
     yasm \
     git \
     python3

RUN \
     git clone https://github.com/emscripten-core/emsdk.git \
  && cd emsdk \
  && ./emsdk install latest \
  && ./emsdk activate latest

RUN \
     source ./emsdk_env.sh \
  && git clone https://github.com/sagemathinc/sagejs \
  && cd sagejs/src \
  && make
     
