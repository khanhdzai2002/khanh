let csrf = "";
export const setCsrf = (value: string) => (csrf = value);
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      "Không kết nối được backend. Hãy kiểm tra máy chủ và thử tải lại.",
    );
  }
  const text = await response.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      response.status >= 500
        ? "Backend chưa sẵn sàng. Hãy khởi động API và PostgreSQL, rồi thử lại."
        : "Máy chủ trả về dữ liệu không hợp lệ. Kiểm tra cấu hình /api và /auth trên hosting.",
    );
  }
  if (!response.ok) {
    const message = [
      body.message,
      ...(body.errors || [])
        .slice(0, 3)
        .map((e: any) => e.path + ": " + e.message),
    ].join(" · ");
    throw new Error(
      response.status === 409
        ? message + " Tải lại để lấy dữ liệu mới."
        : message,
    );
  }
  return body;
}
export const send = <T = any>(
  path: string,
  body: unknown,
  method = "POST",
  headers: Record<string, string> = {},
) => api<T>(path, { method, body: JSON.stringify(body), headers });
export async function fileBase64(file: File) {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let text = "";
  for (let i = 0; i < buffer.length; i += 8192)
    text += String.fromCharCode(...buffer.subarray(i, i + 8192));
  return btoa(text);
}
