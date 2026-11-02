import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../shared/domain";
import { inspectionFilesSchema } from "../shared/inspection-images";
export function parseInspectionFiles(raw: unknown) {
  const files = inspectionFilesSchema.parse(raw);
  const images = files.map((file) => {
    const bytes = Buffer.from(file.data, "base64");
    if (bytes.toString("base64") !== file.data)
      throw new AppError(400, "Ảnh mã hóa không hợp lệ");
    let mime = "";
    if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
      mime = "image/jpeg";
    if (
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      mime = "image/png";
    if (
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    )
      mime = "image/webp";
    if (!mime)
      throw new AppError(
        400,
        "Chỉ nhận ảnh JPEG, PNG hoặc WebP. HEIC/PDF cần chuyển thành ảnh trước.",
      );
    return {
      id: randomUUID(),
      name: file.name,
      bytes,
      mime,
      sha: createHash("sha256").update(bytes).digest("hex"),
    };
  });
  if (images.reduce((n, i) => n + i.bytes.length, 0) > 8 * 1024 * 1024)
    throw new AppError(400, "Mỗi lần tải tối đa 4 ảnh, tổng dung lượng 8 MB");
  if (new Set(images.map((i) => i.sha)).size !== images.length)
    throw new AppError(400, "Ảnh bị trùng trong cùng lần tải");
  return images;
}
