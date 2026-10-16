import { it, expect, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import * as sdk from "@larksuiteoapi/node-sdk";
import { makeApp } from "../server/app";
import { migrate } from "../server/migrate";
import { pool } from "../server/db";
import { LARK_WEB_TOKEN_URL } from "../server/lark-oauth";

it("đăng nhập web end-to-end gửi đúng verifier S256 đến endpoint v2 qua SDK HTTP thật", async () => {
  await migrate();
  vi.stubEnv("LARK_APP_ID", "synthetic-web-app");
  vi.stubEnv("LARK_APP_SECRET", "synthetic-web-secret");
  vi.stubEnv("LARK_TENANT_KEY", "synthetic-web-tenant");
  const http = sdk.defaultHttpInstance as any;
  const originalAdapter = http.defaults.adapter;
  const server = makeApp().listen(0, "127.0.0.1");
  await new Promise<void>((ok) => server.once("listening", ok));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  let exchanges = 0;
  const openId = "synthetic-pkce-" + randomUUID();
  try {
    const login = await fetch(base + "/auth/login", { redirect: "manual" });
    expect(login.status).toBe(302);
    const authorize = new URL(login.headers.get("location")!);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    http.defaults.adapter = async (config: any) => {
      let data;
      if (config.url === LARK_WEB_TOKEN_URL) {
        exchanges++;
        const body = JSON.parse(config.data);
        expect(body.code_verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
        expect(
          createHash("sha256").update(body.code_verifier).digest("base64url"),
        ).toBe(authorize.searchParams.get("code_challenge"));
        expect(body.redirect_uri).toBe(
          authorize.searchParams.get("redirect_uri"),
        );
        expect(body.client_id).toBe(authorize.searchParams.get("client_id"));
        expect(body.client_secret).toBe("synthetic-web-secret");
        expect(body.code).toBe("synthetic-fresh-web-code");
        data = { code: "0", access_token: "synthetic-user-token" };
      } else {
        expect(config.url).toBe(
          "https://open.larksuite.com/open-apis/authen/v1/user_info",
        );
        expect(config.headers.Authorization).toBe(
          "Bearer synthetic-user-token",
        );
        data = {
          code: 0,
          data: {
            open_id: openId,
            tenant_key: "synthetic-web-tenant",
            name: "Synthetic PKCE person",
          },
        };
      }
      expect(config.timeout).toBe(15000);
      expect(config.maxRedirects).toBe(0);
      return { data, status: 200, statusText: "OK", headers: {}, config };
    };
    const callback =
      base +
      "/auth/callback?" +
      new URLSearchParams({
        state: authorize.searchParams.get("state")!,
        code: "synthetic-fresh-web-code",
      });
    const response = await fetch(callback, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(exchanges).toBe(1);
    const sessionCookie = response.headers.get("set-cookie")!.split(";")[0];
    const me = await (
      await fetch(base + "/api/me", { headers: { Cookie: sessionCookie } })
    ).json();
    expect(me.user).toMatchObject({
      name: "Synthetic PKCE person",
      role: "Viewer",
    });
    const replay = await fetch(callback, {
      headers: { Cookie: sessionCookie },
      redirect: "manual",
    });
    expect(replay.status).toBe(401);
    expect(exchanges).toBe(1);
  } finally {
    http.defaults.adapter = originalAdapter;
    vi.unstubAllEnvs();
    server.closeAllConnections();
    await new Promise<void>((ok) => server.close(() => ok()));
    await pool.end();
  }
});
