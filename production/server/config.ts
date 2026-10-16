import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
dotenv.config({
  path: [
    fileURLToPath(new URL("../.env.local", import.meta.url)),
    fileURLToPath(new URL("../.env", import.meta.url)),
  ],
  quiet: true,
});

export function publicOrigin() {
  const explicit = [process.env.APP_BASE_URL, process.env.PUBLIC_URL].filter(
    (x): x is string => !!x,
  );
  if (
    explicit.length === 2 &&
    new URL(explicit[0]).origin !== new URL(explicit[1]).origin
  )
    throw Error(
      "APP_BASE_URL và PUBLIC_URL phải cùng origin; bỏ PUBLIC_URL cũ khi chuyển hosting",
    );
  const value =
    explicit[0] ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : undefined) ||
    process.env.RENDER_EXTERNAL_URL;
  if (!value)
    throw Error(
      "Cần cấu hình APP_BASE_URL hoặc PUBLIC_URL là địa chỉ chính của ứng dụng",
    );
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error(
      "PUBLIC_URL phải là origin, không có đường dẫn, query hoặc thông tin đăng nhập",
    );
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw Error("Production yêu cầu PUBLIC_URL HTTPS");
  return url.origin;
}
export function callbackUrl() {
  const expected = publicOrigin() + "/auth/callback";
  const actual = process.env.LARK_REDIRECT_URI || expected;
  if (actual !== expected)
    throw Error("LARK_REDIRECT_URI phải bằng PUBLIC_URL + /auth/callback");
  return actual;
}
export function configuredTenantKey() {
  return process.env.LARK_TENANT_KEY?.trim() || "";
}
export function larkStatus() {
  const missing = ["LARK_APP_ID", "LARK_APP_SECRET", "LARK_TENANT_KEY"].filter(
    (k) => !process.env[k]?.trim(),
  );
  let configurationError: string | null = null;
  try {
    callbackUrl();
    if (/[\s"']/.test(configuredTenantKey()))
      throw Error(
        "LARK_TENANT_KEY chứa dấu nháy hoặc khoảng trắng bên trong. Chỉ nhập giá trị tenant_key, không kèm dấu nháy.",
      );
  } catch (e) {
    configurationError = (e as Error).message;
  }
  return {
    configured: missing.length === 0 && !configurationError,
    missing,
    configurationError,
  };
}
export function originAllowed(origin: string | undefined) {
  if (!origin) return false;
  const expected = publicOrigin();
  if (origin === expected) return true;
  // Local dev may be opened using localhost or 127.0.0.1 on the same port.
  if (process.env.NODE_ENV === "production") return false;
  try {
    const a = new URL(expected),
      b = new URL(origin),
      local = ["localhost", "127.0.0.1", "[::1]"];
    return (
      local.includes(a.hostname) &&
      local.includes(b.hostname) &&
      a.protocol === "http:" &&
      b.protocol === a.protocol &&
      a.port === b.port &&
      b.origin === origin
    );
  } catch {
    return false;
  }
}
