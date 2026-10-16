import pg from "pg";
import "./config";
import { randomUUID } from "node:crypto";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});
export type DB = Pick<pg.PoolClient, "query">;
export async function transaction<T>(
  fn: (db: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const value = await fn(db);
    await db.query("COMMIT");
    return value;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function audit(
  db: DB,
  actor: string,
  action: string,
  id: string,
  details: unknown,
) {
  await db.query("INSERT INTO activity_logs VALUES($1,$2,now(),$3,$4,$5)", [
    randomUUID(),
    actor,
    action,
    id,
    JSON.stringify(details),
  ]);
}
