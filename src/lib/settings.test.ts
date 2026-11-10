import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows: { key: string; value: string; updatedBy: string }[] = [];
vi.mock('@/db/prisma', () => ({
  prisma: {
    appSetting: {
      findMany: async () => rows,
      upsert: async ({ where, create, update }: { where: { key: string }; create: { key: string; value: string; updatedBy: string }; update: { value: string } }) => {
        const r = rows.find(x => x.key === where.key);
        if (r) r.value = update.value; else rows.push(create);
      },
      deleteMany: async ({ where }: { where: { key: string } }) => { const i = rows.findIndex(x => x.key === where.key); if (i >= 0) rows.splice(i, 1); },
    },
  },
}));

const { getSettings, saveSettings, settingsView } = await import('./settings');

describe('settings', () => {
  beforeEach(() => {
    rows.length = 0;
    process.env.CONTROLLAYER_SECRET_KEY = 'settings-test-key';
    delete process.env.ORGANIZATION_NAME;
  });

  it('falls back to the environment, and saved values win', async () => {
    process.env.ORGANIZATION_NAME = 'From Env';
    await saveSettings({}, 'x'); // clears the cache
    expect((await settingsView()).sources.organizationName).toBe('environment');
    expect((await getSettings()).organizationName).toBe('From Env');
    await saveSettings({ organizationName: 'Acme Inc' }, 'admin@acme.example');
    expect((await getSettings()).organizationName).toBe('Acme Inc');
    expect((await settingsView()).sources.organizationName).toBe('app');
  });

  it('stores the API key encrypted and never exposes it in the view', async () => {
    await saveSettings({ assistantApiKey: 'sk-ant-test-1234567890abcd' }, 'admin');
    expect(rows.find(r => r.key === 'assistantApiKey')?.value).not.toContain('sk-ant');
    expect((await getSettings()).assistantApiKey).toBe('sk-ant-test-1234567890abcd');
    const view = await settingsView();
    expect(view.assistant).toEqual({ configured: true, keyHint: '…abcd', model: null });
    expect(JSON.stringify(view)).not.toContain('sk-ant');
    await saveSettings({ assistantApiKey: null }, 'admin');
    expect((await settingsView()).assistant.configured).toBe(false);
  });
});
