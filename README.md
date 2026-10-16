# COMS-FLOW Production Management

Ứng dụng ERP nằm trong [`production/`](production/README.md). Xem [bảng đối chiếu V9](V9_FEATURE_MAP.md) và [hướng dẫn triển khai Railway và kết nối Lark](production/docs/RAILWAY_DEPLOY.md).

Từ thư mục kho mã:

```bash
npm run setup
# Cấu hình production/.env.local và PostgreSQL theo production/README.md
npm run dev
```

Lệnh `npm run dev` chạy migration, backend và giao diện ERP trên cổng phát triển 5173. `npm run build`, `npm test`, `npm start` cũng trỏ tới COMS-FLOW. App Secret chỉ nằm ở backend. Chưa có cấu hình Lark và hosting thật nên chưa xác nhận đăng nhập hoặc phát hành Lark hoạt động. Không nhập dữ liệu công ty vào môi trường DEV khi chưa được phép.

Mã đặt xe cũ vẫn được giữ ở thư mục gốc; chạy riêng bằng `npm run legacy:dev` trên cổng 5180.
