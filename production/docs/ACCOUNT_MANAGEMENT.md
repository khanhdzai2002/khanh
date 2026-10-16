# Thiết lập tài khoản và phân vai trò

Mở **Thiết lập tài khoản** trên sidebar. Tab Phân quyền cũ trong Cấu hình & dữ liệu cũng dẫn tới trang này. Chức năng dùng danh tính Lark cá nhân và PostgreSQL trung tâm; không tạo mật khẩu nội bộ hoặc tài khoản trong danh bạ Lark.

## 1. Administrator đầu tiên

Nếu đang là Viewer và hệ thống chưa có Administrator, mở Cấu hình & dữ liệu → Tài khoản & quyền thao tác. Chủ hosting sao chép đúng Open ID, đặt `LARK_INITIAL_ADMIN_OPEN_ID` trên Railway, Deploy, rồi tài khoản được chỉ định xác nhận khởi tạo trong giao diện. Xem V9_BUTTON_AUDIT.md. Bước này chỉ dùng một lần, không tự cấp admin cho người đầu tiên đăng nhập.

## 2. Thêm thành viên

Administrator chọn **Thêm thành viên**, nhập tên, Open ID thuộc đúng Custom App Lark đang kết nối, chọn một trong năm vai trò rồi lưu. Có thể chọn Administrator cho người được ủy quyền quản trị. Open ID là định danh ứng dụng, không phải email, App ID, user_access_token hoặc tenant key.

Cách thường dùng đơn giản hơn: nhân viên mở URL COMS-FLOW, đăng nhập Lark một lần. Họ tự xuất hiện với quyền Viewer; Administrator tìm người đó và chọn **Thiết lập quyền**. Không thêm lại Open ID đã có. Không gửi token hoặc App Secret cho người quản lý tài khoản.

Nếu thêm trước khi nhân viên đăng nhập, dòng thành viên hiển thị **Chưa đăng nhập Lark**. Lần đăng nhập hợp lệ đầu tiên giữ vai trò đã được cấp; tên được đồng bộ theo Lark. Thêm thành viên không gửi email/tin nhắn mời và không tạo danh tính trên Lark. Nhân viên vẫn phải thuộc đúng tenant, nằm trong phạm vi sử dụng Custom App và đăng nhập bằng chính tài khoản Lark đó.

## 3. Vai trò

| Vai trò | Quyền trong ứng dụng |
| --- | --- |
| Administrator | Quản trị tài khoản, dữ liệu, kế hoạch, lệnh, giao nhận và khôi phục |
| Production Planner | SKU, dự báo, nhập bán hàng, tạo/sửa lệnh, xóa mềm/khôi phục |
| Warehouse Operator | Xem và ghi nhận hàng xưởng giao |
| Manager | Xem báo cáo/tiến độ; workflow phê duyệt chưa bật |
| Viewer | Chỉ xem dữ liệu được phép |

Tab **Vai trò & quyền** hiển thị ma trận lấy từ cùng chính sách được backend sử dụng. Đây là năm vai trò cố định, chưa có role tùy chỉnh hoặc chỉnh từng permission độc lập.

## 4. Đổi vai trò, khóa và mở truy cập

Tìm theo tên/Open ID hoặc lọc vai trò, trạng thái. Nhấn **Thiết lập quyền** ở đúng dòng, chọn vai trò và trạng thái, nhập lý do tối thiểu 3 ký tự, nhấn **Lưu thiết lập**. Nếu cập nhật chính tài khoản đang sử dụng, trang tải lại để áp dụng vai trò mới.

Khóa tài khoản thu hồi các phiên đăng nhập đang lưu và chặn đăng nhập Lark tiếp theo. Mở lại giữ nguyên danh tính và lịch sử. Không xóa vật lý tài khoản đã gắn với lệnh/biên nhận/audit. Quyền được đọc lại từ PostgreSQL ở mỗi API; thay đổi vai trò không chỉ ẩn/hiện nút frontend.

Không được khóa hoặc hạ quyền quản trị viên hoạt động cuối cùng. Quản trị viên thay thế phải đăng nhập Lark thành công ít nhất một lần; một dòng Admin mới thêm nhưng chưa đăng nhập không được coi là người thay thế đã sẵn sàng. Khi hai người sửa cùng phiên bản, lần ghi sau nhận 409 và cần **Tải lại danh sách** trước khi thử lại.

## 5. Lịch sử phân quyền

Tab **Lịch sử phân quyền** hiển thị 200 thay đổi gần nhất: thời gian Việt Nam, người thực hiện, thành viên bị thay đổi, vai trò/trạng thái trước và sau, lý do. Các sự kiện khởi tạo admin cũng được đưa vào danh sách. Nhật ký append-only và cùng transaction với thay đổi quyền, không tự sửa lịch sử cũ.

## 6. Triển khai và kỹ thuật

Migration `005_user_access_versions.sql` thêm version cho users và index truy vấn đăng nhập. Không reset bảng hoặc thay đổi công thức V9. `npm start` chạy migration trước khi listen; Railway cần dùng commit mới nhất của nhánh comsflow-railway.

API quản lý: GET/POST `/api/users`, PUT `/api/users/:id`, GET `/api/users/activity`. Các endpoint này bắt buộc Administrator đang hoạt động. POST/PUT cần session + CSRF + Origin hợp lệ. Tenant luôn lấy từ tài khoản quản trị đã xác thực, không nhận từ request. PUT cần expectedVersion và reason. Backend kiểm tra lại quyền actor trong transaction, dùng advisory lock cho thay đổi vai trò và khóa dòng user, kiểm tra quản trị viên cuối cùng và ghi audit.

`GET /api/account` vẫn chỉ trả thông tin của chính người đang đăng nhập. Viewer không xem được danh sách thành viên hoặc audit của người khác. Người ngoài tenant không được thêm vào bằng cách truyền tenantKey trong body.
