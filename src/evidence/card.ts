import { readFileSync } from 'node:fs';
import path from 'node:path';
import satori from 'satori';
import sharp from 'sharp';

/**
 * Evidence cards: screenshot-style PNG images rendered from scan data.
 *
 * Each card shows what an auditor looks for in a screenshot (system, account,
 * date and time with time zone, the full result list, who collected it) and
 * carries the SHA-256 of the raw data record it was drawn from, so the image
 * can be traced back to the machine-readable evidence. Cards are labeled as
 * generated from API data; they never imitate a console screenshot.
 */

export interface CardRow {
  resource: string;
  status: 'pass' | 'fail';
  message: string;
}

export interface CardInput {
  organization: string;
  provider: string;
  account: string;
  checkTitle: string;
  checkDescription: string;
  dataSource: string;
  capturedAt: Date;
  collectedBy: string;
  controls: string[];
  rows: CardRow[];
  /** SHA-256 of the data record (scan result JSON) this card was rendered from. */
  dataFingerprint: string;
  runId: string;
  reason: string;
  appVersion: string;
}

export const MAX_CARD_ROWS = 60;
const WIDTH = 1600;

type Node = { type: string; props: { style?: Record<string, unknown>; children?: unknown } };
const h = (style: Record<string, unknown>, ...children: unknown[]): Node => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children: children.length === 1 ? children[0] : children },
});

let fonts: { name: string; data: Buffer; weight: 400 | 600 | 700; style: 'normal' }[] | null = null;
function loadFonts() {
  if (!fonts) {
    const dir = path.join(process.cwd(), 'assets', 'fonts');
    fonts = ([400, 600, 700] as const).map(weight => ({
      name: 'Inter', weight, style: 'normal' as const,
      data: readFileSync(path.join(dir, `inter-latin-${weight}-normal.woff`)),
    }));
  }
  return fonts;
}

/** UTC with the offset spelled out, e.g. "2026-11-05 20:43:12 UTC". */
export function formatUtc(d: Date) {
  return `${d.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function buildTree(c: CardInput): Node {
  const failing = c.rows.filter(r => r.status === 'fail').length;
  const passing = c.rows.length - failing;
  const overall = c.rows.length === 0 ? 'NO RESOURCES' : failing ? 'FAILING' : 'PASSING';
  const overallColor = c.rows.length === 0 ? '#94a3b8' : failing ? '#f87171' : '#34d399';
  const shown = c.rows.slice(0, MAX_CARD_ROWS);

  const label = (text: string) => h({ fontSize: 15, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600 }, text);
  const value = (text: string, extra: Record<string, unknown> = {}) => h({ fontSize: 22, color: '#e2e8f0', ...extra }, text);
  const meta = (l: string, v: string, width = '25%') => h({ flexDirection: 'column', width, gap: 6, paddingRight: 24 }, label(l), value(v));

  return h(
    { flexDirection: 'column', width: WIDTH, backgroundColor: '#0b1220', fontFamily: 'Inter', color: '#e2e8f0' },
    // Banner
    h({ justifyContent: 'space-between', alignItems: 'center', padding: '22px 48px', backgroundColor: '#0f172a', borderBottom: '2px solid #1e293b' },
      h({ fontSize: 26, fontWeight: 700, color: '#38bdf8' }, 'ControlLayer · Evidence record'),
      h({ fontSize: 16, color: '#94a3b8', fontWeight: 600, letterSpacing: 1 }, 'SYSTEM-GENERATED FROM CLOUD API DATA · READ-ONLY'),
    ),
    // Title
    h({ flexDirection: 'column', padding: '36px 48px 8px', gap: 10 },
      h({ alignItems: 'center', gap: 20 },
        h({ fontSize: 40, fontWeight: 700, color: '#f8fafc' }, c.checkTitle),
        h({ fontSize: 20, fontWeight: 700, color: overallColor, border: `2px solid ${overallColor}`, borderRadius: 8, padding: '4px 14px' }, overall),
      ),
      h({ fontSize: 21, color: '#94a3b8' }, clip(c.checkDescription, 190)),
    ),
    // Metadata grid
    h({ flexWrap: 'wrap', padding: '24px 48px', rowGap: 22 },
      meta('Organization', clip(c.organization, 40)),
      meta('Cloud', c.provider),
      meta('Account / project', clip(c.account, 40)),
      meta('Captured', formatUtc(c.capturedAt)),
      meta('Data source', clip(c.dataSource, 80), '50%'),
      meta('Collected by', clip(c.collectedBy, 40)),
      meta('Result', `${passing} passing · ${failing} failing`),
    ),
    // Table
    h({ flexDirection: 'column', margin: '8px 48px', border: '1px solid #1e293b', borderRadius: 12 },
      h({ backgroundColor: '#111a2e', padding: '14px 20px', fontSize: 15, color: '#64748b', fontWeight: 600, letterSpacing: 1.5 },
        h({ width: 470 }, 'RESOURCE'), h({ width: 120 }, 'RESULT'), h({ flexGrow: 1 }, 'DETAIL'),
      ),
      ...(shown.length
        ? shown.map((r, i) => h({ padding: '12px 20px', fontSize: 19, borderTop: '1px solid #1e293b', backgroundColor: i % 2 ? '#0d1526' : '#0b1220' },
          h({ width: 470, color: '#e2e8f0', paddingRight: 16 }, clip(r.resource, 44)),
          h({ width: 120, fontWeight: 700, color: r.status === 'pass' ? '#34d399' : '#f87171' }, r.status === 'pass' ? 'PASS' : 'FAIL'),
          h({ flexGrow: 1, width: 900, color: '#cbd5e1' }, clip(r.message, 95)),
        ))
        : [h({ padding: '18px 20px', fontSize: 19, color: '#94a3b8', borderTop: '1px solid #1e293b' }, 'No resources of this type were found in the account.')]),
      ...(c.rows.length > shown.length
        ? [h({ padding: '12px 20px', fontSize: 17, color: '#94a3b8', borderTop: '1px solid #1e293b' }, `+ ${c.rows.length - shown.length} more resources: full list in the data record below.`)]
        : []),
    ),
    // Controls
    h({ padding: '22px 48px 8px', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
      h({ fontSize: 15, color: '#64748b', fontWeight: 600, letterSpacing: 1.5, marginRight: 8 }, 'SUPPORTS CONTROLS'),
      ...c.controls.map(ctl => h({ fontSize: 17, color: '#7dd3fc', backgroundColor: '#0c2a43', borderRadius: 6, padding: '4px 10px' }, ctl)),
    ),
    // Footer
    h({ flexDirection: 'column', gap: 6, margin: '24px 0 0', padding: '22px 48px 28px', backgroundColor: '#0f172a', borderTop: '2px solid #1e293b', fontSize: 16, color: '#94a3b8' },
      h({}, `Data record SHA-256: ${c.dataFingerprint}`),
      h({}, `Scan run ${c.runId} · ${c.reason} · ControlLayer ${c.appVersion}`),
      h({}, 'This image is rendered from the data record with the fingerprint above, which is stored in the same evidence library and audit package.'),
    ),
  );
}

export async function renderEvidenceCard(input: CardInput): Promise<Uint8Array> {
  // satori accepts plain element objects; the cast avoids pulling in React types here.
  const svg = await satori(buildTree(input) as unknown as Parameters<typeof satori>[0], { width: WIDTH, fonts: loadFonts() });
  return new Uint8Array(await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer());
}
