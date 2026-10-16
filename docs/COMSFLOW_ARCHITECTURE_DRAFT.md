# COMS-FLOW — Kiến trúc sơ bộ

Tài liệu này là bản thiết kế ban đầu, giữ lại để truy vết. File V9 đã được cung cấp và đối chiếu; mô tả triển khai thực tế nằm ở `production/docs/ARCHITECTURE.md`. Các ý tưởng như worker đồng bộ Base và phê duyệt tùy chọn trong bản nháp không phải chức năng đã hoàn thành. Xem V9_FEATURE_MAP.md cho trạng thái chính xác.

## Ranh giới hệ thống

React + TypeScript cho giao diện tiếng Việt; Tailwind biên dịch cục bộ thay vì phụ thuộc CDN runtime. Backend Node.js + TypeScript cung cấp API; PostgreSQL lưu tập trung toàn bộ dữ liệu nghiệp vụ. Múi giờ nghiệp vụ `Asia/Ho_Chi_Minh`; timestamp giao dịch lưu `timestamptz`, ngày báo cáo lưu ngày nghiệp vụ rõ ràng. Không dùng localStorage làm nguồn dữ liệu chính.

Ứng dụng mở bằng icon trong Lark Custom App; không có chatbot và không phải Base Extension. Cần kiểm tra tài liệu Lark chính thức hiện hành trước khi chọn endpoint/SDK, quyền, callback và cơ chế xác thực web/desktop/mobile. Chưa xác nhận endpoint hoặc scope nào trong tài liệu này.

## Mô hình dữ liệu dự kiến

| Thực thể | Trách nhiệm và ràng buộc |
| --- | --- |
| Products / ProductVariants | Mã sản phẩm, tên, màu, size, vòng đời; SKU duy nhất theo mã–màu–size; xác định cấp lưu vòng đời sau khi đọc V9 |
| Suppliers | Xưởng và trạng thái sử dụng |
| SalesImports / SalesImportRows | File nguồn, hash, kỳ, chế độ nhập, người nhập, dòng gốc, lỗi, combo chưa phân giải; không suy diễn khóa chống trùng chỉ bằng mã đơn |
| DailySales | Số lượng hợp lệ theo ngày và SKU, liên kết nguồn; tách báo cáo mẫu khỏi dữ liệu vận hành |
| InventorySnapshots | Tồn thực tế nullable, nguồn, ngày cập nhật, người cập nhật; null không tương đương 0 |
| PlanningPolicies | Mục tiêu/an toàn/chờ/bật cộng chờ/bội số và phiên bản chính sách |
| ProductionOrders | UUID ổn định, mã hiển thị duy nhất, xưởng, ngày hẹn, trạng thái, ưu tiên, version, người tạo/cập nhật |
| ProductionOrderCodeReservations | Giữ mọi mã từng sử dụng kể cả đổi tên và xóa mềm; cấp số nguyên tử theo ngày nghiệp vụ |
| ProductionOrderItems | Liên kết SKU, số đặt, dữ liệu định danh tại thời điểm đặt; duy nhất SKU trong lệnh |
| ProductionReceipts / ReceiptItems | Đợt nhận bất biến, người/ngày/ghi chú, số lượng theo dòng lệnh; khóa idempotency và hash nội dung |
| ProductionOrderRevisions | Lý do, actor, version, trước/sau và thay đổi theo trường; ghi cùng transaction |
| ArchivedOrders | Metadata xóa/khôi phục và lý do; giữ nguyên lệnh, dòng, biên nhận và revision |
| ActivityLogs | Nhật ký hành động, định danh cá nhân, correlation ID; không ghi token hoặc secret |
| Users / Roles / UserRoles | Danh tính Lark theo tenant và định danh ổn định, vai trò được cấp; không tự cấp Administrator cho người đăng nhập |

## Toàn vẹn giao dịch

- Sửa lệnh kiểm tra quyền và `expectedVersion`, khóa lệnh trong transaction; khác version trả xung đột và yêu cầu tải lại. Kiểm tra trùng SKU, mã, số đặt không nhỏ hơn đã nhận; khóa mã/màu/size và cấm xóa dòng có biên nhận. Lý do bắt buộc, không sửa biên nhận cũ.
- Nhận hàng khóa lệnh và các dòng theo thứ tự nhất quán; tính lại số chờ trong transaction, từ chối vượt chờ. Idempotency có unique constraint theo phạm vi người dùng/hành động; cùng khóa nhưng khác payload trả xung đột. Ghi biên nhận, trạng thái, version, nhật ký một lần nguyên tử.
- Sửa lệnh và nhận hàng phải dùng cùng quy tắc khóa/version, tránh một hành động vượt qua kiểm tra của hành động kia.
- Xóa mềm không giải phóng mã; khôi phục giữ nguyên lịch sử. Hủy phần chưa nhận là hành động riêng, không xóa biên nhận, không tương đương xóa mềm.
- Không cộng tồn khi nhận hàng. Nguồn hàng đang về phải xác định rõ: nhập thủ công hoặc tính từ lệnh theo chính sách; không cộng hai nguồn cho cùng sản lượng. Cách ánh xạ cần đối chiếu V9.
- Công thức phải là hàm nghiệp vụ thuần có test; kết quả giải thích được bằng đầu vào và phiên bản chính sách. Backend tính lại khi ghi, không tin số dự báo frontend gửi lên.

## Phân quyền và tích hợp

Backend kiểm tra quyền trên mọi API đọc/ghi. Warehouse chỉ nhận hàng khi được cấp quyền; Planner không tự có quyền quản trị người dùng. Quyền duyệt của Manager phụ thuộc cấu hình quy trình; Viewer chỉ đọc. Chi tiết ma trận quyền sẽ được chốt cùng đặc tả V9.

Lark login xử lý mã đăng nhập tại backend, xác minh tenant, chống CSRF bằng state và quản lý phiên cookie HttpOnly/Secure phù hợp môi trường Lark. Secret chỉ ở backend, không VITE_* và không ghi log. Không sử dụng tài khoản kỹ thuật chung làm actor cho người dùng.

Adapter Lark Base là tùy chọn, có ánh xạ nguồn chuẩn theo trường và external ID, staging/xem trước, checkpoint và retry có giới hạn cho lỗi tạm thời/rate limit; không retry mù thao tác ghi. Không đồng bộ hay ghi lên Base thực trong kiểm thử. Chưa có quyền/config thì giao diện báo chưa cấu hình.

## Import, sao lưu và triển khai

Import Excel/CSV/JSON vào staging có giới hạn kích thước, schema validation, xem trước lỗi/trùng và xác nhận. Thay thế kỳ chỉ tác động phạm vi báo cáo được xác nhận; bổ sung dùng khóa đơn+dòng đáng tin cậy hoặc chuyển sang đối soát nếu thiếu khóa. JSON V9 cần adapter từ schema thực tế; chưa thể viết chính xác khi thiếu file.

Triển khai frontend/backend trên HTTPS, PostgreSQL có migrations, tài khoản tối thiểu quyền và sao lưu định kỳ. Cần diễn tập restore sang database riêng; backup tồn tại chưa chứng minh phục hồi được. Tách database test/staging/production, không đưa dữ liệu công ty lên dịch vụ ngoài khi chưa được phép.

## Cổng kiểm thử trước bàn giao

Unit tests: công thức 60, bội số, tùy chọn chờ, bốn vòng đời, thiếu tồn, ngày bất thường, ngày xuất thiếu, loại đơn và combo. Integration tests trên PostgreSQL thật: nhiều size/màu, ba đợt giao, vượt nhận, sửa sau nhận, mã không tái dùng, nhật ký bất biến, xóa/khôi phục, rollback, idempotency đồng thời và hai nhân viên sửa cùng version. Auth tests dùng bộ giả lập trong test; đăng nhập Lark thật phải được xác minh riêng sau khi có app/config.

Chỉ tuyên bố tích hợp Lark hoạt động sau kiểm thử đăng nhập trên ứng dụng nội bộ được cấu hình/phát hành. Cấu hình mẫu và mock không phải bằng chứng tích hợp thật.
