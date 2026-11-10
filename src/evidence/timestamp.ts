import { createHash, randomBytes, verify as cryptoVerify, X509Certificate } from 'node:crypto';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

/**
 * RFC 3161 trusted timestamps.
 *
 * We send a SHA-256 digest (never the evidence itself) to a Time-Stamp
 * Authority, which returns a signed token saying "this digest existed at
 * time T". Tokens are stored and included in audit packages, and can be
 * checked with `openssl ts -verify` without trusting ControlLayer.
 */

const SHA256_OID = '2.16.840.1.101.3.4.2.1';
export const DEFAULT_TSA_URL = 'https://freetsa.org/tsr';

export function tsaUrl(): string | null {
  const v = process.env.TIMESTAMP_AUTHORITY_URL?.trim();
  if (v === 'off' || v === 'none' || v === 'false') return null;
  return v || DEFAULT_TSA_URL;
}

const toArrayBuffer = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const hex = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString('hex');

export function buildRequest(digestHex: string, nonce: Uint8Array): Uint8Array {
  const req = new pkijs.TimeStampReq({
    version: 1,
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: SHA256_OID, algorithmParams: new asn1js.Null() }),
      hashedMessage: new asn1js.OctetString({ valueHex: Buffer.from(digestHex, 'hex') }),
    }),
    nonce: new asn1js.Integer({ valueHex: nonce }),
    certReq: true,
  });
  return new Uint8Array(req.toSchema().toBER());
}

export interface TokenInfo {
  genTime: Date;
  digestHex: string;
  nonceHex: string | null;
  serialHex: string;
  policy: string;
  signatureValid: boolean;
}

const HASH_BY_OID: Record<string, string> = {
  '2.16.840.1.101.3.4.2.1': 'sha256', '2.16.840.1.101.3.4.2.2': 'sha384', '2.16.840.1.101.3.4.2.3': 'sha512',
  '1.2.840.10045.4.3.2': 'sha256', '1.2.840.10045.4.3.3': 'sha384', '1.2.840.10045.4.3.4': 'sha512',
  '1.2.840.113549.1.1.11': 'sha256', '1.2.840.113549.1.1.12': 'sha384', '1.2.840.113549.1.1.13': 'sha512',
};
const MESSAGE_DIGEST_OID = '1.2.840.113549.1.9.4';

/**
 * Checks the CMS signature with Node's crypto (pkijs's own verifier rejects
 * some valid ECDSA P-384 tokens): the signed attributes must contain the hash
 * of the TSTInfo, and the signature over those attributes must verify with
 * one of the certificates embedded in the token.
 */
function verifySignature(signed: pkijs.SignedData, tstInfo: Uint8Array): boolean {
  try {
    const signer = signed.signerInfos[0];
    const digestAlg = HASH_BY_OID[signer.digestAlgorithm.algorithmId];
    const sigAlg = HASH_BY_OID[signer.signatureAlgorithm.algorithmId] ?? digestAlg;
    if (!digestAlg || !sigAlg || !signer.signedAttrs) return false;

    const mdAttr = signer.signedAttrs.attributes.find(a => a.type === MESSAGE_DIGEST_OID);
    const md = mdAttr?.values[0] as asn1js.OctetString | undefined;
    if (!md || hex(md.valueBlock.valueHexView) !== createHash(digestAlg).update(tstInfo).digest('hex')) return false;

    // Signed attributes are signed as a DER SET (tag 0x31), not the [0] tag used in the structure.
    const attrs = new Uint8Array(signer.signedAttrs.encodedValue.slice(0));
    attrs[0] = 0x31;
    const signature = new Uint8Array(signer.signature.valueBlock.valueHexView);
    return (signed.certificates ?? []).some(c => {
      if (!(c instanceof pkijs.Certificate)) return false;
      const cert = new X509Certificate(Buffer.from(c.toSchema().toBER()));
      try {
        return cryptoVerify(sigAlg, attrs, cert.publicKey, signature);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/** Parses a TimeStampToken (CMS SignedData) and checks its signature. */
export async function inspectToken(token: Uint8Array): Promise<TokenInfo> {
  const contentInfo = pkijs.ContentInfo.fromBER(toArrayBuffer(token));
  const signed = new pkijs.SignedData({ schema: contentInfo.content });
  const eContent = signed.encapContentInfo.eContent;
  if (!eContent) throw new Error('Timestamp token has no content.');
  const tst = pkijs.TSTInfo.fromBER(eContent.getValue());
  const signatureValid = verifySignature(signed, new Uint8Array(eContent.getValue()));
  return {
    genTime: tst.genTime,
    digestHex: hex(tst.messageImprint.hashedMessage.valueBlock.valueHexView),
    nonceHex: tst.nonce ? hex(tst.nonce.valueBlock.valueHexView) : null,
    serialHex: hex(tst.serialNumber.valueBlock.valueHexView),
    policy: tst.policy,
    signatureValid,
  };
}

/** Requests a timestamp for a SHA-256 digest (hex). Returns the DER token. */
export async function requestTimestamp(digestHex: string, url: string): Promise<{ token: Uint8Array; info: TokenInfo }> {
  if (!/^[0-9a-f]{64}$/i.test(digestHex)) throw new Error('Expected a SHA-256 digest in hex.');
  const nonce = randomBytes(8);
  nonce[0] &= 0x7f; // keep the INTEGER positive
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/timestamp-query' },
    body: Buffer.from(buildRequest(digestHex, nonce)),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Timestamp authority returned HTTP ${res.status}.`);
  const resp = pkijs.TimeStampResp.fromBER(await res.arrayBuffer());
  const status = resp.status.status;
  if (status !== 0 && status !== 1) throw new Error(`Timestamp authority refused the request (status ${status}).`);
  if (!resp.timeStampToken) throw new Error('Timestamp authority returned no token.');
  const token = new Uint8Array(resp.timeStampToken.toSchema().toBER());
  const info = await inspectToken(token);
  if (info.digestHex.toLowerCase() !== digestHex.toLowerCase()) throw new Error('Timestamp token is for a different digest.');
  if (info.nonceHex !== null && BigInt(`0x${info.nonceHex}`) !== BigInt(`0x${hex(nonce)}`)) throw new Error('Timestamp token nonce does not match.');
  if (!info.signatureValid) throw new Error('Timestamp token signature is invalid.');
  return { token, info };
}
