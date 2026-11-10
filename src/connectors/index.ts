import type { Provider } from '@/checks/types';
import { awsConfigured, awsRegions, collectAws } from './aws';
import { azureConfigured, azureSubscriptionId, collectAzure } from './azure';
import type { CollectResult } from './common';
import { collectGcp, gcpConfigured, gcpProjectId } from './gcp';

export type { CollectResult } from './common';

export interface ConnectorInfo {
  provider: Provider;
  name: string;
  configured: boolean;
  /** Where the scan will run, e.g. regions or project id. */
  target: string;
  setup: { env: string[]; permissions: string; docs: string };
}

export function connectorInfo(): ConnectorInfo[] {
  return [
    {
      provider: 'aws', name: 'Amazon Web Services', configured: awsConfigured(),
      target: `Regions: ${awsRegions().join(', ')}`,
      setup: {
        env: ['AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY, AWS_PROFILE, or an attached IAM role', 'AWS_REGIONS=us-east-1,us-west-2 (optional)'],
        permissions: 'Attach the AWS managed policy "SecurityAudit" (read-only) to the scanning user or role.',
        docs: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-user.html',
      },
    },
    {
      provider: 'gcp', name: 'Google Cloud', configured: gcpConfigured(),
      target: gcpProjectId() ? `Project: ${gcpProjectId()}` : 'No project set',
      setup: {
        env: ['GCP_PROJECT_ID=your-project', 'GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json (or gcloud / attached service account)'],
        permissions: 'Grant the service account "Viewer" and "Security Reviewer" on the project.',
        docs: 'https://cloud.google.com/docs/authentication/application-default-credentials',
      },
    },
    {
      provider: 'azure', name: 'Microsoft Azure', configured: azureConfigured(),
      target: azureSubscriptionId() ? `Subscription: ${azureSubscriptionId()}` : 'No subscription set',
      setup: {
        env: ['AZURE_SUBSCRIPTION_ID=...', 'AZURE_TENANT_ID + AZURE_CLIENT_ID + AZURE_CLIENT_SECRET (or managed identity / az login)'],
        permissions: 'Assign "Reader" and "Security Reader" on the subscription to the service principal.',
        docs: 'https://learn.microsoft.com/azure/developer/javascript/sdk/authentication/overview',
      },
    },
  ];
}

export async function collect(provider: Provider): Promise<CollectResult<unknown>> {
  switch (provider) {
    case 'aws': return collectAws();
    case 'gcp': return collectGcp();
    case 'azure': return collectAzure();
  }
}
