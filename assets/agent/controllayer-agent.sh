#!/usr/bin/env bash
# ControlLayer agent for Linux and macOS.
#
# Reads this machine's security settings (disk encryption, firewall, updates,
# malware protection, screen lock, SSH, logging, password rules, local
# accounts) and sends them to your ControlLayer server. It only reads; it
# changes nothing except, with --schedule, adding a daily job that runs it.
#
#   curl -fsSL https://controllayer.example.com/api/devices/agent/controllayer-agent.sh \
#     | sudo bash -s -- --url https://controllayer.example.com --key cld_... --schedule
#
# Options:
#   --url URL        ControlLayer address (required)
#   --key KEY        device key from ControlLayer > Devices (required)
#   --role ROLE      server or workstation (default: server on Linux, workstation on macOS)
#   --owner EMAIL    who uses this machine (laptops)
#   --schedule       also run every day (cron on Linux, launchd on macOS)
#   --unschedule     remove the daily job
#   --print          print the report instead of sending it
#
# Run as root (sudo) so it can read every setting. Without root, settings it
# can't read are reported as unknown, never as passing.

set -u
AGENT_VERSION="1.0.0"
URL="" KEY="" ROLE="" OWNER="" SCHEDULE=0 UNSCHEDULE=0 PRINT=0
CONFIG_DIR="/etc/controllayer"
[ "$(uname -s)" = "Darwin" ] && CONFIG_DIR="/Library/Application Support/ControlLayer"
CONFIG="$CONFIG_DIR/agent.conf"
INSTALLED="$CONFIG_DIR/controllayer-agent.sh"

while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --key) KEY="${2:-}"; shift 2 ;;
    --role) ROLE="${2:-}"; shift 2 ;;
    --owner) OWNER="${2:-}"; shift 2 ;;
    --schedule) SCHEDULE=1; shift ;;
    --unschedule) UNSCHEDULE=1; shift ;;
    --print) PRINT=1; shift ;;
    -h|--help) sed -n '2,25p' "$0" 2>/dev/null || echo "See the comments at the top of this script."; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

# Settings saved by --schedule, used when options are not given.
if [ -f "$CONFIG" ]; then
  # shellcheck disable=SC1090
  . "$CONFIG"
  URL="${URL:-${CL_URL:-}}"; KEY="${KEY:-${CL_KEY:-}}"; ROLE="${ROLE:-${CL_ROLE:-}}"; OWNER="${OWNER:-${CL_OWNER:-}}"
fi
URL="${URL%/}"

have() { command -v "$1" >/dev/null 2>&1; }
is_root() { [ "$(id -u)" = "0" ]; }

# --- JSON helpers -------------------------------------------------------------
jstr() {
  local s="${1-}"
  s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; s="${s//$'\n'/ }"; s="${s//$'\r'/ }"; s="${s//$'\t'/ }"
  printf '"%s"' "$s"
}
jbool() { case "${1-}" in true) printf true ;; false) printf false ;; *) printf null ;; esac; }
jnum() { case "${1-}" in ''|*[!0-9]*) printf null ;; *) printf '%s' "$((10#$1))" ;; esac; }
now_epoch() { date +%s; }
days_since_epoch() { [ -n "${1-}" ] && echo $(( ($(now_epoch) - $1) / 86400 )); }
iso_from_epoch() {
  if date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ >/dev/null 2>&1; then date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ
  else date -u -r "$1" +%Y-%m-%dT%H:%M:%SZ; fi
}

OS_KIND="linux"; [ "$(uname -s)" = "Darwin" ] && OS_KIND="macos"
if [ "$OS_KIND" = "linux" ] && ! is_root; then echo "Note: not running as root; some settings will be reported as unknown." >&2; fi

# --- Schedule management ---------------------------------------------------------
unschedule() {
  if [ "$OS_KIND" = "macos" ]; then
    launchctl bootout system/com.controllayer.agent 2>/dev/null || launchctl unload /Library/LaunchDaemons/com.controllayer.agent.plist 2>/dev/null
    rm -f /Library/LaunchDaemons/com.controllayer.agent.plist
  else
    rm -f /etc/cron.d/controllayer-agent
  fi
  echo "Daily ControlLayer job removed."
}

schedule() {
  is_root || { echo "--schedule needs root (sudo)." >&2; exit 1; }
  mkdir -p "$CONFIG_DIR" && chmod 700 "$CONFIG_DIR"
  umask 077
  { printf 'CL_URL=%q\nCL_KEY=%q\nCL_ROLE=%q\nCL_OWNER=%q\n' "$URL" "$KEY" "$ROLE" "$OWNER"; } > "$CONFIG"
  if [ -f "$0" ] && [ "$0" != "$INSTALLED" ]; then cp "$0" "$INSTALLED"
  else curl -fsSL "$URL/api/devices/agent/controllayer-agent.sh" -o "$INSTALLED" || { echo "Could not download the agent." >&2; exit 1; }; fi
  chmod 700 "$INSTALLED"
  local minute=$(( RANDOM % 60 )) hour=$(( RANDOM % 24 ))
  if [ "$OS_KIND" = "macos" ]; then
    cat > /Library/LaunchDaemons/com.controllayer.agent.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.controllayer.agent</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$INSTALLED</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>$hour</integer><key>Minute</key><integer>$minute</integer></dict>
  <key>RunAtLoad</key><false/>
</dict></plist>
PLIST
    chmod 644 /Library/LaunchDaemons/com.controllayer.agent.plist
    launchctl bootout system/com.controllayer.agent 2>/dev/null || true
    launchctl bootstrap system /Library/LaunchDaemons/com.controllayer.agent.plist 2>/dev/null || launchctl load /Library/LaunchDaemons/com.controllayer.agent.plist
  else
    echo "$minute $hour * * * root /bin/bash $INSTALLED >/dev/null 2>&1" > /etc/cron.d/controllayer-agent
    chmod 644 /etc/cron.d/controllayer-agent
  fi
  echo "Scheduled: this machine will report to ControlLayer every day at $(printf '%02d:%02d' "$hour" "$minute")."
}

if [ "$UNSCHEDULE" = 1 ]; then unschedule; exit 0; fi
if [ "$PRINT" = 0 ] && { [ -z "$URL" ] || [ -z "$KEY" ]; }; then
  echo "Usage: $0 --url https://your-controllayer --key cld_... [--schedule]" >&2; exit 2
fi

# --- Linux ------------------------------------------------------------------------
linux_collect() {
  MACHINE_ID="$(cat /etc/machine-id 2>/dev/null || cat /var/lib/dbus/machine-id 2>/dev/null || true)"
  [ -z "$MACHINE_ID" ] && MACHINE_ID="host-$(hostname)-$(cat /sys/class/dmi/id/product_uuid 2>/dev/null || true)"
  HOSTNAME_V="$(hostname -f 2>/dev/null || hostname)"
  OS_VERSION="Linux"
  if [ -r /etc/os-release ]; then OS_VERSION="$(. /etc/os-release && echo "${PRETTY_NAME:-$NAME}")"; fi
  DEFAULT_ROLE="server"

  # Disk encryption: is the root filesystem on a dm-crypt (LUKS) device?
  DISK=""
  if have findmnt && have lsblk; then
    local src; src="$(findmnt -n -o SOURCE / 2>/dev/null)"
    if [ -n "$src" ] && [ -b "$src" ]; then
      if lsblk -s -n -o TYPE "$src" 2>/dev/null | grep -qw crypt; then DISK=true; else DISK=false; fi
    fi
  fi

  # Firewall: ufw, firewalld, or nftables / iptables rules that filter input.
  FW=""
  if have ufw && ufw status 2>/dev/null | grep -q "Status: active"; then FW=true
  elif have systemctl && systemctl is-active --quiet firewalld 2>/dev/null; then FW=true
  elif have nft && nft list ruleset 2>/dev/null | grep -Eq 'hook input.*policy drop|hook input.*policy reject|^\s+(ip|ip6|tcp|udp|ct) .*(drop|reject)'; then FW=true
  elif have iptables && iptables -S INPUT 2>/dev/null | grep -Eq '^-P INPUT (DROP|REJECT)|-j (DROP|REJECT)'; then FW=true
  elif is_root && { have ufw || have nft || have iptables || have firewall-cmd; }; then FW=false
  fi

  # Automatic security updates.
  AUTO=""
  if have apt-config; then
    if apt-config dump 2>/dev/null | grep -q 'APT::Periodic::Unattended-Upgrade "1"'; then AUTO=true; else AUTO=false; fi
  elif have systemctl && { have dnf || have yum; }; then
    if systemctl is-enabled --quiet dnf-automatic.timer 2>/dev/null || systemctl is-enabled --quiet dnf-automatic-install.timer 2>/dev/null \
       || systemctl is-enabled --quiet dnf5-automatic.timer 2>/dev/null || systemctl is-enabled --quiet yum-cron 2>/dev/null; then AUTO=true; else AUTO=false; fi
  elif have zypper && have systemctl; then
    if systemctl is-enabled --quiet zypper-automatic.timer 2>/dev/null || systemctl is-enabled --quiet transactional-update.timer 2>/dev/null; then AUTO=true; else AUTO=false; fi
  fi

  # Days since packages were last upgraded.
  DAYS_UPDATE=""
  local last=""
  if ls /var/log/dpkg.log* >/dev/null 2>&1; then
    last="$( (cat /var/log/dpkg.log /var/log/dpkg.log.1 2>/dev/null; zcat /var/log/dpkg.log.*.gz 2>/dev/null) | grep -E ' (upgrade|install) ' | cut -c1-19 | sort | tail -1)"
    [ -n "$last" ] && last="$(date -d "$last" +%s 2>/dev/null || true)"
  elif have rpm; then
    last="$(rpm -qa --qf '%{INSTALLTIME}\n' 2>/dev/null | sort -n | tail -1)"
  fi
  [ -n "$last" ] && DAYS_UPDATE="$(days_since_epoch "$last")"

  # SSH server settings (effective configuration; needs root).
  SSH_ROOT="" SSH_PASS=""
  if have sshd && is_root && { [ -f /etc/ssh/sshd_config ]; }; then
    local t; t="$(sshd -T 2>/dev/null)"
    if [ -n "$t" ]; then
      if echo "$t" | grep -qi '^permitrootlogin no$'; then SSH_ROOT=false; else SSH_ROOT=true; fi
      if echo "$t" | grep -qi '^passwordauthentication yes$'; then SSH_PASS=true; else SSH_PASS=false; fi
    fi
  fi

  # Security logging: auditd, or a persistent systemd journal.
  AUDIT=""
  if have systemctl && systemctl is-active --quiet auditd 2>/dev/null; then AUDIT=true
  elif [ -d /var/log/journal ] && [ -n "$(ls -A /var/log/journal 2>/dev/null)" ]; then AUDIT=true
  elif have systemctl; then AUDIT=false
  fi

  # Password rules.
  PW_MIN="" LOCKOUT=""
  [ -r /etc/security/pwquality.conf ] && PW_MIN="$(grep -E '^\s*minlen\s*=' /etc/security/pwquality.conf | tail -1 | tr -dc '0-9')"
  if [ -r /etc/security/faillock.conf ] && grep -rqs pam_faillock /etc/pam.d/; then
    LOCKOUT="$(grep -E '^\s*deny\s*=' /etc/security/faillock.conf | tail -1 | tr -dc '0-9')"
    [ -z "$LOCKOUT" ] && LOCKOUT=3
  elif [ -d /etc/pam.d ] && is_root; then
    grep -rqsE 'pam_faillock|pam_tally2' /etc/pam.d/ || LOCKOUT=0
  fi

  TIMESYNC=""
  if have timedatectl; then
    case "$(timedatectl show -p NTPSynchronized --value 2>/dev/null)" in yes) TIMESYNC=true ;; no) TIMESYNC=false ;; esac
  fi

  # Local accounts that can log in (regular users and root).
  ACCOUNTS=""
  local admins; admins=" $(getent group sudo wheel admin 2>/dev/null | cut -d: -f4 | tr ',' ' ' | tr '\n' ' ') "
  local lastlog_ok=0; have lastlog && lastlog -u root >/dev/null 2>&1 && lastlog_ok=1
  while IFS=: read -r name _ uid _ _ _ shell; do
    case "$shell" in */nologin|*/false|*/sync|*/shutdown|*/halt|'') continue ;; esac
    if [ "$uid" -ne 0 ] && { [ "$uid" -lt 1000 ] || [ "$uid" -ge 60000 ]; }; then continue; fi
    local admin=false; { [ "$uid" -eq 0 ] || [[ "$admins" == *" $name "* ]]; } && admin=true
    # Nobody can sign in to an account with a locked password and no SSH keys.
    local enabled=true home pw
    home="$(getent passwd "$name" | cut -d: -f6)"
    pw="$(getent shadow "$name" 2>/dev/null | cut -d: -f2)"
    case "$pw" in '!'*|'*'*) [ -s "$home/.ssh/authorized_keys" ] || enabled=false ;; esac
    local entry; entry="{\"name\":$(jstr "$name"),\"admin\":$admin,\"enabled\":$enabled"
    if [ "$lastlog_ok" = 1 ]; then
      local line; line="$(lastlog -u "$name" 2>/dev/null | tail -1)"
      if echo "$line" | grep -q 'Never logged in'; then entry="$entry,\"lastLogin\":null"
      else
        local when; when="$(echo "$line" | grep -oE '[A-Z][a-z]{2} [A-Z][a-z]{2} +[0-9]+ [0-9:]+ [+-][0-9]{4} [0-9]{4}')"
        [ -n "$when" ] && when="$(date -d "$when" +%s 2>/dev/null)" && entry="$entry,\"lastLogin\":$(jstr "$(iso_from_epoch "$when")")"
      fi
    fi
    ACCOUNTS="$ACCOUNTS${ACCOUNTS:+,}$entry}"
  done < <(getent passwd 2>/dev/null)
  ACCOUNTS_JSON="[$ACCOUNTS]"
  MALWARE="" SCREENLOCK_JSON="null" RDP="" RDP_NLA=""
  SCREENLOCK_KNOWN=0
}

# --- macOS ------------------------------------------------------------------------
macos_collect() {
  MACHINE_ID="$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | awk -F'"' '/IOPlatformUUID/{print $4}')"
  HOSTNAME_V="$(scutil --get LocalHostName 2>/dev/null || hostname)"
  OS_VERSION="macOS $(sw_vers -productVersion 2>/dev/null)"
  DEFAULT_ROLE="workstation"

  DISK=""; if fdesetup status 2>/dev/null | grep -q "FileVault is On"; then DISK=true; elif have fdesetup; then DISK=false; fi
  FW=""; local fws; fws="$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null)"
  case "$fws" in *enabled*) FW=true ;; *disabled*) FW=false ;; esac

  AUTO=""
  local v; v="$(defaults read /Library/Preferences/com.apple.SoftwareUpdate AutomaticallyInstallMacOSUpdates 2>/dev/null)"
  [ -z "$v" ] && v="$(defaults read /Library/Preferences/com.apple.SoftwareUpdate CriticalUpdateInstall 2>/dev/null)"
  case "$v" in 1) AUTO=true ;; 0) AUTO=false ;; esac
  DAYS_UPDATE="$(days_since_epoch "$(stat -f %m /System/Library/CoreServices/SystemVersion.plist 2>/dev/null)")"

  MALWARE=""; case "$(spctl --status 2>/dev/null)" in *enabled*) MALWARE=true ;; *disabled*) MALWARE=false ;; esac

  # Screen lock: the shorter of display sleep and the screen saver for the signed-in user.
  local lock="" ds ss user
  ds="$(pmset -g 2>/dev/null | awk '/ displaysleep /{print $2}')"
  user="$(stat -f %Su /dev/console 2>/dev/null)"
  ss=""; if [ -n "$user" ] && [ "$user" != "root" ]; then ss="$(sudo -u "$user" defaults -currentHost read com.apple.screensaver idleTime 2>/dev/null)"; fi
  [ -n "$ss" ] && [ "$ss" -gt 0 ] 2>/dev/null && lock=$(( (ss + 59) / 60 ))
  if [ -n "$ds" ] && [ "$ds" -gt 0 ] 2>/dev/null && { [ -z "$lock" ] || [ "$ds" -lt "$lock" ]; }; then lock="$ds"; fi
  SCREENLOCK_KNOWN=0
  if [ -n "$lock" ]; then SCREENLOCK_JSON="$lock"; SCREENLOCK_KNOWN=1
  elif [ -n "$ds" ]; then SCREENLOCK_JSON="null"; SCREENLOCK_KNOWN=1; fi

  SSH_ROOT="" SSH_PASS=""
  if systemsetup -getremotelogin 2>/dev/null | grep -q ": On"; then
    local t; t="$(sshd -T 2>/dev/null)"
    if [ -n "$t" ]; then
      if echo "$t" | grep -qi '^permitrootlogin no$'; then SSH_ROOT=false; else SSH_ROOT=true; fi
      if echo "$t" | grep -qi '^passwordauthentication yes$'; then SSH_PASS=true; else SSH_PASS=false; fi
    fi
  fi
  AUDIT="" PW_MIN="" LOCKOUT="" RDP="" RDP_NLA="" ACCOUNTS_JSON="null"
  TIMESYNC=""; case "$(systemsetup -getusingnetworktime 2>/dev/null)" in *On*) TIMESYNC=true ;; *Off*) TIMESYNC=false ;; esac
}

if [ "$OS_KIND" = "macos" ]; then macos_collect; else linux_collect; fi
ROLE="${ROLE:-$DEFAULT_ROLE}"
SCREEN_FIELD=""; [ "$SCREENLOCK_KNOWN" = 1 ] && SCREEN_FIELD=",\"screenLockMinutes\":$SCREENLOCK_JSON"

REPORT="{\"machineId\":$(jstr "$MACHINE_ID"),\"hostname\":$(jstr "$HOSTNAME_V"),\"os\":$(jstr "$OS_KIND"),\"osVersion\":$(jstr "$OS_VERSION"),\
\"role\":$(jstr "$ROLE"),\"owner\":$(jstr "$OWNER"),\"agentVersion\":$(jstr "$AGENT_VERSION"),\
\"diskEncrypted\":$(jbool "$DISK"),\"firewallEnabled\":$(jbool "$FW"),\"autoUpdates\":$(jbool "$AUTO"),\"daysSinceUpdate\":$(jnum "$DAYS_UPDATE"),\
\"malwareProtection\":$(jbool "$MALWARE")$SCREEN_FIELD,\"sshRootLogin\":$(jbool "$SSH_ROOT"),\"sshPasswordAuth\":$(jbool "$SSH_PASS"),\
\"rdpEnabled\":$(jbool "$RDP"),\"rdpNla\":$(jbool "$RDP_NLA"),\"auditLogging\":$(jbool "$AUDIT"),\"passwordMinLength\":$(jnum "$PW_MIN"),\
\"lockoutThreshold\":$(jnum "$LOCKOUT"),\"timeSync\":$(jbool "$TIMESYNC"),\"localAccounts\":$ACCOUNTS_JSON}"

if [ "$PRINT" = 1 ]; then echo "$REPORT"; exit 0; fi

RESPONSE="$(curl -sS --max-time 60 -X POST "$URL/api/devices/report" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" --data-binary "$REPORT" -w '\n%{http_code}')" || {
  echo "Could not reach ControlLayer at $URL." >&2; exit 1; }
CODE="$(echo "$RESPONSE" | tail -1)"
if [ "$CODE" != "200" ]; then echo "ControlLayer rejected the report ($CODE): $(echo "$RESPONSE" | sed '$d')" >&2; exit 1; fi
echo "Report sent: $HOSTNAME_V ($OS_VERSION, $ROLE)."

if [ "$SCHEDULE" = 1 ]; then schedule; fi
