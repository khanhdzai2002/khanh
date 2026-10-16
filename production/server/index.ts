import "./db";
import { makeApp } from "./app";
import { pool } from "./db";
import { migrate } from "./migrate";

// Some hosts do not load the monorepo pre-deploy hook. Never accept requests
// until the same locked, versioned migrations have completed successfully.
try {
  if (!process.env.DATABASE_URL) {
    throw Object.assign(new Error("DATABASE_URL is required"), {
      code: "DATABASE_URL_MISSING",
    });
  }
  console.log("Preparing PostgreSQL migrations");
  await migrate();
  console.log("PostgreSQL migrations ready");
} catch (error) {
  // Do not log the original exception: it may contain a connection URI/password.
  const rawCode = (error as { code?: unknown })?.code;
  const code =
    typeof rawCode === "string" && /^[A-Z0-9_]{1,32}$/.test(rawCode)
      ? rawCode
      : "DATABASE_STARTUP_FAILED";
  console.error("PostgreSQL startup failed", {
    code,
    action:
      "Check Postgres status and DATABASE_URL reference in Railway Variables; migrations must succeed before startup.",
  });
  await pool.end();
  process.exit(1);
}
const server = makeApp().listen(
  Number(process.env.PORT || 3001),
  process.env.HOST ||
    (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
  () =>
    console.log("COMS-FLOW API listening on port", process.env.PORT || 3001),
);
const stop = () => server.close(() => void pool.end());
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
