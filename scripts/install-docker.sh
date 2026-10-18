#!/usr/bin/env bash
# Invoked by the confirmed installer only. Official Docker apt repository.
set -euo pipefail
[[ $(id -u) = 0 ]] || { echo 'Installing Docker requires root. Run the bootstrap with sudo bash.' >&2; exit 1; }
[[ $(uname -s) = Linux && -f /etc/os-release ]] || { echo 'Automatic Docker installation supports Ubuntu/Debian only.' >&2; exit 1; }
. /etc/os-release
case "$ID" in ubuntu|debian) ;; *) echo 'Install Docker Engine and Compose using your distribution instructions, then rerun setup.' >&2; exit 1 ;; esac
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl --fail --show-error --silent --location "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
architecture=$(dpkg --print-architecture)
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' "$architecture" "$ID" "${UBUNTU_CODENAME:-$VERSION_CODENAME}" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker compose version
