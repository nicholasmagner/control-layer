/** Settings for the optional AWS one-click MFA mitigation (see api/findings/remediate). */

export const POLICY_NAME = 'ControlLayer-RequireMFA';

export const REQUIRE_MFA_POLICY = {
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'DenyAllExceptMfaSetupUnlessSignedInWithMFA',
      Effect: 'Deny',
      NotAction: [
        'iam:CreateVirtualMFADevice',
        'iam:EnableMFADevice',
        'iam:GetUser',
        'iam:ListMFADevices',
        'iam:ListVirtualMFADevices',
        'iam:ResyncMFADevice',
        'sts:GetSessionToken',
      ],
      Resource: '*',
      Condition: { BoolIfExists: { 'aws:MultiFactorAuthPresent': 'false' } },
    },
  ],
};

