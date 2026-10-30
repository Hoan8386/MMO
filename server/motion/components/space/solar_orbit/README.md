# solar_orbit

**Mô hình:** bài toán hai vật Kepler cho từng hành tinh, phần tử quỹ đạo J2000 (bán trục lớn `a`, tâm sai `e`,
kinh độ điểm cận nhật, kinh độ trung bình) trong `shared/astro.ts`. Mỗi khung giải phương trình Kepler
`M = E − e·sin E` (Newton, 8 vòng lặp) để ra vị trí thật trên elip, Mặt Trời ở một tiêu điểm.

**Đúng:** hướng và hình dạng quỹ đạo, chu kỳ và tốc độ tương đối giữa các hành tinh (định luật 3 Kepler tự hiện ra),
hành tinh chạy nhanh hơn khi ở gần Mặt Trời (định luật 2), vị trí ban đầu theo ngày J2000.

**Không theo tỉ lệ (có ghi trên hình):** khoảng cách nén theo `√r` để hành tinh trong và ngoài cùng nhìn thấy được
(góc giữ nguyên, chỉ bán kính bị nén); kích thước hành tinh theo thang log; độ nghiêng mặt phẳng quỹ đạo bị bỏ qua.

**Thời gian:** `orbitSpeed = 1` → một năm Trái Đất trong 8 giây; bộ đếm "Ngày thứ N · 1 giây = X ngày" luôn hiện.
Với hành tinh vòng ngoài (Sao Mộc trở ra) nên tăng `orbitSpeed` (vd. 20–50).
