# Kết nối tồn kho Lark Base

Luồng hiện tại: Administrator cấu hình nguồn và ánh xạ → đọc Lark → xem trước → xác nhận → cập nhật tồn PostgreSQL, snapshot và audit. Không tự nhập lúc khởi động, không tự đồng bộ theo lịch, không ghi ngược Lark. Đăng nhập thành công chưa đồng nghĩa app có quyền đọc Base.

## 1. Cấp quyền cho Custom App đang dùng

Trong Lark Developer Console, mở **đúng Custom App có App ID đang cấu hình trên Railway** → Permissions & Scopes / Quyền:

- `wiki:wiki:readonly`: đọc thông tin trang Wiki để lấy Base token khi link bắt đầu bằng `/wiki/`.
- `bitable:app:readonly`: đọc cột và bản ghi Base. API hiện hành cũng chấp nhận các quyền riêng `base:field:read` và `base:record:retrieve`; không cần cấp quyền ghi Base cho luồng này.

Xin duyệt quyền nếu tổ chức yêu cầu, tạo phiên bản cập nhật và phát hành cho đúng tổ chức. Giữ nguyên App ID, Secret, Tenant Key và callback đang đăng nhập được. Backend dùng SDK lấy tenant access token; không nhập Bearer token thủ công.

**Quyền API và quyền tài liệu là hai lớp riêng.** Chủ Base/Wiki cần cấp Custom App quyền đọc đúng tài liệu. Trong menu `…` của Base tìm mục thêm ứng dụng / Add document apps (tên mục phụ thuộc giao diện tenant), chọn đúng ứng dụng đang dùng. Nếu không có mục này hoặc app không xuất hiện, nhờ quản trị viên Base/Wiki kiểm tra cơ chế cấp quyền ứng dụng, phạm vi app và quyền không gian Wiki; đừng chuyển Base sang công khai để thử.

Nếu Base có quyền nâng cao, cần cho danh tính ứng dụng truy cập các dòng/cột của view. Theo tài liệu API, có cấu hình quyền nâng cao yêu cầu danh tính có quyền quản lý để truy vấn được dữ liệu; nếu trả thành công nhưng 0 dòng, cần chủ Base kiểm tra quyền đó. Ứng dụng COMS-FLOW vẫn chỉ gọi API đọc.

## 2. Cấu hình trong COMS-FLOW

Sau Railway triển khai bản mã mới và migrations thành công:

1. Mở ứng dụng bằng Administrator → **Cấu hình & dữ liệu → Tồn kho Lark Base**.
2. Dán link đầy đủ của bảng với `table=tbl…` và `view=vew…`. Hỗ trợ link `/wiki/…` và `/base/…`. Đừng nhập Wiki token vào biến `LARK_BASE_APP_TOKEN`: hai mã này khác nhau.
3. Bấm **Đọc danh sách cột**. Link không được tải trực tiếp: backend chỉ trích định danh rồi gọi endpoint chính thức của Lark.
4. Kiểm tra ánh xạ: **Mã sản phẩm**, **Màu**, **Ngày kiểm**, và **S / M / L / XL / XXL → 2XL**. Size XS không có thì chọn “Không có size này”. Chọn đúng tên cột được API trả về, không phải nhãn nhóm phía trên cột.
5. Quy tắc theo người dùng xác nhận: **ô size trống = 0**; **ngày mới nhất theo từng mã–màu**. Mỗi size không được ánh xạ thì không cập nhật, kể cả chế độ ô trống bằng 0.
6. Chọn xử lý SKU chưa có: mặc định bỏ qua để bảo vệ danh mục; có thể chọn **Tạo SKU còn thiếu ở trạng thái Mở bán** nếu muốn nhập danh mục từ Base. Không tự chuyển sang Tăng trưởng.
7. **Lưu cấu hình nguồn → Đọc tồn & xem trước**. Kiểm tra tồn hiện tại, tồn Lark, ngày kiểm, SKU sẽ tạo/bỏ qua và mọi cảnh báo.
8. Bấm **Xác nhận cập nhật … SKU** sau khi đối soát. Tồn mới **thay thế**, không cộng vào tồn cũ. Bấm lại cùng bản xem trước không nhân đôi snapshot.

Không cần biến môi trường Base mới cho luồng này: URL, ánh xạ và lựa chọn được lưu tập trung PostgreSQL. Chỉ App ID/Secret/Tenant Key đang có ở backend được sử dụng để xác thực. API `/api/lark/base/preview` cũ dùng `LARK_BASE_APP_TOKEN`/`LARK_BASE_TABLE_ID` còn giữ để tương thích, không phải luồng nhập tồn mới.

## 3. Quy tắc bảo toàn dữ liệu

- Tồn được lấy từ **các cột size**, không cộng thêm “Tổng số lượng”, “Tồn hôm qua”, “Nhập mới hôm nay”, đơn vị hay giá trị tiền.
- Mã sản phẩm viết hoa; đối chiếu mã–màu không phân biệt hoa/thường, size XXL ánh xạ 2XL. Không đoán các tên màu gần giống: “Đỏ mận” và “Đỏ” là hai màu khác nhau.
- Chỉ đọc **view trong URL**, không tự lấy cả bảng hoặc vượt bộ lọc. Không truyền sort/filter riêng vì Lark có thể bỏ qua view khi dùng các tham số đó.
- Duyệt hết các trang API; giới hạn 10.000 dòng/120 giây để không nhập thiếu âm thầm. Nếu vượt giới hạn, lọc view theo kỳ tồn và đọc lại.
- Chọn ngày kiểm mới nhất theo mã–màu trong view. Hai dòng cùng ngày mới nhất bị chặn toàn bộ lần nhập, không cộng dồn hoặc chọn tùy ý.
- Số tồn phải nguyên, không âm; ngày sai, màu nhiều lựa chọn mơ hồ hoặc công thức lỗi đều cần sửa nguồn. Mã–màu–ngày đều trống là dòng trống và được bỏ qua.
- Ô trống thuộc cột đã ánh xạ được nhập 0 theo cấu hình. Cột không có trong nguồn bị chặn, tránh nhầm cột bị đổi tên thành tồn 0.
- Tồn Lark có ngày cũ hơn ngày tồn đã lưu trong ứng dụng: bỏ qua. Không cho tồn lịch sử ghi đè tồn mới. Cùng ngày có thể cập nhật lại để phản ánh kiểm kho điều chỉnh.
- Cảnh báo nếu ngày tồn cách hiện tại hơn 7 ngày. Cần đối soát kỳ tồn trước khi xác nhận.
- Giữ nguyên inbound, day1/day2, salesSource, lifecycle, pilotQty, manualRate, abnormal, selected và tất cả lệnh/biên nhận.
- Lưu inventoryAt theo **ngày kiểm**, inventorySource có table/record ID. Preview lưu thời điểm đọc; audit lưu nguồn/ánh xạ/người xác nhận/giá trị tồn trước và sau; snapshot giữ từng lần cập nhật.
- Preview chỉ thuộc người tạo, hết hiệu lực sau 15 phút. Nó là bản chụp lúc đọc, không phải số tồn Lark trực tiếp tại lúc xác nhận. Nếu Lark vừa sửa, đóng preview và đọc lại.
- Confirm trong transaction, kiểm tra phiên bản nguồn và từng SKU, khóa dòng theo thứ tự; xung đột rollback toàn bộ và yêu cầu xem trước lại. Không có việc sửa một phần mà báo hoàn tất.
- Chỉ Administrator có quyền cấu hình/đọc/xác nhận. Có session, CSRF, Origin validation và giới hạn đọc Lark 5 lần/phút/IP; các lần đọc API có timeout/retry hữu hạn.

## 4. Chẩn đoán

- **Không đọc được trang Wiki:** kiểm tra `wiki:wiki:readonly`, quyền app với trang/không gian Wiki và app đã phát hành quyền mới chưa.
- **Không đọc được cột/bản ghi:** kiểm tra quyền Base API và quyền tài liệu, bảng/view đúng, quyền nâng cao.
- **0 dòng:** không chứng minh tồn 0; kiểm tra view, quyền nâng cao. Không tự xóa tồn đang có.
- **SKU bị bỏ qua:** xem lý do chưa có danh mục hoặc tồn trong ứng dụng mới hơn ngày nguồn.
- **Xung đột:** tải lại cấu hình nếu cần, đọc tồn & xem trước lại. Không ép ghi đè.

Không có credential Lark/Railway thực trong môi trường phát triển nên chưa xác minh quyền Base thật. Test dùng API giả lập và PostgreSQL `_test`, không tạo/sửa dữ liệu kho công ty.

## Tài liệu chính thức đã kiểm tra ngày 17/10/2026

- [Wiki get_node](https://open.larksuite.com/document/server-docs/docs/wiki-v2/space-node/get_node): obj_type phải là bitable; dùng obj_token làm app_token.
- [Base field list](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-field/list).
- [Base record search](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/search): API hiện hành, phân trang 500 và quyền nâng cao.
- [Cloud document permissions](https://open.larksuite.com/document/ukTMukTMukTM/uczNzUjL3czM14yN3MTN).
