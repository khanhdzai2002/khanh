// Dedicated synthetic database only. Never run UI smoke tests against production.
import "./setup";
process.env.PUBLIC_URL = "http://localhost:5175";
process.env.PORT = "3002";
process.env.NODE_ENV = "development";
const { pool } = await import("../server/db");
const { migrate } = await import("../server/migrate");
await migrate();
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
  throw Error("Unsafe database");
await pool.query(
  "TRUNCATE users,products,suppliers,planning_policies,session CASCADE",
);
await pool.query(
  `INSERT INTO planning_policies VALUES(1,'{"targetDays":5,"leadDays":3,"safeDays":0,"includeLead":false,"roundTo":1}',1)`,
);
await import("../server/index");
