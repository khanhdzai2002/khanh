# COMS-FLOW PRODUCTION MANAGEMENT

Ứng dụng React/TypeScript + Node/TypeScript + PostgreSQL cho đặt hàng, gối hàng và theo dõi sản xuất. Giao diện tiếng Việt, icon CF, thiết kế cho Lark Custom App. Không chatbot, không Base Extension.

Ứng dụng mới nằm hoàn toàn trong `production/`. Mã ứng dụng đặt xe ở thư mục gốc được giữ lại; lệnh mặc định ở gốc đã trỏ tới ERP. Dữ liệu V9 là đặc tả và lịch sử tham khảo, không được seed thành dữ liệu vận hành.

## Chạy phát triển

Yêu cầu Node.js 24, npm 11, PostgreSQL 17. Từ thư mục `/workspace/khanh/production`:

```bash
npm ci --cache /workspace/.npm-cache
cp .env.example .env.local
```

Cấu hình `.env.local` bằng giá trị thực trong môi trường của bạn: DATABASE_URL tới database phát triển, SESSION_SECRET ngẫu nhiên tối thiểu 32 ký tự và PUBLIC_URL đúng origin giao diện. Không gửi secret trong chat hoặc commit vào Git. Mặc định `DEV_AUTH=false`; chỉ bật rõ ràng khi dùng database thử nghiệm và máy phát triển riêng.

```bash
npm run dev:all
# Hoặc từ thư mục gốc: npm run dev
```

Vite dùng cổng 5173 và proxy `/api`, `/auth` tới API cổng 3001. Đây là các địa chỉ cấu hình nội bộ, không phải liên kết preview được hỗ trợ trong onboarding UI. Khi chưa có Lark, màn hình báo chưa cấu hình; DEV_AUTH=true mở danh tính DEV được gắn nhãn rõ. Không dùng danh tính DEV với dữ liệu công ty hoặc triển khai Internet.

Database phát triển trong phiên xây dựng hiện tại là container `comsflow-postgres`, cổng host 5433; mật khẩu ngẫu nhiên và secret phiên chỉ nằm trong `.env.local` bị Git ignore. Dữ liệu kiểm thử dùng database riêng `comsflow_test`; không mặc định coi volume Docker là dữ liệu được bảo toàn ở task/máy mới. Các tiến trình đang chạy không thay thế cấu hình startup hay deploy lâu dài.

## Kiểm thử

```bash
npm run build
# Tạo database test riêng trước. TEST_DATABASE_URL phải kết thúc bằng _test.
npm test
```

Nếu không đặt TEST_DATABASE_URL, runner lấy DATABASE_URL và thêm hậu tố `_test`; không tự tạo database và không bao giờ dùng database chính để reset. Tests truncate dữ liệu trong database test. Không chạy tests đồng thời với smoke UI trên cùng database.

Có 107 tests, gồm 400 trường hợp đối chiếu công thức với hàm V9 nguyên gốc trong một test. Xem [bằng chứng và giới hạn kiểm thử](docs/TESTING.md).

## Tài liệu bàn giao

- [Đối chiếu V9](../V9_FEATURE_MAP.md), [danh mục mã nguồn V9](../docs/V9_SOURCE_INVENTORY.md), [lỗi và sai khác V9](../docs/V9_FINDINGS.md).
- [Kiến trúc và database](docs/ARCHITECTURE.md).
- [Triển khai Railway và cập nhật Custom App Lark hiện hữu](docs/RAILWAY_DEPLOY.md).
- [Chi tiết OAuth, quyền và Lark Base](docs/LARK_SETUP.md).
- [Triển khai HTTPS, backup và restore](docs/DEPLOYMENT.md).
- [Nhập dữ liệu V9 và bán hàng](docs/IMPORTS.md).
- `.env.example`, migrations SQL, Dockerfile, compose.yaml và scripts backup/restore nằm cùng dự án.

## Nếu không thấy nút tạo/sửa

Kiểm tra vai trò ở góc trên. Viewer chỉ xem; xem [đối chiếu V9 và cách chỉ định Administrator đầu tiên](docs/V9_BUTTON_AUDIT.md). Không cần sửa SQL hoặc cấp admin cho mọi người.

## Thiết lập tài khoản

Sidebar **Thiết lập tài khoản**: thêm thành viên Lark, cấp 5 vai trò (kể cả Administrator), khóa/mở, tìm kiếm/lọc và lịch sử phân quyền. Xem [hướng dẫn quản lý tài khoản](docs/ACCOUNT_MANAGEMENT.md).

## Những gì đã có

Dashboard từ dữ liệu tập trung; CRUD SKU/nhiều màu-size/sửa bảng/bulk vòng đời; policy chuẩn V9; tạo và sửa lệnh bằng ma trận size; nhận nhiều đợt; khóa dữ liệu đã nhận; idempotency; version chống ghi đè; audit trước/sau; giữ mã không tái dùng; hủy phần chờ; xóa mềm và khôi phục; CSV/XLSX/print; phân tích file TikTok; nhập thay thế/bổ sung có chống trùng; chuyển số bán giữ tồn/vòng đời; import JSON V9 có preview; RBAC và cấu trúc đăng nhập Lark phía backend.

## Chưa hoàn thành / chưa xác minh bên ngoài

- Người dùng xác nhận Custom App 1.0.0 đã Released và chọn Railway làm hosting chính. Chưa có quyền Railway, project, database Railway, URL HTTPS thật hoặc credential Lark để xác minh ngoài. Auth test dùng mock, không phải bằng chứng đăng nhập thật. Người dùng cung cấp cấu hình an toàn theo LARK_SETUP.md rồi cần kiểm tra trên desktop/mobile Lark thực tế.
- Tồn kho Lark Base: cấu hình URL Wiki/Base và ánh xạ, đọc có phân trang theo view, xem trước rồi xác nhận cập nhật PostgreSQL có snapshot/audit/version/idempotency. Không ghi ngược Base, chưa có lịch đồng bộ tự động; quyền Base thật cần xác minh sau triển khai. Xem [hướng dẫn kết nối tồn kho](docs/LARK_INVENTORY.md).
- Quy trình Manager phê duyệt là tùy chọn chưa bật/chưa triển khai. Không có hành động nào tuyên bố đã phê duyệt hoặc gửi tin tới xưởng.
- Nhập tồn trong Dự kiến sản xuất; không tự cập nhật tồn khi nhận hàng. Không có đối soát kho tự động.
- Chưa có TikTok Shop API, job queue, phân trang server cho mọi danh sách hoặc benchmark dữ liệu doanh nghiệp lớn. Giới hạn file 10 MB/100.000 dòng. Xem giới hạn triển khai trong DEPLOYMENT.md.
- Chưa xác minh deploy Docker/HTTPS, publication Lark hoặc khôi phục snapshot ở cloud task mới. Không gọi hệ thống production-ready khi các bước này còn thiếu.


Đợt rà soát thao tác V9 ngày 17/10/2026: xem [V9_ACTION_FIXES.md](docs/V9_ACTION_FIXES.md) để biết nguyên nhân nút lưu lệnh bị khóa, cách thêm mã/màu/size ngay trong lệnh và kết quả kiểm thử luồng thao tác.

Báo cáo bán hàng theo mã → màu × size và nhập XLSX theo mẫu TikTok: xem [SALES_REPORT.md](docs/SALES_REPORT.md). Có tự nhận diện kỳ file, preview ma trận, biểu đồ, chi tiết dự báo và đối soát riêng.

Dự kiến sản xuất có nút **Cập nhật tồn từ Lark → Đối soát hàng đang về → Lên lệnh nhanh**, theo SKU đã chọn hoặc bộ lọc đang xem. Xem [hướng dẫn và quy tắc bảo toàn dữ liệu](docs/PLANNING_ACTIONS.md).

**Gối lệnh sản xuất → Báo cáo tỷ trọng sản phẩm**: top mã, tỷ trọng theo đã đặt/còn chờ, ma trận màu–size, cơ cấu từng lệnh, tiến độ/quá hạn, bộ lọc và CSV/Excel. Xem [hướng dẫn báo cáo](docs/PRODUCTION_REPORT.md).

**Ngay dưới danh sách lệnh**: bảng Chờ sản xuất theo mã–màu–size, search không dấu, bộ lọc, biểu đồ tròn tỷ trọng số còn chờ và cửa sổ lệnh nguồn. Xem [hướng dẫn tra cứu nhanh](docs/PENDING_PRODUCTION.md).

**Đổi trạng thái lệnh hàng loạt** ở danh sách lệnh, có lý do/version/revision; màu ưu tiên Thường xám, Ưu tiên cam, Cấp bách đỏ trên danh sách/trình soạn/chi tiết. Xem [hướng dẫn thao tác](docs/BULK_ORDER_STATUS.md).

Trong chú giải biểu đồ tròn, bấm **mã → màu → size** để xem số lượng và tỷ trọng ngay tại chỗ; bấm size/màu để truy nguồn lệnh rồi mở chi tiết/giao nhận. Mở mục con giữ nguyên bộ lọc dashboard.

**Chính sách size mới:** toàn bộ vận hành chỉ dùng **S/M/L/XL**; chặn tạo/gối size đã ngừng ở backend và DB, giữ chứng từ cũ để đối soát. Xem [phạm vi thay đổi và lịch sử](docs/ACTIVE_SIZES.md).

Quy trình giao dư do cắt tròn cây vải: xem [Giao nhận thực tế](docs/OVER_RECEIPTS.md). Cho nhận vượt số đặt và hiển thị tiến độ trên 100%; thiếu/dư đối soát riêng từng SKU.

Nhập ảnh phiếu kiểm, ánh xạ theo mã–màu–size, phân bổ và xác nhận hàng về: [Nhập liệu hàng về](docs/INCOMING_GOODS.md). OCR cần cấu hình backend riêng; nhập bảng thủ công không cần API key.
