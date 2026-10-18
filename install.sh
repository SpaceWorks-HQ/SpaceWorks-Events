#!/usr/bin/env bash
# Download a pinned source release, then run its reviewed guided installer.
set -euo pipefail
set +x
ref=dev
install_dir=/opt/spaceworks-events
update=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) ref=${2:?Provide a reviewed commit/tag}; shift 2 ;;
    --directory) install_dir=${2:?Provide an absolute installation directory}; shift 2 ;;
    --update) update=1; shift ;;
    --help) echo 'Usage: bash install.sh [--ref COMMIT_OR_TAG] [--directory /opt/spaceworks-events] [--update]'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done
[[ "$ref" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,150}$ && "$ref" != *..* ]] || { echo 'Invalid release reference.' >&2; exit 1; }
[[ "$install_dir" = /* && "$install_dir" != / && "$install_dir" != *[[:space:]:]* ]] || { echo 'Use an absolute installation directory without spaces or colons.' >&2; exit 1; }
# A pipe contains script bytes, so prompts always come from the terminal.
exec </dev/tty
for dependency in curl tar sed; do command -v "$dependency" >/dev/null || { echo "Install $dependency first." >&2; exit 1; }; done
[[ $(uname -s) = Linux ]] || { echo 'Run this bootstrap on the Linux VPS.' >&2; exit 1; }
[[ ! -e "$install_dir/current" || "$update" = 1 ]] || { echo 'An installation exists. Use --update to preserve its configuration.' >&2; exit 1; }
# Resolve once before downloading: the archive and version always use one commit.
metadata=$(curl --fail --show-error --silent --location --proto '=https' "https://api.github.com/repos/SpaceWorks-HQ/SpaceWorks-Events/commits/$ref")
revision=$(printf '%s\n' "$metadata" | sed -n 's/^  "sha": "\([a-f0-9]\{40\}\)",$/\1/p' | head -n 1)
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || { echo 'Could not resolve the release commit.' >&2; exit 1; }
printf 'Space Works Events release: %s\nInstall directory: %s\n' "$revision" "$install_dir"
read -r -p 'Download this release and continue to configuration? [y/N]: ' proceed
[[ "$proceed" = y || "$proceed" = Y ]] || exit 0
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
curl --fail --show-error --silent --location --proto '=https' "https://api.github.com/repos/SpaceWorks-HQ/SpaceWorks-Events/tarball/$revision" -o "$scratch/source.tar.gz"
mkdir "$scratch/source"
tar -xzf "$scratch/source.tar.gz" -C "$scratch/source" --strip-components=1
printf '%s\n' "$revision" > "$scratch/source/.release"
release_dir="$install_dir/releases/$revision"
[[ ! -e "$release_dir" ]] || { echo 'This source release already exists; use its setup or upgrade script directly.' >&2; exit 1; }
mkdir -p "$install_dir/releases"
mv "$scratch/source" "$release_dir"
if [[ "$update" = 1 ]]; then
  bash "$release_dir/scripts/update-vps.sh"
else
  SWE_INSTALL_DOCKER=1 bash "$release_dir/scripts/setup-vps.sh"
fi
ln -s "$release_dir" "$install_dir/current.new"
mv -Tf "$install_dir/current.new" "$install_dir/current"
printf '\nActive installation: %s/current\n' "$install_dir"
