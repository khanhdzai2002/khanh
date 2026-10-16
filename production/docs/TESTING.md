# Bằng chứng kiểm thử và phạm vi xác nhận

## Đã chạy trên môi trường hiện tại

- Node.js 24.19.0, npm 11.9.0, PostgreSQL 17 trong Docker; migrations 001–004.
- `npm run build`: TypeScript và Vite build thành công. Tailwind biên dịch cục bộ; không cần CDN giao diện V9.
- `npm ci` theo lockfile chạy lại thành công. Sau cài lại, đã khởi động lại Vite để làm mới dependency optimization (server đang chạy trước đó trả 504 cho cache cũ), rồi xác minh login/logout DEV và API trả 401 sau logout.
- `npm test`: **78 tests passed, 4 files**, không có test skip. 23 tests domain, 33 tests integration PostgreSQL/HTTP và 14 tests Lark mock/security và 8 tests cấu hình origin/callback.
- Công thức: một test đối chiếu 400 đầu vào với chính hàm calc V9 trích nguyên văn, kiểm tra need/sale/raw/target/cover/flag. Có test riêng ví dụ 60, làm tròn, ngày chờ opt-in, thiếu tồn, bất thường và bốn vòng đời.
- Giao dịch: nhiều màu/size, nhận 300+450+250 từ 1.000; chặn vượt nhận; idempotency đồng thời; sửa sau nhận, không giảm dưới đã nhận, không đổi SKU/xóa dòng nhận; revision trước/sau; hai người sửa cùng version; xóa/khôi phục; hủy và reopen; giữ mã đã dùng; trigger bất biến.
- Import: CSV và XLSX thật, preview chưa ghi báo cáo, confirm lặp, replace giữ nguồn cũ, append bỏ trùng và khóa khi thiếu line ID, bỏ ngày xuất chưa đủ, chuyển bán giữ tồn/inbound/vòng đời/test. JSON V9: phát hiện trùng/số nhận lệch, giữ tồn unknown, không seed sales cũ; nhập lệnh đã xóa có 2 biên nhận và nguồn editLog, nhập bản nháp giữ trạng thái.
- HTTP: anonymous 401; Origin/CSRF 403; Viewer/Warehouse bị chặn sửa; export Excel đọc ngược bằng ExcelJS xác nhận ma trận XS…2XL.
- Lark **mock** (bao gồm PKCE, callback đồng thời, provider lỗi, provider từ chối và error redirect an toàn): thiếu cấu hình 503, state sai/hết hạn/replay bị chặn, tenant sai bị chặn, người mới Viewer với danh tính riêng; production từ chối DEV_AUTH=true. Không dùng credential thật trong test.

## Kiểm tra trình duyệt

Chromium hệ thống + Python Playwright, locale vi-VN, múi giờ Việt Nam. Smoke dùng backend cổng 3002 trỏ database `_test`, frontend cổng 5175; tách khỏi ứng dụng phát triển/database chính.

Đã trực tiếp thao tác: đăng nhập DEV được gắn nhãn → thêm SKU → sửa số bán/tồn/inbound → chọn Tăng trưởng → đề xuất 60 → chọn vào lệnh → lưu Nháp → nhận 30, hiển thị 50% → sửa số đặt thành 80, giữ nhận 30 → xem revision → tải Excel → xóa mềm → khôi phục. Không có JavaScript page errors. Kiểm tra dashboard ở 1440px và 390px; mobile không có tràn ngang toàn trang, bảng có vùng cuộn riêng.

Lần chạy smoke đầu dừng ở assertion dùng locator không duy nhất cho lý do sửa (cùng xuất hiện trong revision và audit); đây là lỗi locator của bài kiểm tra. Các thao tác trước đó đã thành công. Đã đổi locator sang summary của revision và tiếp tục xác nhận export/xóa/khôi phục/mobile. Không mô tả lần chạy đầu là vượt qua toàn bộ.

Bản build cũng đã được Node phục vụ với NODE_ENV=production, DEV_AUTH=false và origin HTTPS thử nghiệm: trang đăng nhập render, không có nút DEV, health 200, dữ liệu anonymous 401, không lỗi JavaScript. Đây là smoke local, không phải deploy HTTPS thật. Đã kiểm tra các giá trị secret backend cục bộ không xuất hiện trong assets frontend được build.

`tests/serve-smoke.ts` chuẩn bị lại database test trước khi mở backend smoke. Lệnh này **xóa dữ liệu trong database _test**; không chạy song song `npm test` hoặc với dữ liệu cần giữ. Browser smoke đã chạy thủ công bằng công cụ trong phiên; chưa được đóng gói thành suite CI Playwright tự động.

## Chuẩn bị Railway

Đã kiểm tra APP_BASE_URL, domain Railway do nền tảng cấp, từ chối origin cũ xung đột, callback cùng origin; health anonymous trên `/health` và `/api/health`, database lỗi trả 503 không lộ thông tin kết nối. Chưa có Project/URL Railway, chưa kiểm tra HTTPS hoặc OAuth live. Docker build đã tải được base image nhưng bị kẹt tại npm ci; kiểm tra độc lập fetch npm registry trong container trả TypeError. Đã dừng build bị chặn. Build npm trên host thành công; chưa xác minh Docker image hoàn chỉnh hoặc việc Railway chấp nhận railway.json.

## Sửa khởi động khi thiếu migrations trên Railway

`npm start` hiện chờ migration hoàn tất trước khi mở cổng HTTP, bổ sung cho pre-deploy hook để tránh host bỏ qua config-as-code ở monorepo. Migrations giữ transaction/advisory lock và bảng phiên, không seed lệnh hoặc số bán. Kết nối có timeout 10 giây; lỗi khởi động chỉ ghi mã lỗi và hướng dẫn, không ghi URI/password.

Đã thử tiến trình production với PostgreSQL cục bộ trên database tổng hợp mới, tên kết thúc `_test`: ban đầu không có bảng; khởi động tự áp dụng 4 migrations, `/health` 200, API anonymous 401, policy vẫn 5 ngày và không có lệnh. Khởi động lại không áp dụng SQL đã chạy. Trỏ tới cổng database không tồn tại: tiến trình thoát 1 trước khi listen, log không chứa mật khẩu. Database thử riêng đã được xóa sau kiểm tra, không tác động database nghiệp vụ. Integration test xác minh hai migration đồng thời giữ nguyên lệnh/biên nhận đã nhận một phần.

Lỗi báo cho người dùng được tách giữa thiếu bảng (`42P01`) và lỗi kết nối. Chưa có quyền xem Postgres/variables/logs của Railway thực tế để kết luận nguyên nhân ở deployment của người dùng.

## Kiểm tra bản sửa điểm mở web và cấu hình HTTPS

Lệnh mặc định ở root hiện chạy ERP trên Vite 5173 cùng backend 3001; không mở ứng dụng đặt xe cũ. Chromium đã kiểm tra trang đăng nhập hiển thị đúng tên biến Lark còn thiếu, đăng nhập/đăng xuất DEV, dashboard ở desktop và 390px, anonymous `/api/me` trả 401 sau logout và xóa query lỗi đăng nhập khỏi thanh địa chỉ. Không có JavaScript page errors; không tạo hoặc sửa SKU/lệnh trong lần kiểm tra này.

`docker compose --env-file .env.production -f compose.https.yaml config --quiet` thành công với cấu hình tổng hợp tạm thời (đã xóa sau kiểm tra). Caddy 2 validate cấu hình HTTPS thành công bằng hostname dự kiến. Không khởi động dịch vụ công khai, không thay DNS hoặc cấp chứng chỉ trong lần validate. TypeScript kiểm tra cả scripts triển khai. Các kết quả này không chứng minh hosting hoặc OAuth thật đã hoạt động.

## Backup / restore đã diễn tập

Đã dùng PostgreSQL `pg_dump --format=custom` và `pg_restore --clean --if-exists --no-owner --exit-on-error` trong container để phục hồi **dữ liệu tổng hợp kiểm thử** từ `comsflow_test` sang `comsflow_restore`. Đối chiếu khớp: 2 lệnh, 2 dòng, 2 biên nhận, 750 sản phẩm đã nhận, 750 đơn vị trong biên nhận, 1 revision. Hash JSON của các biên nhận và revisions giống nguồn. Không phục hồi đè database vận hành. Scripts shell backup/restore đã kiểm tra cú pháp; chúng cần PostgreSQL client trên máy vận hành.

## Chưa được xác minh

Đăng nhập Lark thật; tenant/app publication; mở từ icon desktop/mobile Lark; quyền Base thật và mapping field; deploy HTTPS/Docker image tại hosting; diễn tập phục hồi dữ liệu công ty và đăng nhập sau restore; tải lớn; nhiều replica; phục hồi ở cloud task mới. Không lấy kết quả mock/local làm bằng chứng cho các mục này.

## Chạy lại

Từ `production/`, chuẩn bị `.env.local`, database riêng kết thúc `_test`, chạy `npm ci`, `npm run build`, `npm test`. Runner không tạo database; chỉ cho phép suffix `_test`. Các tests reset dữ liệu test bằng TRUNCATE CASCADE, không thay source hoặc lockfile. Nếu có lỗi, giữ nguyên exit status và kiểm tra output thay vì chỉ nhìn số test cuối cùng.
