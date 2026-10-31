// The map of the science library: domains → topics (with their Vietnamese names and colours), as the
// spec lays it out. Topics without a component yet are listed too, so the gallery shows what is
// covered and what is still to build. Component meta.json "domain"/"topic" use these ids.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PAL = JSON.parse(fs.readFileSync(path.join(here, "..", "shared", "palettes.json"), "utf8"));

export const STYLE_LABELS = {
  cinematic: "Điện ảnh",
  scientific: "Mô phỏng khoa học",
  "3d": "Mô phỏng 3D",
  educational: "Đồ hoạ giáo dục",
  infographic: "Infographic",
  minimalist: "Tối giản",
  futuristic: "Tương lai",
  organic: "Tự nhiên",
};

const DOMAINS = [
  {
    id: "astronomy",
    label: "Vũ trụ & Thiên văn",
    topics: [
      ["cosmology", "Vũ trụ học"],
      ["black_holes", "Hố đen"],
      ["solar_system", "Hệ Mặt Trời"],
      ["stars_galaxies", "Sao & Thiên hà"],
      ["exoplanets", "Ngoại hành tinh"],
      ["dark_universe", "Vật chất & năng lượng tối"],
      ["space_exploration", "Khám phá không gian"],
    ],
  },
  {
    id: "mathematics",
    label: "Toán học",
    topics: [
      ["algebra", "Đại số"],
      ["calculus", "Giải tích"],
      ["geometry", "Hình học"],
      ["linear_algebra", "Đại số tuyến tính"],
      ["probability", "Xác suất & Thống kê"],
      ["number_theory", "Lý thuyết số"],
      ["fractals", "Fractal & Hỗn loạn"],
      ["logic_graphs", "Logic & Lý thuyết đồ thị"],
    ],
  },
  {
    id: "biology",
    label: "Sinh học",
    topics: [
      ["genetics", "DNA & Di truyền"],
      ["cell_biology", "Sinh học tế bào"],
      ["evolution", "Tiến hoá"],
      ["ecology", "Sinh thái học"],
      ["human_biology", "Cơ thể người"],
      ["neuroscience", "Khoa học thần kinh"],
      ["microbiology", "Vi sinh vật"],
      ["botany", "Thực vật học"],
      ["zoology", "Động vật & Sinh vật biển"],
      ["biotechnology", "Công nghệ sinh học"],
    ],
  },
  {
    id: "physics",
    label: "Vật lý",
    topics: [
      ["classical_mechanics", "Cơ học cổ điển"],
      ["relativity", "Hấp dẫn & Tương đối"],
      ["quantum", "Cơ học lượng tử"],
      ["electromagnetism", "Điện từ học"],
      ["thermodynamics", "Nhiệt động lực học"],
      ["waves", "Quang học & Sóng"],
      ["nuclear", "Hạt & Hạt nhân"],
      ["condensed_matter", "Vật lý chất rắn"],
      ["fluids", "Cơ học chất lưu"],
      ["plasma", "Plasma & Năng lượng"],
    ],
  },
];

// Domains with their palette and topics (each with its refined palette), for the web gallery.
export function taxonomy() {
  return DOMAINS.map((d) => ({
    id: d.id,
    label: d.label,
    palette: PAL.domains[d.id],
    topics: d.topics.map(([id, label]) => ({ id, label, palette: { ...PAL.domains[d.id], ...(PAL.topics[id] || {}) } })),
  }));
}
