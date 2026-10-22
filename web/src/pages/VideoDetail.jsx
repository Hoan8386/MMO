import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { StatusBadge, Progress, ScenePreview, ErrorNote } from "../components.jsx";

const BUSY = ["generating", "rendering"];

export default function VideoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [video, setVideo] = useState(null);
  const [error, setError] = useState("");
  const [script, setScript] = useState("");
  const [editingScript, setEditingScript] = useState(false);

  const load = useCallback(async () => {
    try {
      const v = await api.get(`/videos/${id}`);
      setVideo(v);
      setScript((s) => (editingScript ? s : v.script));
    } catch (e) {
      setError(e.message);
    }
  }, [id, editingScript]);

  useEffect(() => {
    load();
  }, [load]);

  const busy = video && BUSY.includes(video.status);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [busy, load]);

  async function act(fn) {
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!video) return <div className="page"><ErrorNote error={error} />{!error && <p>Đang tải…</p>}</div>;

  const hasScenes = video.scenes.length > 0;
  const allReady = hasScenes && video.scenes.every((s) => s.status === "ready");

  return (
    <div className="page">
      <Link to="/legacy" className="back">← Danh sách video vẽ tay</Link>
      <header className="page-head">
        <div>
          <h1>{video.title}</h1>
          <p className="sub">
            {video.type_name} · {video.scenes.length} cảnh {video.duration ? `· ${Number(video.duration).toFixed(1)} giây` : ""}
          </p>
        </div>
        <div className="actions">
          <button className="btn" disabled={busy} onClick={() => act(() => api.post(`/videos/${id}/generate`))}>
            {hasScenes ? "Tạo lại toàn bộ cảnh" : "Tạo cảnh bằng AI"}
          </button>
          <button className="btn primary" disabled={busy || !allReady} onClick={() => act(() => api.post(`/videos/${id}/render`))}>
            Render video
          </button>
          <button
            className="btn danger"
            disabled={busy}
            onClick={() => confirm("Xoá video này và toàn bộ file của nó?") && act(async () => { await api.del(`/videos/${id}`); navigate("/legacy"); })}
          >
            Xoá
          </button>
        </div>
      </header>

      <ErrorNote error={error} />

      <section className="card status-card">
        <StatusBadge status={video.status} />
        <span className="muted">{video.message}</span>
        {busy && <Progress value={video.progress} />}
      </section>

      {video.status === "done" && video.output_path && (
        <section className="card">
          <h2>Video hoàn chỉnh</h2>
          <video className="player" src={`/storage/${video.output_path}?v=${encodeURIComponent(video.updated_at)}`} controls />
          <a className="btn" href={`/storage/${video.output_path}`} download={`${video.title}.mp4`}>Tải MP4</a>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Kịch bản</h2>
          {!editingScript ? (
            <button className="btn small" disabled={busy} onClick={() => setEditingScript(true)}>Sửa</button>
          ) : (
            <div className="actions">
              <button className="btn small" onClick={() => { setEditingScript(false); setScript(video.script); }}>Huỷ</button>
              <button
                className="btn small primary"
                onClick={() => act(async () => { await api.put(`/videos/${id}`, { script }); setEditingScript(false); })}
              >
                Lưu
              </button>
            </div>
          )}
        </div>
        {editingScript ? (
          <textarea rows={8} value={script} onChange={(e) => setScript(e.target.value)} />
        ) : (
          <p className="script">{video.script}</p>
        )}
        {editingScript && <small className="muted">Sau khi lưu, bấm “Tạo lại toàn bộ cảnh” để áp dụng kịch bản mới.</small>}
      </section>

      <h2 className="section-title">Các cảnh</h2>
      {!hasScenes && <p className="muted">Chưa có cảnh. Bấm “Tạo cảnh bằng AI” để tách kịch bản, tạo giọng đọc và vẽ từng cảnh.</p>}
      <div className="scene-grid">
        {video.scenes.map((s, i) => (
          <SceneCard key={s.id} scene={s} index={i} type={video.type} videoId={id} busy={busy} onChange={load} onError={setError} />
        ))}
      </div>
    </div>
  );
}

function SceneCard({ scene, index, type, videoId, busy, onChange, onError }) {
  const [text, setText] = useState(scene.text);
  useEffect(() => setText(scene.text), [scene.text]);
  const dirty = text !== scene.text;

  async function regenerate() {
    try {
      if (dirty) await api.put(`/videos/${videoId}/scenes/${scene.id}`, { text });
      await api.post(`/videos/${videoId}/scenes/${scene.id}/regenerate`);
      onChange();
    } catch (e) {
      onError(e.message);
    }
  }

  return (
    <article className={`scene-card ${scene.status}`}>
      <div className="scene-index">Cảnh {index + 1}</div>
      <ScenePreview paths={scene.paths} type={type} />
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
      {scene.status === "error" && <div className="note error">{scene.message}</div>}
      {scene.audio_path && <audio src={`/storage/${scene.audio_path}?v=${encodeURIComponent(scene.updated_at)}`} controls preload="none" />}
      <div className="scene-foot">
        <span className="muted">{scene.audio_duration ? `${Number(scene.audio_duration).toFixed(1)} giây` : ""}</span>
        <button className="btn small" disabled={busy} onClick={regenerate}>
          {dirty ? "Lưu & vẽ lại" : "Vẽ lại cảnh"}
        </button>
      </div>
    </article>
  );
}
