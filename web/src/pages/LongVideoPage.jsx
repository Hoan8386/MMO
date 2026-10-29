import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { ErrorNote } from "../components.jsx";

// "Video dài": long minimal explainers (black background, white line diagrams). One AI call writes
// the whole script and draws every scene (SVG + motion tags) that the scene runtime animates
// (server/src/longvideo/).
const STATUS = {
  draft: { label: "Nháp", tone: "muted" },
  planning: { label: "AI đang viết", tone: "info" },
  planned: { label: "Chờ duyệt", tone: "warn" },
  rendering: { label: "Đang render", tone: "info" },
  done: { label: "Hoàn thành", tone: "done" },
  failed: { label: "Lỗi", tone: "error" },
  busy: { label: "Đang xử lý", tone: "info" },
};
const Status = ({ s }) => <span className={`pill ${(STATUS[s] || STATUS.draft).tone}`}>{(STATUS[s] || STATUS.draft).label}</span>;
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

export default function LongVideoPage() {
  const [list, setList] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const load = useCallback(() => api.get("/long").then(setList).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Video dài</h1>
          <p className="sub">Video giải thích nhiều phút, phong cách tối giản nền đen. Một lượt gọi AI viết toàn bộ kịch bản và tự vẽ hình động cho từng cảnh; mỗi video giữ hình của riêng nó, sửa được từng cảnh.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm(true)}>+ Video dài mới</button>
      </header>
      <ErrorNote error={error} />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Video</th><th>Trạng thái</th><th>Độ dài mục tiêu</th><th>Cảnh</th><th>Cập nhật</th></tr>
          </thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.slug}>
                <td><Link className="title-link" to={`/long/${v.slug}`}>{v.title}</Link></td>
                <td><Status s={v.status} /></td>
                <td>{v.minutes} phút</td>
                <td>{v.scenes || "—"}</td>
                <td className="muted">{v.updated ? new Date(v.updated).toLocaleString("vi-VN") : "—"}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={5} className="empty">Chưa có video dài nào.</td></tr>}
          </tbody>
        </table>
      </div>
      {showForm && <NewLongModal onClose={() => setShowForm(false)} />}
    </div>
  );
}

function NewLongModal({ onClose }) {
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState({ title: "", material: "", minutes: 8, brand: "", voice: "", rate: "+0%" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get("/long/meta").then((m) => {
      setMeta(m);
      setForm((f) => ({ ...f, voice: f.voice || m.defaultVoice }));
    });
  }, []);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const v = await api.post("/long", form);
      await api.post(`/long/${v.slug}/plan`);
      navigate(`/long/${v.slug}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Video dài mới</h2>
        <ErrorNote error={error} />
        <label>
          Tiêu đề
          <input value={form.title} onChange={set("title")} placeholder="vd. Năng lượng tối là gì?" autoFocus required />
        </label>
        <label>
          Tư liệu / dàn ý (không bắt buộc)
          <textarea rows={8} value={form.material} onChange={set("material")} placeholder="Dán bài viết, ghi chú hoặc dàn ý. Để trống thì AI giải thích tiêu đề bằng kiến thức phổ thông." />
        </label>
        <div className="grid-2">
          <label>
            Độ dài (phút)
            <input type="number" min={1} max={30} value={form.minutes} onChange={set("minutes")} />
          </label>
          <label>
            Tên kênh (góc phải)
            <input value={form.brand} onChange={set("brand")} placeholder="vd. Manhattan Project" />
          </label>
        </div>
        <label>
          Giọng đọc
          <select value={form.voice} onChange={set("voice")}>
            {meta?.voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </label>
        <p className="muted small">Một lượt gọi AI cho cả video, kể cả hình động của từng cảnh. Khoảng 45 từ mỗi cảnh.</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Huỷ</button>
          <button className="btn primary" disabled={saving}>{saving ? "Đang tạo…" : "Tạo & AI viết kịch bản"}</button>
        </div>
      </form>
    </div>
  );
}

export function LongVideoDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [v, setV] = useState(null);
  const [scenes, setScenes] = useState(null); // edits not yet saved
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(3);

  const load = useCallback(() => api.get(`/long/${slug}`).then(setV).catch((e) => setError(e.message)), [slug]);
  useEffect(() => {
    load();
  }, [load]);
  const busy = v?.busy;
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [busy, load]);
  // A finished job brings a new plan: drop stale edits.
  useEffect(() => {
    if (!busy) setScenes(null);
  }, [busy]);

  const run = (path, body) => api.post(`/long/${slug}/${path}`, body).then(load).catch((e) => setError(e.message));
  const shown = scenes || v?.plan?.scenes || [];
  const words = shown.reduce((n, s) => n + s.voice_text.split(/\s+/).length, 0);
  const calls = v?.calls || [];

  async function save() {
    try {
      setV(await api.put(`/long/${slug}`, { scenes }));
      setScenes(null);
    } catch (e) {
      setError(e.message);
    }
  }
  async function remove() {
    if (!confirm(`Xoá video "${v.title}" và mọi file của nó?`)) return;
    await api.del(`/long/${slug}`);
    navigate("/long");
  }
  const edit = (i, patch) => setScenes((list) => (list || v.plan.scenes).map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const drop = (i) => setScenes((list) => (list || v.plan.scenes).filter((_, k) => k !== i));

  if (!v) return <div className="page"><ErrorNote error={error} /></div>;
  return (
    <div className="page">
      <Link className="back" to="/long">← Video dài</Link>
      <header className="page-head">
        <div>
          <h1>{v.title}</h1>
          <p className="sub">
            <Status s={busy ? "busy" : v.status} /> · mục tiêu {v.minutes} phút · {shown.length} cảnh · {words} từ (~{mmss((words / 150) * 60)})
            {calls.length > 0 && ` · ${calls.length} lượt gọi AI, ${calls.reduce((n, c) => n + (c.output_tokens || 0), 0).toLocaleString("vi-VN")} token ra`}
          </p>
        </div>
        <div className="actions">
          <button className="btn" disabled={busy} onClick={() => run("plan")}>{v.plan ? "AI viết lại" : "AI viết kịch bản"}</button>
          {v.plan && <button className="btn" disabled={busy} onClick={() => run("continue")} title="Chỉ dùng khi câu trả lời AI bị cắt giữa chừng (chạm max_tokens): thêm 1 lượt gọi cho các cảnh còn thiếu">AI viết tiếp</button>}
          <button className="btn" onClick={remove} disabled={busy}>Xoá</button>
        </div>
      </header>
      <ErrorNote error={error} />

      {v.plan && (
        <div className="card status-card">
          <span>Render thử</span>
          <input type="number" min={1} style={{ width: 70 }} value={limit} onChange={(e) => setLimit(e.target.value)} />
          <span>cảnh đầu</span>
          <button className="btn" disabled={busy || scenes} onClick={() => run("build", { limit: Number(limit) })}>Render thử</button>
          <button className="btn primary" disabled={busy || scenes} onClick={() => run("build", {})}>Render toàn bộ</button>
          {scenes && <span className="muted small">Lưu chỉnh sửa trước khi render</span>}
          <span className="status-msg muted small">{v.message}</span>
        </div>
      )}

      {v.video && !busy && (
        <div className="card">
          <video className="player" src={`${v.video}?t=${v.updated}`} controls />
          <a className="btn" href={v.video} download>Tải MP4</a> <span className="muted small">{v.duration ? mmss(v.duration) : ""}</span>
        </div>
      )}

      {v.log?.length > 0 && (
        <details className="card job" open={busy}>
          <summary>Nhật ký</summary>
          <pre>{v.log.slice(-40).join("\n")}</pre>
        </details>
      )}

      {scenes && (
        <div className="sticky-save">
          <button className="btn primary" onClick={save}>Lưu chỉnh sửa</button>
          <button className="btn" onClick={() => setScenes(null)}>Bỏ</button>
        </div>
      )}

      <div className="long-scenes">
        {shown.map((s, i) => (
          <SceneCard key={`${s.id}-${i}`} scene={s} index={i} brand={v.brand} onChange={(p) => edit(i, p)} onDelete={() => drop(i)} disabled={busy} />
        ))}
      </div>
    </div>
  );
}

function SceneCard({ scene, index, brand, onChange, onDelete, disabled }) {
  const [preview, setPreview] = useState(scene.preview);
  // An edited scene is redrawn by the server (the same code that renders the video).
  useEffect(() => {
    if (scene.preview) return setPreview(scene.preview);
    const t = setTimeout(() => api.post("/long/preview", { scene, brand }).then((r) => setPreview(r.preview)).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [scene, brand]);
  const change = (patch) => onChange({ ...patch, preview: undefined });

  return (
    <div className="long-scene card">
      <div className="long-frame" dangerouslySetInnerHTML={{ __html: preview || "" }} />
      <div className="long-fields">
        <div className="card-head">
          <span className="scene-index">Cảnh {index + 1}{scene.svg ? " · AI vẽ" : ` · hình mẫu ${scene.kind}`}</span>
          <button className="btn small" onClick={onDelete} disabled={disabled}>Xoá cảnh</button>
        </div>
        <input value={scene.heading} onChange={(e) => change({ heading: e.target.value })} placeholder="Tiêu đề" disabled={disabled} />
        <textarea rows={3} value={scene.voice_text} onChange={(e) => change({ voice_text: e.target.value })} disabled={disabled} />
        <details>
          <summary className="muted small">Hình động (SVG) · phụ đề · chú thích · nhịp</summary>
          <p className="muted small">SVG trên khung 1920×1080. Nhãn chuyển động: step, draw, delay, at, move, scale, rot, spin, bob, osc, orbit, tw, drift, count; icon: &lt;icon name='galaxy' x='' y='' s=''/&gt;.</p>
          <textarea className="code" rows={8} value={scene.svg || ""} onChange={(e) => change({ svg: e.target.value })} disabled={disabled} />
          <input value={scene.sub} onChange={(e) => change({ sub: e.target.value })} placeholder="Phụ đề dưới tiêu đề" disabled={disabled} />
          <input value={scene.note} onChange={(e) => change({ note: e.target.value })} placeholder="Chú thích cuối khung" disabled={disabled} />
          <input value={scene.beats.join(" | ")} onChange={(e) => change({ beats: e.target.value.split("|").map((x) => x.trim()).filter(Boolean) })} placeholder="Từ khoá nhịp, cách nhau bởi |" disabled={disabled} />
        </details>
      </div>
    </div>
  );
}
