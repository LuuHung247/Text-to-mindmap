# Mindmap Webapp

Ứng dụng web này cho phép bạn hiển thị mind map dạng radial từ dữ liệu JSON, với giao diện và màu sắc giống hình tham chiếu.

## Cách chạy với Flask

1. Cài đặt Flask:
   ```bash
   pip install flask
   ```
2. Chạy ứng dụng:
   ```bash
   python app.py
   ```
3. Truy cập: http://127.0.0.1:5000/

## Cấu trúc thư mục
- `app.py`: Flask app
- `templates/index.html`: Giao diện chính
- `static/`: Chứa các file JS, CSS

## Cách sử dụng

1. Mở file `index.html` trong trình duyệt (không cần server, chỉ cần double click).
2. Mind map sẽ tự động hiển thị, có thể kéo/pan và zoom bằng chuột.
3. Di chuột lên các node để xem tooltip.

## Tuỳ biến dữ liệu

Để thay đổi nội dung mind map, sửa biến `mindmapData` trong file `app.js`.

---

**Không cần cài đặt gì thêm, chỉ cần trình duyệt hiện đại (Chrome, Edge, Firefox, ...).** 