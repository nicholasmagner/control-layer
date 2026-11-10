import type { Provider } from '@/checks/types';
import { collectAws } from './aws';
import { collectAzure } from './azure';
import { findCli, type CliName } from './cli';
import type { CollectResult } from './common';
import { awsConnection, azureConnection, gcpConnection, isLocalInstall, type Method } from './config';
import { collectGcp } from './gcp';

export type { CollectResult } from './common';

export interface ConnectorInfo {
  provider: Provider;
  name: string;
  configured: boolean;
  method: Method | null;
  /** Who / what is connected, e.g. account id, project, subscription. */
  label: string | null;
  /** Where the scan runs, e.g. regions or project id. */
  target: string;
  cli: { name: CliName; installed: boolean; installUrl: string };
  setup: { keyHelp: string[]; consoleUrl: string; permissions: string; signinNote: string };
}

const CLI: Record<Provider, { name: CliName; installUrl: string }> = {
  aws: { name: 'aws', installUrl: 'https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html' },
  gcp: { name: 'gcloud', installUrl: 'https://cloud.google.com/sdk/docs/install' },
  azure: { name: 'az', installUrl: 'https://learn.microsoft.com/cli/azure/install-azure-cli' },
};

export async function connectorInfo(): Promise<ConnectorInfo[]> {
  const [aws, gcp, azure] = await Promise.all([awsConnection(), gcpConnection(), azureConnection()]);
  const cli = async (p: Provider) => ({ ...CLI[p], installed: !!(await findCli(CLI[p].name)) });
  return [
    {
      provider: 'aws', name: 'Amazon Web Services', configured: !!aws, method: aws?.method ?? null, label: aws?.label ?? null,
      target: aws ? `Regions: ${aws.regions.join(', ')}` : 'Not connected',
      cli: await cli('aws'),
      setup: {
        keyHelp: [
          'In the AWS console, open IAM > Users > Create user (e.g. "controllayer-scanner"). Do not give it console access.',
          'Choose "Attach policies directly" and attach the AWS managed policy SecurityAudit (read-only).',
          'Open the new user > Security credentials > Create access key > "Application running outside AWS".',
          'Copy the Access key ID and Secret access key here.',
        ],
        consoleUrl: 'https://console.aws.amazon.com/iam/home#/users/create',
        permissions: 'Read-only: the AWS managed policy SecurityAudit.',
        signinNote: isLocalInstall()
          ? 'Your browser opens the AWS sign-in page. Sign in as usual; sessions last up to 12 hours, so scheduled scans need an access key instead. The account needs the SignInLocalDevelopmentAccess and SecurityAudit policies.'
          : 'ControlLayer shows a sign-in link. Open it, sign in, and paste the code it shows back here. Sessions last up to 12 hours.',
      },
    },
    {
      provider: 'gcp', name: 'Google Cloud', configured: !!gcp, method: gcp?.method ?? null, label: gcp?.label ?? null,
      target: gcp ? `Project: ${gcp.projectId}` : 'Not connected',
      cli: await cli('gcp'),
      setup: {
        keyHelp: [
          'In the Google Cloud console, open IAM & Admin > Service Accounts > Create service account (e.g. "controllayer-scanner").',
          'Grant it the roles Viewer and Security Reviewer on the project.',
          'Open the service account > Keys > Add key > Create new key > JSON. A key file downloads.',
          'Upload that file here.',
        ],
        consoleUrl: 'https://console.cloud.google.com/iam-admin/serviceaccounts/create',
        permissions: 'Read-only: Viewer + Security Reviewer on the project.',
        signinNote: isLocalInstall()
          ? 'Your browser opens the Google sign-in page. Sign in with an account that can view the project.'
          : 'ControlLayer shows a sign-in link. Open it, sign in, and paste the code it shows back here.',
      },
    },
    {
      provider: 'azure', name: 'Microsoft Azure', configured: !!azure, method: azure?.method ?? null, label: azure?.label ?? null,
      target: azure ? `Subscription: ${azure.subscriptionId}` : 'Not connected',
      cli: await cli('azure'),
      setup: {
        keyHelp: [
          'In the Azure portal, open Microsoft Entra ID > App registrations > New registration (e.g. "controllayer-scanner").',
          'In the app, open Certificates & secrets > New client secret, and copy the secret value.',
          'In your subscription, open Access control (IAM) > Add role assignment and give the app Reader and Security Reader.',
          'Enter the tenant ID, application (client) ID, secret and subscription ID here.',
        ],
        consoleUrl: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
        permissions: 'Read-only: Reader + Security Reader on the subscription.',
        signinNote: isLocalInstall()
          ? 'Your browser (or the Windows sign-in window) opens. Sign in with an account that has Reader and Security Reader on the subscription.'
          : 'ControlLayer shows a link and a code. Open the link, enter the code, and sign in.',
      },
    },
  ];
}

export async function collect(provider: Provider): Promise<CollectResult<unknown>> {
  if (provider === 'aws') {
    const c = await awsConnection();
    if (!c) throw new Error('AWS is not connected. Open Cloud Accounts and click Connect.');
    return collectAws(c);
  }
  if (provider === 'gcp') {
    const c = await gcpConnection();
    if (!c) throw new Error('Google Cloud is not connected. Open Cloud Accounts and click Connect.');
    return collectGcp(c);
  }
  const c = await azureConnection();
  if (!c) throw new Error('Azure is not connected. Open Cloud Accounts and click Connect.');
  return collectAzure(c);
}
