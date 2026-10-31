import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { ErrorNote } from "../components.jsx";

// "Video dài": long minimal explainers (black background, white line diagrams). One AI call writes
// the whole script and picks, scene by scene, a HyperFrames frame of the library, a Motion Canvas
// animation, or a drawing it makes itself (SVG + motion tags) (server/src/longvideo/).
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
const KIND = {
  frame: { label: "Frame HyperFrames", tone: "warn" },
  anim: { label: "Animation Motion Canvas", tone: "info" },
  draw: { label: "AI tự vẽ", tone: "muted" },
};
const kindOf = (sc) => (sc.kind === "frame" || sc.kind === "anim" ? sc.kind : "draw");
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
          <p className="sub">Video giải thích nhiều phút, phong cách tối giản nền đen. Một lượt gọi AI viết toàn bộ kịch bản và chọn hình cho từng cảnh: frame HyperFrames (số liệu, so sánh, danh sách…), animation Motion Canvas mô phỏng chính xác khái niệm, hoặc tự vẽ hình động khi thư viện không có. Sửa được từng cảnh.</p>
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
  const [form, setForm] = useState({ title: "", material: "", minutes: 8, brand: "", voice: "", rate: "+0%", topic: "" });
  const [topics, setTopics] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get("/topics").then(setTopics).catch(() => {});
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
          Chủ đề (chọn frame và animation phù hợp)
          <select value={form.topic} onChange={set("topic")}>
            <option value="">Tự động theo nội dung (khoa học tổng quát)</option>
            {topics.map((t) => <option key={t.topic_id} value={t.topic_id}>{t.name}</option>)}
          </select>
        </label>
        <label>
          Giọng đọc
          <select value={form.voice} onChange={set("voice")}>
            {meta?.voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </label>
        <p className="muted small">Một lượt gọi AI cho cả video: AI nhận các frame và animation hợp với chủ đề, phối khoảng 1/4 cảnh frame, 1/4 cảnh animation, còn lại tự vẽ. Khoảng 45 từ mỗi cảnh.</p>
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
    const t = setInterval(load, 1500);
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
          {shown.length > 0 && (
            <p className="mix-line">
              {Object.entries(KIND).map(([k, m]) => (
                <span key={k} className={`pill ${m.tone}`}>{shown.filter((sc) => kindOf(sc) === k).length} {m.label}</span>
              ))}
              {v.plan?.library?.targets && <span className="muted small">mục tiêu ≥ {v.plan.library.targets.frame} frame, ≥ {v.plan.library.targets.anim} animation</span>}
            </p>
          )}
        </div>
        <div className="actions">
          <button className="btn" disabled={busy} onClick={() => run("plan")}>{v.plan ? "AI viết lại" : "AI viết kịch bản"}</button>
          <button className="btn" onClick={remove} disabled={busy}>Xoá</button>
        </div>
      </header>
      <ErrorNote error={error} />

      {v.progress && <ProgressPanel slug={slug} p={v.progress} running={busy} />}

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

// Editable JSON of a frame's inputs or an animation's props; the parsed object reaches the scene
// only while the text is valid JSON.
const STAGE_ICON = { pending: "○", running: "◐", done: "✓", skipped: "–", failed: "✕" };
const dur = (ms) => (ms > 0 ? mmss(ms / 1000) : "0:00");

// The running (or last) task step by step: overall percent from each step's share, elapsed time and
// an estimate of what is left, then each step with its counts, its own bar and how long it took.
function ProgressPanel({ slug, p, running }) {
  const [now, setNow] = useState(Date.now());
  const [detail, setDetail] = useState(false);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  const end = p.endedAt || (running ? now : p.startedAt);
  const share = (s) => (s.status === "done" || s.status === "skipped" ? 1 : s.status === "running" ? (s.percent ?? 0) / 100 : 0);
  const weights = p.stages.filter((s) => s.status !== "skipped");
  const total = weights.reduce((n, s) => n + s.weight, 0) || 1;
  const percent = p.endedAt && !p.error ? 100 : Math.round((weights.reduce((n, s) => n + s.weight * share(s), 0) / total) * 100);
  const elapsed = end - p.startedAt;
  // Time left from the pace so far (only once there is enough progress to judge it).
  const left = running && percent >= 5 && percent < 100 ? (elapsed * (100 - percent)) / percent : 0;
  return (
    <section className={`card progress-card ${p.error ? "failed" : ""}`}>
      <div className="card-head">
        <h2>Tiến trình — {p.label}</h2>
        <span className="muted small">
          {p.error ? "Lỗi" : p.endedAt ? "Hoàn thành" : running ? "Đang chạy" : "Đã dừng"} · {dur(elapsed)}
          {left > 0 && ` · còn khoảng ${dur(left)}`}
          {p.task === "build" && (
            <button className="btn small" onClick={() => setDetail((d) => !d)}>{detail ? "Ẩn chi tiết" : "Chi tiết render"}</button>
          )}
        </span>
      </div>
      <div className="progress-total">
        <div className="progress-bar"><span style={{ width: `${percent}%` }} /></div>
        <strong>{percent}%</strong>
      </div>
      <ol className="progress-stages">
        {p.stages.map((s) => (
          <li key={s.key} className={`stage ${s.status}`}>
            <span className="stage-icon">{STAGE_ICON[s.status] || "○"}</span>
            <div className="stage-body">
              <div className="stage-head">
                <span>{s.label}</span>
                <span className="muted small">
                  {s.detail}
                  {s.startedAt && s.status !== "skipped" && ` · ${dur((s.endedAt || (running ? now : s.startedAt)) - s.startedAt)}`}
                </span>
              </div>
              {s.status === "running" && s.percent != null && (
                <div className="progress-bar thin"><span style={{ width: `${s.percent}%` }} /></div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {p.error && <div className="note error">{p.error}</div>}
      {detail && <RenderDetail slug={slug} />}
    </section>
  );
}

const SEGMENT = { done: "Xong", rendering: "Đang chụp", stopped: "Bị ngắt (render lại)", pending: "Chờ" };

// Inside the HyperFrames render: the video is cut into segments captured side by side (one Chrome +
// ffmpeg each); the frames of every segment (counted in its file), the speed and time left measured
// between two looks, HyperFrames' own output, and HyperFrames Studio to watch the video being made.
function RenderDetail({ slug }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const pace = useRef([]); // [{ t, frames }] of the last minute
  const load = useCallback(
    () =>
      api.get(`/long/${slug}/render`).then((r) => {
        const frames = r.segments.reduce((n, s) => n + (s.status === "stopped" ? 0 : s.done), 0);
        pace.current = [...pace.current.filter((x) => Date.now() - x.t < 60_000 && x.frames <= frames), { t: Date.now(), frames }];
        setD({ ...r, frames });
      }).catch((e) => setError(e.message)),
    [slug],
  );
  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  async function studio(open) {
    setOpening(true);
    setError("");
    try {
      if (open) {
        const s = await api.post(`/long/${slug}/studio`);
        window.open(s.url, "_blank");
      } else await api.del(`/long/${slug}/studio`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setOpening(false);
    }
  }

  if (!d) return <div className="render-detail"><ErrorNote error={error} /><span className="muted small">Đang đọc…</span></div>;
  const first = pace.current[0];
  const last = pace.current[pace.current.length - 1];
  const fps = first && last.t - first.t > 5000 ? ((last.frames - first.frames) * 1000) / (last.t - first.t) : 0;
  const left = fps > 0 && d.totalFrames ? (d.totalFrames - d.frames) / fps : 0;
  const pct = (n, of) => (of ? Math.min(100, (n / of) * 100) : 0);
  return (
    <div className="render-detail">
      <ErrorNote error={error} />
      <div className="render-detail-head">
        <strong>{d.frames.toLocaleString("vi-VN")} / {d.totalFrames ? d.totalFrames.toLocaleString("vi-VN") : "?"} khung hình</strong>
        <span className="muted small">
          {d.segments.length} đoạn × {d.segmentFrames ? d.segmentFrames.toLocaleString("vi-VN") : "?"} khung
          {fps > 0 && ` · ${fps.toFixed(1)} khung/giây`}
          {left > 0 && ` · chụp xong sau khoảng ${dur(left * 1000)}`}
        </span>
        <span className="render-detail-actions">
          {d.studio ? (
            <>
              <a className="btn small" href={d.studio.url} target="_blank" rel="noreferrer">Mở Studio ↗</a>
              <button className="btn small" disabled={opening} onClick={() => studio(false)}>Tắt Studio</button>
            </>
          ) : (
            <button className="btn small" disabled={opening} onClick={() => studio(true)}>{opening ? "Đang mở…" : "Xem trong HyperFrames Studio"}</button>
          )}
        </span>
      </div>
      {d.segments.length === 0 ? (
        <p className="muted small">Chưa có đoạn nào — HyperFrames đang chuẩn bị (mở trang, đo thời lượng, chia đoạn).</p>
      ) : (
        <ol className="render-segments">
          {d.segments.map((s) => (
            <li key={s.index} className={`segment ${s.status}`}>
              <span className="segment-name">Đoạn {s.index + 1}</span>
              <span className="muted small">{mmss(s.start / 30)}–{mmss((s.start + s.frames) / 30)}</span>
              <div className="progress-bar thin"><span style={{ width: `${pct(s.done, s.frames)}%` }} /></div>
              <span className="small">{s.done.toLocaleString("vi-VN")}/{s.frames.toLocaleString("vi-VN")}</span>
              <span className={`pill ${s.status === "done" ? "done" : s.status === "rendering" ? "info" : s.status === "stopped" ? "warn" : "muted"}`}>{SEGMENT[s.status]}</span>
            </li>
          ))}
        </ol>
      )}
      {d.studio && <p className="muted small">Studio cho xem và tua video đã dựng. Sửa trong Studio sẽ bị ghi đè ở lần “Render” sau. Mở Studio khi đang render sẽ làm render chậm hơn một chút.</p>}
      <details>
        <summary className="small">Nhật ký HyperFrames ({d.log.length} dòng cuối)</summary>
        <pre className="render-log">{d.log.join("\n") || "(chưa có)"}</pre>
      </details>
    </div>
  );
}

function JsonField({ value, onChange, disabled }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [bad, setBad] = useState("");
  return (
    <>
      <textarea
        className="code"
        rows={7}
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value || "{}"));
            setBad("");
          } catch (err) {
            setBad(err.message);
          }
        }}
      />
      {bad && <p className="check-errors small">JSON lỗi: {bad}</p>}
    </>
  );
}

function SceneCard({ scene, index, brand, onChange, onDelete, disabled }) {
  const [preview, setPreview] = useState(scene.preview);
  const [problems, setProblems] = useState(scene.problems || []);
  // An edited scene is redrawn (and its frame/animation choice checked) by the server.
  useEffect(() => {
    if (scene.preview) {
      setPreview(scene.preview);
      setProblems(scene.problems || []);
      return;
    }
    const t = setTimeout(() => api.post("/long/preview", { scene, brand }).then((r) => (setPreview(r.preview), setProblems(r.problems || []))).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [scene, brand]);
  const change = (patch) => onChange({ ...patch, preview: undefined, problems: undefined });
  const kind = kindOf(scene);

  return (
    <div className="long-scene card">
      <div className="long-frame" dangerouslySetInnerHTML={{ __html: preview || "" }} />
      <div className="long-fields">
        <div className="card-head">
          <span className="scene-index">
            Cảnh {index + 1} <span className={`pill ${KIND[kind].tone}`}>{KIND[kind].label}</span>
            {kind === "frame" && <code> {scene.frame_id}</code>}
            {kind === "anim" && <code> {scene.component}</code>}
          </span>
          <button className="btn small" onClick={onDelete} disabled={disabled}>Xoá cảnh</button>
        </div>
        <input value={scene.heading} onChange={(e) => change({ heading: e.target.value })} placeholder="Tiêu đề" disabled={disabled} />
        <textarea rows={3} value={scene.voice_text} onChange={(e) => change({ voice_text: e.target.value })} disabled={disabled} />
        {problems.length > 0 && <ul className="check-errors">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        {kind !== "draw" && (
          <details open={problems.length > 0}>
            <summary className="muted small">{kind === "frame" ? "Biến đầu vào của frame (JSON)" : "Tham số animation (JSON)"} · nhịp</summary>
            <JsonField value={kind === "frame" ? scene.inputs : scene.props} onChange={(o) => change(kind === "frame" ? { inputs: o } : { props: o })} disabled={disabled} />
            <input value={scene.beats.join(" | ")} onChange={(e) => change({ beats: e.target.value.split("|").map((x) => x.trim()).filter(Boolean) })} placeholder="Từ khoá nhịp (keyword của frame / mốc của animation), cách nhau bởi |" disabled={disabled} />
            <input value={scene.note} onChange={(e) => change({ note: e.target.value })} placeholder="Chú thích cuối khung" disabled={disabled} />
            <button type="button" className="btn small" disabled={disabled} onClick={() => change({ kind: "ai", frame_id: undefined, inputs: undefined, component: undefined, props: undefined })} title="AI sẽ không vẽ lại: cảnh dùng hình dự phòng cho tới khi bạn dán SVG">Đổi thành cảnh tự vẽ</button>
          </details>
        )}
        {kind === "draw" && <details>
          <summary className="muted small">Hình động (SVG) · phụ đề · chú thích · nhịp</summary>
          <p className="muted small">SVG trên khung 1920×1080. Nhãn chuyển động: step, draw, delay, at, move, scale, rot, spin, bob, osc, orbit, tw, drift, count; icon: &lt;icon name='galaxy' x='' y='' s=''/&gt;.</p>
          <textarea className="code" rows={8} value={scene.svg || ""} onChange={(e) => change({ svg: e.target.value })} disabled={disabled} />
          <input value={scene.sub} onChange={(e) => change({ sub: e.target.value })} placeholder="Phụ đề dưới tiêu đề" disabled={disabled} />
          <input value={scene.note} onChange={(e) => change({ note: e.target.value })} placeholder="Chú thích cuối khung" disabled={disabled} />
          <input value={scene.beats.join(" | ")} onChange={(e) => change({ beats: e.target.value.split("|").map((x) => x.trim()).filter(Boolean) })} placeholder="Từ khoá nhịp, cách nhau bởi |" disabled={disabled} />
        </details>}
      </div>
    </div>
  );
}
