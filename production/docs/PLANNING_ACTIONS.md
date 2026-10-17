# Cập nhật nguồn và lên lệnh nhanh

Trong **Dự kiến sản xuất**, Administrator hoặc Production Planner dùng 3 thao tác ngay phía trên bảng. Không cần nhập từng ô tồn hoặc hàng đang về.

## 1. Cập nhật tồn từ Lark

- Administrator cấu hình nguồn một lần tại **Cấu hình & dữ liệu → Tồn kho Lark Base**; xem [quyền API/tài liệu và ánh xạ](LARK_INVENTORY.md).
- Lọc mã/màu/size cần dùng, chọn SKU nếu chỉ muốn cập nhật một phần. Có lựa chọn thì chỉ dùng các SKU đã chọn trong bảng đang xem; chưa chọn thì dùng toàn bộ SKU đang xem. Tối đa 2.000 SKU/lần.
- Bấm **Cập nhật tồn từ Lark** → kiểm tra tồn trước/sau, ngày kiểm và cảnh báo → **Xác nhận cập nhật tồn kho**.
- Backend khớp đúng mã–màu–size của SKU đã có; đọc nguồn Wiki/Base đã lưu, không nhận nguồn tùy ý từ Planner. Chỉ Administrator được cấu hình URL/ánh xạ.
- Quy tắc tồn giữ nguyên: ngày mới nhất theo mã–màu; ô size trống theo cấu hình (mặc định người dùng chọn =0), XXL→2XL; dòng mới nhất trùng bị chặn; tồn cũ hơn số tồn đã biết trong ứng dụng được bỏ qua.
- SKU không tìm thấy trong nguồn giữ nguyên, có cảnh báo; không ngầm chuyển về 0. Các SKU ngoài phạm vi không bị tạo/cập nhật, kể cả nguồn đã bật tạo SKU còn thiếu.
- Giữ nguyên hàng đang về, doanh số, vòng đời và SL test. Preview không ghi tồn; confirm có transaction, version, snapshot, audit và chống gửi lặp.

## 2. Đối soát hàng đang về

1. Chọn hoặc lọc SKU cần cập nhật.
2. Bấm **Đối soát hàng đang về**. Mặc định lấy số đặt trừ số đã nhận ở các lệnh đã gửi xưởng, đã xác nhận và đang sản xuất; lệnh nhận một phần giữ trạng thái nội bộ đã chọn và chỉ tính phần còn chờ.
3. Mỗi SKU có số đang về cũ/mới và chi tiết từng lệnh: `đặt − nhận = còn chờ`.
4. Mặc định không tính nháp/tạm dừng. Muốn tính thì bật tùy chọn và bấm **Đối soát lại**; nút xác nhận khóa khi tùy chọn chưa được tính lại.
5. Đã xóa hoặc hủy phần còn lại luôn bị loại; dòng đã giao đủ có phần còn chờ =0. Có danh sách lệnh bị loại để kiểm tra.
6. Bấm **Cập nhật hàng đang về** để thay số đang về hiện tại. Không cộng dồn. SKU không có lệnh hợp lệ sẽ được cập nhật về 0 nếu xác nhận; hàng đang về nhập tay ngoài các lệnh này cũng bị thay thế, cần đối soát nguồn trước khi xác nhận.

Ví dụ hai lệnh cùng SKU: lệnh A đặt100/nhận30, lệnh B đặt50/nhận0 → đang về120. Dự báo tốc độ40/ngày, mục tiêu5 ngày, tồn30: `40×5−30−120=50`. Không trừ thêm cùng số xưởng còn nợ lần nữa.

Đối soát không sửa lệnh/biên nhận hoặc tăng tồn thực tế. Sau mỗi lần nhận hàng, bấm đối soát lại để giảm đang về theo phần đã nhận; cập nhật tồn thật từ nguồn kho sau khi đã kiểm nhận. Không có tác vụ cập nhật ngầm khi ghi nhận hàng.

Backend lưu preview thuộc người tạo, tối đa15phút. Xác nhận đọc lại phiên bản/toàn bộ lệnh và phần đã nhận; lệnh mới, sửa, hủy, xóa hoặc nhận thêm sau preview đều yêu cầu đối soát lại. Các lệnh hiện có được khóa đọc trước SKU để nhất quán với luồng sửa/nhận. Lệnh tạo sau thời điểm đọc xác nhận thuộc lần đối soát kế tiếp. Mọi SKU được kiểm tra version trước khi ghi; xung đột rollback toàn bộ. Xác nhận lại cùng preview không lặp snapshot/audit.

## 3. Lên lệnh nhanh

- Cập nhật tồn và đối soát đang về trước khi lên lệnh.
- Bấm **Lên lệnh nhanh** phía trên bảng để lấy các SKU đang xem có đề xuất >0; nếu đã chọn SKU, chỉ lấy các SKU đã chọn trong bảng đang xem.
- Hoặc bấm **Lên lệnh nhanh** ở từng dòng để lấy riêng SKU đó.
- Ứng dụng chuyển sang **Gối lệnh sản xuất** và mở trình soạn lệnh đã điền đúng mã–màu–size, số lượng đề xuất và ưu tiên. Nhập xưởng, ngày giao, kiểm tra rồi **Lưu lệnh vào lịch sử**.
- Chưa lưu thì chưa có lệnh mới trong database; không tự gửi tin/email cho xưởng. Lệnh mặc định Nháp; chọn trạng thái phù hợp, hoặc chủ động bật tính nháp khi đối soát.
- Đề xuất bằng0 thì nút riêng SKU bị khóa. SKU Tăng trưởng thiếu tồn vẫn khóa đề xuất; Mở bán chỉ dùng lượng test; Giảm sút/Xả kho=0. Không tự đổi vòng đời theo doanh số và không thay công thức V9 5 ngày.

## Quyền và kiểm thử

Administrator/Production Planner được thao tác nguồn đã cấu hình. Warehouse/Manager/Viewer chỉ xem theo quyền hiện có. Backend bảo vệ session, Origin, CSRF và kiểm tra quyền; không dùng localStorage lưu dữ liệu nghiệp vụ.

159 tests đạt, build đạt; Chromium desktop và390px đã chạy luồng đọc tồn (API Lark giả lập), xác nhận thật ở PostgreSQL `_test`, đối soát sau nhận một phần, kiểm tra lựa chọn nháp, lên lệnh50 và lưu thật bằng dữ liệu tổng hợp. Không kiểm thử với token Base thật và không thay đổi tồn/lệnh công ty. Mã được push chưa chứng minh Railway đã triển khai thành công.
