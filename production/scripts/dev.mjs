import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import dotenv from "dotenv";
const directory = fileURLToPath(new URL("../", import.meta.url));
dotenv.config({
  path: [directory + ".env.local", directory + ".env"],
  quiet: true,
});
if (process.env.NODE_ENV === "production")
  throw Error(
    "Dùng npm start cho production; dev server không dùng cho dữ liệu vận hành.",
  );
const webPort = Number(
  process.env.DEV_PORT ||
    new URL(process.env.PUBLIC_URL || "http://localhost:5173").port ||
    5173,
);
const apiPort = Number(process.env.PORT || 3001);
async function available(port) {
  await new Promise((ok, no) => {
    const probe = createServer();
    probe.once("error", () =>
      no(
        Error(
          `Cổng ${port} đang được sử dụng. Dừng tiến trình cũ của ứng dụng trước khi chạy npm run dev.`,
        ),
      ),
    );
    probe.listen(port, "127.0.0.1", () => probe.close(ok));
  });
}
await available(webPort);
await available(apiPort);
const migration = spawnSync(
  process.execPath,
  ["--import", "tsx", "server/migrate.ts"],
  { cwd: directory, env: process.env, stdio: "inherit" },
);
if (migration.status !== 0) {
  console.error(
    "Chưa khởi động được COMS-FLOW. Kiểm tra PostgreSQL và DATABASE_URL rồi chạy lại.",
  );
  process.exit(migration.status || 1);
}
const api = spawn(
  process.execPath,
  ["--import", "tsx", "--watch", "server/index.ts"],
  { cwd: directory, env: process.env, stdio: "inherit" },
);
const web = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "0.0.0.0",
    "--port",
    String(webPort),
    "--strictPort",
    "--force",
  ],
  { cwd: directory, env: process.env, stdio: "inherit" },
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api.kill("SIGTERM");
  web.kill("SIGTERM");
  process.exitCode = code;
}
for (const child of [api, web]) {
  child.once("error", () => stop(1));
  child.once("exit", (code) => stop(code || 0));
}
process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
