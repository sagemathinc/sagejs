FROM ubuntu:20.04

MAINTAINER William Stein <wstein@sagemath.com>

USER root

RUN \
    apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y \
     dpkg-dev \
     yasm \
     git \
     python3 \
     curl \
     zlib1g-dev \
     libffi-dev \
     texinfo

# So we can source (see http://goo.gl/oBPi5G)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

RUN \
     git clone https://github.com/emscripten-core/emsdk.git \
  && cd emsdk \
  && ./emsdk install latest \
  && ./emsdk activate latest


RUN \
     cd emsdk && source ./emsdk_env.sh \
  && git clone https://github.com/sagemathinc/sagejs \
  && cd sagejs/src \
  && make -j16
     
