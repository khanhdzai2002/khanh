import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type DB, audit } from "./db";
import { AppError, roles } from "../shared/domain";

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    openId: z
      .string()
      .trim()
      .min(3)
      .max(256)
      .regex(
        /^[A-Za-z0-9_-]+$/,
        "Open ID không được có khoảng trắng hoặc dấu nháy",
      ),
    role: z.enum(roles).default("Viewer"),
  })
  .strict();
const updateSchema = z
  .object({
    role: z.enum(roles),
    disabled: z.boolean(),
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

async function administrator(db: DB, actorId: string, lock = false) {
  if (lock)
    await db.query("SELECT pg_advisory_xact_lock(hashtext('comsflow:roles'))");
  const actor = (
    await db.query(
      "SELECT id,tenant_key,role,disabled FROM users WHERE id=$1" +
        (lock ? " FOR UPDATE" : ""),
      [actorId],
    )
  ).rows[0];
  if (!actor || actor.disabled || actor.role !== "Administrator")
    throw new AppError(
      403,
      "Chỉ Administrator đang hoạt động được quản lý tài khoản",
    );
  return actor;
}
export async function listUsers(db: DB, actorId: string) {
  const actor = await administrator(db, actorId);
  return (
    await db.query(
      `SELECT u.id,u.name,u.role,u.disabled,u.open_id,u.tenant_key,u.version,
    (SELECT max(a.at) FROM activity_logs a WHERE a.actor_id=u.id AND a.action='auth.lark.login') AS last_login_at
    FROM users u WHERE u.tenant_key=$1 ORDER BY u.name,u.id`,
      [actor.tenant_key],
    )
  ).rows;
}
// Mutation functions must run in a transaction; the global role lock also protects
// against simultaneous demotions of the last active administrators.
export async function createUser(db: DB, actorId: string, raw: unknown) {
  const input = createSchema.parse(raw);
  const actor = await administrator(db, actorId, true);
  const user = (
    await db.query(
      `INSERT INTO users(id,tenant_key,open_id,name,role)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_key,open_id) DO NOTHING RETURNING id,name,role,disabled,open_id,version`,
      [randomUUID(), actor.tenant_key, input.openId, input.name, input.role],
    )
  ).rows[0];
  if (!user)
    throw new AppError(
      409,
      "Open ID này đã có trong COMS-FLOW. Tìm thành viên trong danh sách để thiết lập quyền, không thêm lại.",
    );
  await audit(db, actorId, "user.create", user.id, {
    after: {
      name: user.name,
      openId: user.open_id,
      role: user.role,
      disabled: false,
    },
    source: "COMS-FLOW account setup; Lark identity verified on sign-in",
  });
  return user;
}
export async function updateUser(
  db: DB,
  actorId: string,
  id: string,
  raw: unknown,
) {
  const input = updateSchema.parse(raw);
  const actor = await administrator(db, actorId, true);
  const old = (
    await db.query(
      "SELECT * FROM users WHERE id=$1 AND tenant_key=$2 FOR UPDATE",
      [id, actor.tenant_key],
    )
  ).rows[0];
  if (!old)
    throw new AppError(404, "Không tìm thấy thành viên trong tổ chức của bạn");
  if (old.version !== input.expectedVersion)
    throw new AppError(409, "Quyền tài khoản đã được người khác cập nhật");
  if (
    old.role === "Administrator" &&
    !old.disabled &&
    (input.disabled || input.role !== "Administrator")
  ) {
    const others = await db.query(
      "SELECT 1 FROM users u WHERE tenant_key=$1 AND role='Administrator' AND NOT disabled AND id<>$2 AND EXISTS(SELECT 1 FROM activity_logs a WHERE a.actor_id=u.id AND a.action='auth.lark.login')",
      [actor.tenant_key, id],
    );
    if (!others.rowCount)
      throw new AppError(
        409,
        "Không thể gỡ hoặc khóa quản trị viên cuối cùng. Cần một Administrator khác đã đăng nhập Lark thành công.",
      );
  }
  if (old.role === input.role && old.disabled === input.disabled)
    throw new AppError(400, "Chưa có thay đổi quyền hoặc trạng thái truy cập");
  await db.query(
    "UPDATE users SET role=$2,disabled=$3,version=version+1 WHERE id=$1",
    [id, input.role, input.disabled],
  );
  let revoked = 0;
  if (input.disabled)
    revoked =
      (await db.query("DELETE FROM session WHERE sess->>'userId'=$1", [id]))
        .rowCount || 0;
  await audit(db, actorId, "user.update", id, {
    reason: input.reason,
    before: { role: old.role, disabled: old.disabled, version: old.version },
    after: {
      role: input.role,
      disabled: input.disabled,
      version: old.version + 1,
    },
    revokedSessions: revoked,
  });
  return { ok: true, version: old.version + 1 };
}
export async function userAccessHistory(db: DB, actorId: string) {
  const actor = await administrator(db, actorId);
  return (
    await db.query(
      `SELECT a.id,a.at,a.action,a.details,actor.name AS actor,target.name AS member
    FROM activity_logs a JOIN users actor ON actor.id=a.actor_id JOIN users target ON target.id::text=a.entity_id
    WHERE target.tenant_key=$1 AND a.action IN ('user.create','user.update','admin.bootstrap.initial','admin.bootstrap')
    ORDER BY a.at DESC,a.id LIMIT 200`,
      [actor.tenant_key],
    )
  ).rows;
}
