import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, PROJECT_BUSY } from "../api.js";
import { ProjectStatusBadge, Progress, ErrorNote } from "../components.jsx";
import PlanEditor from "../PlanEditor.jsx";
import { TopicChip } from "./ProjectsPage.jsx";

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [frames, setFrames] = useState([]);
  const [draft, setDraft] = useState(null); // plan being edited, null = in sync with server
  const [errors, setErrors] = useState([]);
  const [error, setError] = useState("");
  const [studioBusy, setStudioBusy] = useState(false);

  // Read the draft through a ref so typing in the editor does not re-trigger loading.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const load = useCallback(async () => {
    try {
      const data = await api.get(`/projects/${id}`);
      setP(data);
      if (!draftRef.current) setErrors(data.plan_errors);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    api.get("/frames").then(setFrames).catch((e) => setError(e.message));
  }, []);

  const busy = !!p && (p.busy || PROJECT_BUSY.includes(p.status));
  // Poll fast while a job runs; slowly while Studio is open, which also keeps it alive.
  useEffect(() => {
    if (!busy && !p?.studio) return;
    const t = setInterval(load, busy ? 2000 : 15000);
    return () => clearInterval(t);
  }, [busy, p?.studio, load]);

  async function act(fn) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
    await load();
  }

  async function savePlan() {
    if (!draft) return true;
    const r = await api.put(`/projects/${id}/plan`, { plan: draft });
    setDraft(null);
    setErrors(r.plan_errors);
    return r.plan_errors.length === 0;
  }

  // Building from the plan overwrites Studio edits, so ask before forcing it.
  async function build(render) {
    if (!(await savePlan())) throw new Error("Kế hoạch còn lỗi — sửa các ô báo đỏ rồi thử lại");
    try {
      await api.post(`/projects/${id}/build`, { render });
    } catch (e) {
      if (!/chỉnh sửa tay/.test(e.message)) throw e;
      if (!confirm(`${e.message}\n\nBản hiện tại sẽ được sao lưu vào thư mục backups. Vẫn dựng lại?`)) return;
      await api.post(`/projects/${id}/build`, { render, force: true });
    }
  }

  async function replan(mock) {
    if (p.plan && !confirm("Lập lại kế hoạch sẽ thay toàn bộ kế hoạch hiện tại. Tiếp tục?")) return;
    setDraft(null);
    await api.post(`/projects/${id}/plan`, { mock });
  }

  async function openStudio() {
    setStudioBusy(true);
    const win = window.open("", "_blank"); // open synchronously so the popup is not blocked
    try {
      const s = await api.post(`/projects/${id}/studio`);
      if (win) win.location = s.url;
      else window.open(s.url, "_blank");
    } catch (e) {
      win?.close();
      throw e;
    } finally {
      setStudioBusy(false);
    }
  }

  async function closeStudio() {
    const r = await api.del(`/projects/${id}/studio`);
    if (r?.manual_edit) alert("Đã đóng Studio. Phát hiện chỉnh sửa tay — bấm “Render” để xuất video kèm các chỉnh sửa này.");
  }

  if (!p) return <div className="page"><ErrorNote error={error} />{!error && <p>Đang tải…</p>}</div>;

  const plan = draft || p.plan;
  const latest = p.versions[0];
  const totalTokens = Number(p.usage.input_tokens) + Number(p.usage.output_tokens) + Number(p.usage.cache_read_input_tokens);

  return (
    <div className="page">
      <Link to="/" className="back">← Dự án video</Link>
      <header className="page-head">
        <div>
          <h1>{p.title}</h1>
          <p className="sub">
            {plan ? `${plan.scenes.length} cảnh` : "Chưa có kế hoạch"}
            {p.duration ? ` · ${Number(p.duration).toFixed(1)} giây` : ""}
            {totalTokens ? ` · ${totalTokens.toLocaleString("vi-VN")} token AI (${p.usage.calls} lần gọi)` : ""}
          </p>
        </div>
        <div className="actions">
          <button className="btn danger" disabled={busy} onClick={() => confirm("Xoá dự án và toàn bộ file của nó?") && act(async () => { await api.del(`/projects/${id}`); navigate("/"); })}>
            Xoá
          </button>
        </div>
      </header>

      <ErrorNote error={error} />

      <section className="card status-card">
        <ProjectStatusBadge status={p.status} />
        <span className="muted status-msg">{p.message}</span>
        {busy && <Progress value={p.progress} />}
      </section>

      <section className="card">
        <h2>Các bước</h2>
        <div className="steps">
          <div className="step">
            <strong>1. Kế hoạch</strong>
            <span className="muted small">AI chia cảnh, chọn frame, viết lời đọc.</span>
            <div className="actions">
              <button className="btn" disabled={busy} onClick={() => act(() => replan(false))}>{p.plan ? "Lập lại bằng AI" : "Lập kế hoạch bằng AI"}</button>
              <button className="btn small" disabled={busy} onClick={() => act(() => replan(true))} title="Không gọi AI, không tốn token">Thử (mock)</button>
            </div>
          </div>
          <div className="step">
            <strong>2. Duyệt & render</strong>
            <span className="muted small">Tạo giọng đọc, dựng HyperFrames, xuất MP4.</span>
            <div className="actions">
              <button className="btn primary" disabled={busy || !plan} onClick={() => act(() => build(true))}>Duyệt & render</button>
              <button className="btn" disabled={busy || !plan} onClick={() => act(() => build(false))} title="Dựng để xem/sửa trong Studio trước khi render">Chỉ dựng</button>
            </div>
          </div>
          <div className="step">
            <strong>3. Chỉnh tay trong Studio</strong>
            <span className="muted small">Kéo, cắt, sửa chữ trên timeline HyperFrames.</span>
            <div className="actions">
              {p.studio ? (
                <>
                  <a className="btn" href={p.studio.url} target="_blank" rel="noreferrer">Mở lại Studio ↗</a>
                  <button className="btn" onClick={() => act(closeStudio)}>Đóng Studio</button>
                </>
              ) : (
                <button className="btn" disabled={busy || !p.built || studioBusy} onClick={() => act(openStudio)}>
                  {studioBusy ? "Đang mở…" : "Chỉnh sửa trong Studio ↗"}
                </button>
              )}
              <button className="btn" disabled={busy || !p.built} onClick={() => act(() => api.post(`/projects/${id}/render`))} title="Render đúng những gì đang có, gồm cả chỉnh sửa trong Studio">
                Render
              </button>
            </div>
            {p.has_manual_edits && <span className="pill warn">Có chỉnh sửa tay trong Studio</span>}
            {p.plan_changed && <span className="pill warn">Kế hoạch đã đổi — bấm “Duyệt & render” hoặc “Chỉ dựng” để áp dụng</span>}
          </div>
        </div>
      </section>

      {latest && (
        <section className="card">
          <div className="card-head">
            <h2>Video v{latest.version}{latest.manual_edit ? " (có sửa tay)" : ""}</h2>
            <a className="btn small" href={latest.url} download={`${p.slug}-v${latest.version}.mp4`}>Tải MP4</a>
          </div>
          <video className="player" src={latest.url} controls key={latest.url} />
          {p.versions.length > 1 && (
            <div className="versions">
              {p.versions.slice(1).map((v) => (
                <a key={v.id} href={v.url} target="_blank" rel="noreferrer" className="chip">
                  v{v.version} · {Number(v.duration).toFixed(1)}s{v.manual_edit ? " · sửa tay" : ""}
                </a>
              ))}
            </div>
          )}
          {latest.qc && !latest.qc.ok && <div className="note error">QC: {latest.qc.issues.join("; ")}</div>}
        </section>
      )}

      {plan && (
        <section className="card">
          <div className="card-head">
            <h2>Kế hoạch</h2>
            <div className="actions">
              {p.plan_approved ? <span className="pill ok">Đã duyệt</span> : null}
              {errors.length > 0 && <span className="pill error">{errors.length} lỗi</span>}
              {draft && (
                <>
                  <button className="btn small" onClick={() => { setDraft(null); setErrors(p.plan_errors); }}>Huỷ thay đổi</button>
                  <button className="btn small primary" onClick={() => act(savePlan)}>Lưu kế hoạch</button>
                </>
              )}
            </div>
          </div>
          {p.warnings.length > 0 && !draft && (
            <details className="warnings">
              <summary className="muted small">{p.warnings.length} cảnh báo từ lần dựng gần nhất</summary>
              <ul>{p.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </details>
          )}
          <PlanEditor
            plan={plan}
            frames={frames}
            images={p.images}
            errors={errors}
            audio={draft ? {} : p.audio}
            disabled={busy}
            onChange={setDraft}
          />
          {draft && (
            <div className="sticky-save">
              <span>Có thay đổi chưa lưu</span>
              <button className="btn small" onClick={() => { setDraft(null); setErrors(p.plan_errors); }}>Huỷ</button>
              <button className="btn small primary" onClick={() => act(savePlan)}>Lưu kế hoạch</button>
            </div>
          )}
        </section>
      )}

      <ProjectInfo p={p} disabled={busy} onSaved={load} onError={setError} />
      <ImagesCard p={p} disabled={busy} onChanged={load} onError={setError} />

      {p.jobs.length > 0 && (
        <section className="card">
          <h2>Nhật ký xử lý</h2>
          {p.jobs.map((j) => (
            <details key={j.id} className="job" open={j === p.jobs[0] && j.status === "failed"}>
              <summary>
                <span className={`pill ${j.status === "failed" ? "error" : j.status === "done" ? "ok" : "info"}`}>{j.type}: {j.status}</span>
                <span className="muted small">{j.started_at ? new Date(j.started_at).toLocaleString("vi-VN") : ""}</span>
              </summary>
              <pre>{j.log || j.error || ""}</pre>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}

function ProjectInfo({ p, disabled, onSaved, onError }) {
  const [form, setForm] = useState(null);
  const [voices, setVoices] = useState([]);
  const [topics, setTopics] = useState([]);
  useEffect(() => {
    api.get("/projects/voices").then(setVoices).catch(() => {});
    api.get("/topics").then(setTopics).catch(() => {});
  }, []);
  const topic = topics.find((t) => t.topic_id === p.topic);
  const editing = !!form;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    try {
      await api.put(`/projects/${p.id}`, form);
      setForm(null);
      onSaved();
    } catch (e) {
      onError(e.message);
    }
  }

  const f = form || p;
  return (
    <section className="card">
      <div className="card-head">
        <h2>Tư liệu & cài đặt</h2>
        {!editing ? (
          <button className="btn small" disabled={disabled} onClick={() => setForm({ title: p.title, material: p.material, topic: p.topic, channel: p.channel || "", voice: p.voice, voice_rate: p.voice_rate, target_seconds: p.target_seconds })}>
            Sửa
          </button>
        ) : (
          <div className="actions">
            <button className="btn small" onClick={() => setForm(null)}>Huỷ</button>
            <button className="btn small primary" onClick={save}>Lưu</button>
          </div>
        )}
      </div>
      {editing ? (
        <>
          <label>Tên dự án<input value={f.title} onChange={set("title")} /></label>
          <label>Tư liệu / kịch bản<textarea rows={8} value={f.material} onChange={set("material")} /></label>
          <div className="grid-2">
            <label>
              Chủ đề
              <select value={f.topic} onChange={set("topic")}>
                {topics.map((t) => <option key={t.topic_id} value={t.topic_id}>{t.name}</option>)}
              </select>
            </label>
            <label>Tên kênh<input value={f.channel} onChange={set("channel")} /></label>
            <label>Độ dài mong muốn (giây)<input type="number" value={f.target_seconds} onChange={set("target_seconds")} /></label>
            <label>
              Giọng đọc
              <select value={f.voice} onChange={set("voice")}>
                {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </label>
            <label>Tốc độ đọc<input value={f.voice_rate} onChange={set("voice_rate")} /></label>
          </div>
          <small className="muted">Đổi chủ đề sẽ đổi bộ màu ở lần dựng sau và đổi bộ frame AI được chọn ở lần lập kế hoạch sau. Tư liệu mới chỉ có hiệu lực khi lập lại kế hoạch. Đổi giọng hoặc tốc độ sẽ tạo lại toàn bộ audio ở lần dựng sau.</small>
        </>
      ) : (
        <>
          <p className="muted small info-line">
            <TopicChip topic={topic} fallback={p.topic} /> · Kênh: {p.channel || "—"} · Giọng: {p.voice} ({p.voice_rate}) · Mong muốn {p.target_seconds} giây
          </p>
          <p className="script clamp">{p.material}</p>
        </>
      )}
    </section>
  );
}

function ImagesCard({ p, disabled, onChanged, onError }) {
  const input = useRef(null);
  async function upload(files) {
    const form = new FormData();
    for (const f of files) form.append("images", f);
    try {
      await api.post(`/projects/${p.id}/images`, form);
      onChanged();
    } catch (e) {
      onError(e.message);
    }
  }
  return (
    <section className="card">
      <div className="card-head">
        <h2>Ảnh của dự án</h2>
        <button className="btn small" disabled={disabled} onClick={() => input.current.click()}>Tải ảnh lên</button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      {p.images.length ? (
        <div className="image-grid">
          {p.images.map((img) => (
            <figure key={img.name}>
              <img src={img.url} alt={img.name} />
              <figcaption>
                <span>{img.name}</span>
                <button className="btn small danger" disabled={disabled} onClick={() => api.del(`/projects/${p.id}/images/${encodeURIComponent(img.name)}`).then(onChanged, (e) => onError(e.message))}>
                  ✕
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="muted small">Chưa có ảnh. Khi có ảnh, AI có thể dùng frame “Ảnh kèm chú thích”.</p>
      )}
    </section>
  );
}
