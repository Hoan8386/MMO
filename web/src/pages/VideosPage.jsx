import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { StatusBadge, Progress, ErrorNote } from "../components.jsx";

const BUSY = ["generating", "rendering"];

export default function VideosPage() {
  const [videos, setVideos] = useState([]);
  const [types, setTypes] = useState([]);
  const [filter, setFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setVideos(await api.get(`/videos${filter ? `?type_id=${filter}` : ""}`));
    } catch (e) {
      setError(e.message);
    }
  }, [filter]);

  useEffect(() => {
    api.get("/types").then(setTypes).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Keep polling while anything is being generated or rendered.
  const busy = videos.some((v) => BUSY.includes(v.status));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [busy, load]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Video</h1>
          <p className="sub">Viết kịch bản, chọn loại video, AI vẽ từng cảnh và HyperFrames xuất ra MP4.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm(true)}>+ Tạo video</button>
      </header>

      <ErrorNote error={error} />

      <div className="toolbar">
        <div className="chips">
          <button className={`chip ${filter === "" ? "active" : ""}`} onClick={() => setFilter("")}>Tất cả</button>
          {types.map((t) => (
            <button key={t.id} className={`chip ${String(filter) === String(t.id) ? "active" : ""}`} onClick={() => setFilter(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {showForm && <CreateVideo types={types} onClose={() => setShowForm(false)} />}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Tiêu đề</th>
              <th>Loại</th>
              <th>Cảnh</th>
              <th>Trạng thái</th>
              <th>Thời lượng</th>
              <th>Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v) => (
              <tr key={v.id}>
                <td>
                  <Link to={`/videos/${v.id}`} className="title-link">{v.title}</Link>
                </td>
                <td>{v.type_name}</td>
                <td>{v.scene_count}</td>
                <td className="status-cell">
                  <StatusBadge status={v.status} />
                  {BUSY.includes(v.status) && <Progress value={v.progress} />}
                </td>
                <td>{v.duration ? `${Number(v.duration).toFixed(1)} giây` : "—"}</td>
                <td className="muted">{new Date(v.updated_at).toLocaleString("vi-VN")}</td>
              </tr>
            ))}
            {!videos.length && (
              <tr>
                <td colSpan={6} className="empty">Chưa có video nào. Bấm “Tạo video” để bắt đầu.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateVideo({ types, onClose }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: "", type_id: types[0]?.id || "", script: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e, andGenerate) {
    e.preventDefault();
    setSaving(true);
    try {
      const video = await api.post("/videos", { ...form, type_id: Number(form.type_id || types[0]?.id) });
      if (andGenerate) await api.post(`/videos/${video.id}/generate`);
      navigate(`/videos/${video.id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => submit(e, true)}>
        <h2>Tạo video mới</h2>
        <ErrorNote error={error} />
        <label>
          Tiêu đề
          <input value={form.title} onChange={set("title")} required placeholder="Đã là bạn, sao còn phải giấu?" />
        </label>
        <label>
          Loại video
          <select value={form.type_id} onChange={set("type_id")}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label>
          Kịch bản
          <textarea
            rows={10}
            value={form.script}
            onChange={set("script")}
            required
            placeholder="Mỗi câu sẽ thành một cảnh. Ví dụ: Bạn đang xem video này, cho tôi hỏi một câu thật lòng nhé..."
          />
          <small className="muted">{form.script.length} ký tự</small>
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Huỷ</button>
          <button type="button" className="btn" disabled={saving} onClick={(e) => submit(e, false)}>Lưu nháp</button>
          <button className="btn primary" disabled={saving}>{saving ? "Đang lưu…" : "Lưu & tạo cảnh bằng AI"}</button>
        </div>
      </form>
    </div>
  );
}
