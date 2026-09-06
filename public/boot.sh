#!/bin/sh
# Executed inside the emulated guest only. /mnt is v86's existing host9p mount.
set -eu
export HOME=/root XDG_CONFIG_HOME=/root/.config XDG_DATA_HOME=/root/.local/share XDG_CACHE_HOME=/root/.cache
export TERM=xterm-256color GOMAXPROCS=1 GOGC=50
export PATH=/tmp:$PATH TERM_LLM_BROWSER_WORKSPACE_FILE=/mnt/active-cwd
mkdir -p "$XDG_CONFIG_HOME/term-llm/agents/artifact" /mnt/artifact
ln -s /mnt/artifact /workspace
cp /mnt/agent.yaml /mnt/system.md "$XDG_CONFIG_HOME/term-llm/agents/artifact/"
cp /mnt/guest-config.yaml "$XDG_CONFIG_HOME/term-llm/config.yaml"
cp /mnt/term-llm /tmp/term-llm
cp /mnt/guest-bridge /tmp/guest-bridge
cp /mnt/git /tmp/git
cp /mnt/picnic-mcp /tmp/picnic-mcp
chmod +x /tmp/picnic-mcp
cat > "$XDG_CONFIG_HOME/term-llm/mcp.json" <<'MCP'
{"servers":{"picnic":{"command":"/tmp/picnic-mcp"}}}
MCP
chmod +x /tmp/term-llm /tmp/guest-bridge /tmp/git
# Offline upstream Git; no host identity, remotes, hooks, or credentials.
git -C /workspace init -b main
git -C /workspace config user.name 'Browser Lab'
git -C /workspace config user.email 'lab@example.invalid'
git -C /workspace -c commit.gpgsign=false commit --allow-empty -m 'Initialize browser workspace'
cat > /workspace/notes.txt <<'NOTES'
Picnic: Sunday at 12:00, Harbour Park.
Four people, one vegetarian.
Bring sandwiches, fruit, water and a blanket.
If it rains, meet at the community hall.
NOTES
printf '/mnt/artifact' > /mnt/active-cwd
git --version
cp /tmp/guest-bridge "$XDG_CONFIG_HOME/term-llm/agents/artifact/write-artifact"
stty cols 90 rows 26
ifconfig lo up
/tmp/guest-bridge /mnt >/tmp/bridge.log 2>&1 &
uname -a
/tmp/term-llm --version
# Install zsh beside the original shell; never replace the guest's system libc.
mkdir -p /opt/zsh
tar -xf /mnt/zsh-root.tar -C /opt/zsh
cat > /tmp/zsh <<'ZSH_WRAPPER'
#!/bin/sh
exec /opt/zsh/lib/ld-musl-i386.so.1 --library-path /opt/zsh/lib:/opt/zsh/usr/lib /opt/zsh/bin/zsh "$@"
ZSH_WRAPPER
chmod +x /tmp/zsh
/tmp/term-llm config completion zsh > /root/.term-llm-completion.zsh
cat > /root/.zshrc <<'ZSH_RC'
module_path=(/opt/zsh/usr/lib/zsh/5.9 $module_path)
fpath=(/opt/zsh/usr/share/zsh/5.9/functions/**/*(/) $fpath)
export TERMINFO=/opt/zsh/etc/terminfo
export SHELL=/tmp/zsh
PROMPT='%1~%# '
autoload -Uz compinit
compinit -d /root/.zcompdump
source /root/.term-llm-completion.zsh
compdef _term-llm tl
bindkey '^I' expand-or-complete
chat() {
  /tmp/term-llm chat --provider browser --no-search
  printf '\nLAB_CLI_EXIT\n'
}
printf '\nLAB_READY\n'
ZSH_RC
cd /workspace
set +eu
exec /tmp/zsh -i
