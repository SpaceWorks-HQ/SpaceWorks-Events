#!/usr/bin/env bash
# Automatic deploys, as SpaceWorks does them (explicit opt-in): installs GitHub's
# official Actions runner as a systemd service with the label
# spaceworks-events-prod. When a release is published, the Release workflow's
# deploy job runs scripts/vps-deploy.sh here; nothing connects in from GitHub.
#   install-runner.sh           install or re-register the runner
#   install-runner.sh --remove  unregister it and remove the service
# Runs as root: the installation is root-owned and the runner controls Docker.
set -euo pipefail
# Tokens must stay out of shell traces, argv, answer files and the runner's .env.
set +x
source_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
# shellcheck source=scripts/vps-lib.sh
. "$source_dir/scripts/vps-lib.sh"
mode=install
case "${1:-}" in
  '') ;;
  --remove) mode=remove ;;
  *) die 'Usage: install-runner.sh [--remove]' ;;
esac
[[ $# -le 1 ]] || die 'Usage: install-runner.sh [--remove]'
require_root
require_tty
if [[ "$(uname -s)" != Linux ]] || ! command -v systemctl >/dev/null || [[ ! -d /run/systemd/system ]]; then
  die 'Automatic deploys need Linux with systemd running.'
fi
RUNNER_DIR=${SWE_RUNNER_DIR:-/opt/spaceworks-events-runner}
is_safe_path "$RUNNER_DIR" && [[ "$RUNNER_DIR" != "$SWE_DIR" && ! -L "$RUNNER_DIR" ]] || die 'Use a dedicated absolute runner directory.'
repository=${SWE_REPOSITORY:-$(conf_get "$(install_conf)" SWE_REPOSITORY)}
repository=${repository:-$SWE_DEFAULT_REPOSITORY}
is_repository "$repository" || die 'SWE_REPOSITORY must be a GitHub owner/name.'
if [[ $mode = remove && ! -f "$RUNNER_DIR/.runner" ]]; then
  say 'No configured runner to remove.'
  exit 0
fi

runner_token=''
read_token() {
  local purpose=$1
  printf '\nIn https://github.com/%s: Settings -> Actions -> Runners.\n' "$repository" >/dev/tty
  if [[ $purpose = registration ]]; then
    printf 'Choose New self-hosted runner and copy the short-lived token from its config.sh command.\n' >/dev/tty
  else
    printf 'Select this runner -> Remove and copy the short-lived removal token.\n' >/dev/tty
  fi
  printf '%s token (hidden): ' "$purpose" >/dev/tty
  IFS= read -r -s runner_token </dev/tty || die 'A terminal and token are required.'
  runner_token=${runner_token%$'\r'}
  printf '\n' >/dev/tty
  [[ "$runner_token" =~ ^[A-Za-z0-9_-]+$ ]] || die 'A non-empty GitHub runner token is required.'
}
configure_runner() (
  # The runner's supported secret-input variable: masked and consumed by config.sh.
  export ACTIONS_RUNNER_INPUT_TOKEN="$runner_token" RUNNER_ALLOW_RUNASROOT=1
  cd "$RUNNER_DIR"
  bash ./config.sh "$@"
)
unregister() {
  read_token removal
  cd "$RUNNER_DIR"
  if [[ -f .service ]]; then bash ./svc.sh stop; bash ./svc.sh uninstall; fi
  configure_runner remove
  runner_token=''
}

if [[ $mode = remove ]]; then
  unregister
  say 'Runner registration and service removed; its files were kept. Delete the SWE_DEPLOY variable on GitHub too.'
  exit 0
fi

command -v python3 >/dev/null || install_packages python3
for binary in curl tar sha256sum python3; do
  command -v "$binary" >/dev/null || die "Missing $binary. Install it, then rerun."
done
case $(uname -m) in
  x86_64|amd64) architecture=x64 ;;
  aarch64|arm64) architecture=arm64 ;;
  *) die 'The runner supports only Linux x64 and arm64.' ;;
esac
temporary=$(mktemp -d)
trap 'runner_token=""; rm -rf -- "$temporary"' EXIT
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 15 --max-time 600 \
  https://api.github.com/repos/actions/runner/releases/latest -o "$temporary/release.json"
selection=$(python3 "$source_dir/scripts/runner-release.py" "$architecture" < "$temporary/release.json") \
  || die 'Could not verify the official runner release metadata.'
url=${selection%%$'\n'*}
checksum=${selection##*$'\n'}
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 15 --max-time 600 \
  "$url" -o "$temporary/runner.tar.gz"
printf '%s  %s\n' "$checksum" "$temporary/runner.tar.gz" | sha256sum --check --status \
  || die 'Runner SHA-256 mismatch; nothing was unpacked or registered.'
install -d -m 0700 "$RUNNER_DIR"
if [[ -f "$RUNNER_DIR/.runner" ]]; then
  say 'Re-registering replaces the existing registration, which needs its removal token first.'
  unregister
fi
read_token registration
tar -xzf "$temporary/runner.tar.gz" --no-same-owner -C "$RUNNER_DIR"
[[ -f "$RUNNER_DIR/config.sh" ]] || die 'The official runner archive is incomplete.'
[[ ! -f "$RUNNER_DIR/bin/installdependencies.sh" ]] || bash "$RUNNER_DIR/bin/installdependencies.sh" >/dev/null
configure_runner --url "https://github.com/$repository" --name "$(hostname)-spaceworks-events" \
  --labels spaceworks-events-prod --unattended --replace
runner_token=''
[[ -f "$RUNNER_DIR/svc.sh" ]] || die 'Runner configuration did not create its service helper.'
# config.sh writes .env; keep the runner's own settings and add where the install lives.
{ grep -vE '^(SWE_DIR|RUNNER_ALLOW_RUNASROOT)=' "$RUNNER_DIR/.env" 2>/dev/null || true
  printf 'SWE_DIR=%s\nRUNNER_ALLOW_RUNASROOT=1\n' "$SWE_DIR"; } > "$RUNNER_DIR/.env.new"
chmod 600 "$RUNNER_DIR/.env.new"
mv -f "$RUNNER_DIR/.env.new" "$RUNNER_DIR/.env"
cd "$RUNNER_DIR"
[[ -f .service ]] || bash ./svc.sh install root
bash ./svc.sh start
cat <<EOF

Runner installed as a systemd service. Finish in GitHub repository $repository:
1. Settings -> Secrets and variables -> Actions -> Variables -> New repository variable:
   SWE_DEPLOY = true
2. Settings -> Actions -> General -> Fork pull request workflows:
   Require approval for all external contributors.
3. Settings -> Actions -> Runners: this runner is Idle with the label spaceworks-events-prod.
4. In an organization, restrict its runner group to this repository and, where the plan
   allows, to release.yml on refs/heads/main.
From then on, every published release (a VERSION bump reaching main) deploys here: a
backup, the update, health checks, and the previous release restored if it fails.
SECURITY: this public repository's runner controls Docker, which is root on this server.
GitHub recommends self-hosted runners for private repositories; apply the restrictions
above and never target its label from pull_request workflows. The deploy job checks out
no code and uses no third-party actions. Runner updates stay automatic.
Remove it with: sudo bash $SWE_DIR/current/scripts/install-runner.sh --remove
EOF
