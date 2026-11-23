#!/bin/bash
set +x
set -euo pipefail

cd -- "$(dirname -- "$0")"

radio_node="$(command -v node || true)"
if [[ -z "$radio_node" ]]; then
  for radio_candidate in "$HOME/.local/bin/node" /opt/homebrew/bin/node /usr/local/bin/node; do
    if [[ -x "$radio_candidate" ]]; then
      radio_node="$radio_candidate"
      break
    fi
  done
fi

if [[ -z "$radio_node" ]]; then
  printf '找不到 Node.js。可在浏览器打开「末班电台.html」使用预设问法。\n' >&2
  exit 1
fi

radio_token="${MODELSCOPE_TOKEN:-${MODELSCOPE_API_TOKEN:-${MODELSCOPE_API_KEY:-${MODELSCOPE_ACCESS_TOKEN:-}}}}"
if [[ -z "$radio_token" && -t 0 ]]; then
  if ! IFS= read -r -s -p '魔搭 Token（留空使用预设问法） ' radio_token; then
    radio_token=''
  fi
  printf '\n'
fi

export MODELSCOPE_TOKEN="$radio_token"
exec "$radio_node" 末班电台服务.mjs --open
