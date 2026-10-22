import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, PROJECT_BUSY } from "../api.js";
import { ProjectStatusBadge, Progress, ErrorNote, AspectPicker, AspectBadge } from "../components.jsx";

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setProjects(await api.get("/projects"));
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    api.get("/topics").then(setTopics).catch(() => {});
  }, []);
  const topicName = (id) => topics.find((t) => t.topic_id === id)?.name || id;

  const busy = projects.some((p) => p.busy || PROJECT_BUSY.includes(p.status));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [busy, load]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Dự án video</h1>
          <p className="sub">Nhập tư liệu, AI lập kế hoạch từ thư viện frame, bạn duyệt rồi HyperFrames xuất ra MP4.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm(true)}>+ Dự án mới</button>
      </header>

      <ErrorNote error={error} />

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Dự án</th>
              <th>Chủ đề</th>
              <th>Khung hình</th>
              <th>Trạng thái</th>
              <th>Cảnh</th>
              <th>Thời lượng</th>
              <th>Token AI</th>
              <th>Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link className="title-link" to={`/projects/${p.id}`}>{p.title}</Link>
                  {p.mode === "animation" && <span className="pill mode-pill">Hoạt hình</span>}
                  {p.current_version ? <div className="muted small">v{p.current_version}{p.manual_edit ? " · có sửa tay" : ""}</div> : null}
                </td>
                <td><TopicChip topic={topics.find((t) => t.topic_id === p.topic)} fallback={topicName(p.topic)} /></td>
                <td><AspectBadge ratio={p.aspect_ratio} /></td>
                <td>
                  <div className="status-cell">
                    <ProjectStatusBadge status={p.status} />
                    {PROJECT_BUSY.includes(p.status) && <Progress value={p.progress} />}
                  </div>
                </td>
                <td>{p.scene_count ?? "—"}</td>
                <td>{p.duration ? `${Number(p.duration).toFixed(1)} giây` : "—"}</td>
                <td>{Number(p.tokens) ? Number(p.tokens).toLocaleString("vi-VN") : "—"}</td>
                <td className="muted">{new Date(p.updated_at).toLocaleString("vi-VN")}</td>
              </tr>
            ))}
            {!projects.length && (
              <tr>
                <td colSpan={8} className="empty">Chưa có dự án nào. Bấm “+ Dự án mới” để bắt đầu.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && <NewProjectModal topics={topics} onClose={() => setShowForm(false)} />}
    </div>
  );
}

export function TopicChip({ topic, fallback }) {
  if (!topic) return <span className="muted">{fallback || "—"}</span>;
  return (
    <span className="topic-chip" style={{ background: topic.theme.bg, color: topic.theme.ink, borderColor: topic.theme.accent }}>
      <i style={{ background: topic.theme.accent }} />
      {topic.name}
    </span>
  );
}

const MODES = [
  { id: "explainer", icon: "▦", name: "Video giải thích", text: "Thư viện frame: tiêu đề, số liệu, danh sách, ảnh… cho tin tức, kiến thức, đánh giá." },
  { id: "animation", icon: "✿", name: "Phim hoạt hình", text: "Gửi mô tả câu chuyện, AI dựng phim với nhân vật người và con vật, lời thoại nhiều giọng." },
];

function NewProjectModal({ topics, onClose }) {
  const navigate = useNavigate();
  const [voices, setVoices] = useState([]);
  const [form, setForm] = useState({ mode: "explainer", title: "", material: "", topic: "technology", channel: "", voice: "vi-VN-HoaiMyNeural", voice_rate: "+6%", target_seconds: 90, aspect_ratio: "16:9" });
  const anim = form.mode === "animation";
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    api.get("/projects/voices").then(setVoices).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const p = await api.post("/projects", form);
      navigate(`/projects/${p.id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Dự án mới</h2>
        <ErrorNote error={error} />
        <label>
          Tên dự án
          <input value={form.title} onChange={set("title")} placeholder="vd. Bản tin công nghệ 22/10" autoFocus required />
        </label>
        <div className="field">
          <span className="field-label">Loại video</span>
          <div className="mode-pick">
            {MODES.map((m) => (
              <button
                type="button"
                key={m.id}
                className={`mode-card ${form.mode === m.id ? "active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, mode: m.id, target_seconds: m.id === "animation" ? 60 : 90, ...(m.id === "animation" ? { topic: "storytelling" } : {}) }))}
              >
                <span className="mode-icon" aria-hidden>{m.icon}</span>
                <strong>{m.name}</strong>
                <small>{m.text}</small>
              </button>
            ))}
          </div>
        </div>
        {!anim && <div className="field">
          <span className="field-label">Chủ đề</span>
          <div className="topic-pick">
            {topics.map((t) => (
              <button
                type="button"
                key={t.topic_id}
                className={`topic-card ${form.topic === t.topic_id ? "active" : ""}`}
                style={{ background: t.theme.bg, color: t.theme.ink }}
                onClick={() => setForm((f) => ({ ...f, topic: t.topic_id }))}
              >
                <span className="swatch">
                  <i style={{ background: t.theme.accent }} />
                  <i style={{ background: t.theme.accent2 }} />
                </span>
                <strong>{t.name}</strong>
                <small style={{ color: t.theme.muted }}>{t.description}</small>
              </button>
            ))}
          </div>
        </div>}
        <div className="field">
          <span className="field-label">Khung hình — chọn theo nền tảng đăng</span>
          <AspectPicker value={form.aspect_ratio} onChange={(v) => setForm((f) => ({ ...f, aspect_ratio: v }))} />
        </div>
        <label>
          {anim ? "Mô tả câu chuyện" : "Tư liệu / kịch bản"}
          <textarea
            rows={9}
            value={form.material}
            onChange={set("material")}
            placeholder={
              anim
                ? "Kể câu chuyện bạn muốn làm phim: nhân vật là ai (người, con vật), chuyện gì xảy ra, kết thúc thế nào. Có thể ghi sẵn vài câu thoại trong ngoặc kép. AI sẽ viết kịch bản, chọn nhân vật, bối cảnh và lồng tiếng."
                : "Dán ghi chú, bài báo hoặc kịch bản. AI chỉ dùng thông tin có ở đây."
            }
            required
          />
        </label>
        <div className="grid-2">
          <label>
            Tên kênh
            <input value={form.channel} onChange={set("channel")} placeholder="hiện ở cảnh kết" />
          </label>
          <label>
            Độ dài mong muốn (giây)
            <input type="number" min={20} max={300} value={form.target_seconds} onChange={set("target_seconds")} />
          </label>
          <label>
            Giọng đọc
            <select value={form.voice} onChange={set("voice")}>
              {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </label>
          <label>
            Tốc độ đọc
            <input value={form.voice_rate} onChange={set("voice_rate")} placeholder="+6%" />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Huỷ</button>
          <button className="btn primary" disabled={saving}>{saving ? "Đang tạo…" : "Tạo dự án"}</button>
        </div>
      </form>
    </div>
  );
}
