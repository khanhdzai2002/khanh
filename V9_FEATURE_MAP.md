# COMS-FLOW — Bảng đối chiếu V9

Triển khai hiện tại: [Railway và Custom App Lark 1.0.0 đã phát hành](production/docs/RAILWAY_DEPLOY.md). Người dùng đã mở được https://khanh-production.up.railway.app và xác nhận đăng nhập Lark bằng ảnh; ảnh đăng nhập đầu tiên có vai trò Viewer. Chưa đổi công thức nghiệp vụ. Xem [đối chiếu nút thao tác và khởi tạo Administrator](production/docs/V9_BUTTON_AUDIT.md).


Cập nhật thao tác 17/10/2026: [nguyên nhân, bản sửa và kiểm thử](production/docs/V9_ACTION_FIXES.md). Bổ sung thêm mã/màu/size ngay trong lệnh, sửa số ngay trong bảng bán, chuyển từng SKU hoặc nhóm đang lọc và lỗi lưu ngay trong dialog.

Báo cáo bán hàng cập nhật: [ma trận mã → màu × size và sửa bộ đọc XLSX](production/docs/SALES_REPORT.md). Giữ quy tắc số lượng, vòng đời và công thức V9.

## Trạng thái và nguồn

**Đã nhận và phân tích file V9** `comsflow_production_planner_v9_chinh_sua_lich_su_goi_hang.html` (744 dòng, SHA-256 `5e468146bd3ed292b7e4494a1276e4572d08161743a5f83f57adb36ce20b3316`). Xem `docs/V9_SOURCE_INVENTORY.md` và `docs/V9_FINDINGS.md`. Ứng dụng mới được xây riêng trong `production/`, bảo toàn ứng dụng đặt xe hiện tại.

Bảng dưới đây đối chiếu MASTER PROMPT với V9. Trạng thái phân tích không đồng nghĩa đã triển khai hoặc đã kiểm thử ứng dụng mới. Danh mục hàm và cấu trúc dữ liệu trong tài liệu nguồn cho phép truy vết đến từng dòng.

| Nhóm | Yêu cầu đối chiếu | Đích dự kiến | Trạng thái |
| --- | --- | --- | --- |
| Dashboard | SKU, tồn, đề xuất, chọn sản xuất, đặt xưởng, nhận, còn nợ, quá hạn; lọc ngày/mã/xưởng | Dashboard và truy vấn tổng hợp, loại lệnh xóa mềm | Đã đối chiếu nguồn; xem bảng truy vết dưới |
| Tab 01 | CRUD SKU, mã/màu/size, nhập nhanh nhiều size, sửa bảng, tìm/lọc, chọn nhiều, đổi vòng đời hàng loạt | Danh mục và dự kiến sản xuất | Đã đối chiếu nguồn; xem bảng truy vết dưới |
| Chính sách | Mục tiêu 5 ngày, chờ 3 ngày, an toàn 0, không cộng chờ mặc định, bội số 1 | PlanningPolicies, dịch vụ dự báo có phiên bản | `policyCheck`, `calc` dòng 227–253 |
| Tăng trưởng | Trung bình 2 ngày hoặc tốc độ thủ công cho ngày bất thường; thiếu tồn khóa đề xuất | Dự báo kèm chi tiết công thức và nguồn đầu vào | Đã đối chiếu nguồn; xem bảng truy vết dưới |
| Mở bán | Dùng lượng test nhập tay, không trừ tồn | Nhánh dự báo riêng | Đã đối chiếu nguồn; xem bảng truy vết dưới |
| Giảm sút / Xả kho | Đề xuất bằng 0; không tự đổi vòng đời theo tín hiệu bán | Nhánh dự báo riêng, tín hiệu xu hướng độc lập | Đã đối chiếu nguồn; xem bảng truy vết dưới |
| Tab 02 | Tạo lệnh từ SKU hoặc dòng tay, chọn màu, nhóm mã+màu, XS/S/M/L/XL/2XL, tổng theo size/màu/lệnh | Trình soạn lệnh sản xuất | Đã đối chiếu nguồn; xem bảng truy vết dưới |
| Mã và trạng thái lệnh | LSX-YYYYMMDD-01 không tái sử dụng; nháp/gửi/xác nhận/sản xuất/giao một phần/hoàn thành/tạm dừng/hủy còn lại | Máy trạng thái và cơ chế giữ mã đã sử dụng | Đã đối chiếu nguồn; xem bảng truy vết dưới |
| Ưu tiên và xuất | Thường/Ưu tiên/Cấp bách; Excel/CSV/in PDF | Lệnh và báo cáo | Đã đối chiếu nguồn; xem bảng truy vết dưới |
| Lịch sử | Tìm/lọc, xưởng, ngày hẹn, số đặt/nhận/chờ, tiến độ, phụ trách | Danh sách lệnh và chi tiết lịch sử | Đã đối chiếu nguồn; xem bảng truy vết dưới |
| Giao nhiều đợt | Biên nhận theo SKU/ngày/ghi chú; không nhận quá chờ; không tự cộng tồn | Receipts, transaction, khóa dòng, idempotency | Đã đối chiếu nguồn; xem bảng truy vết dưới |
| Sửa lệnh lịch sử | Lý do bắt buộc, trước/sau/người/thời gian, khóa định danh dòng đã nhận, không giảm dưới đã nhận, không xóa dòng đã nhận | Revisions, kiểm tra backend, optimistic concurrency | Đã đối chiếu nguồn; xem bảng truy vết dưới |
| Hủy phần còn lại | Phân biệt xóa; phải khôi phục phần chưa nhận trước khi sửa số lượng | Hành động nghiệp vụ riêng có nhật ký | Đã đối chiếu nguồn; xem bảng truy vết dưới |
| Xóa và khôi phục | Giữ dòng/biên nhận/revision, lý do/người/thời gian; không tính KPI hoạt động | ArchivedOrders và soft delete | Đã đối chiếu nguồn; xem bảng truy vết dưới |
| Tab 04 | TikTok Excel/CSV, loại hủy/chưa thanh toán/hoàn trả, tính số lượng lẻ, top mã/màu, xu hướng, 2/7 ngày, khoảng tùy chọn | Pipeline import và phân tích bán hàng | `makeSalesSnapshot` dòng 724–736 |
| Combo | Thiếu ánh xạ màu/size đưa vào đối soát riêng | Hàng nhập chưa phân giải, không tự gán SKU | Đã đối chiếu nguồn; xem bảng truy vết dưới |
| Kỳ nhập bán hàng | Thay thế hoặc bổ sung, chống trùng đơn/dòng, nguồn file/người/kỳ/thời gian; bỏ ngày xuất chưa trọn vẹn | SalesImports, dữ liệu gốc và DailySales | V9 chỉ thay thế; bổ sung/chống trùng là yêu cầu mới |
| Chuyển bán sang dự kiến | Giữ tồn, đang về, vòng đời; dữ liệu nhúng là lịch sử/mẫu | Chuyển từng SKU hoặc nhóm đang lọc có xác nhận | Đã đối chiếu nguồn; xem bảng truy vết dưới |
| Tồn và đang về | Nguồn/ngày cập nhật, thiếu tồn khác 0, không trừ hai lần sản lượng đang về | InventorySnapshots và nguồn incoming rõ ràng | Đã đối chiếu nguồn; xem bảng truy vết dưới |
| JSON V9 | Xem trước, phát hiện trùng, xác nhận trước ghi | Bộ chuyển đổi dữ liệu có staging | Đã xác định schema; xem inventory |
| Lark Custom App | Icon CF, web app riêng, đăng nhập cá nhân, desktop/mobile, không chatbot/Base Extension | Xác thực backend, phiên người dùng và RBAC | Đã có mã và hướng dẫn; chưa xác minh tenant thật |
| Lark Base | Ánh xạ trường, nguồn chuẩn, chống trùng, không ghi đè bảng đang dùng | Adapter chỉ đọc xem trước; chưa đồng bộ | Cần field mapping và quyền Base thật |
| Vai trò | Administrator, Production Planner, Warehouse Operator, Manager, Viewer | Quyền tại backend, mặc định từ chối | Đã có RBAC backend; kiểm thử HTTP và phiên |

## Ví dụ chấp nhận từ yêu cầu

- Tăng trưởng: `(20 × 5) − 30 − 10 = 60`, không cộng mặc định 3 ngày chờ.
- Giao lệnh 1.000: nhận 300 rồi 450 → nhận 750, chờ 250, tiến độ 75%.
- Hai phiên sửa cùng version: lần ghi thứ hai bị từ chối, yêu cầu tải lại.
- Mọi kiểm thử giao dịch dùng cơ sở dữ liệu riêng, không dùng lệnh thật.

## Truy vết hành vi thực tế

| Nguồn V9 | Hành vi xác minh | Hướng chuyển đổi |
| --- | --- | --- |
| 95–103, 227–253 | Policy min/max 1–45, 0–30, 0–20, 1–1000; khóa mọi đề xuất khi policy sai | Giữ giới hạn và nhánh công thức, validate backend |
| 234–253 | Mở bán lấy floor test, không làm tròn bội; tăng trưởng ceil nhu cầu trước làm tròn bội; cover = tồn / rate | Giữ nguyên, không tự đổi vòng đời |
| 253, 294–301 | Cấp bách khi cover ≤ leadDays + 2; đổi vòng đời theo mã do người vận hành | Giữ ngưỡng và xác nhận bulk |
| 284–327 | Nhóm mã+màu; priority cao nhất; size XS/S/M/L/XL/2XL; CSV, HTML giả .xls, print | Xuất .xlsx thật, giữ cột và tổng |
| 331–377 | Nhận cộng dồn, còn chờ 0 khi hủy, không thay tồn/inbound; mã max+1 từ active+deleted | Transaction, chống lặp, giữ mã vĩnh viễn |
| 380–515 | Sửa có snapshot, sourceIndex, lý do ≥3; khóa dòng nhận; chữ ký JSON; reopen hủy | UUID dòng, version, server validation và actor phiên Lark |
| 517–573 | Archive đầy đủ; tìm/lọc/xuất/xem/khôi phục; loại KPI | Soft-delete và sự kiện khôi phục, audit bất biến |
| 580–617 | Ngày đầy đủ lấy exportedAt trước 23:55 thì bỏ ngày cuối; r2=q2/2, r7=q7/7; trend ≥1,2 và chênh ≥0,5 hoặc ≤0,8 và chênh ≤−0,5 | Giữ thresholds; báo rõ phạm vi dữ liệu; nhập mốc export minh bạch |
| 664–682 | Chuyển 2/7 ngày giữ tồn/inbound/vòng đời/test; 7 ngày dùng abnormal/manualRate | Giữ đầu vào khác; ghi nguồn và audit |
| 695–736 | XLSX ZIP/XML, CSV; chuẩn hóa MIU/MAN, map màu MIU66/01/37; đơn hủy/unpaid/return/refund bị loại; net qty-returned; combo/unknown riêng | Giữ parser nghiệp vụ; thư viện đọc file và staging có validation |
| 328–329, 742 | Backup/restore toàn state, không catalog; migrations v7/v8 có thể đổi policy cũ | Import xem trước, không áp dụng migration cũ âm thầm |

## Phạm vi mới so với V9

V9 không có database, API, giao dịch nhiều người dùng, Lark login, RBAC, actor đáng tin cậy, idempotency, nhập bổ sung, danh mục suppliers độc lập, hoặc dashboard xuyên module. Các mục này là yêu cầu nâng cấp, không được mô tả là chức năng sẵn có của V9.

## Trạng thái triển khai hiện tại

| Module | Mã ứng dụng mới | Xác thực / giới hạn |
| --- | --- | --- |
| Dự báo và vòng đời | `production/shared/domain.ts`, `src/Planning.tsx` | Đối chiếu 400 trường hợp với calc V9; thiếu tồn là null; không trừ hai lần hàng đang về |
| Dashboard | `src/App.tsx`, `server/service.ts` | KPI từ PostgreSQL, không seed số liệu V9; bộ lọc ngày/xưởng cho lệnh, mã cho tồn/dự báo |
| Danh mục và CSV/XLSX | `src/Planning.tsx`, `server/app.ts` | CRUD/sửa số liệu, thêm nhiều màu/size, đổi vòng đời hàng loạt, preview chống trùng; SKU đã dùng trong lệnh khóa định danh |
| Lệnh và ma trận size | `src/Orders.tsx`, `server/service.ts` | Tạo/sửa/mức ưu tiên, tổng theo size, mã không tái dùng, xuất XLSX thật/CSV/in; mã mới tạo nguyên tử tại backend |
| Giao nhận nhiều đợt | `server/service.ts`, `migrations/001_initial.sql` | Transaction, version, idempotency; kiểm thử 1.000→300+450+250; không tự cập nhật tồn |
| Chỉnh sửa và nhật ký | `server/service.ts`, `src/Orders.tsx` | Lý do, trước/sau, actor, khóa dòng đã nhận; xung đột 409; biên nhận/audit có trigger bất biến |
| Xóa/khôi phục/hủy | `server/service.ts`, `src/Orders.tsx` | Soft-delete, snapshot, lịch sử khôi phục; hủy phần còn lại là hành động riêng |
| Bán hàng | `shared/sales.ts`, `server/imports.ts`, `src/Sales.tsx` | CSV và XLSX, top mã/màu, trend, TB 2/7, combo/unknown/excluded, nguồn file/kỳ/người; không có TikTok API |
| Chuyển sang kế hoạch | `server/imports.ts` | Giữ tồn, đang về, vòng đời, test; 7 ngày dùng manualRate như V9 |
| Nhập bổ sung | `server/imports.ts`, migrations | Cần Order Line ID hoặc SKU ID; thiếu khóa bị chặn, không phỏng đoán gộp đơn |
| JSON V9 | `server/imports.ts`, `src/Settings.tsx` | Preview, duplicate/mismatch blocking, transaction; nhập lệnh/nháp/đã xóa và biên nhận; editLog cũ nguyên vẹn trong nguồn V9, không giả thành actor Lark đã xác minh |
| Lark login và quyền | `server/auth.ts`, `src/Settings.tsx` | SDK chính thức, state, session PostgreSQL, CSRF, 5 vai trò. Test auth dùng mock; cần tenant/App Secret/HTTPS để thử thật |
| Icon/app riêng | `production/public/cf.svg`, `docs/LARK_SETUP.md` | Web app/icon đã có; chưa tạo/phát hành app trong Developer Console |
| Lark Base | `server/app.ts`, `docs/LARK_SETUP.md` | Chỉ đọc tối đa 100 bản ghi để xác minh; chưa có ánh xạ tenant hoặc đồng bộ/ghi dữ liệu thật |
| Phê duyệt Manager | `shared/domain.ts` | Quyền được tách; workflow duyệt tùy chọn chưa bật/chưa có API duyệt, không tuyên bố đã duyệt |
| Vận hành | `production/docs/DEPLOYMENT.md`, Dockerfile, scripts | Local build/API/browser đã kiểm tra; deployment HTTPS, publication và fresh-task restoration chưa xác minh |

Xem `production/README.md` cho cách chạy và `production/docs/TESTING.md` cho bằng chứng và giới hạn. Không coi trạng thái tích hợp bên ngoài là hoàn thành chỉ vì có code hoặc mock.

## Thiết lập tài khoản bổ sung

Trang riêng quản lý thành viên, tạo Admin/thành viên bằng danh tính Lark, 5 vai trò, khóa/mở và audit: [ACCOUNT_MANAGEMENT.md](production/docs/ACCOUNT_MANAGEMENT.md). Đây là chức năng mới cho nhiều người dùng; không thay đổi công thức hoặc workflow V9.

### Tồn kho Lark Base

Bổ sung nguồn tồn Wiki/Base, ánh xạ mã–màu và size ngang, ngày mới nhất theo mã–màu, ô trống bằng 0 theo xác nhận người dùng; preview/confirm tập trung, snapshot/audit/version. Không thay công thức V9 hoặc inbound/lifecycle. Xem `production/docs/LARK_INVENTORY.md`.

### Thao tác nhanh kế hoạch

Tồn Lark theo SKU đã chọn; đang về đối soát từ phần còn chờ của lệnh, thay thế không cộng dồn; lên lệnh nhanh từng SKU/nhóm đã chọn với số đề xuất V9. Giữ preview/confirm, audit/version/idempotency và không tự gửi xưởng. Xem `production/docs/PLANNING_ACTIONS.md`.

### Báo cáo cơ cấu sản phẩm gối

Thêm báo cáo tỷ trọng theo mã, màu/size, từng lệnh, xưởng/ngày, tiến độ và quá hạn tại trang Gối lệnh sản xuất. Dùng số lượng thật đã đặt/nhận/còn chờ, lọc rõ trạng thái và mẫu số, xuất CSV/Excel. Chỉ đọc; giữ nguyên nghiệp vụ V9. Xem `production/docs/PRODUCTION_REPORT.md`.

### Danh sách chờ và tỷ trọng tròn

Thêm ngay dưới danh sách lệnh: cộng phần chưa nhận theo mã–màu–size, bộ lọc/search không dấu, modal đối soát lệnh nguồn, donut tỷ trọng số còn chờ theo mã và CSV/Excel đúng bộ lọc. Chỉ đọc, không thay tồn/giao nhận/dự báo V9. Xem `production/docs/PENDING_PRODUCTION.md`.
