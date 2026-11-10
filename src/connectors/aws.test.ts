import { describe, expect, it } from 'vitest';
import { parseCredentialReport } from './aws';

const CSV = [
  'user,arn,user_creation_time,password_enabled,password_last_used,password_last_changed,password_next_rotation,mfa_active,access_key_1_active,access_key_1_last_rotated,access_key_1_last_used_date,access_key_1_last_used_region,access_key_1_last_used_service,access_key_2_active,access_key_2_last_rotated,access_key_2_last_used_date,access_key_2_last_used_region,access_key_2_last_used_service,cert_1_active,cert_1_last_rotated,cert_2_active,cert_2_last_rotated',
  '<root_account>,arn:aws:iam::123456789012:root,2020-01-01T00:00:00+00:00,not_supported,2026-01-10T00:00:00+00:00,not_supported,not_supported,true,false,N/A,N/A,N/A,N/A,false,N/A,N/A,N/A,N/A,false,N/A,false,N/A',
  'alice,arn:aws:iam::123456789012:user/alice,2024-03-01T00:00:00+00:00,true,no_information,2024-03-01T00:00:00+00:00,N/A,false,true,2025-01-01T00:00:00+00:00,2026-05-01T00:00:00+00:00,us-east-1,s3,false,N/A,N/A,N/A,N/A,false,N/A,false,N/A',
].join('\n');

describe('parseCredentialReport', () => {
  it('normalizes the root row and IAM users', () => {
    const [root, alice] = parseCredentialReport(CSV);
    expect(root).toMatchObject({ user: 'root', isRoot: true, mfaActive: true, passwordEnabled: false });
    expect(root.accessKeys.every(k => !k.active)).toBe(true);
    expect(alice).toMatchObject({ user: 'alice', isRoot: false, passwordEnabled: true, mfaActive: false, passwordLastUsed: undefined });
    expect(alice.accessKeys[0]).toEqual({ active: true, lastRotated: '2025-01-01T00:00:00+00:00', lastUsed: '2026-05-01T00:00:00+00:00' });
  });
});
