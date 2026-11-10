import type { FormerPerson, Provider } from '@/checks/types';
import { prisma } from '@/db/prisma';
import { collectAd } from './ad';
import { collectAws } from './aws';
import { collectAzure } from './azure';
import { findCli, githubCliToken, type CliName } from './cli';
import type { CollectResult } from './common';
import {
  adConnection, awsConnection, azureConnection, devicesConnection, gcpConnection, githubConnection, gworkspaceConnection, isLocalInstall, m365Connection, type Method,
} from './config';
import { collectDevices } from './devices';
import { collectGcp } from './gcp';
import { collectGithub } from './github';
import { collectGworkspace } from './gworkspace';
import { collectM365 } from './m365';

export type { CollectResult } from './common';

export interface ConnectorInfo {
  provider: Provider;
  name: string;
  kind: 'cloud' | 'identity' | 'code' | 'onprem';
  /** One line on what ControlLayer checks there. */
  blurb: string;
  configured: boolean;
  method: Method | null;
  /** Who / what is connected, e.g. account id, project, subscription. */
  label: string | null;
  /** What is scanned, e.g. regions or project id. */
  target: string;
  /** Browser sign-in through this CLI; null when the service only supports keys. */
  cli: { name: CliName; installed: boolean; installUrl: string } | null;
  setup: {
    keyHelp: string[];
    consoleUrl: string;
    consoleName: string;
    permissions: string;
    signinNote: string;
    /** What the "keys" option is called, e.g. "a read-only access key". */
    keyName: string;
    /** Word for what the user picks after signing in, e.g. "project". */
    pickWord: string;
  };
}

const INSTALL: Record<CliName, string> = {
  aws: 'https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html',
  gcloud: 'https://cloud.google.com/sdk/docs/install',
  az: 'https://learn.microsoft.com/cli/azure/install-azure-cli',
  gh: 'https://cli.github.com/',
};

export async function connectorInfo(): Promise<ConnectorInfo[]> {
  const [aws, gcp, azure, gws, m365, github, ad, devices] = await Promise.all([
    awsConnection(), gcpConnection(), azureConnection(), gworkspaceConnection(), m365Connection(), githubConnection(), adConnection(), devicesConnection(),
  ]);
  const local = isLocalInstall();
  const cli = async (name: CliName) => ({ name, installUrl: INSTALL[name], installed: !!(await findCli(name)) });
  const browserNote = (who: string) => local
    ? `Your browser opens the ${who} sign-in page. Sign in as usual, then come back.`
    : 'ControlLayer shows a sign-in link. Open it, sign in, and paste the code it shows back here if asked.';

  return [
    {
      provider: 'aws', name: 'Amazon Web Services', kind: 'cloud', blurb: 'IAM, MFA, logging, storage, network and database settings.',
      configured: !!aws, method: aws?.method ?? null, label: aws?.label ?? null,
      target: aws ? `Regions: ${aws.regions.join(', ')}` : 'Not connected',
      cli: await cli('aws'),
      setup: {
        keyName: 'a read-only access key', pickWord: 'account', consoleName: 'AWS console',
        keyHelp: [
          'In the AWS console, open IAM > Users > Create user (e.g. "controllayer-scanner"). Do not give it console access.',
          'Choose "Attach policies directly" and attach the AWS managed policy SecurityAudit (read-only).',
          'Open the new user > Security credentials > Create access key > "Application running outside AWS".',
          'Copy the Access key ID and Secret access key here.',
        ],
        consoleUrl: 'https://console.aws.amazon.com/iam/home#/users/create',
        permissions: 'Read-only: the AWS managed policy SecurityAudit.',
        signinNote: local
          ? 'Your browser opens the AWS sign-in page. Sign in as usual; sessions last up to 12 hours, so scheduled scans need an access key instead. The account needs the SignInLocalDevelopmentAccess and SecurityAudit policies.'
          : 'ControlLayer shows a sign-in link. Open it, sign in, and paste the code it shows back here. Sessions last up to 12 hours.',
      },
    },
    {
      provider: 'gcp', name: 'Google Cloud', kind: 'cloud', blurb: 'IAM roles, service account keys, audit logs, storage, firewall and Cloud SQL.',
      configured: !!gcp, method: gcp?.method ?? null, label: gcp?.label ?? null,
      target: gcp ? `Project: ${gcp.projectId}` : 'Not connected',
      cli: await cli('gcloud'),
      setup: {
        keyName: 'a read-only service account key', pickWord: 'project', consoleName: 'Google Cloud console',
        keyHelp: [
          'In the Google Cloud console, open IAM & Admin > Service Accounts > Create service account (e.g. "controllayer-scanner").',
          'Grant it the roles Viewer and Security Reviewer on the project.',
          'Open the service account > Keys > Add key > Create new key > JSON. A key file downloads.',
          'Upload that file here.',
        ],
        consoleUrl: 'https://console.cloud.google.com/iam-admin/serviceaccounts/create',
        permissions: 'Read-only: Viewer + Security Reviewer on the project.',
        signinNote: local ? 'Your browser opens the Google sign-in page. Sign in with an account that can view the project.' : browserNote('Google'),
      },
    },
    {
      provider: 'azure', name: 'Microsoft Azure', kind: 'cloud', blurb: 'Storage, network security groups, SQL firewalls, Key Vault, logging and Defender.',
      configured: !!azure, method: azure?.method ?? null, label: azure?.label ?? null,
      target: azure ? `Subscription: ${azure.subscriptionId}` : 'Not connected',
      cli: await cli('az'),
      setup: {
        keyName: 'a read-only service principal', pickWord: 'subscription', consoleName: 'Azure portal',
        keyHelp: [
          'In the Azure portal, open Microsoft Entra ID > App registrations > New registration (e.g. "controllayer-scanner").',
          'In the app, open Certificates & secrets > New client secret, and copy the secret value.',
          'In your subscription, open Access control (IAM) > Add role assignment and give the app Reader and Security Reader.',
          'Enter the tenant ID, application (client) ID, secret and subscription ID here.',
        ],
        consoleUrl: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
        permissions: 'Read-only: Reader + Security Reader on the subscription.',
        signinNote: local
          ? 'Your browser (or the Windows sign-in window) opens. Sign in with an account that has Reader and Security Reader on the subscription.'
          : 'ControlLayer shows a link and a code. Open the link, enter the code, and sign in.',
      },
    },
    {
      provider: 'gworkspace', name: 'Google Workspace', kind: 'identity', blurb: '2-Step Verification, unused accounts, super admins and people who left.',
      configured: !!gws, method: gws?.method ?? null, label: gws?.label ?? null,
      target: gws ? `Directory as ${gws.adminEmail}` : 'Not connected',
      cli: null,
      setup: {
        keyName: 'a service account with read-only directory access', pickWord: 'domain', consoleName: 'Google Cloud console',
        keyHelp: [
          'In the Google Cloud console (any project), enable the Admin SDK API, then open IAM & Admin > Service Accounts > Create service account. It needs no roles.',
          'Open the service account > Keys > Add key > Create new key > JSON, and note its Client ID (Details tab).',
          'In the Google Admin console, open Security > Access and data control > API controls > Manage Domain Wide Delegation > Add new. Enter the Client ID and the scope https://www.googleapis.com/auth/admin.directory.user.readonly',
          'Upload the key file here and enter the email of a Google Workspace admin for the service account to act as (read-only).',
        ],
        consoleUrl: 'https://console.cloud.google.com/apis/library/admin.googleapis.com',
        permissions: 'Read-only: the Admin SDK scope admin.directory.user.readonly.',
        signinNote: '',
      },
    },
    {
      provider: 'm365', name: 'Microsoft 365', kind: 'identity', blurb: 'MFA enforcement and registration, unused accounts, Global Administrators and people who left.',
      configured: !!m365, method: m365?.method ?? null, label: m365?.label ?? null,
      target: m365 ? 'Microsoft Entra ID directory' : 'Not connected',
      cli: await cli('az'),
      setup: {
        keyName: 'a read-only app registration', pickWord: 'organization', consoleName: 'Microsoft Entra admin center',
        keyHelp: [
          'In the Microsoft Entra admin center, open Applications > App registrations > New registration (e.g. "controllayer-scanner").',
          'Open API permissions > Add a permission > Microsoft Graph > Application permissions, and add User.Read.All, AuditLog.Read.All, Policy.Read.All and RoleManagement.Read.Directory. Click "Grant admin consent".',
          'Open Certificates & secrets > New client secret, and copy the secret value.',
          'Enter the tenant ID, application (client) ID and secret here.',
        ],
        consoleUrl: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
        permissions: 'Read-only Microsoft Graph permissions: User.Read.All, AuditLog.Read.All, Policy.Read.All, RoleManagement.Read.Directory.',
        signinNote: `${browserNote('Microsoft')} Use an account with the Global Reader or Security Reader role.`,
      },
    },
    {
      provider: 'github', name: 'GitHub', kind: 'code', blurb: '2FA, branch protection and code review, secret scanning, Dependabot and people who left.',
      configured: !!github, method: github?.method ?? null, label: github?.label ?? null,
      target: github ? `Organization: ${github.org}` : 'Not connected',
      cli: await cli('gh'),
      setup: {
        keyName: 'a personal access token', pickWord: 'organization', consoleName: 'GitHub settings',
        keyHelp: [
          'Sign in to GitHub as an organization owner (owners can see 2FA status and security settings).',
          'Open Settings > Developer settings > Personal access tokens > Tokens (classic) > Generate new token.',
          'Select the scopes repo and read:org, set an expiry, and generate it.',
          'Paste the token here with your organization name.',
        ],
        consoleUrl: 'https://github.com/settings/tokens/new?scopes=repo,read:org&description=ControlLayer',
        permissions: 'Scopes repo and read:org. ControlLayer only reads.',
        signinNote: `${browserNote('GitHub')} Sign in as an organization owner to see 2FA status and security settings.`,
      },
    },
    {
      provider: 'devices', name: 'Servers and laptops', kind: 'onprem',
      blurb: 'Disk encryption, firewall, updates, malware protection, screen lock, SSH/RDP and local accounts on Linux, Windows and Mac machines, wherever they are.',
      configured: !!devices, method: devices?.method ?? null, label: devices?.label ?? null,
      target: devices ? 'Reports from the agent script' : 'No devices yet',
      cli: null,
      setup: { keyName: 'the agent script', pickWord: 'device', consoleName: '', keyHelp: [], consoleUrl: '', permissions: 'The script only reads settings.', signinNote: '' },
    },
    {
      provider: 'ad', name: 'Active Directory', kind: 'onprem',
      blurb: 'Domain password policy, stale and disabled accounts, Domain Admins, password exceptions, and people who left.',
      configured: !!ad, method: ad?.method ?? null, label: ad?.label ?? null,
      target: ad ? `Domain controller: ${ad.url.replace(/^ldaps?:\/\//, '')}` : 'Not connected',
      cli: null,
      setup: {
        keyName: 'a read-only domain account', pickWord: 'domain', consoleName: '',
        keyHelp: [
          'In Active Directory Users and Computers, create a regular user (e.g. "svc-controllayer"). It needs no special groups: any domain user can read the settings ControlLayer checks.',
          'Set a long password and tick "Password never expires" only if your policy allows service accounts (or rotate it and update it here).',
          'Enter a domain controller address. Use ldaps:// (port 636), or ldap:// with StartTLS, so the password is encrypted. If your domain controllers use an internal certificate authority, paste its certificate.',
          'The computer running ControlLayer must be able to reach the domain controller on your network.',
        ],
        consoleUrl: '',
        permissions: 'A regular domain user account; ControlLayer only reads.',
        signinNote: '',
      },
    },
  ];
}

async function formerPeople(): Promise<FormerPerson[]> {
  const rows = await prisma.person.findMany({ where: { endDate: { lte: new Date() } }, select: { name: true, email: true, githubUsername: true, endDate: true } });
  return rows.map(r => ({ name: r.name, email: r.email, githubUsername: r.githubUsername, endDate: r.endDate!.toISOString() }));
}

const notConnected = (name: string) => new Error(`${name} is not connected. Open Integrations and click Connect.`);

export async function collect(provider: Provider): Promise<CollectResult<unknown>> {
  switch (provider) {
    case 'aws': {
      const c = await awsConnection();
      if (!c) throw notConnected('AWS');
      return collectAws(c);
    }
    case 'gcp': {
      const c = await gcpConnection();
      if (!c) throw notConnected('Google Cloud');
      return collectGcp(c);
    }
    case 'azure': {
      const c = await azureConnection();
      if (!c) throw notConnected('Azure');
      return collectAzure(c);
    }
    case 'gworkspace': {
      const c = await gworkspaceConnection();
      if (!c) throw notConnected('Google Workspace');
      const r = await collectGworkspace(c);
      r.inventory.formerPeople = await formerPeople();
      return r;
    }
    case 'm365': {
      const c = await m365Connection();
      if (!c) throw notConnected('Microsoft 365');
      const r = await collectM365(c);
      r.inventory.formerPeople = await formerPeople();
      return r;
    }
    case 'ad': {
      const c = await adConnection();
      if (!c) throw notConnected('Active Directory');
      const r = await collectAd(c);
      r.inventory.formerPeople = await formerPeople();
      return r;
    }
    case 'devices':
      return collectDevices();
    case 'github': {
      const c = await githubConnection();
      if (!c) throw notConnected('GitHub');
      const r = await collectGithub(c, c.token ?? await githubCliToken());
      r.inventory.formerPeople = await formerPeople();
      return r;
    }
  }
}
