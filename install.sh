#!/usr/bin/env bash
# Space Works Events VPS installer:
#   curl -fsSL https://raw.githubusercontent.com/SpaceWorks-HQ/SpaceWorks-Events/main/install.sh | bash
# Pins the latest main commit (or --ref), downloads that source release into
# temporary storage and runs its guided setup, which asks every question first
# and changes nothing until you confirm. Run it again to update, back up or
# check the installation. It is fetched alone, so it is self-contained.
set -euo pipefail
set +x

show_guide() {
  cat <<'EOF'

Space Works Events installer - the whole event platform on one Linux server.

What you need
  - A 64-bit (x86_64 or arm64) Linux server: Ubuntu/Debian, Fedora/RHEL/Alma/Rocky,
    Arch or openSUSE. 2 vCPU, 4 GB memory (swap is offered on smaller plans) and
    at least 10 GB free disk.
  - root, or a user with sudo. Docker and Docker Compose are installed if missing.
  - A hostname whose DNS A record points at this server, with ports 80 and 443 open.
  - An SMTP relay on a verified sending domain (Brevo, Amazon SES, Postmark...).
  - Your super-admin email address.

What it does
  1. Checks this server and downloads the pinned release into temporary storage.
  2. Asks every question, shows a summary and waits for your confirmation.
  3. Installs to /opt/spaceworks-events (SWE_DIR) with secrets in
     /etc/spaceworks-events, then builds and starts the app, PostgreSQL, Redis,
     Silo object storage, Caddy HTTPS, migrations and the email scheduler.
  Run the same command later to update, back up or check the installation.

Options
  --ref REF     install or update to a branch, tag or commit (default: main)
  --repo O/N    install from a fork (default: SpaceWorks-HQ/SpaceWorks-Events)
  --dir PATH    installation directory (default: /opt/spaceworks-events)
  --update      update an existing installation without the menu
  --help        show this guide and exit
EOF
}

say() { printf '[Space Works Events] %s\n' "$*"; }
die() { printf '[Space Works Events] ERROR: %s\n' "$*" >&2; exit 1; }
usage() { die 'Usage: install.sh [--ref REF] [--repo OWNER/NAME] [--dir PATH] [--update] [--help]'; }

repository=${SWE_REPOSITORY:-}
ref=${SWE_REF:-main}
install_dir=${SWE_DIR:-/opt/spaceworks-events}
action=''
while (($# > 0)); do
  case "$1" in
    -h|--help) show_guide; exit 0 ;;
    --ref) (($# > 1)) || usage; ref=$2; shift ;;
    --ref=*) ref=${1#--ref=} ;;
    --repo) (($# > 1)) || usage; repository=$2; shift ;;
    --repo=*) repository=${1#--repo=} ;;
    --dir) (($# > 1)) || usage; install_dir=$2; shift ;;
    --dir=*) install_dir=${1#--dir=} ;;
    --update) action=update ;;
    *) usage ;;
  esac
  shift
done
[[ "$ref" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,150}$ && "$ref" != *..* ]] || die 'Invalid release reference.'
install_dir=${install_dir%/}
[[ "$install_dir" = /* && -n "${install_dir#/}" && "$install_dir" != *[[:space:]:\'\"]* ]] \
  || die 'Use an absolute installation directory without spaces, quotes or colons.'
if [[ -n "${SWE_CONFIG_DIR:-}" ]]; then
  [[ "$SWE_CONFIG_DIR" = /* && "$SWE_CONFIG_DIR" != / && "$SWE_CONFIG_DIR" != *[[:space:]:\'\"]* ]] \
    || die 'SWE_CONFIG_DIR must be an absolute path without spaces, quotes or colons.'
fi

show_guide
[[ $(uname -s) = Linux ]] || die 'Run this on the Linux server that will host Space Works Events.'
case $(uname -m) in
  x86_64|amd64|aarch64|arm64) ;;
  *) die "Unsupported architecture $(uname -m); use an x86_64 or arm64 server." ;;
esac
for dependency in curl tar; do
  command -v "$dependency" >/dev/null || die "Install $dependency first, then rerun."
done
{ : </dev/tty; } 2>/dev/null || die 'An interactive terminal is required (for SSH, use ssh -t).'
SUDO=()
if [[ $(id -u) != 0 ]]; then
  command -v sudo >/dev/null || die 'Run this as root, or install sudo.'
  SUDO=(sudo)
  say 'Installation steps run as root; sudo may ask for your password.'
fi
as_root() { ${SUDO[@]+"${SUDO[@]}"} "$@"; }
prompt() {
  local reply
  printf '%s' "$1" >/dev/tty
  IFS= read -r reply </dev/tty || reply=''
  printf '%s' "${reply%$'\r'}"
}
conf_get() {
  as_root sed -n "s/^$1=//p" "$install_dir/install.conf" 2>/dev/null | tail -n 1 | tr -d "'\r" || true
}

installed=''
if as_root test -L "$install_dir/current"; then
  installed=$(basename "$(as_root readlink -f "$install_dir/current")")
fi
pending=''
if as_root test -f "$install_dir/install.conf"; then pending=$(conf_get SWE_PENDING_RELEASE); fi
repository=${repository:-$(conf_get SWE_REPOSITORY)}
repository=${repository:-SpaceWorks-HQ/SpaceWorks-Events}
[[ "$repository" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?/[A-Za-z0-9_.-]{1,100}$ && "$repository" != */. && "$repository" != */.. ]] \
  || die 'The repository must be a GitHub owner/name.'
run_env=(env "SWE_DIR=$install_dir" "SWE_REPOSITORY=$repository")
[[ -z "${SWE_CONFIG_DIR:-}" ]] || run_env+=("SWE_CONFIG_DIR=$SWE_CONFIG_DIR")

if [[ -n "$installed" ]]; then
  if [[ -z "$action" ]]; then
    choice=$(prompt "
Space Works Events is installed in $install_dir (commit ${installed:0:12}).
What do you want to do?
  1) Update to the latest release - backs up the database first, keeps your settings and data
  2) Back up now - database, configuration and uploads
  3) Check status and health
  4) Cancel - change nothing
Choose 1-4 [4]: ")
    case "${choice:-4}" in
      1) action=update ;;
      2) as_root "${run_env[@]}" bash "$install_dir/current/scripts/vps-backup.sh"; exit 0 ;;
      3) as_root "${run_env[@]}" bash "$install_dir/current/scripts/vps-status.sh"; exit 0 ;;
      4) say 'Cancelled. Nothing was changed.'; exit 0 ;;
      *) die 'Invalid choice. Nothing was changed.' ;;
    esac
  fi
elif [[ -n "$pending" ]]; then
  if ! [[ "$pending" =~ ^[a-f0-9]{40}$ ]] || ! as_root test -f "$install_dir/releases/$pending/scripts/setup-vps.sh"; then
    die "$install_dir/install.conf names an unfinished release that is missing. Repair it by hand."
  fi
  choice=$(prompt "
A previous setup of commit ${pending:0:12} in $install_dir did not finish.
  1) Resume - continue it, keeping any secrets it already generated
  2) Cancel - change nothing
Choose 1-2 [1]: ")
  case "${choice:-1}" in
    1) as_root "${run_env[@]}" bash "$install_dir/releases/$pending/scripts/setup-vps.sh" --resume; exit 0 ;;
    2) say 'Cancelled. Nothing was changed.'; exit 0 ;;
    *) die 'Invalid choice. Nothing was changed.' ;;
  esac
else
  [[ "$action" != update ]] || die "There is no installation in $install_dir to update."
  if as_root test -e "$install_dir" && [[ -n "$(as_root find "$install_dir" -mindepth 1 -maxdepth 1 ! -name .lock -print -quit)" ]]; then
    die "$install_dir has files but no installation record. Choose another --dir or empty it first."
  fi
  action=install
fi

say "Resolving $ref in $repository."
revision=$(curl --fail --silent --show-error --location --proto '=https' \
  --header 'Accept: application/vnd.github.sha' \
  "https://api.github.com/repos/$repository/commits/$ref") || die "Could not find $ref in $repository on GitHub."
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || die 'GitHub returned an unexpected commit id.'
if [[ "$action" = update && "$revision" = "$installed" ]]; then
  say "Already on the latest release (commit ${revision:0:12}). Nothing to update."
  exit 0
fi
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
say "Downloading commit ${revision:0:12} into temporary storage."
curl --fail --silent --show-error --location --proto '=https' \
  "https://codeload.github.com/$repository/tar.gz/$revision" -o "$stage/source.tar.gz"
mkdir "$stage/source"
tar -xzf "$stage/source.tar.gz" -C "$stage/source" --strip-components=1 --no-same-owner
rm -f "$stage/source.tar.gz"
printf '%s\n' "$revision" > "$stage/source/.release"
for file in scripts/vps-lib.sh scripts/setup-vps.sh scripts/update-vps.sh scripts/vps-compose.sh compose.production.yml; do
  [[ -f "$stage/source/$file" ]] || die "Commit ${revision:0:12} has no $file; it predates this installer."
done
run_env+=(SWE_STAGED=1)
status=0
if [[ "$action" = update ]]; then
  as_root "${run_env[@]}" bash "$stage/source/scripts/update-vps.sh" || status=$?
else
  as_root "${run_env[@]}" bash "$stage/source/scripts/setup-vps.sh" || status=$?
fi
# 2 is a cancellation at the confirmation prompt; it already said so.
[[ $status = 0 || $status = 2 ]] || die "Stopped with an error (exit $status). Fix the cause above, then run the installer again."
