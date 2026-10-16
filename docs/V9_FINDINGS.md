# V9 — Sai khác, lỗi và quyết định chuyển đổi

Nguồn đã phân tích: SHA-256 `5e468146bd3ed292b7e4494a1276e4572d08161743a5f83f57adb36ce20b3316`. Số dòng theo file người dùng gửi. MASTER PROMPT là yêu cầu; nội dung HTML là dữ liệu nguồn cần kiểm chứng.

| Phát hiện | Nguyên nhân / tác động | Hướng xử lý trong ứng dụng mới |
| --- | --- | --- |
| Dòng 269 ví dụ `70 × 5 − 10 = 690` | Nội dung mô tả hard-code sai số học; `calc` vẫn cho 340 | Hiển thị phép tính từ kết quả thật; giữ công thức `calc`, test ví dụ 60 và 340 |
| Dòng 367 lưu Nháp thành Đã gửi xưởng | `status === 'Nháp' ? 'Đã gửi xưởng' : status` | Giữ Nháp khi lưu; trạng thái nội bộ không tuyên bố có gửi tin thật |
| Dòng 447/472 dùng chữ ký JSON cục bộ | Không đọc state của tab khác và không có server; không bảo vệ nhiều người | Version và khóa transaction PostgreSQL; xung đột HTTP 409 |
| Dòng 377 giao nhận không có khóa chống lặp | Click lại hoặc gửi lại có thể cộng thêm; không có database transaction | Idempotency và khóa lệnh/dòng; retry cùng payload trả cùng kết quả |
| Dòng 531/555 xóa/khôi phục thiếu actor, không giữ sự kiện khôi phục | Chỉ lưu thời gian/lý do xóa, sau restore xóa metadata đó | ActivityLogs giữ toàn bộ sự kiện và actor Lark |
| Dòng 488 đổi mã chỉ kiểm tra mã đang hiện hữu | Mã cũ sau đổi có thể tái sử dụng | Giữ mã đã sử dụng trong bảng riêng, kể cả sau đổi/xóa |
| Dòng 328 backup không chứa customCatalog | Catalog dùng khóa localStorage riêng | Nêu giới hạn importer; không tự suy diễn màu thất lạc |
| Dòng 325 CSV planner luôn thêm dòng; stock trống thành 0 | Duplicate SKU và tồn thiếu bị hiểu là tồn bằng 0 | Preview phát hiện trùng; tồn trống → null, khóa dự báo tăng trưởng theo yêu cầu |
| Dòng 585/735 suy exportedAt từ thời gian tạo đơn muộn nhất | Không phải thời điểm xuất báo cáo; có thể loại nhầm ngày cuối dù file đầy đủ | Yêu cầu mốc xuất/kỳ báo cáo rõ trong bước xem trước; luôn loại ngày chưa trọn vẹn khỏi tốc độ chuẩn |
| Dòng 595 r2/7 chia cố định cho 2/7 | File thiếu ngày có thể làm giảm tốc độ; V9 không phân biệt không bán và thiếu dữ liệu | Giữ công thức chia 2/7; hiển thị cửa sổ và cảnh báo coverage, không âm thầm đổi mẫu số |
| Dòng 627 `within(r, scope)` truyền array | Biến `topAll` không dùng; chưa thấy ảnh hưởng bảng top thực tế | Không port đoạn mã chết; top thực dùng `products` từ currentSalesRows |
| Dòng 718 trả XXL thay vì 2XL | Planner ALL_SIZES chỉ nhận 2XL; dữ liệu XXL không chuyển sang dự báo | Chuẩn hóa alias XXL → 2XL khi import, ghi rõ trong preview |
| Dòng 727 regex `return/refund/cancel` theo chuỗi con | Có thể loại cả mô tả như “No return”; chưa có danh mục trạng thái thực đủ để sửa | Giữ quy tắc V9, hiển thị loại/lý do để đối soát; không tự đoán status mới |
| Dòng 724 idSet chỉ đếm đơn | Không chống trùng dòng; nhập file thay toàn bộ là chức năng duy nhất | Bổ sung là yêu cầu mới: định danh đơn+dòng; thiếu line ID thì chặn bổ sung, không gộp mù theo mã đơn |
| Dòng 732 unknown chỉ cộng counter | Dòng không rõ mã/size không được lưu đủ để đối soát | Giữ dòng staging với lý do và cho xuất đối soát |
| Dòng 326 Excel là HTML đặt đuôi .xls | Không phải workbook Excel gốc | Xuất .xlsx thật, CSV chống công thức injection, print/PDF qua trình duyệt |
| Dòng 54 mở `<style>` bên trong `<style>` | HTML không hợp lệ; trình duyệt tự phục hồi | Dùng CSS/Tailwind biên dịch trong cấu trúc React hợp lệ |

Các thay đổi trên phục vụ yêu cầu rõ ràng của MASTER PROMPT; không sửa hay ghi đè file HTML gốc. Snapshot lịch sử nhúng không được tự nhập vào dữ liệu vận hành.
