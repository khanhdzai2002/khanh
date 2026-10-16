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

Có 84 tests, gồm 400 trường hợp đối chiếu công thức với hàm V9 nguyên gốc trong một test. Xem [bằng chứng và giới hạn kiểm thử](docs/TESTING.md).

## Tài liệu bàn giao

- [Đối chiếu V9](../V9_FEATURE_MAP.md), [danh mục mã nguồn V9](../docs/V9_SOURCE_INVENTORY.md), [lỗi và sai khác V9](../docs/V9_FINDINGS.md).
- [Kiến trúc và database](docs/ARCHITECTURE.md).
- [Triển khai Railway và cập nhật Custom App Lark hiện hữu](docs/RAILWAY_DEPLOY.md).
- [Chi tiết OAuth, quyền và Lark Base](docs/LARK_SETUP.md).
- [Triển khai HTTPS, backup và restore](docs/DEPLOYMENT.md).
- [Nhập dữ liệu V9 và bán hàng](docs/IMPORTS.md).
- `.env.example`, migrations SQL, Dockerfile, compose.yaml và scripts backup/restore nằm cùng dự án.

## Những gì đã có

Dashboard từ dữ liệu tập trung; CRUD SKU/nhiều màu-size/sửa bảng/bulk vòng đời; policy chuẩn V9; tạo và sửa lệnh bằng ma trận size; nhận nhiều đợt; khóa dữ liệu đã nhận; idempotency; version chống ghi đè; audit trước/sau; giữ mã không tái dùng; hủy phần chờ; xóa mềm và khôi phục; CSV/XLSX/print; phân tích file TikTok; nhập thay thế/bổ sung có chống trùng; chuyển số bán giữ tồn/vòng đời; import JSON V9 có preview; RBAC và cấu trúc đăng nhập Lark phía backend.

## Chưa hoàn thành / chưa xác minh bên ngoài

- Người dùng xác nhận Custom App 1.0.0 đã Released và chọn Railway làm hosting chính. Chưa có quyền Railway, project, database Railway, URL HTTPS thật hoặc credential Lark để xác minh ngoài. Auth test dùng mock, không phải bằng chứng đăng nhập thật. Người dùng cung cấp cấu hình an toàn theo LARK_SETUP.md rồi cần kiểm tra trên desktop/mobile Lark thực tế.
- Base adapter hiện chỉ đọc xem trước tối đa 100 bản ghi. Chưa có đồng bộ, mapping thực tế, phân trang toàn bộ Base hoặc thao tác ghi. Cần xác nhận nguồn chuẩn/quyền trước khi mở rộng; không ghi đè Base đang hoạt động.
- Quy trình Manager phê duyệt là tùy chọn chưa bật/chưa triển khai. Không có hành động nào tuyên bố đã phê duyệt hoặc gửi tin tới xưởng.
- Nhập tồn trong Dự kiến sản xuất; không tự cập nhật tồn khi nhận hàng. Không có đối soát kho tự động.
- Chưa có TikTok Shop API, job queue, phân trang server cho mọi danh sách hoặc benchmark dữ liệu doanh nghiệp lớn. Giới hạn file 10 MB/100.000 dòng. Xem giới hạn triển khai trong DEPLOYMENT.md.
- Chưa xác minh deploy Docker/HTTPS, publication Lark hoặc khôi phục snapshot ở cloud task mới. Không gọi hệ thống production-ready khi các bước này còn thiếu.
