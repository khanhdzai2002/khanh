import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  it,
  expect,
  vi,
} from "vitest";
import { createHash } from "node:crypto";
import { pool } from "../server/db";
import { migrate } from "../server/migrate";
const mock = vi.hoisted(() => ({ token: vi.fn(), info: vi.fn() }));
vi.mock("@larksuiteoapi/node-sdk", () => ({
  Client: class {
    accessToken = { retrieveByAuthorizationCode: mock.token };
    authen = { userInfo: { get: mock.info } };
  },
  AppType: { SelfBuild: 0 },
  Domain: { Lark: "https://open.larksuite.com" },
  withUserAccessToken: () => ({}),
  defaultHttpInstance: { request: vi.fn() },
}));
import { makeApp } from "../server/app";
import { validateOAuthState } from "../server/auth";
let server: ReturnType<ReturnType<typeof makeApp>["listen"]>, base: string;
beforeAll(async () => {
  await migrate();
});
beforeEach(async () => {
  vi.resetAllMocks();
  server = makeApp().listen(0, "127.0.0.1");
  await new Promise<void>((ok) => server.once("listening", ok));
  base = "http://127.0.0.1:" + (server.address() as any).port;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((ok) => server.close(() => ok()));
  process.env.PUBLIC_URL = "http://localhost:5174";
  for (const k of [
    "LARK_APP_ID",
    "LARK_APP_SECRET",
    "LARK_TENANT_KEY",
    "LARK_REDIRECT_URI",
  ])
    delete process.env[k];
  vi.clearAllMocks();
});
afterAll(async () => {
  await pool.end();
});
function config() {
  process.env.PUBLIC_URL = "https://example.invalid";
  process.env.LARK_APP_ID = "synthetic-unit-test-app";
  process.env.LARK_APP_SECRET = "synthetic-unit-test-only";
  process.env.LARK_TENANT_KEY = "test-tenant";
  process.env.LARK_REDIRECT_URI = "https://example.invalid/auth/callback";
}
async function login() {
  const r = await fetch(base + "/auth/login", { redirect: "manual" });
  expect(r.status).toBe(302);
  return {
    cookie: r.headers.get("set-cookie")!.split(";")[0],
    state: new URL(r.headers.get("location")!).searchParams.get("state")!,
  };
}
it("thiếu Lark config không tự đăng nhập bằng danh tính giả", async () => {
  expect(
    (await fetch(base + "/auth/login", { redirect: "manual" })).status,
  ).toBe(503);
});
function acceptLark() {
  mock.token.mockResolvedValue({ accessToken: "synthetic-provider-token" });
  mock.info.mockResolvedValue({
    code: 0,
    data: {
      open_id: "test-lark-personal-open-id",
      tenant_key: "test-tenant",
      name: "Synthetic Lark Person",
    },
  });
}
it("authorize dùng client_id, response_type và PKCE S256, không lộ secret", async () => {
  config();
  const response = await fetch(base + "/auth/login", { redirect: "manual" });
  const location = response.headers.get("location")!;
  const url = new URL(location);
  expect(url.origin).toBe("https://accounts.larksuite.com");
  expect(url.searchParams.get("client_id")).toBe(process.env.LARK_APP_ID);
  expect(url.searchParams.get("response_type")).toBe("code");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(location).not.toContain(process.env.LARK_APP_SECRET!);
  const state = url.searchParams.get("state")!;
  const attempt = (
    await pool.query("SELECT * FROM oauth_login_attempts WHERE state_hash=$1", [
      createHash("sha256").update(state).digest("hex"),
    ])
  ).rows[0];
  expect(attempt.state_hash).not.toBe(state);
  expect(
    createHash("sha256").update(attempt.code_verifier).digest("base64url"),
  ).toBe(url.searchParams.get("code_challenge"));
});
it("hai callback đồng thời chỉ đổi mã một lần", async () => {
  config();
  acceptLark();
  const l = await login();
  const path = base + "/auth/callback?state=" + l.state + "&code=synthetic";
  const responses = await Promise.all([
    fetch(path, { headers: { Cookie: l.cookie }, redirect: "manual" }),
    fetch(path, { headers: { Cookie: l.cookie }, redirect: "manual" }),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([302, 401]);
  expect(mock.token).toHaveBeenCalledTimes(1);
  expect(mock.token.mock.calls[0][0].codeVerifier).toBeTruthy();
});
it("state thuộc session khác bị chặn và không tiêu thụ phiên hợp lệ", async () => {
  config();
  acceptLark();
  const l = await login();
  const response = await fetch(
    base + "/auth/callback?state=" + l.state + "&code=synthetic",
    { redirect: "manual" },
  );
  expect(response.status).toBe(401);
  expect(mock.token).not.toHaveBeenCalled();
  const valid = await fetch(
    base + "/auth/callback?state=" + l.state + "&code=synthetic",
    { headers: { Cookie: l.cookie }, redirect: "manual" },
  );
  expect(valid.status).toBe(302);
});
it("state quá hạn trong database không gọi provider dù session còn mới", async () => {
  config();
  const l = await login();
  await pool.query(
    "UPDATE oauth_login_attempts SET created_at=now()-interval '6 minutes' WHERE state_hash=$1",
    [createHash("sha256").update(l.state).digest("hex")],
  );
  const response = await fetch(
    base + "/auth/callback?state=" + l.state + "&code=synthetic",
    { headers: { Cookie: l.cookie }, redirect: "manual" },
  );
  expect(response.status).toBe(401);
  expect(mock.token).not.toHaveBeenCalled();
});
it("lỗi token không rò rỉ credential và không tự retry mã một lần", async () => {
  config();
  mock.token.mockRejectedValue(
    Error("synthetic-unit-test-only provider detail"),
  );
  const l = await login();
  const response = await fetch(
    base + "/auth/callback?state=" + l.state + "&code=synthetic",
    { headers: { Cookie: l.cookie }, redirect: "manual" },
  );
  expect(response.status).toBe(502);
  const text = await response.text();
  expect(text).not.toContain(process.env.LARK_APP_SECRET!);
  expect(text).not.toContain("provider detail");
  expect(mock.token).toHaveBeenCalledTimes(1);
});
it("callback trình duyệt đưa về giao diện lỗi thay vì trang JSON", async () => {
  config();
  const l = await login();
  const response = await fetch(
    base + "/auth/callback?state=" + l.state + "&error=access_denied",
    { headers: { Cookie: l.cookie, Accept: "text/html" }, redirect: "manual" },
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    "https://example.invalid/?login_error=login_expired",
  );
  expect(mock.token).not.toHaveBeenCalled();
});
it("lỗi user_info được ghi đúng bước và không nhầm thành tenant sai", async () => {
  config();
  mock.token.mockResolvedValue({ accessToken: "synthetic-provider-token" });
  mock.info.mockResolvedValue({
    code: 99991672,
    msg: "synthetic-unit-test-only private provider detail",
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const l = await login();
    const response = await fetch(
      base + "/auth/callback?state=" + l.state + "&code=synthetic",
      {
        headers: { Cookie: l.cookie },
        redirect: "manual",
      },
    );
    expect(response.status).toBe(502);
    expect(log).toHaveBeenCalledWith(
      "Lark OAuth failed",
      expect.objectContaining({ stage: "user_info", providerCode: 99991672 }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "private provider detail",
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "synthetic-provider-token",
    );
    expect(await response.text()).not.toContain("private provider detail");
  } finally {
    log.mockRestore();
  }
});
it("Redirect URL sai origin bị chặn trước khi bắt đầu OAuth", async () => {
  config();
  process.env.LARK_REDIRECT_URI = "https://other.invalid/auth/callback";
  expect(
    (await fetch(base + "/auth/login", { redirect: "manual" })).status,
  ).toBe(503);
});
it("Redirect URL có thể tự suy ra an toàn từ PUBLIC_URL", async () => {
  config();
  delete process.env.LARK_REDIRECT_URI;
  const response = await fetch(base + "/auth/login", { redirect: "manual" });
  expect(response.status).toBe(302);
  expect(
    new URL(response.headers.get("location")!).searchParams.get("redirect_uri"),
  ).toBe("https://example.invalid/auth/callback");
});
it("state sai hoặc hết hạn bị chặn", () => {
  expect(() =>
    validateOAuthState({ state: "valid", at: Date.now() }, "invalid"),
  ).toThrow();
  expect(() =>
    validateOAuthState({ state: "valid", at: Date.now() - 6 * 60000 }, "valid"),
  ).toThrow();
});
it("callback state sai không gọi token endpoint", async () => {
  config();
  const l = await login();
  const response = await fetch(
    base + "/auth/callback?state=wrong&code=synthetic",
    { headers: { Cookie: l.cookie }, redirect: "manual" },
  );
  expect(response.status).toBe(401);
  expect(mock.token).not.toHaveBeenCalled();
});
it("callback mock đúng tenant tạo danh tính cá nhân Viewer, state chỉ dùng một lần", async () => {
  config();
  mock.token.mockResolvedValue({ accessToken: "synthetic-provider-token" });
  mock.info.mockResolvedValue({
    code: 0,
    data: {
      open_id: "test-lark-personal-open-id",
      tenant_key: "test-tenant",
      name: "Synthetic Lark Person",
    },
  });
  const l = await login();
  const path = "/auth/callback?state=" + l.state + "&code=synthetic";
  const r = await fetch(base + path, {
    headers: { Cookie: l.cookie },
    redirect: "manual",
  });
  expect(r.status).toBe(302);
  const cookie = r.headers.get("set-cookie")!.split(";")[0];
  const me = await (
    await fetch(base + "/api/me", { headers: { Cookie: cookie } })
  ).json();
  expect(me.user).toMatchObject({
    name: "Synthetic Lark Person",
    role: "Viewer",
  });
  const replay = await fetch(base + path, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  expect(replay.status).toBe(401);
  expect(mock.token).toHaveBeenCalledTimes(1);
});
it("callback mock từ tenant khác bị từ chối", async () => {
  config();
  mock.token.mockResolvedValue({ accessToken: "synthetic-provider-token" });
  mock.info.mockResolvedValue({
    code: 0,
    data: {
      open_id: "wrong-tenant-person",
      tenant_key: "other-tenant",
      name: "Synthetic Outsider",
    },
  });
  const l = await login();
  const r = await fetch(
    base + "/auth/callback?state=" + l.state + "&code=synthetic",
    { headers: { Cookie: l.cookie }, redirect: "manual" },
  );
  expect(r.status).toBe(403);
});
it("production từ chối DEV_AUTH", () => {
  process.env.NODE_ENV = "production";
  process.env.PUBLIC_URL = "https://example.invalid";
  try {
    expect(() => makeApp()).toThrow("DEV_AUTH");
  } finally {
    process.env.NODE_ENV = "test";
    process.env.PUBLIC_URL = "http://localhost:5174";
  }
});
