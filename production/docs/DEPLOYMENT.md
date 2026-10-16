# Triển khai HTTPS và sao lưu

> Quyết định mới: dùng Railway và URL miễn phí Railway; không triển khai tên miền riêng. Làm theo [RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md). Phần VPS/tên miền dưới đây chỉ là phương án cũ, không phải cấu hình đang triển khai.


Hướng dẫn mới cho app Lark đã tạo, domain `comsmiu.vn`, Docker Compose + Caddy tự cấp HTTPS và checklist Console: [LARK_GO_LIVE.md](LARK_GO_LIVE.md). Đây là cấu hình chuẩn bị; chưa có hosting để deploy thật.

## Chuẩn bị

Node.js 24, PostgreSQL 17, một hostname HTTPS do Coms-Flow quản lý. Không nạp dữ liệu thật khi chưa được phép. PostgreSQL là nguồn dữ liệu trung tâm; không dựa vào volume Docker cục bộ của phiên Codex để đảm bảo dữ liệu lâu dài.

1. Từ `production/`, chạy `npm ci`, sao chép `.env.example` sang `.env.local` và cấp DATABASE_URL/SESSION_SECRET qua secret manager. Không commit `.env.local`.
2. Đặt NODE_ENV=production, DEV_AUTH=false, PUBLIC_URL=https://hostname-thật, HOST phù hợp reverse proxy, LARK_REDIRECT_URI=https://hostname-thật/auth/callback. Cấp secret Lark tại backend sau khi tạo app. Build chỉ nhận biến frontend công khai; không có VITE_APP_SECRET.
3. Chạy `npm run build`, sao lưu database, chạy `npm run migrate` từ đúng phiên bản, rồi `npm start`. Migration được khóa và có bảng phiên bản, không tự thực thi khi server khởi động.
4. Đặt reverse proxy HTTPS trước Node; `/`, `/api/`, `/auth/` cùng origin. Chuyển Host và X-Forwarded-Proto đúng; backend cấu hình một proxy tin cậy. Không mở cổng database/public backend trực tiếp ra Internet.
5. Kiểm tra `/api/health`, trang đăng nhập, callback Lark, quyền Viewer/Planner/Warehouse, kiểm tra một lệnh thử trên staging. Chưa làm bước này thì chưa được tuyên bố triển khai production hoàn tất.

Dockerfile và compose.yaml là phương án đóng gói. Chạy `docker compose --env-file .env.local config --quiet` trước khi dùng. Cần thêm POSTGRES_PASSWORD và DATABASE_URL với hostname `postgres`, mật khẩu được URL-encode, vào cấu hình an toàn. Compose không cài HTTPS; reverse proxy vẫn là bắt buộc. Đặt DEV_AUTH=false trong cấu hình, không chỉ dựa vào giá trị override của compose. Build image, chạy migration bằng `docker compose run --rm app npm run migrate`, rồi khởi động app. Không dùng `docker compose down -v` trên dữ liệu cần giữ.

Ví dụ Nginx (thay hostname và cấu hình chứng chỉ bằng hệ thống HTTPS đang dùng):

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 16m;
    proxy_read_timeout 120s;
}
```

Trang được thiết kế mở dưới dạng web app của Lark. CSP không cho nhúng iframe tùy ý. Nếu tenant yêu cầu một cơ chế nhúng cụ thể, đối chiếu tài liệu của Lark và chỉ cho phép origin chính xác; không mở wildcard.

## Sao lưu và phục hồi

Máy vận hành cần công cụ PostgreSQL client cùng hoặc mới hơn phiên bản server. Cấp DATABASE_URL an toàn, chạy `bash scripts/backup.sh /vị-trí-sao-lưu-an-toàn`. Không bật `set -x` hoặc ghi URL/token ra log. File dump có dữ liệu nghiệp vụ: mã hóa, giới hạn truy cập, lưu ngoài máy chủ và áp dụng thời gian lưu do công ty quyết định.

Tạo database riêng tên kết thúc `_restore` hoặc `_test`. Cấp RESTORE_DATABASE_URL, chạy `bash scripts/restore-test.sh /đường-dẫn/backup.dump`. Script cố ý không cho phục hồi thẳng vào database vận hành. Sau restore phải đối chiếu số lệnh, dòng, tổng đã nhận, từng biên nhận và revisions; đăng nhập staging, thử quyền và đọc dữ liệu. Không chỉ dựa vào `pg_restore --list` để tuyên bố khôi phục thành công.

Muốn phục hồi production cần quy trình riêng: dừng ghi, sao lưu trạng thái hiện tại, rà soát bản phục hồi đã kiểm chứng và được người phụ trách cho phép. Không chạy phục hồi production trong kiểm thử.

## Giới hạn vận hành cần đánh giá trước rollout

Rate limit HTTP hiện trong bộ nhớ của từng tiến trình. Khi chạy nhiều replica cần store dùng chung và sticky-free session PostgreSQL; giới hạn Lark đọc có retry hữu hạn. Chưa có worker/job queue hoặc bộ đồng bộ Base tự động. Giới hạn file 10 MB, 100.000 dòng và xem trước tối đa 100 dòng; danh sách vận hành hiện chưa phân trang server nên cần đo tải theo dữ liệu thực trước mở rộng. Import XLSX chạy ở backend và cần giới hạn tài nguyên container.

Dockerfile/compose và hạ tầng HTTPS cần kiểm chứng tại nơi triển khai thật; kiểm thử trên môi trường hiện tại không chứng minh hostname, chứng chỉ hoặc publication Lark đã sẵn sàng.
