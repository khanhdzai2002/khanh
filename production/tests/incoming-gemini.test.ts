import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { incomingOcrStatus, readIncomingImages } from "../server/incoming-ocr";
const keys = [
  "INCOMING_OCR_PROVIDER",
  "INCOMING_OCR_API_KEY",
  "INCOMING_OCR_MODEL",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
];
beforeEach(() => {
  for (const key of keys) vi.stubEnv(key, "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const images = [
  { mime: "image/png", bytes: Buffer.from("synthetic-image-only") },
];
const result = {
  date: null,
  note: "Synthetic only",
  warnings: [],
  rows: [
    { sku: "MIU37", color: "Cam", bag: "1", S: 150, M: null, L: 0, XL: 0 },
  ],
};
const response = (extra = {}) =>
  new Response(
    JSON.stringify({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(result) }] },
        },
      ],
      ...extra,
    }),
    { status: 200 },
  );
function gemini() {
  vi.stubEnv("INCOMING_OCR_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "synthetic-google-key");
}
it("defaults to OpenAI and keeps legacy configuration compatible", () => {
  expect(incomingOcrStatus()).toMatchObject({
    providerId: "openai",
    keyVariable: "INCOMING_OCR_API_KEY",
    configured: false,
  });
  vi.stubEnv("INCOMING_OCR_API_KEY", "synthetic");
  expect(incomingOcrStatus().configured).toBe(true);
});
it("recognizes Gemini-only key automatically, explicit choice wins with both keys", () => {
  vi.stubEnv("GEMINI_API_KEY", "synthetic");
  expect(incomingOcrStatus()).toMatchObject({
    configured: true,
    providerId: "gemini",
    provider: "Google Gemini",
    keyVariable: "GEMINI_API_KEY",
  });
  vi.stubEnv("INCOMING_OCR_API_KEY", "synthetic-openai");
  expect(incomingOcrStatus().providerId).toBe("openai");
  vi.stubEnv("INCOMING_OCR_PROVIDER", " Gemini ");
  expect(incomingOcrStatus().providerId).toBe("gemini");
});
it("selected Gemini never accepts OpenAI key or silently fails over", async () => {
  vi.stubEnv("INCOMING_OCR_PROVIDER", "gemini");
  vi.stubEnv("INCOMING_OCR_API_KEY", "synthetic-openai");
  expect(incomingOcrStatus().configured).toBe(false);
  const spy = vi.fn();
  vi.stubGlobal("fetch", spy);
  await expect(readIncomingImages(images)).rejects.toThrow("GEMINI_API_KEY");
  expect(spy).not.toHaveBeenCalled();
});
it("invalid provider and URL-like model are rejected before any network request", async () => {
  gemini();
  const spy = vi.fn();
  vi.stubGlobal("fetch", spy);
  vi.stubEnv("GEMINI_MODEL", "https://untrusted.invalid/");
  expect(incomingOcrStatus().configured).toBe(false);
  await expect(readIncomingImages(images)).rejects.toThrow("Tên model");
  vi.stubEnv("INCOMING_OCR_PROVIDER", "external");
  expect(incomingOcrStatus().configurationError).toContain(
    "gemini hoặc openai",
  );
  expect(spy).not.toHaveBeenCalled();
});
it("Gemini has independent model and never reuses gpt model accidentally", () => {
  gemini();
  vi.stubEnv("INCOMING_OCR_MODEL", "gpt-4.1-mini");
  expect(incomingOcrStatus().model).toBe("gemini-flash-latest");
  vi.stubEnv("GEMINI_MODEL", "gemini-2.5-flash");
  expect(incomingOcrStatus().model).toBe("gemini-2.5-flash");
});
it("sends image inlineData to fixed Google URL, API key in header only, JSON MIME, preserves null", async () => {
  gemini();
  const spy = vi.fn(async (_url: string, _options?: RequestInit) => response());
  vi.stubGlobal("fetch", spy);
  expect(await readIncomingImages(images)).toEqual(result);
  expect(spy).toHaveBeenCalledTimes(1);
  const [url, options] = spy.mock.calls[0];
  expect(url).toBe(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
  );
  expect(url).not.toContain("synthetic-google-key");
  expect(options!.headers).toMatchObject({
    "x-goog-api-key": "synthetic-google-key",
  });
  expect(options!.redirect).toBe("error");
  const request = JSON.parse(options!.body as string);
  expect(request.contents[0].parts[1]).toEqual({
    inlineData: {
      mimeType: "image/png",
      data: images[0].bytes.toString("base64"),
    },
  });
  expect(request.generationConfig.responseMimeType).toBe("application/json");
  expect(request.systemInstruction.parts[0].text).toContain("untrusted data");
});
it("ignores thought text and joins only response text parts", async () => {
  gemini();
  const json = JSON.stringify(result);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: "STOP",
                content: {
                  parts: [
                    { thought: true, text: "not JSON: hidden reasoning" },
                    { text: json.slice(0, 20) },
                    { text: json.slice(20) },
                  ],
                },
              },
            ],
          }),
        ),
    ),
  );
  expect(await readIncomingImages(images)).toEqual(result);
});
it("blocks partial, safety, empty or malformed Gemini output instead of returning partial rows", async () => {
  gemini();
  for (const body of [
    {
      candidates: [
        {
          finishReason: "MAX_TOKENS",
          content: { parts: [{ text: JSON.stringify(result) }] },
        },
      ],
    },
    { promptFeedback: { blockReason: "SAFETY" } },
    { candidates: [] },
    {
      candidates: [
        { finishReason: "STOP", content: { parts: [{ text: "not JSON" }] } },
      ],
    },
    {
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              {
                text: JSON.stringify({
                  ...result,
                  rows: [{ ...result.rows[0], S: -1 }],
                }),
              },
            ],
          },
        },
      ],
    },
  ]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body))),
    );
    await expect(readIncomingImages(images)).rejects.toThrow("Kết quả đọc ảnh");
  }
});
it("quota errors are safe and neither retried nor sent to OpenAI", async () => {
  gemini();
  vi.stubEnv("INCOMING_OCR_API_KEY", "synthetic-other-provider");
  const spy = vi.fn(
    async () =>
      new Response("sensitive provider error synthetic-google-key", {
        status: 429,
      }),
  );
  vi.stubGlobal("fetch", spy);
  await expect(readIncomingImages(images)).rejects.toThrow(
    "Google Gemini trả HTTP 429",
  );
  expect(spy).toHaveBeenCalledTimes(1);
});
it("network failure keeps a safe error without revealing provider key", async () => {
  gemini();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw Error("synthetic-google-key");
    }),
  );
  await expect(readIncomingImages(images)).rejects.toThrow(
    "Không kết nối được dịch vụ đọc ảnh",
  );
});
