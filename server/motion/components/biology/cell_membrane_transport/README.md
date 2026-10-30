# cell_membrane_transport

**Mô hình giản lược** (ghi chú hiện trên hình). Toàn bộ chuyển động được mô phỏng trước khi phát, 30 bước/giây,
bằng bộ sinh số ngẫu nhiên có seed — cùng props cho đúng cùng một clip.

- Mỗi phân tử đi bộ ngẫu nhiên có quán tính ở tốc độ không đổi, phản xạ ở thành.
- `diffusion`: chạm màng → 50% đi xuyên lớp lipid. Dòng tổng đi từ nơi đông sang nơi thưa cho tới khi hai bên gần bằng nhau.
- `facilitated`: chỉ đi qua được tại hai kênh protein; vẫn xuôi gradient.
- `active`: lớp lipid đóng; mỗi 1,1 giây mỗi bơm kéo phân tử gần nhất ở ngoài vào trong (chữ ATP sáng lên),
  bất kể bên trong đã đông hơn — tức là ngược gradient.

Số phân tử hai bên cập nhật mỗi khung. Không mô phỏng định lượng hệ số khuếch tán, điện thế màng hay kích thước thật.
