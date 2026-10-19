# Shared helpers for the VPS setup, update, backup, restore and status scripts.
# Sourced, never executed. Prompts read the terminal directly because
# `curl | bash` feeds the installer itself on stdin.
# shellcheck shell=bash

SWE_DIR=${SWE_DIR:-/opt/spaceworks-events}
SWE_DEFAULT_CONFIG_DIR=/etc/spaceworks-events
# shellcheck disable=SC2034 # used by the scripts that source this file
SWE_DEFAULT_REPOSITORY=SpaceWorks-HQ/SpaceWorks-Events

say() { printf '[Space Works Events] %s\n' "$*"; }
warn() { printf '[Space Works Events] WARNING: %s\n' "$*" >&2; }
die() { printf '[Space Works Events] ERROR: %s\n' "$*" >&2; exit 1; }

require_root() { [[ $(id -u) = 0 ]] || die 'Run this as root (sudo bash ...).'; }
require_tty() { { : </dev/tty; } 2>/dev/null || die 'An interactive terminal is required.'; }

is_hostname() { [[ ${#1} -le 253 && "$1" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$ ]]; }
is_email() { [[ "$1" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] && is_env_value "$1"; }
# Stricter, for values that end up in the Caddyfile.
is_plain_email() { [[ "$1" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; }
is_port() { [[ "$1" =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 )); }
is_nonempty() { [[ -n "${1//[[:space:]]/}" ]]; }
# Answers are stored as single-quoted env-file values, which cannot hold ' or \.
is_env_value() { is_nonempty "$1" && [[ "$1" != *[\'\\]* ]]; }
is_mode() { [[ "$1" = 1 || "$1" = 2 ]]; }
is_safe_path() { [[ "$1" = /* && "$1" != / && "$1" != *[[:space:]:\'\"]* ]]; }
is_repository() { [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?/[A-Za-z0-9_.-]{1,100}$ && "$1" != */. && "$1" != */.. ]]; }

# ask VAR "Question" DEFAULT VALIDATOR "Hint shown when the answer is invalid"
# Asks again until the validator accepts the answer (Enter takes the default).
ask() {
  local var=$1 question=$2 default=${3-} check=${4:-is_nonempty} hint=${5:-'Please enter a valid value.'} reply
  while true; do
    if [[ -n "$default" ]]; then printf '%s [%s]: ' "$question" "$default" >/dev/tty
    else printf '%s: ' "$question" >/dev/tty; fi
    IFS= read -r reply </dev/tty || die 'No terminal input; run this in an interactive terminal.'
    reply=${reply%$'\r'}
    reply=${reply:-$default}
    if "$check" "$reply"; then printf -v "$var" '%s' "$reply"; return 0; fi
    printf '  %s\n' "$hint" >/dev/tty
  done
}

# ask_secret VAR "Question": hidden input, asked again until it can be stored.
ask_secret() {
  local var=$1 question=$2 reply
  while true; do
    printf '%s: ' "$question" >/dev/tty
    IFS= read -r -s reply </dev/tty || die 'No terminal input; run this in an interactive terminal.'
    printf '\n' >/dev/tty
    reply=${reply%$'\r'}
    if is_env_value "$reply"; then printf -v "$var" '%s' "$reply"; return 0; fi
    printf "  A value is required, without ' or \\\\ characters.\n" >/dev/tty
  done
}

# confirm "Question" Y|N: succeeds on yes. The default is taken on Enter.
confirm() {
  local question=$1 default=${2:-N} reply
  while true; do
    if [[ "$default" = Y ]]; then printf '%s [Y/n]: ' "$question" >/dev/tty
    else printf '%s [y/N]: ' "$question" >/dev/tty; fi
    IFS= read -r reply </dev/tty || die 'No terminal input; run this in an interactive terminal.'
    reply=${reply%$'\r'}
    case "${reply:-$default}" in
      [Yy]|[Yy][Ee][Ss]) return 0 ;;
      [Nn]|[Nn][Oo]) return 1 ;;
    esac
    printf '  Answer y or n.\n' >/dev/tty
  done
}

# Values written by these scripts only; parsed, never sourced.
conf_get() {
  local file=$1 name=$2 value
  [[ -f "$file" ]] || return 0
  value=$(sed -n "s/^$name=//p" "$file" | tail -n 1 | tr -d '\r')
  value=${value#\'}; value=${value%\'}
  printf '%s' "$value"
}

conf_set() {
  local file=$1 name=$2 value=$3
  touch "$file"
  { grep -v "^$name=" "$file" || true; printf "%s='%s'\n" "$name" "$value"; } > "$file.new"
  chmod 600 "$file.new"
  mv -f "$file.new" "$file"
}

conf_unset() {
  local file=$1 name=$2
  [[ -f "$file" ]] || return 0
  { grep -v "^$name=" "$file" || true; } > "$file.new"
  chmod 600 "$file.new"
  mv -f "$file.new" "$file"
}

install_conf() { printf '%s/install.conf' "$SWE_DIR"; }

# The configuration directory recorded by the installer, else the default.
load_config_dir() {
  local recorded
  recorded=$(conf_get "$(install_conf)" SWE_CONFIG_DIR)
  SWE_CONFIG_DIR=${SWE_CONFIG_DIR:-${recorded:-$SWE_DEFAULT_CONFIG_DIR}}
  is_safe_path "$SWE_CONFIG_DIR" || die 'SWE_CONFIG_DIR must be an absolute path without spaces, quotes or colons.'
  export SWE_CONFIG_DIR
}

release_revision() {
  local dir=$1 revision
  revision=$(cat "$dir/.release" 2>/dev/null || git -C "$dir" rev-parse HEAD 2>/dev/null || true)
  [[ "$revision" =~ ^[a-f0-9]{40}$ ]] || die "Cannot tell which commit $dir contains (no .release file or Git history)."
  printf '%s' "$revision"
}

release_version() { printf 'vps-%s' "${1:0:12}"; }

# A published release (install.sh writes its image version to .release-version)
# pulls images from GitHub Packages; any other source is built on this server.
is_published_version() { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+-[a-z0-9-]+\.[0-9]+\.[0-9a-f]{12}$ ]]; }
source_version() {
  local dir=$1 revision=$2 published
  published=$(cat "$dir/.release-version" 2>/dev/null || true)
  if [[ -z "$published" ]]; then release_version "$revision"; return 0; fi
  is_published_version "$published" && [[ "${published: -12}" = "${revision:0:12}" ]] \
    || die "$dir/.release-version does not match its commit."
  printf '%s' "$published"
}

# Point compose.env at the images for VERSION: GitHub Packages for a published
# release, local names (compose.production.yml defaults) for a source build.
set_image_settings() {
  local file=$1 version=$2 repository=$3 prefix='' name
  if is_published_version "$version"; then
    prefix="ghcr.io/$(printf '%s' "${repository%%/*}" | tr '[:upper:]' '[:lower:]')/spaceworks-events"
  fi
  conf_set "$file" SWE_BACKEND_IMAGE "${prefix:+$prefix-backend}"
  conf_set "$file" SWE_FRONTEND_IMAGE "${prefix:+$prefix-frontend}"
  # Settings of releases before 0.9.1, which had separate migrator and ops images.
  for name in SWE_APP_IMAGE SWE_MIGRATOR_IMAGE SWE_OPS_IMAGE; do conf_unset "$file" "$name"; done
}

# Pull a published release's images, or build them from this source. The
# backend image also runs migrations and the operator tools; the frontend
# image is needed only by the split layout.
fetch_images() {
  local version=$1 layout=${2:-single} services=(app)
  [[ "$layout" != split ]] || services+=(frontend)
  if is_published_version "$version"; then
    say 'Downloading the release images from GitHub Packages.'
    compose pull --quiet "${services[@]}"
  else
    say 'Building images from source. This takes several minutes on a small server.'
    compose build "${services[@]}"
  fi
}

# One installer, updater, backup or restore at a time per installation. Child
# scripts run by a lock holder inherit the lock.
take_lock() {
  [[ ${SWE_LOCK_HELD:-0} != 1 ]] || return 0
  mkdir -p "$SWE_DIR"
  exec 9>"$SWE_DIR/.lock"
  if command -v flock >/dev/null; then
    flock -n 9 || die 'Another Space Works Events install, update, backup or restore is running.'
  fi
  export SWE_LOCK_HELD=1
}

# Copy a staged source release into $SWE_DIR/releases/<commit> and print its path.
# A release that is already in place is reused, taking the staged image version.
promote_release() {
  local source=$1 revision=$2 target="$SWE_DIR/releases/$2"
  case "$source/" in "$SWE_DIR/releases/"*) printf '%s' "$source"; return 0 ;; esac
  # Called in a command substitution, where errexit does not apply: check each step.
  if [[ ! -d "$target" ]]; then
    if ! { mkdir -p "$SWE_DIR/releases" && rm -rf "$target.partial" && cp -R "$source" "$target.partial" \
      && chown -R 0:0 "$target.partial" && chmod -R go-w "$target.partial" && mv "$target.partial" "$target"; }; then
      rm -rf "$target.partial"
      return 1
    fi
  elif [[ -f "$source/.release-version" ]]; then
    cp "$source/.release-version" "$target/.release-version" || return 1
  else
    rm -f "$target/.release-version" || return 1
  fi
  printf '%s' "$target"
}

activate_release() {
  ln -sfn "$1" "$SWE_DIR/current.new"
  mv -Tf "$SWE_DIR/current.new" "$SWE_DIR/current"
}

# A TCP port with a listener on this host (IPv4 or IPv6).
port_in_use() {
  local hex file
  printf -v hex '%04X' "$1"
  for file in /proc/net/tcp /proc/net/tcp6; do
    [[ -r "$file" ]] || continue
    awk -v wanted="$hex" 'NR > 1 { split($2, address, ":"); if (toupper(address[2]) == wanted && $4 == "0A") found = 1 } END { exit !found }' "$file" && return 0
  done
  return 1
}

free_disk_mb() {
  local path=$1
  while [[ ! -e "$path" ]]; do path=$(dirname "$path"); done
  df -Pm "$path" | awk 'NR == 2 { print $4 }'
}

memory_mb() { awk '/^MemTotal:/ { print int($2 / 1024) }' /proc/meminfo; }
swap_mb() { awk '/^SwapTotal:/ { print int($2 / 1024) }' /proc/meminfo; }

# Building the Next.js image needs roughly 4 GB of memory; small VPS plans get swap.
# Some hosts (OpenVZ/LXC containers, some btrfs roots) refuse swap files: warn and go on.
create_swap() {
  local file=/swapfile size_mb=$1
  say "Creating a ${size_mb} MB swap file at $file."
  if [[ $(stat -f -c %T / 2>/dev/null) = btrfs ]] && command -v btrfs >/dev/null; then
    btrfs filesystem mkswapfile --size "${size_mb}m" "$file" >/dev/null 2>&1 || true
  else
    if { fallocate -l "${size_mb}M" "$file" 2>/dev/null || dd if=/dev/zero of="$file" bs=1M count="$size_mb" status=none; } \
      && chmod 600 "$file"; then
      mkswap "$file" >/dev/null 2>&1 || true
    fi
  fi
  if [[ -f "$file" ]] && swapon "$file" 2>/dev/null; then
    grep -q "^$file " /etc/fstab || printf '%s none swap sw 0 0\n' "$file" >> /etc/fstab
  else
    rm -f "$file"
    warn 'This server does not allow a swap file; the image build may run out of memory.'
  fi
}

# Install distribution packages with the family's package manager.
install_packages() {
  # shellcheck disable=SC1091
  ( . /etc/os-release
    case " ${ID:-} ${ID_LIKE:-} " in
      *" debian "*|*" ubuntu "*) export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq "$@" ;;
      *" fedora "*|*" rhel "*|*" centos "*|*" rocky "*|*" almalinux "*) dnf install -y "$@" 2>/dev/null || yum install -y "$@" ;;
      *" arch "*|*" manjaro "*) pacman -Syu --noconfirm --needed "$@" ;;
      *" suse "*|*" opensuse "*|*" sles "*) zypper --non-interactive install "$@" ;;
      *) exit 1 ;;
    esac ) || die "Could not install $*; install it with your package manager, then rerun."
}

# These scripts never attach a terminal to a container: the installer runs them
# with stdin from /dev/null, and Compose refuses a TTY without one.
compose() {
  case "${1:-}" in
    run|exec) local command=$1; shift; sh "$SWE_REPO_DIR/scripts/vps-compose.sh" "$command" -T "$@" ;;
    *) sh "$SWE_REPO_DIR/scripts/vps-compose.sh" "$@" ;;
  esac
}
