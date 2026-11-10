import { IAMClient, PutUserPolicyCommand } from '@aws-sdk/client-iam';
import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { awsClientCredentials } from '@/connectors/aws';
import { awsConnection } from '@/connectors/config';
import { describeError } from '@/connectors/common';
import { prisma } from '@/db/prisma';
import { anchorChain, appendEvidence } from '@/evidence/store';
import { logEvent } from '@/lib/events';
import { readJson } from '@/lib/http';
import { POLICY_NAME, REQUIRE_MFA_POLICY } from '@/lib/remediation';
import { getSettings } from '@/lib/settings';

/**
 * Optional one-click mitigation for "Console users have MFA" findings.
 *
 * This is the only feature that WRITES to a cloud account, so it is off unless
 * ENABLE_AWS_REMEDIATION=true, admin-only, and needs iam:PutUserPolicy (which
 * the read-only SecurityAudit policy does not grant).
 *
 * It attaches an inline policy that denies everything except setting up MFA
 * until the user signs in with MFA. The finding stays open until the next
 * scan confirms the user has enrolled an MFA device.
 */

export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'admin');
  if (!(await getSettings()).remediationEnabled) {
    throw new HttpError(403, 'One-click remediation is turned off. An admin can turn it on in Settings.');
  }
  const { findingId } = await readJson<{ findingId?: string }>(req);
  const finding = findingId ? await prisma.finding.findUnique({ where: { id: findingId } }) : null;
  if (!finding) throw new HttpError(404, 'Finding not found.');
  if (finding.isSample) throw new HttpError(400, 'This is sample data; there is no real AWS account to change.');
  if (finding.checkId !== 'aws.iam_user_mfa' || finding.status !== 'Open') {
    throw new HttpError(400, 'One-click remediation is only available for open "Console users have MFA" findings.');
  }
  const userName = (finding.details as { userName?: string } | null)?.userName;
  if (!userName) throw new HttpError(400, 'The finding does not record which IAM user it is about. Run a new scan.');

  try {
    const conn = await awsConnection();
    if (!conn) throw new Error('AWS is not connected.');
    await new IAMClient({ region: conn.regions[0], ...awsClientCredentials(conn) }).send(new PutUserPolicyCommand({
      UserName: userName, PolicyName: POLICY_NAME, PolicyDocument: JSON.stringify(REQUIRE_MFA_POLICY),
    }));
  } catch (err) {
    await logEvent({ action: 'Require-MFA policy', actor: user.email, decision: 'Failed', resource: finding.resource ?? userName, reason: describeError(err) });
    throw new HttpError(502, `AWS rejected the change: ${describeError(err)}`);
  }

  const note = `Applied ${POLICY_NAME}: ${userName} is blocked from everything except MFA setup until they sign in with MFA.`;
  await prisma.finding.update({
    where: { id: finding.id },
    data: { details: { ...(finding.details as object), mitigation: note, mitigatedAt: new Date().toISOString(), mitigatedBy: user.email } },
  });
  await appendEvidence({
    title: `AWS: Require-MFA policy applied to ${userName}`,
    kind: 'automated', source: 'aws:remediation',
    content: { userName, policyName: POLICY_NAME, policy: REQUIRE_MFA_POLICY, appliedBy: user.email },
    controlIds: (await prisma.control.findMany({
      where: { OR: [{ framework: 'SOC2', controlId: 'CC6.1' }, { framework: 'CMMC', controlId: 'IA.L1-3.5.2' }, { framework: 'PCI', controlId: '8.4.2' }] },
      select: { id: true },
    })).map(c => c.id),
    collectedBy: user.email,
  });
  void anchorChain(user.email).catch(err => console.error('[timestamp]', err));
  await logEvent({ action: 'Require-MFA policy', actor: user.email, decision: 'Applied', resource: finding.resource ?? userName, reason: note });
  return NextResponse.json({ ok: true, message: `${note} The finding will close after the next scan sees MFA enabled.` });
});
