import "./db";
import { makeApp } from "./app";
import { pool } from "./db";
const server = makeApp().listen(
  Number(process.env.PORT || 3001),
  process.env.HOST ||
    (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
  () =>
    console.log("COMS-FLOW API listening on port", process.env.PORT || 3001),
);
const stop = () => server.close(() => void pool.end());
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
