import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Client } from 'pg';

/**
 * Applies prisma/migrations/<name>/migration.sql files in order and records
 * them in Prisma's own `_prisma_migrations` table, so a database created by
 * the desktop app stays compatible with `prisma migrate deploy` (Docker/server
 * installs) and vice versa. The desktop app ships without the Prisma CLI.
 */
export async function applyMigrations(client: Client, migrationsDir: string, log: (m: string) => void) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )`);

  const applied = new Set(
    (await client.query<{ migration_name: string }>(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    )).rows.map(r => r.migration_name),
  );

  const names = readdirSync(migrationsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(path.join(migrationsDir, d.name, 'migration.sql')))
    .map(d => d.name)
    .sort();

  let count = 0;
  for (const name of names) {
    if (applied.has(name)) continue;
    const sql = readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const id = randomUUID();
    log(`Applying database migration ${name}`);
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count) VALUES ($1, $2, $3, now(), 0)`,
        [id, checksum, name],
      );
      await client.query(sql);
      await client.query(`UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1`, [id]);
      await client.query('COMMIT');
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Database migration ${name} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return count;
}
