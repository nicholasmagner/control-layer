/**
 * Common vendors for small companies, so adding one fills in sensible
 * defaults (category, typical data access, AI use). Everything can be edited.
 */
export interface CatalogVendor {
  name: string;
  website: string;
  category: string;
  dataAccess: string[];
  usesAi?: boolean;
  subprocessor?: boolean;
  critical?: boolean;
  /** Integration that, when connected, suggests this vendor. */
  provider?: string;
}

const v = (name: string, website: string, category: string, dataAccess: string[], extra: Partial<CatalogVendor> = {}): CatalogVendor =>
  ({ name, website, category, dataAccess, ...extra });

const CUST = ['customer_data', 'personal_data'];

export const VENDOR_CATALOG: CatalogVendor[] = [
  v('Amazon Web Services', 'aws.amazon.com', 'Cloud infrastructure', [...CUST, 'credentials'], { subprocessor: true, critical: true, provider: 'aws' }),
  v('Google Cloud', 'cloud.google.com', 'Cloud infrastructure', [...CUST, 'credentials'], { subprocessor: true, critical: true, provider: 'gcp' }),
  v('Microsoft Azure', 'azure.microsoft.com', 'Cloud infrastructure', [...CUST, 'credentials'], { subprocessor: true, critical: true, provider: 'azure' }),
  v('Cloudflare', 'cloudflare.com', 'Cloud infrastructure', [...CUST], { subprocessor: true, critical: true }),
  v('Vercel', 'vercel.com', 'Cloud infrastructure', [...CUST], { subprocessor: true, critical: true }),
  v('Heroku', 'heroku.com', 'Cloud infrastructure', [...CUST], { subprocessor: true, critical: true }),
  v('DigitalOcean', 'digitalocean.com', 'Cloud infrastructure', [...CUST], { subprocessor: true, critical: true }),
  v('MongoDB Atlas', 'mongodb.com', 'Cloud infrastructure', [...CUST], { subprocessor: true, critical: true }),
  v('Supabase', 'supabase.com', 'Cloud infrastructure', [...CUST], { subprocessor: true, critical: true }),
  v('Snowflake', 'snowflake.com', 'Data & analytics', [...CUST], { subprocessor: true }),
  v('Google Workspace', 'workspace.google.com', 'Identity & productivity', ['personal_data', 'employee_data', 'internal_data', 'customer_data'], { critical: true, usesAi: true, provider: 'gworkspace' }),
  v('Microsoft 365', 'microsoft.com/microsoft-365', 'Identity & productivity', ['personal_data', 'employee_data', 'internal_data', 'customer_data'], { critical: true, usesAi: true, provider: 'm365' }),
  v('Okta', 'okta.com', 'Identity & productivity', ['employee_data', 'credentials'], { critical: true }),
  v('1Password', '1password.com', 'Security', ['credentials'], { critical: true }),
  v('Bitwarden', 'bitwarden.com', 'Security', ['credentials'], { critical: true }),
  v('GitHub', 'github.com', 'Code & DevOps', ['source_code', 'credentials'], { critical: true, usesAi: true, provider: 'github' }),
  v('GitLab', 'gitlab.com', 'Code & DevOps', ['source_code', 'credentials'], { critical: true, usesAi: true }),
  v('Atlassian (Jira, Confluence)', 'atlassian.com', 'Code & DevOps', ['internal_data', 'personal_data'], { usesAi: true }),
  v('Linear', 'linear.app', 'Code & DevOps', ['internal_data'], { usesAi: true }),
  v('CircleCI', 'circleci.com', 'Code & DevOps', ['source_code', 'credentials']),
  v('Docker Hub', 'docker.com', 'Code & DevOps', ['source_code']),
  v('Sentry', 'sentry.io', 'Monitoring', [...CUST], { subprocessor: true }),
  v('Datadog', 'datadoghq.com', 'Monitoring', [...CUST], { subprocessor: true }),
  v('New Relic', 'newrelic.com', 'Monitoring', [...CUST], { subprocessor: true }),
  v('PagerDuty', 'pagerduty.com', 'Monitoring', ['employee_data']),
  v('Slack', 'slack.com', 'Communication', ['internal_data', 'personal_data', 'customer_data'], { usesAi: true }),
  v('Zoom', 'zoom.us', 'Communication', ['personal_data', 'internal_data'], { usesAi: true }),
  v('Microsoft Teams', 'microsoft.com/microsoft-teams', 'Communication', ['personal_data', 'internal_data'], { usesAi: true }),
  v('Notion', 'notion.so', 'Storage & documents', ['internal_data', 'personal_data'], { usesAi: true }),
  v('Dropbox', 'dropbox.com', 'Storage & documents', ['internal_data', 'personal_data'], { usesAi: true }),
  v('Box', 'box.com', 'Storage & documents', ['internal_data', 'personal_data'], { usesAi: true }),
  v('DocuSign', 'docusign.com', 'Storage & documents', ['personal_data', 'internal_data'], { usesAi: true }),
  v('Figma', 'figma.com', 'Design & product', ['internal_data'], { usesAi: true }),
  v('Miro', 'miro.com', 'Design & product', ['internal_data'], { usesAi: true }),
  v('Salesforce', 'salesforce.com', 'CRM & sales', [...CUST], { subprocessor: true, usesAi: true }),
  v('HubSpot', 'hubspot.com', 'CRM & sales', [...CUST], { subprocessor: true, usesAi: true }),
  v('Pipedrive', 'pipedrive.com', 'CRM & sales', ['personal_data'], { usesAi: true }),
  v('Intercom', 'intercom.com', 'Customer support', [...CUST], { subprocessor: true, usesAi: true }),
  v('Zendesk', 'zendesk.com', 'Customer support', [...CUST], { subprocessor: true, usesAi: true }),
  v('Freshdesk', 'freshworks.com', 'Customer support', [...CUST], { subprocessor: true, usesAi: true }),
  v('Stripe', 'stripe.com', 'Payments & finance', ['payment_data', 'personal_data', 'customer_data'], { subprocessor: true, critical: true }),
  v('PayPal', 'paypal.com', 'Payments & finance', ['payment_data', 'personal_data'], { subprocessor: true }),
  v('QuickBooks', 'quickbooks.intuit.com', 'Payments & finance', ['internal_data', 'personal_data']),
  v('Xero', 'xero.com', 'Payments & finance', ['internal_data', 'personal_data']),
  v('Brex', 'brex.com', 'Payments & finance', ['employee_data', 'internal_data']),
  v('Ramp', 'ramp.com', 'Payments & finance', ['employee_data', 'internal_data']),
  v('Gusto', 'gusto.com', 'HR & payroll', ['employee_data', 'personal_data'], { critical: true }),
  v('Rippling', 'rippling.com', 'HR & payroll', ['employee_data', 'personal_data', 'credentials'], { critical: true }),
  v('BambooHR', 'bamboohr.com', 'HR & payroll', ['employee_data', 'personal_data']),
  v('Deel', 'deel.com', 'HR & payroll', ['employee_data', 'personal_data']),
  v('Justworks', 'justworks.com', 'HR & payroll', ['employee_data', 'personal_data']),
  v('Checkr', 'checkr.com', 'HR & payroll', ['employee_data', 'personal_data']),
  v('Mailchimp', 'mailchimp.com', 'Email & marketing', ['personal_data'], { subprocessor: true, usesAi: true }),
  v('SendGrid (Twilio)', 'sendgrid.com', 'Email & marketing', [...CUST], { subprocessor: true }),
  v('Postmark', 'postmarkapp.com', 'Email & marketing', [...CUST], { subprocessor: true }),
  v('Twilio', 'twilio.com', 'Email & marketing', [...CUST], { subprocessor: true }),
  v('Segment', 'segment.com', 'Data & analytics', [...CUST], { subprocessor: true }),
  v('Google Analytics', 'analytics.google.com', 'Data & analytics', ['personal_data'], { subprocessor: true }),
  v('Mixpanel', 'mixpanel.com', 'Data & analytics', [...CUST], { subprocessor: true }),
  v('Amplitude', 'amplitude.com', 'Data & analytics', [...CUST], { subprocessor: true }),
  v('PostHog', 'posthog.com', 'Data & analytics', [...CUST], { subprocessor: true }),
  v('OpenAI', 'openai.com', 'AI & machine learning', [...CUST], { subprocessor: true, usesAi: true }),
  v('Anthropic', 'anthropic.com', 'AI & machine learning', [...CUST], { subprocessor: true, usesAi: true }),
  v('Google Gemini API', 'ai.google.dev', 'AI & machine learning', [...CUST], { subprocessor: true, usesAi: true }),
  v('Cohere', 'cohere.com', 'AI & machine learning', [...CUST], { subprocessor: true, usesAi: true }),
  v('Hugging Face', 'huggingface.co', 'AI & machine learning', ['internal_data'], { usesAi: true }),
  v('Pinecone', 'pinecone.io', 'AI & machine learning', [...CUST], { subprocessor: true, usesAi: true }),
  v('CrowdStrike', 'crowdstrike.com', 'Security', ['employee_data', 'internal_data'], { critical: true }),
  v('SentinelOne', 'sentinelone.com', 'Security', ['employee_data', 'internal_data'], { critical: true }),
  v('Kandji', 'kandji.io', 'Security', ['employee_data'], { critical: true }),
  v('Jamf', 'jamf.com', 'Security', ['employee_data'], { critical: true }),
  v('KnowBe4', 'knowbe4.com', 'Security', ['employee_data']),
];

export const VENDOR_CATEGORIES = [...new Set(VENDOR_CATALOG.map(c => c.category)), 'Other'];

export const DATA_TYPES: { id: string; label: string; sensitive: boolean }[] = [
  { id: 'customer_data', label: 'Customer data', sensitive: true },
  { id: 'personal_data', label: 'Personal data', sensitive: true },
  { id: 'health_data', label: 'Health data (PHI)', sensitive: true },
  { id: 'payment_data', label: 'Payment card data', sensitive: true },
  { id: 'credentials', label: 'Credentials / secrets', sensitive: true },
  { id: 'source_code', label: 'Source code', sensitive: true },
  { id: 'employee_data', label: 'Employee data', sensitive: false },
  { id: 'internal_data', label: 'Internal documents', sensitive: false },
];
