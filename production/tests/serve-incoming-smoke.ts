// Synthetic provider only, isolated database. Never use this runner for deployment.
import "./setup";
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
  throw Error("Unsafe database");
const gemini = process.env.INCOMING_SMOKE_PROVIDER === "gemini";
process.env.INCOMING_OCR_PROVIDER = gemini ? "gemini" : "openai";
process.env.INCOMING_OCR_API_KEY = "synthetic-browser-provider";
process.env.GEMINI_API_KEY = "synthetic-browser-google-key";
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  if (
    String(input) === "https://api.openai.com/v1/chat/completions" ||
    String(input) ===
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent"
  ) {
    const request = JSON.parse(options?.body as string);
    if (
      !(gemini
        ? request.contents?.[0]?.parts?.[1]?.inlineData
        : request.messages?.[1]?.content?.length)
    )
      throw Error("Missing selected images");
    const result = {
      date: "2026-10-26",
      note: "SYNTHETIC PROVIDER — NOT REAL OCR",
      warnings: ["SYNTHETIC: Kiểm tra ô M còn trống và màu Cam của MIU66"],
      rows: [
        { sku: "MIU37", color: "Cam", bag: "1", S: 150, M: null, L: 0, XL: 0 },
        { sku: "MIU66", color: "Cam", bag: "2", S: 5, M: 0, L: 0, XL: 0 },
      ],
    };
    return new Response(
      JSON.stringify(
        gemini
          ? {
              candidates: [
                {
                  finishReason: "STOP",
                  content: { parts: [{ text: JSON.stringify(result) }] },
                },
              ],
            }
          : {
              choices: [
                {
                  finish_reason: "stop",
                  message: { content: JSON.stringify(result) },
                },
              ],
            },
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  return originalFetch(input, options);
};
await import("./serve-smoke");
