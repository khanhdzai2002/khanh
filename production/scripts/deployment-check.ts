import dotenv from "dotenv";
// A production env file may be passed explicitly; injected environment wins.
if (process.argv[2]) dotenv.config({ path: process.argv[2], quiet: true });
const { publicOrigin, callbackUrl, larkStatus } =
  await import("../server/config");
const missing = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "LARK_APP_ID",
  "LARK_APP_SECRET",
  "LARK_TENANT_KEY",
].filter((k) => !process.env[k]);
const errors: string[] = [];
if (missing.length) errors.push("Thiếu biến backend: " + missing.join(", "));
if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32)
  errors.push("SESSION_SECRET cần ít nhất 32 ký tự ngẫu nhiên");
if (process.env.NODE_ENV !== "production" || process.env.DEV_AUTH === "true")
  errors.push("Cần NODE_ENV=production và DEV_AUTH=false");
let homepage = "",
  redirect = "";
try {
  homepage = publicOrigin();
  redirect = callbackUrl();
  if (!homepage.startsWith("https://")) errors.push("Hosting phải có HTTPS");
  if (/\.(example|invalid|test)$/.test(new URL(homepage).hostname))
    errors.push("Hostname vẫn là ví dụ, chưa phải hostname triển khai thật");
} catch (e) {
  errors.push((e as Error).message);
}
if (process.env.DATABASE_URL) {
  try {
    const db = new URL(process.env.DATABASE_URL);
    if (
      !["postgres:", "postgresql:"].includes(db.protocol) ||
      db.password.includes("REPLACE")
    )
      errors.push("DATABASE_URL chưa hợp lệ");
  } catch {
    errors.push("DATABASE_URL chưa hợp lệ");
  }
}
const status = larkStatus();
if (status.configurationError) errors.push(status.configurationError);
if (errors.length) {
  for (const message of new Set(errors)) console.error(message);
  process.exitCode = 1;
} else {
  console.log(
    "Cấu hình đã đủ theo kiểm tra tĩnh; chưa chứng minh OAuth hoặc hosting đã hoạt động.",
  );
  console.log("Web App Homepage:", homepage);
  console.log("Redirect URL:", redirect);
}
