import { it, expect } from "vitest";
import { larkFailureDetails } from "../server/lark-diagnostics";

it("giữ mã lỗi token chính thức, bỏ description và dữ liệu nhạy cảm", () => {
  const result = larkFailureDetails(
    {
      statusCode: 401,
      code: 20001,
      error: "invalid_client",
      errorDescription: "synthetic-secret-private",
      config: { data: "synthetic-secret-private" },
    },
    "token_exchange",
  );
  expect(result).toEqual({
    stage: "token_exchange",
    httpStatus: 401,
    providerCode: 20001,
    oauthError: "invalid_client",
    transportCode: null,
  });
  expect(JSON.stringify(result)).not.toContain("synthetic-secret-private");
});
it("Axios user_info chỉ giữ status và code, không ghi token hoặc body", () => {
  expect(
    larkFailureDetails(
      {
        response: {
          status: 403,
          data: { code: 99991672, msg: "private", data: { name: "private" } },
        },
      },
      "user_info",
    ),
  ).toMatchObject({
    stage: "user_info",
    httpStatus: 403,
    providerCode: 99991672,
  });
});
it("mã hoặc oauth error không thuộc allowlist không được log", () => {
  const result = larkFailureDetails(
    {
      statusCode: "private",
      code: "private",
      error: "private",
      message: "private",
    },
    "token_exchange",
  );
  expect(JSON.stringify(result)).not.toContain("private");
  expect(larkFailureDetails(null, "token_exchange").providerCode).toBeNull();
  expect(
    larkFailureDetails({ code: "ECONNREFUSED" }, "user_info").transportCode,
  ).toBe("ECONNREFUSED");
});
