import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, transaction } from "../server/db";
import { migrate } from "../server/migrate";
import {
  initialAdminStatus,
  bootstrapInitialAdmin,
} from "../server/initial-admin";
import { makeApp } from "../server/app";
const tenant = "synthetic-bootstrap-tenant";
const beforeEnv = {
  tenant: process.env.LARK_TENANT_KEY,
  target: process.env.LARK_INITIAL_ADMIN_OPEN_ID,
};
beforeAll(async () => {
  await migrate();
});
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("Unsafe database");
  await pool.query(
    "TRUNCATE users,products,suppliers,planning_policies,session CASCADE",
  );
  process.env.LARK_TENANT_KEY = tenant;
  delete process.env.LARK_INITIAL_ADMIN_OPEN_ID;
});
afterEach(() => {
  if (beforeEnv.tenant === undefined) delete process.env.LARK_TENANT_KEY;
  else process.env.LARK_TENANT_KEY = beforeEnv.tenant;
  if (beforeEnv.target === undefined)
    delete process.env.LARK_INITIAL_ADMIN_OPEN_ID;
  else process.env.LARK_INITIAL_ADMIN_OPEN_ID = beforeEnv.target;
});
afterAll(async () => {
  await pool.end();
});
async function person(
  extra: { tenant?: string; disabled?: boolean; role?: string } = {},
) {
  const u = { id: randomUUID(), openId: "synthetic-open-" + randomUUID() };
  await pool.query(
    "INSERT INTO users(id,tenant_key,open_id,name,role,disabled) VALUES($1,$2,$3,$4,$5,$6)",
    [
      u.id,
      extra.tenant || tenant,
      u.openId,
      "Synthetic bootstrap person",
      extra.role || "Viewer",
      extra.disabled || false,
    ],
  );
  return u;
}
const attempt = (id: string) =>
  transaction((db) => bootstrapInitialAdmin(db, id));
it("chưa cấu hình danh tính thì Viewer không tự nâng quyền", async () => {
  const u = await person();
  expect(await attempt(u.id)).toBe(false);
  expect((await initialAdminStatus(pool, u.id))?.role).toBe("Viewer");
});
it("chỉ đúng Open ID và tenant được cấu hình mới đủ điều kiện", async () => {
  const u = await person();
  process.env.LARK_INITIAL_ADMIN_OPEN_ID = "someone-else";
  expect(await attempt(u.id)).toBe(false);
  process.env.LARK_INITIAL_ADMIN_OPEN_ID = u.openId;
  process.env.LARK_TENANT_KEY = "another-tenant";
  expect(await attempt(u.id)).toBe(false);
});
it("không mở khóa hoặc nâng quyền user disabled", async () => {
  const u = await person({ disabled: true });
  process.env.LARK_INITIAL_ADMIN_OPEN_ID = u.openId;
  expect(await attempt(u.id)).toBe(false);
  expect(
    (await pool.query("SELECT disabled,role FROM users WHERE id=$1", [u.id]))
      .rows[0],
  ).toMatchObject({ disabled: true, role: "Viewer" });
});
it("đã có Administrator, kể cả bị khóa, thì không bootstrap thêm", async () => {
  await person({ role: "Administrator", disabled: true });
  const u = await person();
  process.env.LARK_INITIAL_ADMIN_OPEN_ID = u.openId;
  expect(await attempt(u.id)).toBe(false);
});
it("hai yêu cầu đồng thời chỉ cấp quyền và ghi audit đúng một lần", async () => {
  const u = await person();
  process.env.LARK_INITIAL_ADMIN_OPEN_ID = " " + u.openId + " ";
  expect((await Promise.all([attempt(u.id), attempt(u.id)])).sort()).toEqual([
    false,
    true,
  ]);
  const account = await initialAdminStatus(pool, u.id);
  expect(account?.role).toBe("Administrator");
  const audit = (
    await pool.query(
      "SELECT details FROM activity_logs WHERE action='admin.bootstrap.initial'",
    )
  ).rows;
  expect(audit).toHaveLength(1);
  expect(audit[0].details.before.role).toBe("Viewer");
  expect(audit[0].details.after.role).toBe("Administrator");
});
it("đã dùng bootstrap thì không tái dùng sau khi hạ quyền", async () => {
  const u = await person();
  process.env.LARK_INITIAL_ADMIN_OPEN_ID = u.openId;
  expect(await attempt(u.id)).toBe(true);
  await pool.query("UPDATE users SET role='Viewer' WHERE id=$1", [u.id]);
  expect(await attempt(u.id)).toBe(false);
});
it("HTTP chỉ xem danh tính của mình; bootstrap cần phiên, CSRF, đúng người và body không chọn user/role", async () => {
  const chosen = await person(),
    other = await person();
  process.env.LARK_INITIAL_ADMIN_OPEN_ID = chosen.openId;
  let selected = other.id;
  const app = makeApp();
  // Route exists only in this isolated test server to create normal signed sessions.
  app.get("/synthetic-test-session", (req, res) => {
    req.session.userId = selected;
    req.session.csrf = "synthetic-test-csrf";
    res.json({ ok: true });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((ok) => server.once("listening", ok));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  async function login() {
    const r = await fetch(base + "/synthetic-test-session");
    return r.headers.get("set-cookie")!.split(";")[0];
  }
  const post = (
    cookie: string,
    body: unknown = {},
    csrf = "synthetic-test-csrf",
  ) =>
    fetch(base + "/api/admin/bootstrap", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: process.env.PUBLIC_URL!,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify(body),
    });
  try {
    expect((await fetch(base + "/api/account")).status).toBe(401);
    const otherCookie = await login();
    const own = await (
      await fetch(base + "/api/account", { headers: { Cookie: otherCookie } })
    ).json();
    expect(own.openId).toBe(other.openId);
    expect(own.bootstrapEligible).toBe(false);
    expect((await post(otherCookie)).status).toBe(403);
    selected = chosen.id;
    const cookie = await login();
    expect((await post(cookie, {}, "wrong")).status).toBe(403);
    expect(
      (await post(cookie, { userId: other.id, role: "Administrator" })).status,
    ).toBe(400);
    expect((await post(cookie)).status).toBe(200);
    expect((await post(cookie)).status).toBe(403);
    expect(
      (
        await (
          await fetch(base + "/api/me", { headers: { Cookie: cookie } })
        ).json()
      ).user.role,
    ).toBe("Administrator");
    expect((await initialAdminStatus(pool, other.id))?.role).toBe("Viewer");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});
