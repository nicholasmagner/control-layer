import { describe, expect, it } from 'vitest';
import { getControlDef } from '@/frameworks';
import { renderMarkdown } from './markdown';
import { parsePeopleCsv, publishedText } from './service';
import { POLICY_TEMPLATES, renderTemplate } from './templates';

describe('policy templates', () => {
  it('map only to controls that exist', () => {
    for (const t of POLICY_TEMPLATES) {
      expect(t.controls.length).toBeGreaterThan(0);
      for (const key of t.controls) {
        const [fw, id] = key.split(':');
        expect(getControlDef(fw, id), `${t.slug} -> ${key}`).toBeDefined();
      }
    }
  });

  it('have unique slugs and fill every placeholder but the effective date', () => {
    expect(new Set(POLICY_TEMPLATES.map(t => t.slug)).size).toBe(POLICY_TEMPLATES.length);
    for (const t of POLICY_TEMPLATES) {
      const text = renderTemplate(t.body, { organization: 'Acme', owner: 'the CTO', effectiveDate: '{{effective_date}}', reviewIntervalDays: 365 });
      expect(text.replaceAll('{{effective_date}}', '')).not.toMatch(/\{\{/);
      expect(text).toContain('Acme');
    }
  });

  it('fills the effective date on publish', () => {
    expect(publishedText('Effective {{effective_date}}', new Date('2026-03-04T10:00:00Z'))).toBe('Effective 2026-03-04');
  });
});

describe('renderMarkdown', () => {
  it('escapes HTML so policy text cannot inject markup', () => {
    const html = renderMarkdown('# Hi <script>alert(1)</script>\n\nText <img src=x onerror=alert(1)> **bold**');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('renders headings, lists and tables', () => {
    const html = renderMarkdown('## Scope\n- one\n- two\n\n1. first\n2. second\n\n| A | B |\n| :--- | --- |\n| x | y |');
    expect(html).toContain('<h2>Scope</h2>');
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(html).toContain('<ol><li>first</li><li>second</li></ol>');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>y</td>');
  });
});

describe('parsePeopleCsv', () => {
  it('reads common column names, quotes and skips bad rows', () => {
    const { people, errors } = parsePeopleCsv('Full Name,Work Email,Job Title,GitHub,Start Date\n"Smith, Jane",JANE@x.com,CTO,@jane,2024-03-01\nBob,not-an-email,,,\n');
    expect(people).toEqual([{ name: 'Smith, Jane', email: 'jane@x.com', title: 'CTO', githubUsername: 'jane', startDate: new Date('2024-03-01') }]);
    expect(errors).toHaveLength(1);
  });

  it('requires name and email columns', () => {
    expect(() => parsePeopleCsv('first,last\na,b')).toThrow(/name/);
  });
});
