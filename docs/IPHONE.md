# Dùng Fieldwork trên iPhone

Mở [Fieldwork trên GitHub Pages](https://chu0n.github.io/Fieldwork/) bằng Safari. Chọn file từ ứng dụng Files. Mỗi địa chỉ web và hồ sơ trình duyệt có bộ nhớ riêng.

## Dùng bản cục bộ trên Wi-Fi

1. Build trên máy tính bằng `pnpm run build`.
2. Trong thư mục `release`, chạy `node serve-iphone.mjs` hoặc mở `OPEN-ON-IPHONE.cmd` trên Windows.
3. Kết nối iPhone và máy tính vào cùng mạng Wi-Fi tin cậy. Mở địa chỉ hiện trên cửa sổ terminal trong Safari.
4. Giữ cửa sổ server mở trong lúc sử dụng và nhấn Ctrl+C để dừng.

Server chỉ phục vụ HTML của ứng dụng. Dữ liệu nhập ở thiết bị nào được xử lý trong trình duyệt của thiết bị đó. Nếu bản HTML tải trực tiếp chỉ hiện dưới dạng bản xem trước trong Files, dùng địa chỉ HTTPS hoặc Wi-Fi ở trên.
