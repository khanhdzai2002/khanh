import { audit, type DB } from "./db";
import { configuredTenantKey } from "./config";

export async function initialAdminStatus(db: DB, userId: string) {
  const user = (
    await db.query(
      "SELECT id,name,role,open_id,tenant_key,disabled FROM users WHERE id=$1",
      [userId],
    )
  ).rows[0];
  if (!user) return null;
  const state = (
    await db.query(`SELECT
    EXISTS(SELECT 1 FROM users WHERE role='Administrator') AS has_admin,
    EXISTS(SELECT 1 FROM activity_logs WHERE action='admin.bootstrap.initial') AS used`)
  ).rows[0];
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    openId: user.open_id,
    tenantKey: user.tenant_key,
    hasAdministrator: state.has_admin,
    bootstrapUsed: state.used,
    bootstrapEligible:
      !user.disabled &&
      !state.has_admin &&
      !state.used &&
      user.tenant_key === configuredTenantKey() &&
      !!process.env.LARK_INITIAL_ADMIN_OPEN_ID?.trim() &&
      user.open_id === process.env.LARK_INITIAL_ADMIN_OPEN_ID.trim(),
  };
}

// Called only inside a transaction. No role or target identity comes from the browser.
export async function bootstrapInitialAdmin(db: DB, userId: string) {
  await db.query(
    "SELECT pg_advisory_xact_lock(hashtext('comsflow:initial-admin'))",
  );
  const account = await initialAdminStatus(db, userId);
  if (!account?.bootstrapEligible) return false;
  const updated = await db.query(
    "UPDATE users SET role='Administrator' WHERE id=$1 AND NOT disabled RETURNING id",
    [userId],
  );
  if (updated.rowCount !== 1) return false;
  await audit(db, userId, "admin.bootstrap.initial", userId, {
    source:
      "Hosting operator configured LARK_INITIAL_ADMIN_OPEN_ID; selected user confirmed in their session",
    before: { role: account.role },
    after: { role: "Administrator" },
  });
  return true;
}
