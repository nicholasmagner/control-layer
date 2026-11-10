# Setting up ControlLayer

How to connect your cloud accounts, identity providers, code hosting, servers and laptops, and how to configure a server install. Back to the [README](../README.md).

## Connecting your accounts

Open **Integrations** and click **Connect** on any service. There are two ways to connect:

- **Sign in with your browser** (easiest, in the desktop app). ControlLayer runs the service's official sign-in (`aws login`, `gcloud auth application-default login`, `az login` for Azure and Microsoft 365, or `gh auth login` for GitHub), your browser opens, and you sign in as usual. Then you pick the account, project, subscription or organization to scan. This needs that command-line tool installed; the dialog links to it if it's missing. On a server, the same dialog shows the sign-in link and a box to paste the code into.
- **Use a key**: an AWS access key, a Google Cloud service account key file, an Azure service principal, a Microsoft 365 app registration, a GitHub personal access token, or (for Google Workspace, which has no browser sign-in) a service account with domain-wide delegation. The dialog shows the few steps to create one. Keys are checked with the cloud before saving and stored encrypted (`CONTROLLAYER_SECRET_KEY`). This is the best choice for automatic scheduled scans; AWS browser sessions last up to 12 hours.

Either way, ControlLayer only reads configuration. The permissions it needs:

| Service | Read-only permissions |
| :--- | :--- |
| **AWS** | Managed policy `SecurityAudit` (browser sign-in also needs `SignInLocalDevelopmentAccess`) |
| **Google Cloud** | `Viewer` + `Security Reviewer` on the project |
| **Azure** | `Reader` + `Security Reader` on the subscription |
| **Google Workspace** | Domain-wide delegation for the scope `admin.directory.user.readonly`, acting as an admin |
| **Microsoft 365** | Graph `User.Read.All`, `AuditLog.Read.All`, `Policy.Read.All`, `RoleManagement.Read.Directory` (or sign in as a Global Reader). Sign-in activity and MFA registration reports need Microsoft Entra ID P1 or P2. |
| **GitHub** | Token scopes `repo` and `read:org`, from an organization owner (owners can see 2FA status and security settings) |
| **Active Directory** | A regular domain user (no admin rights). ControlLayer must reach a domain controller over `ldaps://` (636) or `ldap://` with StartTLS. |

If a permission is missing, the scan still runs everything it can and lists the sections it could not read. Those checks are reported as not evaluated, never as passing. The first real scan automatically removes the sample data.

Server installs can still use environment variables instead; see [`.env.example`](../.env.example).

### Servers and laptops (on-premises or anywhere)

Open **Devices** and click **Add a device**. Copy the one-line command for Linux, macOS or Windows and run it on each machine as root / Administrator (or push it with Group Policy, Intune, Jamf or Ansible). With **Run every day** it also adds a daily job (cron, launchd or a scheduled task), so reports stay current.

- The script only reads settings and sends them over HTTPS to your ControlLayer server; machines need to reach that address, ControlLayer never connects to them. Check what it would send with `--print` (`-Print` on Windows).
- Machines authenticate with a device key that can only submit reports. Replace it any time under Devices.
- Device checks re-run automatically a few minutes after reports arrive. Settings a script cannot read are reported as not evaluated, never as passing.
- The scripts are in [`assets/agent/`](../assets/agent/) for review.

### Scheduled scans

Set `SCAN_INTERVAL_HOURS=24` to scan every configured account daily while the server runs. Alternatively, run `npm run scan` from cron or a scheduled job. It exits non-zero if a scan fails.

## Configuration

Admins change workspace settings in the app under **Settings**: organization name, automatic scan schedule, how often evidence images refresh, independent timestamps, the one-click AWS fix, and the optional assistant's API key. Changes apply immediately. Services are connected under **Integrations**, and the public page is set up under **Trust Center**.

Server installs also read these environment variables (see [`.env.example`](../.env.example)). A value saved in the app takes priority.

| Variable | Purpose |
| :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `CONTROLLAYER_SECRET_KEY` | Encrypts keys saved in the app: cloud keys and the assistant API key (`openssl rand -base64 32`) |
| `ORGANIZATION_NAME`, `SCAN_INTERVAL_HOURS`, `SNAPSHOT_INTERVAL_DAYS`, `TIMESTAMP_AUTHORITY_URL`, `ENABLE_AWS_REMEDIATION`, `ASSISTANT_API_KEY`, `ASSISTANT_MODEL` | Defaults for the settings above |
| `AWS_*`, `GCP_*`, `GOOGLE_APPLICATION_CREDENTIALS`, `AZURE_*`, `GITHUB_ORG` + `GITHUB_TOKEN` | Optional: credentials from the environment instead of the app |
| `SECURE_COOKIES` | Force HTTPS-only session cookies (automatic behind an HTTPS proxy) |
