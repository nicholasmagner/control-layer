<#
  ControlLayer agent for Windows (Windows 10/11 and Windows Server 2016+).

  Reads this computer's security settings (BitLocker, firewall, updates,
  Microsoft Defender, screen lock, Remote Desktop, logon auditing, password
  rules, local accounts) and sends them to your ControlLayer server. It only
  reads; it changes nothing except, with -Schedule, adding a daily task.

  Run in PowerShell as Administrator:
    & ([scriptblock]::Create((irm 'https://controllayer.example.com/api/devices/agent/controllayer-agent.ps1'))) `
      -Url 'https://controllayer.example.com' -Key 'cld_...' -Schedule

  Options:
    -Url        ControlLayer address (required)
    -Key        device key from ControlLayer > Devices (required)
    -Role       server or workstation (default: from the Windows edition)
    -Owner      email of the person who uses this computer (laptops)
    -Schedule   also run every day (scheduled task as SYSTEM)
    -Unschedule remove the daily task
    -Print      print the report instead of sending it
#>
param(
  [string]$Url = '',
  [string]$Key = '',
  [ValidateSet('', 'server', 'workstation')][string]$Role = '',
  [string]$Owner = '',
  [switch]$Schedule,
  [switch]$Unschedule,
  [switch]$Print
)

$ErrorActionPreference = 'SilentlyContinue'
$AgentVersion = '1.0.0'
$ConfigDir = Join-Path $env:ProgramData 'ControlLayer'
$ConfigFile = Join-Path $ConfigDir 'agent.json'
$Installed = Join-Path $ConfigDir 'controllayer-agent.ps1'
$TaskName = 'ControlLayer agent'

# Settings saved by -Schedule, used when options are not given.
if (Test-Path $ConfigFile) {
  $saved = Get-Content $ConfigFile -Raw | ConvertFrom-Json
  if (-not $Url) { $Url = $saved.url }
  if (-not $Key) { $Key = $saved.key }
  if (-not $Role) { $Role = $saved.role }
  if (-not $Owner) { $Owner = $saved.owner }
}
$Url = $Url.TrimEnd('/')

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if ($Unschedule) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output 'Daily ControlLayer task removed.'
  return
}
if (-not $Print -and (-not $Url -or -not $Key)) {
  # 'return', not 'exit': when run with [scriptblock]::Create, exit would close the PowerShell window.
  Write-Host 'Usage: controllayer-agent.ps1 -Url https://your-controllayer -Key cld_... [-Schedule]' -ForegroundColor Red
  return
}
if (-not $isAdmin) { Write-Warning 'Not running as Administrator; some settings will be reported as unknown.' }

function Get-Reg($path, $name) {
  $item = Get-ItemProperty -Path $path -Name $name
  if ($null -ne $item) { return $item.$name }
  return $null
}

# --- Identity -----------------------------------------------------------------------
$os = Get-CimInstance Win32_OperatingSystem
$machineId = Get-Reg 'HKLM:\SOFTWARE\Microsoft\Cryptography' 'MachineGuid'
if (-not $machineId) { $machineId = (Get-CimInstance Win32_ComputerSystemProduct).UUID }
$hostname = $env:COMPUTERNAME
$cs = Get-CimInstance Win32_ComputerSystem
if ($cs -and $cs.PartOfDomain -and $cs.Domain) { $hostname = "$($env:COMPUTERNAME).$($cs.Domain)".ToLower() }
$osVersion = "$($os.Caption) $((Get-Reg 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' 'DisplayVersion'))".Trim()
$defaultRole = if ($os.ProductType -eq 1) { 'workstation' } else { 'server' }
if (-not $Role) { $Role = $defaultRole }

# --- Disk encryption (BitLocker on the system drive) -----------------------------------
$diskEncrypted = $null
$bl = Get-BitLockerVolume -MountPoint $env:SystemDrive
if ($bl) { $diskEncrypted = ($bl.ProtectionStatus -eq 'On' -or [int]$bl.ProtectionStatus -eq 1) }
elseif ($isAdmin) {
  $vol = Get-CimInstance -Namespace 'root\cimv2\Security\MicrosoftVolumeEncryption' -ClassName Win32_EncryptableVolume -Filter "DriveLetter='$($env:SystemDrive)'"
  if ($vol) { $diskEncrypted = ($vol.ProtectionStatus -eq 1) } else { $diskEncrypted = $false }
}

# --- Firewall (every profile on) ---------------------------------------------------------
$firewall = $null
$profiles = Get-NetFirewallProfile
if ($profiles) { $firewall = -not ($profiles | Where-Object { -not $_.Enabled }) }

# --- Updates ---------------------------------------------------------------------------------
$daysSinceUpdate = $null
try {
  $searcher = (New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher()
  $count = $searcher.GetTotalHistoryCount()
  if ($count -gt 0) {
    $last = $searcher.QueryHistory(0, [Math]::Min($count, 100)) |
      Where-Object { $_.Operation -eq 1 -and ($_.ResultCode -eq 2 -or $_.ResultCode -eq 3) } |
      Sort-Object Date -Descending | Select-Object -First 1
    if ($last) { $daysSinceUpdate = [int]((Get-Date).ToUniversalTime() - $last.Date.ToUniversalTime()).TotalDays }
  }
} catch { }
if ($null -eq $daysSinceUpdate) {
  $hf = Get-HotFix | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 1
  if ($hf) { $daysSinceUpdate = [int]((Get-Date) - $hf.InstalledOn).TotalDays }
}
$au = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
$noAuto = Get-Reg $au 'NoAutoUpdate'
$auOptions = Get-Reg $au 'AUOptions'
$autoUpdates = -not ($noAuto -eq 1 -or $auOptions -eq 2)

# --- Malware protection --------------------------------------------------------------------
$malware = $null
$mp = Get-MpComputerStatus
if ($mp) { $malware = [bool]($mp.AntivirusEnabled -and $mp.RealTimeProtectionEnabled) }
if (-not $malware -and $os.ProductType -eq 1) {
  # Another antivirus registered with Windows Security Center (bit 12 of productState = on).
  $av = Get-CimInstance -Namespace 'root\SecurityCenter2' -ClassName AntiVirusProduct
  if ($av) { $malware = [bool]($av | Where-Object { (([int]$_.productState -shr 12) -band 0xF) -eq 1 }) }
}

# --- Screen lock (machine inactivity limit set by policy) -----------------------------------
$screenLock = $null
$inactivity = Get-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' 'InactivityTimeoutSecs'
if ($inactivity -and [int]$inactivity -gt 0) { $screenLock = [int][Math]::Ceiling([int]$inactivity / 60) }

# --- Remote Desktop ------------------------------------------------------------------------
$deny = Get-Reg 'HKLM:\System\CurrentControlSet\Control\Terminal Server' 'fDenyTSConnections'
$rdpEnabled = if ($null -ne $deny) { $deny -eq 0 } else { $null }
$nla = Get-Reg 'HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' 'UserAuthentication'
$rdpNla = if ($null -ne $nla) { $nla -eq 1 } else { $null }

# --- OpenSSH server (if installed) ---------------------------------------------------------
$sshRoot = $null; $sshPass = $null
if ((Get-Service sshd).Status -eq 'Running') {
  $cfg = Join-Path $env:ProgramData 'ssh\sshd_config'
  if (Test-Path $cfg) {
    $text = Get-Content $cfg | Where-Object { $_ -notmatch '^\s*#' }
    $sshPass = -not ($text -match '^\s*PasswordAuthentication\s+no')
    $sshRoot = $false
  }
}

# --- Logon auditing (successful logons are being recorded) --------------------------------
$auditLogging = $null
if ($isAdmin) {
  $evt = Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = 4624; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 1
  $auditLogging = [bool]$evt
}

# --- Password and lockout rules (local security policy) ------------------------------------
$pwMin = $null; $lockout = $null
if ($isAdmin) {
  $tmp = Join-Path $env:TEMP "cl-secpol-$([guid]::NewGuid()).inf"
  secedit /export /cfg $tmp /areas SECURITYPOLICY | Out-Null
  if (Test-Path $tmp) {
    $policy = Get-Content $tmp
    $m = $policy | Select-String '^MinimumPasswordLength\s*=\s*(\d+)'
    if ($m) { $pwMin = [int]$m.Matches[0].Groups[1].Value }
    $m = $policy | Select-String '^LockoutBadCount\s*=\s*(\d+)'
    if ($m) { $lockout = [int]$m.Matches[0].Groups[1].Value }
    Remove-Item $tmp -Force
  }
}

# --- Time sync ---------------------------------------------------------------------------------
$timeSync = $null
$w32 = Get-Service w32time
if ($w32) { $timeSync = ($w32.Status -eq 'Running') }

# --- Local accounts (not on domain controllers) --------------------------------------------
$accounts = $null
if ($os.ProductType -ne 2) {
  $users = Get-LocalUser
  if ($users) {
    $adminSids = @((Get-LocalGroupMember -SID 'S-1-5-32-544') | ForEach-Object { "$($_.SID)" })
    $accounts = @($users | ForEach-Object {
      $a = [ordered]@{ name = $_.Name; admin = ($adminSids -contains "$($_.SID)"); enabled = [bool]$_.Enabled }
      $a.lastLogin = if ($_.LastLogon) { $_.LastLogon.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } else { $null }
      $a
    })
  }
}

$report = [ordered]@{
  machineId = "$machineId"; hostname = $hostname; os = 'windows'; osVersion = $osVersion; role = $Role; owner = $Owner
  agentVersion = $AgentVersion; diskEncrypted = $diskEncrypted; firewallEnabled = $firewall; autoUpdates = $autoUpdates
  daysSinceUpdate = $daysSinceUpdate; malwareProtection = $malware; sshRootLogin = $sshRoot; sshPasswordAuth = $sshPass
  rdpEnabled = $rdpEnabled; rdpNla = $rdpNla; auditLogging = $auditLogging; passwordMinLength = $pwMin
  lockoutThreshold = $lockout; timeSync = $timeSync; localAccounts = $accounts
}
# A screen lock that is not set by policy is reported as "none"; servers don't report it.
if ($Role -eq 'workstation') { $report.screenLockMinutes = $screenLock }

$json = $report | ConvertTo-Json -Depth 5 -Compress
if ($Print) { Write-Output $json; return }

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Stop'
try {
  $res = Invoke-RestMethod -Method Post -Uri "$Url/api/devices/report" -Headers @{ Authorization = "Bearer $Key" } `
    -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 60
  Write-Output "Report sent: $hostname ($osVersion, $Role)."
} catch {
  Write-Host "ControlLayer rejected the report or could not be reached: $($_.Exception.Message)" -ForegroundColor Red
  return
}
$ErrorActionPreference = 'SilentlyContinue'

if ($Schedule) {
  if (-not $isAdmin) { Write-Host '-Schedule needs PowerShell run as Administrator.' -ForegroundColor Red; return }
  $ErrorActionPreference = 'Stop'
  New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
  # Only SYSTEM and Administrators can read the saved key.
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($sid in 'S-1-5-18', 'S-1-5-32-544') {
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
  }
  Set-Acl -Path $ConfigDir -AclObject $acl
  @{ url = $Url; key = $Key; role = $Role; owner = $Owner } | ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding UTF8
  Invoke-WebRequest -Uri "$Url/api/devices/agent/controllayer-agent.ps1" -OutFile $Installed -UseBasicParsing
  $at = (Get-Date).Date.AddHours((Get-Random -Minimum 0 -Maximum 24)).AddMinutes((Get-Random -Minimum 0 -Maximum 60))
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$Installed`""
  $trigger = New-ScheduledTaskTrigger -Daily -At $at
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
  Write-Output "Scheduled: this computer will report to ControlLayer every day at $($at.ToString('HH:mm'))."
}
