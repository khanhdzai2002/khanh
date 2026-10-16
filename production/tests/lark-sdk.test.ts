import { it, expect } from "vitest";
import * as sdk from "@larksuiteoapi/node-sdk";
import { larkClient } from "../server/auth";
import { pool } from "../server/db";

it("SDK thật ánh xạ PKCE/token/user_info và giữ timeout trên HTTP transport giả lập", async () => {
  const names = [
    "PUBLIC_URL",
    "LARK_APP_ID",
    "LARK_APP_SECRET",
    "LARK_TENANT_KEY",
    "LARK_REDIRECT_URI",
  ];
  const saved = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  const http = sdk.defaultHttpInstance as any;
  const originalAdapter = http.defaults.adapter;
  const calls: any[] = [];
  try {
    Object.assign(process.env, {
      PUBLIC_URL: "https://synthetic-sdk.invalid",
      LARK_APP_ID: "synthetic-app",
      LARK_APP_SECRET: "synthetic-secret",
      LARK_TENANT_KEY: "synthetic-tenant",
      LARK_REDIRECT_URI: "https://synthetic-sdk.invalid/auth/callback",
    });
    http.defaults.adapter = async (config: any) => {
      calls.push(config);
      const data =
        config.url === "https://accounts.larksuite.com/oauth/v3/token"
          ? { access_token: "synthetic-access-token", token_type: "Bearer" }
          : {
              code: 0,
              data: {
                open_id: "synthetic-person",
                tenant_key: "synthetic-tenant",
              },
            };
      return { data, status: 200, statusText: "OK", headers: {}, config };
    };
    const client = larkClient();
    const token = await client.accessToken.retrieveByAuthorizationCode({
      code: "synthetic-auth-code",
      redirectUri: "https://synthetic-sdk.invalid/auth/callback",
      codeVerifier: "synthetic-verifier",
    });
    expect(token.accessToken).toBe("synthetic-access-token");
    const user = await client.authen.userInfo.get(
      {},
      sdk.withUserAccessToken(token.accessToken!),
    );
    expect(user.data?.tenant_key).toBe("synthetic-tenant");
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[0].data)).toMatchObject({
      client_id: "synthetic-app",
      client_secret: "synthetic-secret",
      grant_type: "authorization_code",
      code: "synthetic-auth-code",
      code_verifier: "synthetic-verifier",
      redirect_uri: "https://synthetic-sdk.invalid/auth/callback",
    });
    expect(calls[1].url).toBe(
      "https://open.larksuite.com/open-apis/authen/v1/user_info",
    );
    expect(calls[1].headers.Authorization).toBe(
      "Bearer synthetic-access-token",
    );
    for (const call of calls) {
      expect(call.timeout).toBe(15000);
      expect(call.maxRedirects).toBe(0);
    }
  } finally {
    http.defaults.adapter = originalAdapter;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
    await pool.end();
  }
});
