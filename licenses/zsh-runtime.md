# Guest zsh runtime

zsh5.9-r5 and x86 dependencies are repackaged unchanged from Alpine v3.22 official HTTPS packages into an isolated /opt/zsh tree. Exact URLs, SHA-256, versions, licenses and Alpine source commits are in sources/zsh/packages.json (also in hosted zsh-source.tar.gz). No package install scripts execute. Browser decompresses gzip; guest BusyBox tar unpacks it without overwriting host/system libc. /tmp/zsh invokes bundled musl with explicit library path. Guest-generated completion comes from its own term-llm binary.

Corresponding zsh5.9 source, exact Alpine APKBUILD/install scripts/patches (verified against recipe SHA-512), and provenance are in hosted zsh-source.tar.gz. Notices: zsh-LICENCE, musl-COPYRIGHT, ncurses-COPYING, libcap-LICENSE alongside this file. libcap redistributed under its BSD option. Completion/_qdbus GPL source is included in the zsh source archive. Other runtime library attributions are included in these notices.
