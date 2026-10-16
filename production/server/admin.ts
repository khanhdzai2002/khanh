import { pool, transaction, audit } from "./db";
import { roles } from "../shared/domain";
import { configuredTenantKey } from "./config";
// Out-of-band bootstrap, never creates a shared identity. User must log in with Lark first.
const [openId, role] = process.argv.slice(2);
if (!openId || !roles.includes(role as any) || !configuredTenantKey())
  throw Error(
    "Usage: npm run admin -- <Lark open_id> <role>; configure LARK_TENANT_KEY first",
  );
await transaction(async (db) => {
  const r = await db.query(
    "UPDATE users SET role=$1,version=version+1 WHERE open_id=$2 AND tenant_key=$3 RETURNING id",
    [role, openId, configuredTenantKey()],
  );
  if (r.rowCount !== 1) throw Error("User must sign in first");
  await audit(db, r.rows[0].id, "admin.bootstrap", r.rows[0].id, {
    role,
    source: "Operator CLI",
  });
});
console.log("Role updated");
await pool.end();
