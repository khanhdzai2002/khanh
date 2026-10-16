import { afterEach, it, expect } from "vitest";
import {
  publicOrigin,
  callbackUrl,
  originAllowed,
  larkStatus,
  configuredTenantKey,
} from "../server/config";
const originalTenantKey = process.env.LARK_TENANT_KEY;
afterEach(() => {
  process.env.NODE_ENV = "test";
  process.env.PUBLIC_URL = "http://localhost:5174";
  delete process.env.LARK_REDIRECT_URI;
  delete process.env.APP_BASE_URL;
  delete process.env.RAILWAY_PUBLIC_DOMAIN;
  if (originalTenantKey === undefined) delete process.env.LARK_TENANT_KEY;
  else process.env.LARK_TENANT_KEY = originalTenantKey;
});
it("tenant key bỏ khoảng trắng đầu cuối, giữ nguyên chữ hoa thường", () => {
  process.env.LARK_TENANT_KEY = " \n Synthetic-Tenant \t";
  expect(configuredTenantKey()).toBe("Synthetic-Tenant");
  expect(larkStatus().configurationError).toBeNull();
});
it("tenant key nhập kèm dấu nháy hoặc khoảng trắng bên trong có lỗi cấu hình rõ", () => {
  for (const value of ['"synthetic-tenant"', "synthetic tenant"]) {
    process.env.LARK_TENANT_KEY = value;
    expect(larkStatus().configurationError).toContain("LARK_TENANT_KEY");
    expect(larkStatus().configurationError).not.toContain(value);
  }
});
it("Railway dùng APP_BASE_URL và callback cùng một public origin", () => {
  delete process.env.PUBLIC_URL;
  process.env.NODE_ENV = "production";
  process.env.APP_BASE_URL = "https://synthetic-comsflow.up.railway.app/";
  expect(publicOrigin()).toBe("https://synthetic-comsflow.up.railway.app");
  expect(callbackUrl()).toBe(
    "https://synthetic-comsflow.up.railway.app/auth/callback",
  );
});
it("Railway chỉ suy origin từ domain do nền tảng cấp khi chưa có URL tường minh", () => {
  delete process.env.PUBLIC_URL;
  process.env.RAILWAY_PUBLIC_DOMAIN = "synthetic-comsflow.up.railway.app";
  expect(publicOrigin()).toBe("https://synthetic-comsflow.up.railway.app");
});
it("chặn URL cũ và mới xung đột khi chuyển hosting", () => {
  process.env.APP_BASE_URL = "https://synthetic-comsflow.up.railway.app";
  expect(() => publicOrigin()).toThrow("cùng origin");
});
it("chuẩn hóa dấu / cuối PUBLIC_URL khi so Origin", () => {
  process.env.PUBLIC_URL = "http://localhost:5174/";
  expect(publicOrigin()).toBe("http://localhost:5174");
  expect(originAllowed("http://localhost:5174")).toBe(true);
});
it("localhost alias chỉ dùng development và đúng cổng", () => {
  expect(originAllowed("http://127.0.0.1:5174")).toBe(true);
  expect(originAllowed("http://localhost:5173")).toBe(false);
  expect(originAllowed("https://attacker.invalid")).toBe(false);
  process.env.NODE_ENV = "production";
  process.env.PUBLIC_URL = "https://comsflow.invalid";
  expect(originAllowed("https://other.invalid")).toBe(false);
});
it("chặn PUBLIC_URL có credentials, path hoặc query", () => {
  for (const value of [
    "https://name:password@host.invalid",
    "https://host.invalid/path",
    "https://host.invalid/?next=bad",
  ]) {
    process.env.PUBLIC_URL = value;
    expect(() => publicOrigin()).toThrow();
  }
});
it("production bắt buộc HTTPS", () => {
  process.env.NODE_ENV = "production";
  process.env.PUBLIC_URL = "http://localhost:5174";
  expect(() => publicOrigin()).toThrow("HTTPS");
});
it("thông tin config chỉ trả tên thiếu, không có secret", () => {
  const value = larkStatus();
  expect(Object.keys(value).sort()).toEqual([
    "configurationError",
    "configured",
    "missing",
  ]);
  expect(callbackUrl()).toBe("http://localhost:5174/auth/callback");
});
