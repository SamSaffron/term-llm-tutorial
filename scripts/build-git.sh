#!/bin/sh
# Rebuild offline-only static i686 Git; run from the lab directory.
set -eu
cd "$(dirname "$0")/.."
mkdir -p .build/git sources/git public/assets
fetch() { test -f "$2" || curl -fL "$1" -o "$2"; echo "$3  $2" | sha256sum -c -; }
fetch https://ziglang.org/download/0.14.1/zig-x86_64-linux-0.14.1.tar.xz sources/git/zig-x86_64-linux-0.14.1.tar.xz 24aeeec8af16c381934a6cd7d95c807a8cb2cf7df9fa40d359aa884195c4716c
fetch https://www.kernel.org/pub/software/scm/git/git-2.50.1.tar.xz sources/git/git-2.50.1.tar.xz 7e3e6c36decbd8f1eedd14d42db6674be03671c2204864befa2a41756c5c8fc4
fetch https://zlib.net/fossils/zlib-1.3.1.tar.gz sources/git/zlib-1.3.1.tar.gz 9a93b2b7dfdac77ceba5a558a580e74667dd6fede4585b91eefb60f03b72df23
for archive in sources/git/*tar.*; do tar -xf "$archive" -C .build/git; done
ROOT=$(pwd)
ZIG="$ROOT/.build/git/zig-x86_64-linux-0.14.1/zig"
export ZIG_GLOBAL_CACHE_DIR="$ROOT/.build/git/zig-cache"
export CC="$ZIG cc -target x86-linux-musl -mcpu=pentium4"
export AR="$ZIG ar" RANLIB="$ZIG ranlib"
(cd .build/git/zlib-1.3.1 && ./configure --static --prefix="$ROOT/.build/git/zlib" && make -j4 && make install)
# No network helpers, Perl, Tcl/Tk, Python, gettext, or external crypto dependencies.
# Core worktree/status/stash/commit/diff are real upstream built-ins.
(cd .build/git/git-2.50.1 && make -j4 git CC="$CC" AR="$AR" RANLIB="$RANLIB" \
 CFLAGS='-Os' LDFLAGS='-static' ZLIB_PATH="$ROOT/.build/git/zlib" \
 NO_REGEX=NeedsStartEnd NO_CURL=1 NO_EXPAT=1 NO_OPENSSL=1 NO_GETTEXT=1 NO_ICONV=1 NO_PERL=1 NO_PYTHON=1 NO_TCLTK=1 \
 NO_INSTALL_HARDLINKS=1 NO_GITWEB=1 NO_TCLTK=1 prefix=/usr/local)
cp .build/git/git-2.50.1/git public/assets/git
file public/assets/git
sha256sum public/assets/git
