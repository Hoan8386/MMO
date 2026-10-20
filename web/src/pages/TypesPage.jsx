import { useEffect, useState } from "react";
import { api, parsePalette } from "../api.js";
import { ErrorNote } from "../components.jsx";

const EMPTY = {
  name: "",
  description: "",
  style_prompt: "",
  palette: ["#ffe0b8", "#e84a5f", "#f7c548", "#4fc3f7", "#81c784"],
  stroke_color: "#141414",
  background_color: "#ffffff",
  subtitle_color: "#141414",
  stroke_width: 5,
  width: 1920,
  height: 1080,
  voice: "vi-VN-HoaiMyNeural",
  voice_rate: "-5%",
  hand_width: 546,
  hand_rotate: -24,
};

const ASPECTS = [
  { label: "Ngang 16:9 (YouTube)", width: 1920, height: 1080 },
  { label: "Dọc 9:16 (TikTok, Shorts)", width: 1080, height: 1920 },
  { label: "Vuông 1:1", width: 1080, height: 1080 },
];

export default function TypesPage() {
  const [types, setTypes] = useState([]);
  const [voices, setVoices] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  const load = () => api.get("/types").then(setTypes).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api.get("/types/voices").then(setVoices).catch(() => {});
  }, []);

  async function remove(t) {
    if (!confirm(`Xoá loại video “${t.name}”?`)) return;
    try {
      await api.del(`/types/${t.id}`);
      setEditing(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Loại video</h1>
          <p className="sub">Mỗi loại là một phong cách: cách AI vẽ, bảng màu, giọng đọc, khổ hình và bàn tay vẽ.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({ ...EMPTY })}>+ Thêm loại</button>
      </header>
      <ErrorNote error={error} />

      <div className="type-layout">
        <div className="type-list">
          {types.map((t) => (
            <button key={t.id} className={`type-card ${editing?.id === t.id ? "active" : ""}`} onClick={() => setEditing({ ...t, palette: parsePalette(t.palette) })}>
              <div className="swatches">
                {parsePalette(t.palette).slice(0, 6).map((c) => <span key={c} style={{ background: c }} />)}
              </div>
              <strong>{t.name}</strong>
              <span className="muted">{t.description}</span>
              <span className="muted small">{t.width}×{t.height} · {t.video_count} video</span>
            </button>
          ))}
        </div>
        {editing && (
          <TypeEditor
            key={editing.id || "new"}
            initial={editing}
            voices={voices}
            onSaved={(t) => { setEditing({ ...t, palette: parsePalette(t.palette) }); load(); }}
            onDelete={editing.id ? () => remove(editing) : null}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
    </div>
  );
}

function TypeEditor({ initial, voices, onSaved, onDelete, onClose }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const field = (k) => ({ value: form[k] ?? "", onChange: (e) => set(k, e.target.value) });

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = { ...form };
      ["id", "created_at", "updated_at", "video_count", "hand_image"].forEach((k) => delete body[k]);
      const saved = form.id ? await api.put(`/types/${form.id}`, body) : await api.post("/types", body);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadHand(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append("image", file);
    try {
      const saved = await api.post(`/types/${form.id}/hand`, fd);
      // Default the tip to the image's left edge, middle height; the user refines it by clicking.
      const img = await loadImage(`/storage/${saved.hand_image}`);
      const patch = { hand_natural_width: img.naturalWidth, hand_tip_x: 0, hand_tip_y: Math.round(img.naturalHeight / 2) };
      onSaved(await api.put(`/types/${form.id}`, patch));
    } catch (err) {
      setError(err.message);
    }
  }

  async function resetHand() {
    try {
      onSaved(await api.del(`/types/${form.id}/hand`));
    } catch (err) {
      setError(err.message);
    }
  }

  const aspect = ASPECTS.findIndex((a) => a.width === Number(form.width) && a.height === Number(form.height));

  return (
    <form className="card editor" onSubmit={save}>
      <div className="card-head">
        <h2>{form.id ? `Sửa: ${initial.name}` : "Loại video mới"}</h2>
        <button type="button" className="btn small" onClick={onClose}>Đóng</button>
      </div>
      <ErrorNote error={error} />

      <div className="grid-2">
        <label>Tên<input {...field("name")} required /></label>
        <label>Mã (slug)<input {...field("slug")} placeholder="tự tạo từ tên" /></label>
      </div>
      <label>Mô tả ngắn<input {...field("description")} /></label>
      <label>
        Phong cách vẽ (gửi cho AI)
        <textarea rows={5} {...field("style_prompt")} required placeholder="Mô tả bằng tiếng Anh hoặc tiếng Việt: nhân vật trông thế nào, đồ vật, mức độ chi tiết…" />
      </label>

      <fieldset>
        <legend>Màu sắc</legend>
        <div className="grid-3">
          <ColorField label="Nét viền" value={form.stroke_color} onChange={(v) => set("stroke_color", v)} />
          <ColorField label="Nền" value={form.background_color} onChange={(v) => set("background_color", v)} />
          <ColorField label="Phụ đề" value={form.subtitle_color} onChange={(v) => set("subtitle_color", v)} />
        </div>
        <div className="palette-edit">
          <span>Bảng màu tô:</span>
          {form.palette.map((c, i) => (
            <span key={i} className="palette-item">
              <input type="color" value={c} onChange={(e) => set("palette", form.palette.map((x, j) => (j === i ? e.target.value : x)))} />
              <button type="button" title="Bỏ màu này" onClick={() => set("palette", form.palette.filter((_, j) => j !== i))}>×</button>
            </span>
          ))}
          <button type="button" className="btn small" onClick={() => set("palette", [...form.palette, "#cccccc"])}>+ màu</button>
        </div>
        <label className="inline">Độ dày nét<input type="number" min="1" max="20" step="0.5" {...field("stroke_width")} /></label>
      </fieldset>

      <fieldset>
        <legend>Khổ hình và giọng đọc</legend>
        <div className="grid-3">
          <label>
            Khổ hình
            <select value={aspect} onChange={(e) => { const a = ASPECTS[e.target.value]; setForm((f) => ({ ...f, width: a.width, height: a.height })); }}>
              {aspect < 0 && <option value={-1}>{form.width}×{form.height}</option>}
              {ASPECTS.map((a, i) => <option key={i} value={i}>{a.label}</option>)}
            </select>
          </label>
          <label>
            Giọng đọc
            <select {...field("voice")}>
              {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </label>
          <label>Tốc độ đọc<input {...field("voice_rate")} placeholder="-5% hoặc +10%" pattern="[+-]\d{1,2}%" /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Bàn tay vẽ</legend>
        {form.id ? (
          <HandPicker form={form} set={set} onUpload={uploadHand} onReset={resetHand} />
        ) : (
          <p className="muted">Lưu loại video trước, rồi tải ảnh bàn tay lên. Mặc định dùng bàn tay cầm bút chì có sẵn.</p>
        )}
      </fieldset>

      <div className="modal-actions">
        {onDelete && <button type="button" className="btn danger" onClick={onDelete}>Xoá loại này</button>}
        <button className="btn primary" disabled={saving}>{saving ? "Đang lưu…" : "Lưu"}</button>
      </div>
    </form>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="color-field">
      {label}
      <span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <code>{value}</code>
      </span>
    </label>
  );
}

// Click on the image to mark where the pencil tip is; that point follows every stroke.
function HandPicker({ form, set, onUpload, onReset }) {
  const src = form.hand_image ? `/storage/${form.hand_image}` : "/default-hand.png";
  const natural = Number(form.hand_natural_width) || 248;

  function pick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const k = natural / rect.width;
    set("hand_tip_x", Math.round((e.clientX - rect.left) * k * 10) / 10);
    set("hand_tip_y", Math.round((e.clientY - rect.top) * k * 10) / 10);
  }

  const shown = 220;
  const k = shown / natural;
  return (
    <div className="hand-picker">
      <div className="hand-stage" onClick={pick} style={{ width: shown }}>
        <img src={src} alt="Bàn tay" style={{ width: shown }} />
        <span className="tip-dot" style={{ left: form.hand_tip_x * k, top: form.hand_tip_y * k }} />
      </div>
      <div className="hand-controls">
        <p className="muted small">Bấm vào đúng đầu bút chì trên ảnh. Ảnh phải là PNG nền trong suốt.</p>
        <label className="inline">Kích thước (px)<input type="number" min="100" max="1500" value={form.hand_width} onChange={(e) => set("hand_width", e.target.value)} /></label>
        <label className="inline">Góc nghiêng (độ)<input type="number" min="-90" max="90" value={form.hand_rotate} onChange={(e) => set("hand_rotate", e.target.value)} /></label>
        <div className="actions">
          <label className="btn small file-btn">
            Tải ảnh bàn tay
            <input type="file" accept="image/png" onChange={(e) => onUpload(e.target.files[0])} hidden />
          </label>
          {form.hand_image && <button type="button" className="btn small" onClick={onReset}>Dùng tay mặc định</button>}
        </div>
        <p className="muted small">Nhớ bấm “Lưu” sau khi chọn đầu bút, kích thước hoặc góc nghiêng.</p>
      </div>
    </div>
  );
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
