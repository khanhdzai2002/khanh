import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, transaction, audit } from "../server/db";
import { migrate } from "../server/migrate";
import {
  createUser,
  updateUser,
  listUsers,
  userAccessHistory,
} from "../server/users";
import { roles } from "../shared/domain";
import { makeApp } from "../server/app";
const tenant = "synthetic-account-management";
let adminId: string;
beforeAll(async () => {
  await migrate();
});
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("Unsafe database");
  await pool.query(
    "TRUNCATE users,products,suppliers,planning_policies,session CASCADE",
  );
  adminId = await seed("Administrator");
});
afterAll(async () => {
  await pool.end();
});
async function seed(role = "Viewer", org = tenant, loggedIn = true) {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1,$2,$3,$4,$5)",
    [
      id,
      org,
      "ou_synthetic_" + id.replaceAll("-", ""),
      "Synthetic " + role,
      role,
    ],
  );
  if (loggedIn)
    await transaction((db) => audit(db, id, "auth.lark.login", id, {}));
  return id;
}
const create = (body: unknown, actor = adminId) =>
  transaction((db) => createUser(db, actor, body));
const change = (id: string, body: unknown, actor = adminId) =>
  transaction((db) => updateUser(db, actor, id, body));
const input = (role = "Viewer", extra = {}) => ({
  name: "Synthetic added person",
  openId: "ou_synthetic_" + randomUUID().replaceAll("-", ""),
  role,
  ...extra,
});
const update = (role = "Production Planner", extra = {}) => ({
  role,
  disabled: false,
  expectedVersion: 1,
  reason: "Synthetic role assignment",
  ...extra,
});
it("Administrator thêm thành viên với 5 vai trò, đúng tenant và có audit, chưa giả định đã đăng nhập", async () => {
  for (const role of roles) {
    const u = await create(input(role));
    expect(u.role).toBe(role);
    expect(u.version).toBe(1);
    const row = (await listUsers(pool, adminId)).find((x) => x.id === u.id);
    expect(row.tenant_key).toBe(tenant);
    expect(row.last_login_at).toBeNull();
  }
  expect(
    (await userAccessHistory(pool, adminId)).filter(
      (x) => x.action === "user.create",
    ),
  ).toHaveLength(5);
});
it("các vai trò không phải Admin không tự thêm tài khoản hoặc xem danh sách", async () => {
  for (const role of roles.filter((r) => r !== "Administrator")) {
    const id = await seed(role);
    await expect(create(input("Administrator"), id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(listUsers(pool, id)).rejects.toMatchObject({ status: 403 });
  }
});
it("chặn Open ID trùng, vai trò sai và body chọn tenant hoặc mật khẩu", async () => {
  const body = input();
  await create(body);
  await expect(create(body)).rejects.toMatchObject({ status: 409 });
  for (const bad of [
    input("Owner"),
    input("Viewer", { tenantKey: "another-org" }),
    input("Viewer", { password: "synthetic-password" }),
    input("Viewer", { openId: "Bearer wrong token" }),
  ])
    await expect(create(bad)).rejects.toThrow();
  expect(await userAccessHistory(pool, adminId)).toHaveLength(1);
});
it("đổi quyền ghi đúng version, lý do, trước và sau", async () => {
  const u = await create(input());
  await change(u.id, update());
  const row = (await listUsers(pool, adminId)).find((x) => x.id === u.id);
  expect(row).toMatchObject({ role: "Production Planner", version: 2 });
  const event = (await userAccessHistory(pool, adminId)).find(
    (x) => x.action === "user.update",
  );
  expect(event.details).toMatchObject({
    reason: "Synthetic role assignment",
    before: { role: "Viewer", version: 1 },
    after: { role: "Production Planner", version: 2 },
  });
  await expect(
    change(u.id, update("Manager", { expectedVersion: 2, reason: "" })),
  ).rejects.toThrow();
});
it("hai cập nhật cùng version chỉ một cập nhật được ghi", async () => {
  const u = await create(input());
  const result = await Promise.allSettled([
    change(u.id, update("Manager")),
    change(u.id, update("Production Planner")),
  ]);
  expect(result.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  const failure = result.find(
    (x) => x.status === "rejected",
  ) as PromiseRejectedResult;
  expect(failure.reason.status).toBe(409);
  expect(
    (await userAccessHistory(pool, adminId)).filter(
      (x) => x.action === "user.update",
    ),
  ).toHaveLength(1);
});
it("không khóa/hạ quản trị viên cuối cùng, admin chưa đăng nhập không được dùng làm người thay thế", async () => {
  await create(input("Administrator"));
  await expect(change(adminId, update("Viewer"))).rejects.toMatchObject({
    status: 409,
  });
  await expect(
    change(adminId, update("Administrator", { disabled: true })),
  ).rejects.toMatchObject({ status: 409 });
});
it("hai Admin tự hạ quyền đồng thời vẫn còn một Admin đang hoạt động", async () => {
  const other = await seed("Administrator");
  const result = await Promise.allSettled([
    change(adminId, update("Viewer"), adminId),
    change(other, update("Viewer"), other),
  ]);
  expect(result.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect(
    Number(
      (
        await pool.query(
          "SELECT count(*) n FROM users WHERE tenant_key=$1 AND role='Administrator' AND NOT disabled",
          [tenant],
        )
      ).rows[0].n,
    ),
  ).toBe(1);
});
it("khóa thu hồi phiên, mở lại giữ tài khoản và lịch sử", async () => {
  const u = await create(input());
  await pool.query(
    "INSERT INTO session VALUES($1,$2,now()+interval '1 hour')",
    ["synthetic-session", JSON.stringify({ userId: u.id })],
  );
  await change(u.id, update("Viewer", { disabled: true }));
  expect(
    (await pool.query("SELECT * FROM session WHERE sess->>'userId'=$1", [u.id]))
      .rowCount,
  ).toBe(0);
  await change(
    u.id,
    update("Viewer", {
      expectedVersion: 2,
      disabled: false,
      reason: "Synthetic access restored",
    }),
  );
  const row = (await listUsers(pool, adminId)).find((x) => x.id === u.id);
  expect(row).toMatchObject({ disabled: false, version: 3 });
  expect(
    (await userAccessHistory(pool, adminId)).filter(
      (x) => x.action === "user.update",
    ),
  ).toHaveLength(2);
});
it("chỉ quản lý thành viên cùng tenant, admin tenant khác không thay thế admin hiện tại", async () => {
  const foreign = await seed("Administrator", "other-synthetic-org");
  expect((await listUsers(pool, adminId)).some((x) => x.id === foreign)).toBe(
    false,
  );
  await expect(change(foreign, update())).rejects.toMatchObject({
    status: 404,
  });
  await expect(change(adminId, update("Viewer"))).rejects.toMatchObject({
    status: 409,
  });
});
it("backend kiểm tra lại actor đang hoạt động trong transaction", async () => {
  await seed("Administrator");
  await pool.query("UPDATE users SET role='Viewer' WHERE id=$1", [adminId]);
  await expect(create(input())).rejects.toMatchObject({ status: 403 });
});
it("HTTP: anonymous/Viewer bị chặn ghi; Admin thêm, xem audit và khóa một phiên đang đăng nhập", async () => {
  const viewer = await seed();
  let selected = adminId;
  const app = makeApp();
  app.get("/synthetic-test-session", (req, res) => {
    req.session.userId = selected;
    req.session.csrf = "synthetic-users-csrf";
    res.json({ ok: true });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((ok) => server.once("listening", ok));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const login = async () => {
    const r = await fetch(base + "/synthetic-test-session");
    return r.headers.get("set-cookie")!.split(";")[0];
  };
  const post = (
    path: string,
    cookie: string,
    body: unknown,
    method = "POST",
    csrf = "synthetic-users-csrf",
  ) =>
    fetch(base + path, {
      method,
      headers: {
        Cookie: cookie,
        Origin: process.env.PUBLIC_URL!,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify(body),
    });
  try {
    expect((await fetch(base + "/api/users")).status).toBe(401);
    selected = viewer;
    const viewerCookie = await login();
    expect(
      (await fetch(base + "/api/users", { headers: { Cookie: viewerCookie } }))
        .status,
    ).toBe(403);
    expect(
      (await post("/api/users", viewerCookie, input("Administrator"))).status,
    ).toBe(403);
    expect(
      (
        await post(
          "/api/users/" + viewer,
          viewerCookie,
          update("Administrator"),
          "PUT",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(base + "/api/users/activity", {
          headers: { Cookie: viewerCookie },
        })
      ).status,
    ).toBe(403);
    selected = adminId;
    const adminCookie = await login();
    expect(
      (await post("/api/users", adminCookie, input(), "POST", "bad")).status,
    ).toBe(403);
    const response = await post(
      "/api/users",
      adminCookie,
      input("Warehouse Operator"),
    );
    expect(response.status).toBe(201);
    expect((await response.json()).role).toBe("Warehouse Operator");
    expect(
      (
        await fetch(base + "/api/users/activity", {
          headers: { Cookie: adminCookie },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post(
          "/api/users/" + viewer,
          adminCookie,
          update("Viewer", { disabled: true }),
          "PUT",
        )
      ).status,
    ).toBe(200);
    expect(
      (await fetch(base + "/api/me", { headers: { Cookie: viewerCookie } }))
        .status,
    ).toBe(401);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});
