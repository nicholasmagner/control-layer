import { describe, it, expect, vi } from 'vitest';

// No API key saved in Settings.
vi.mock('@/lib/settings', () => ({ getSettings: async () => ({ assistantApiKey: null, assistantModel: null }) }));
import { sanitizeContext } from './engine';

describe('sanitizeContext', () => {
  it('redacts keys that look like secrets, regardless of nesting', () => {
    const result = sanitizeContext({
      username: 'bob',
      apiKey: 'sk-ant-should-not-leak',
      nested: { password: 'hunter2', ok: 'fine' },
    }) as Record<string, unknown>;

    expect(result.username).toBe('bob');
    expect(result.apiKey).toBe('[redacted]');
    expect((result.nested as Record<string, unknown>).password).toBe('[redacted]');
    expect((result.nested as Record<string, unknown>).ok).toBe('fine');
  });

  it('caps array length so a large table can not blow out the context window', () => {
    const input = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const result = sanitizeContext(input) as unknown[];
    expect(result.length).toBe(20);
  });

  it('bottoms out recursion instead of stack-overflowing on deeply nested input', () => {
    let deep: unknown = 'leaf';
    for (let i = 0; i < 20; i++) deep = { child: deep };
    expect(() => sanitizeContext(deep)).not.toThrow();
  });

  it('leaves primitives untouched', () => {
    expect(sanitizeContext('hello')).toBe('hello');
    expect(sanitizeContext(42)).toBe(42);
    expect(sanitizeContext(null)).toBe(null);
  });
});

describe('Assistant when no API key is configured', () => {
  it('generateExplanation degrades to a deterministic message instead of throwing', async () => {
    const { Assistant } = await import('./engine');
    const result = await Assistant.generateExplanation('CC6.1', [{ a: 1 }], [{ b: 2 }]);
    expect(result).toContain('not configured');
    expect(result).toContain('Settings');
  });

  it('chat degrades to a deterministic message instead of throwing', async () => {
    const { Assistant } = await import('./engine');
    const result = await Assistant.chat([{ role: 'user', content: 'hello' }], { findings: [] });
    expect(result).toContain('not configured');
  });

  it('chat with no messages returns a fallback rather than calling the model', async () => {
    const { Assistant } = await import('./engine');
    const result = await Assistant.chat([], {});
    expect(result).toContain('not configured');
  });
});
