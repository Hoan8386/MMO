import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, PROJECT_BUSY } from "../api.js";
import { ProjectStatusBadge, Progress, ErrorNote } from "../components.jsx";

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
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
                  {p.current_version ? <div className="muted small">v{p.current_version}{p.manual_edit ? " · có sửa tay" : ""}</div> : null}
                </td>
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
                <td colSpan={6} className="empty">Chưa có dự án nào. Bấm “+ Dự án mới” để bắt đầu.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && <NewProjectModal onClose={() => setShowForm(false)} />}
    </div>
  );
}

function NewProjectModal({ onClose }) {
  const navigate = useNavigate();
  const [voices, setVoices] = useState([]);
  const [form, setForm] = useState({ title: "", material: "", channel: "", voice: "vi-VN-HoaiMyNeural", voice_rate: "+6%", target_seconds: 90 });
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
        <label>
          Tư liệu / kịch bản
          <textarea rows={9} value={form.material} onChange={set("material")} placeholder="Dán ghi chú, bài báo hoặc kịch bản. AI chỉ dùng thông tin có ở đây." required />
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
