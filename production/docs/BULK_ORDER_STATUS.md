# Đổi trạng thái lệnh hàng loạt và màu ưu tiên

## Cách dùng

Administrator hoặc Production Planner mở **Gối lệnh sản xuất → Danh sách lệnh**:

1. Tìm/lọc các lệnh cần xử lý. Chọn ô ở từng lệnh hoặc ô chọn tất cả lệnh hợp lệ đang xem.
2. Bấm **Đổi trạng thái hàng loạt**, chọn trạng thái nội bộ và nhập lý do (3–450 ký tự).
3. Kiểm tra bảng mã lệnh/trạng thái cũ/mới, rồi **Xác nhận đổi trạng thái**.
4. Dữ liệu tải lại và bỏ lựa chọn sau khi xử lý thành công. Cột **Trạng thái nội bộ** hiển thị kết quả độc lập với trạng thái giao hàng.

Tối đa200lệnh/lần. Thao tác chỉ dùng những lệnh đã chọn **trong kết quả đang xem**; các lệnh bị bộ lọc che đi không bị đổi. Bấm Bỏ chọn lệnh để xóa toàn bộ lựa chọn. Chọn quá200 thì nút bị khóa; thu hẹp bộ lọc hoặc bỏ chọn bớt.

Có5 trạng thái nội bộ đang dùng: Nháp, Đã gửi xưởng, Đã xác nhận, Đang sản xuất, Tạm dừng. Đã gửi xưởng là trạng thái nội bộ, không tự gửi email/tin nhắn. Giao một phần/Đã giao đủ được tính từ biên nhận; không cho đổi bằng thao tác metadata. Hủy phần còn lại/khôi phục là luồng riêng, không tự thực hiện khi đổi trạng thái.

Lệnh xóa mềm/hủy phần còn lại/giao đủ không được chọn; backend cũng chặn nếu client cố gửi. Lệnh đã nhận một phần còn chờ vẫn đổi trạng thái nội bộ được mà không sửa dữ liệu đã nhận. Danh sách giữ cột trạng thái giao hàng bên cạnh để phân biệt với trạng thái nội bộ.

## Tính toàn vẹn

- Chỉ gửi ID, expectedVersion, trạng thái mới và lý do; không gửi thay số lượng/SKU/ưu tiên/biên nhận.
- Backend kiểm tra quyền hiện tại trong database, session, Origin, CSRF và schema. Manager/Warehouse/Viewer không có quyền đổi hàng loạt.
- Khóa từng lệnh theo ID có thứ tự, kiểm tra tất cả trước khi ghi trong một transaction. Nếu một lệnh bị sửa/nhận hàng/xóa/hủy sau khi mở cửa sổ, toàn bộ lần cập nhật bị chặn và yêu cầu tải lại. Không tự bỏ qua lỗi để cập nhật một phần.
- Mỗi lệnh có thay đổi thật tăng version, ghi revision trước/sau với lý do và danh tính Lark của người thực hiện; audit dùng cùng batchId để đối soát một lượt cập nhật.
- Không ghi lại các dòng sản phẩm: giữ nguyên item ID, số đặt, số nhận, ưu tiên, nhà xưởng, mã lệnh, ngày hẹn, biên nhận và lịch sử cũ.
- Lệnh đã có cùng trạng thái hiện tại được giữ nguyên, không tăng version hoặc tạo lịch sử chỉnh sửa giả. Nếu tất cả giống trạng thái chọn, kết quả là xử lý không có thay đổi.
- Hai lượt cập nhật cùng version chỉ một lượt thành công. Gửi lặp payload cũ bị version conflict, không tạo chỉnh sửa trùng. Tải lại dữ liệu rồi kiểm tra kết quả thay vì cố ghi đè.

## Màu ưu tiên

- **THƯỜNG**: xám, chữ than xám trên nền nhạt.
- **ƯU TIÊN**: cam đậm trên nền cam nhạt.
- **CẤP BÁCH**: đỏ đậm trên nền đỏ nhạt.

Giữ nguyên chữ và giá trị nghiệp vụ, không chỉ phân biệt bằng màu. Áp dụng ở cột ưu tiên danh sách lệnh (đặt gần mã lệnh để nhìn nhanh), chọn ưu tiên nhóm mã–màu trong trình soạn, bộ thêm dòng và từng dòng chi tiết lệnh. Danh sách dùng mức cao nhất trong tất cả dòng của lệnh; chi tiết hiển thị đúng ưu tiên của từng dòng. Thay màu khi chọn không tự lưu lệnh; vẫn cần lưu chỉnh sửa theo quy trình hiện có.

Không có migration, biến môi trường hoặc quyền Lark mới. Không tự đổi ưu tiên hay vòng đời sản phẩm theo trạng thái lệnh.

## Kiểm thử

189tests/15file đạt, gồm10tests mới về toàn bộ batch, per-order revision/audit, item/receipt bất biến, xung đột rollback, hủy/xóa/đủ, no-op/mixed batch, hai lượt đồng thời, giới hạn schema, quyền DB hiện tại và HTTP/session/CSRF, ánh xạ mức/màu ưu tiên.

Chromium desktop1440/mobile390px kiểm tra chọn lệnh hợp lệ/giao đủ khóa chọn, lý do bắt buộc, batch2lệnh qua API thật trên `_test`, đọc revision, cạnh tranh cập nhật409 không ghi dở dang, màu của chú giải/danh sách/chọn nhóm khi đổi3mức và badge ở chi tiết lệnh. Không lỗi JavaScript/tràn trang. Chỉ dữ liệu tổng hợp, chưa xác minh deployment Railway; không sửa lệnh công ty trong kiểm thử.
