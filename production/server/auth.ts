import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  randomBytes,
  randomUUID,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import * as lark from "@larksuiteoapi/node-sdk";
import { pool, audit, transaction } from "./db";
import { AppError, can, type Role } from "../shared/domain";
import type { Actor } from "./service";
import { callbackUrl, larkStatus, publicOrigin } from "./config";
import { larkFailureDetails } from "./lark-diagnostics";
import { exchangeLarkCode } from "./lark-oauth";
declare module "express-session" {
  interface SessionData {
    userId?: string;
    csrf?: string;
    oauth?: { state: string; at: number };
  }
}
declare global {
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}
export function larkConfigured() {
  return larkStatus().configured;
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const safeLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  trace: () => {},
};
export function larkClient() {
  if (!larkConfigured())
    throw new AppError(
      503,
      "Chưa cấu hình Lark App ID, Secret, tenant và redirect URI tại backend",
    );
  return new lark.Client({
    appId: process.env.LARK_APP_ID!,
    appSecret: process.env.LARK_APP_SECRET!,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Lark,
    logger: safeLogger,
    // Preserve the SDK's response interceptor and HTTP methods while bounding requests.
    httpInstance: new Proxy(lark.defaultHttpInstance, {
      get(target, property, receiver) {
        if (property === "request")
          return (options: lark.HttpRequestOptions<unknown>) =>
            target.request({ ...options, timeout: 15000, maxRedirects: 0 });
        return Reflect.get(target, property, receiver);
      },
    }) as unknown as lark.HttpInstance,
  });
}
const devEnabled = () =>
  process.env.NODE_ENV !== "production" && process.env.DEV_AUTH === "true";
const regenerate = (req: Request) =>
  new Promise<void>((ok, no) =>
    req.session.regenerate((e) => (e ? no(e) : ok())),
  );
const save = (req: Request) =>
  new Promise<void>((ok, no) => req.session.save((e) => (e ? no(e) : ok())));
function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const auth = Router();
auth.get("/config", (_req, res) =>
  res.json({
    larkConfigured: larkConfigured(),
    devAuth: devEnabled(),
    missing: larkStatus().missing,
    configurationError: larkStatus().configurationError,
  }),
);
auth.get("/login", async (req, res) => {
  if (!larkConfigured())
    throw new AppError(
      503,
      "Lark chưa được cấu hình; xem hướng dẫn LARK_SETUP.md",
    );
  const state = randomBytes(32).toString("hex");
  const verifier = randomBytes(48).toString("base64url");
  req.session.oauth = { state, at: Date.now() };
  await save(req);
  await pool.query(
    "DELETE FROM oauth_login_attempts WHERE created_at < now()-interval '5 minutes'",
  );
  await pool.query(
    "INSERT INTO oauth_login_attempts(state_hash,session_hash,code_verifier) VALUES($1,$2,$3)",
    [hash(state), hash(req.sessionID), verifier],
  );
  const url = new URL(
    "https://accounts.larksuite.com/open-apis/authen/v1/authorize",
  );
  url.searchParams.set("client_id", process.env.LARK_APP_ID!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", callbackUrl());
  url.searchParams.set("state", state);
  if (process.env.LARK_OAUTH_SCOPES)
    url.searchParams.set("scope", process.env.LARK_OAUTH_SCOPES);
  url.searchParams.set(
    "code_challenge",
    createHash("sha256").update(verifier).digest("base64url"),
  );
  url.searchParams.set("code_challenge_method", "S256");
  res.redirect(url.href);
});
export function validateOAuthState(
  expected: { state: string; at: number } | undefined,
  actual: unknown,
) {
  if (
    !expected ||
    typeof actual !== "string" ||
    !equal(expected.state, actual) ||
    Date.now() - expected.at > 5 * 60000 ||
    expected.at > Date.now() + 60000
  )
    throw new AppError(
      401,
      "Phiên đăng nhập đã hết hạn hoặc state không hợp lệ",
    );
}
auth.get("/callback", async (req, res) => {
  const expected = req.session.oauth;
  validateOAuthState(expected, req.query.state);
  const attempt = (
    await pool.query(
      "DELETE FROM oauth_login_attempts WHERE state_hash=$1 AND session_hash=$2 AND created_at>now()-interval '5 minutes' RETURNING code_verifier",
      [hash(req.query.state as string), hash(req.sessionID)],
    )
  ).rows[0];
  if (!attempt)
    throw new AppError(
      401,
      "Phiên đăng nhập đã dùng hoặc hết hạn; hãy đăng nhập lại",
    );
  delete req.session.oauth;
  await save(req);
  if (req.query.error)
    throw new AppError(401, "Bạn chưa cho phép ứng dụng đăng nhập bằng Lark");
  if (
    typeof req.query.code !== "string" ||
    !req.query.code ||
    req.query.code.length > 4096
  )
    throw new AppError(400, "Lark không trả mã đăng nhập");
  const client = larkClient();
  let result;
  let stage: "token_exchange" | "user_info" = "token_exchange";
  try {
    // Authorization codes are single-use: never automatically retry this exchange.
    const token = await exchangeLarkCode({
      code: req.query.code,
      redirectUri: callbackUrl(),
      codeVerifier: attempt.code_verifier,
    });
    if (!token.accessToken) throw { code: "MISSING_ACCESS_TOKEN" };
    stage = "user_info";
    result = await client.authen.userInfo.get(
      {},
      lark.withUserAccessToken(token.accessToken),
    );
    if (result.code !== 0) throw { code: result.code };
    if (!result.data?.open_id || !result.data?.tenant_key)
      throw { code: "INVALID_USER_INFO" };
  } catch (error) {
    console.error("Lark OAuth failed", larkFailureDetails(error, stage));
    throw new AppError(
      502,
      "Lark chưa xác thực được đăng nhập. Kiểm tra App ID, App Secret, Redirect URL và quyền ứng dụng.",
    );
  }
  const u = result.data;
  if (!u?.open_id || u.tenant_key !== process.env.LARK_TENANT_KEY)
    throw new AppError(403, "Tài khoản không thuộc tenant được phép");
  const user = (
    await pool.query(
      "INSERT INTO users(id,tenant_key,open_id,name) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_key,open_id) DO UPDATE SET name=excluded.name RETURNING *",
      [randomUUID(), u.tenant_key, u.open_id, u.name || u.open_id],
    )
  ).rows[0];
  if (user.disabled) throw new AppError(403, "Tài khoản bị vô hiệu hóa");
  await regenerate(req);
  req.session.userId = user.id;
  req.session.csrf = randomBytes(32).toString("hex");
  await save(req);
  await transaction((db) => audit(db, user.id, "auth.lark.login", user.id, {}));
  res.redirect("/");
});
auth.post("/dev", async (req, res) => {
  const ip = req.socket.remoteAddress;
  if (
    !devEnabled() ||
    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip || "")
  )
    throw new AppError(403, "Đăng nhập thử nghiệm bị tắt");
  const user = (
    await pool.query(
      "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1,'local-development','developer','Lập trình viên (DEV)','Administrator') ON CONFLICT(tenant_key,open_id) DO UPDATE SET name=excluded.name RETURNING *",
      [randomUUID()],
    )
  ).rows[0];
  await regenerate(req);
  req.session.userId = user.id;
  req.session.csrf = randomBytes(32).toString("hex");
  await save(req);
  res.json({ developmentOnly: true });
});
auth.post("/logout", async (req, res) => {
  if (
    !req.session.csrf ||
    !equal(req.session.csrf, req.get("X-CSRF-Token") || "")
  )
    throw new AppError(403, "CSRF không hợp lệ");
  await new Promise<void>((ok, no) =>
    req.session.destroy((e) => (e ? no(e) : ok())),
  );
  res.clearCookie("cf.sid");
  res.json({ ok: true });
});
export async function authenticated(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    if (!req.session.userId) throw new AppError(401, "Cần đăng nhập");
    const user = (
      await pool.query("SELECT id,name,role,disabled FROM users WHERE id=$1", [
        req.session.userId,
      ])
    ).rows[0];
    if (!user || user.disabled)
      throw new AppError(401, "Phiên không còn hiệu lực");
    req.actor = user;
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (!req.session.csrf ||
        !equal(req.session.csrf, req.get("X-CSRF-Token") || ""))
    )
      throw new AppError(403, "CSRF không hợp lệ");
    next();
  } catch (e) {
    next(e);
  }
}
export function permission(action: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.actor || !can(req.actor.role as Role, action))
      return next(
        new AppError(403, "Bạn không có quyền thực hiện thao tác này"),
      );
    next();
  };
}
export async function retryRead<T>(operation: () => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (e) {
      const status = (e as any).response?.status;
      if (attempt >= 2 || ![429, 502, 503, 504].includes(status))
        throw new AppError(
          502,
          "Lark tạm thời không khả dụng hoặc quyền chưa đủ; thử lại sau",
        );
      await new Promise((r) =>
        setTimeout(r, Math.min(3000, 500 * 2 ** attempt)),
      );
    }
  }
}
auth.get("/base-status", (_req, res) =>
  res.json({
    configured: !!(
      larkConfigured() &&
      process.env.LARK_BASE_APP_TOKEN &&
      process.env.LARK_BASE_TABLE_ID
    ),
  }),
);
auth.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  if (
    !["/login", "/callback"].includes(req.path) ||
    !req.get("Accept")?.includes("text/html")
  )
    return next(error);
  const status = error instanceof AppError ? error.status : 500;
  const code =
    status === 503
      ? "not_configured"
      : status === 403
        ? "access_denied"
        : status === 401
          ? "login_expired"
          : status === 502
            ? "provider_error"
            : "login_failed";
  const destination = new URL("/", publicOrigin());
  destination.searchParams.set("login_error", code);
  res.redirect(303, destination.href);
});
