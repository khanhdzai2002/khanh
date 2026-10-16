import { readFile, readdir } from "node:fs/promises";
import { pool, transaction } from "./db";
export async function migrate() {
  await transaction(async (db) => {
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtext('comsflow:migrations'))",
    );
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const file of (
      await readdir(new URL("../migrations/", import.meta.url))
    )
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      const old = await db.query(
        "SELECT 1 FROM schema_migrations WHERE name=$1",
        [file],
      );
      if (!old.rowCount) {
        await db.query(
          await readFile(
            new URL("../migrations/" + file, import.meta.url),
            "utf8",
          ),
        );
        await db.query("INSERT INTO schema_migrations(name) VALUES($1)", [
          file,
        ]);
        console.log("Applied migration", file);
      }
    }
  });
}
if (process.argv[1]?.endsWith("migrate.ts")) {
  await migrate();
  await pool.end();
}
