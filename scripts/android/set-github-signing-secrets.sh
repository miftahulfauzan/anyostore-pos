#!/usr/bin/env bash
set -euo pipefail

repo="miftahulfauzan/anyostore-pos"
key_file="${HOME}/.android/anyostore-release.jks"
password_file="${HOME}/.android/anyostore-release-password"
gh_bin="$(command -v gh || true)"

if [[ -z "$gh_bin" ]]; then
  for candidate in /opt/homebrew/Cellar/gh/*/bin/gh /usr/local/Cellar/gh/*/bin/gh; do
    if [[ -x "$candidate" ]]; then
      gh_bin="$candidate"
      break
    fi
  done
fi

if [[ -z "$gh_bin" ]]; then
  echo "Install GitHub CLI and sign in before adding the release signing secrets." >&2
  exit 1
fi
if [[ ! -r "$key_file" || ! -r "$password_file" ]]; then
  echo "The local Anyostore release keystore or password file is missing." >&2
  exit 1
fi

"$gh_bin" auth status --hostname github.com >/dev/null
base64 -i "$key_file" | tr -d '\r\n' | "$gh_bin" secret set ANDROID_KEYSTORE_BASE64 --repo "$repo"
tr -d '\r\n' < "$password_file" | "$gh_bin" secret set ANDROID_KEYSTORE_PASSWORD --repo "$repo"

echo "Stable Android signing secrets configured for $repo."
