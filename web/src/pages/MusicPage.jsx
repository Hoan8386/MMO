import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { ErrorNote } from "../components.jsx";

// Background music per topic: each topic's style note and volume, and its tracks (upload, preview,
// rename, describe the mood the AI reads when it picks a track, delete).
export default function MusicPage() {
  const [topics, setTopics] = useState(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => api.get("/music").then(setTopics, (e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  const shown = (topics || []).filter((t) => !filter || `${t.name} ${t.music_style}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Nhạc nền theo chủ đề</h1>
          <p className="muted">
            Mỗi chủ đề có loại nhạc riêng. Khi lập kế hoạch, AI chọn bản hợp tâm trạng video nhất trong các bản của chủ đề (cùng 1 lượt gọi); khi dựng, nhạc được lặp đủ độ dài video, mở và kết bằng fade.
            Lấy nhạc: bấm “Chọn nhạc Mixkit” ở chủ đề (danh sách đã lọc đúng tâm trạng/thể loại của chủ đề), nghe thử rồi bấm “+ Thêm” ở bài muốn dùng — mỗi lần tải đúng một bài bạn chọn. Nhạc Mixkit miễn phí, dùng được cho video, không cần ghi nguồn.
          </p>
        </div>
        <input className="search" value={filter} placeholder="Tìm chủ đề…" onChange={(e) => setFilter(e.target.value)} />
      </header>
      <ErrorNote error={error} />
      {!topics ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <div className="music-grid">
          {shown.map((t) => <TopicMusic key={t.topic_id} topic={t} onChanged={load} onError={setError} />)}
        </div>
      )}
    </div>
  );
}

function TopicMusic({ topic, onChanged, onError }) {
  const input = useRef(null);
  const [style, setStyle] = useState(topic.music_style);
  const [volume, setVolume] = useState(Math.round(topic.music_volume * 100));
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [browsing, setBrowsing] = useState(false);
  useEffect(() => {
    setStyle(topic.music_style);
    setVolume(Math.round(topic.music_volume * 100));
  }, [topic.music_style, topic.music_volume]);
  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const dirty = style !== topic.music_style || volume !== Math.round(topic.music_volume * 100);

  function upload(files) {
    if (!files?.length) return;
    const form = new FormData();
    for (const f of files) form.append("files", f);
    run(async () => {
      const r = await api.post(`/music/topics/${topic.topic_id}/tracks`, form);
      if (r.skipped?.length) onError(`Bỏ qua file không phải nhạc (mp3, m4a, aac, wav, ogg): ${r.skipped.join(", ")}`);
    });
  }

  return (
    <section className="card music-card">
      <div className="card-head">
        <h2>
          <span className="swatch">
            <i style={{ background: topic.theme?.accent }} />
            <i style={{ background: topic.theme?.accent2 }} />
          </span>
          {topic.name}
        </h2>
        <div className="actions">
          <button className="btn small" disabled={busy} onClick={() => setBrowsing((b) => !b)}>{browsing ? "Đóng Mixkit" : "Chọn nhạc Mixkit"}</button>
          <button className="btn small" disabled={busy} onClick={() => input.current.click()}>+ Tải file lên</button>
        </div>
        <input ref={input} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      {browsing && <MixkitBrowser topic={topic} busy={busy} run={run} onError={onError} />}
      <form
        className="music-link"
        onSubmit={(e) => {
          e.preventDefault();
          const url = link.trim();
          if (url) run(async () => { await api.post(`/music/topics/${topic.topic_id}/tracks/from-url`, { url }); setLink(""); });
        }}
      >
        <input value={link} disabled={busy} placeholder="Hoặc dán link file Mixkit (https://assets.mixkit.co/…mp3)" onChange={(e) => setLink(e.target.value)} />
        <button className="btn small" disabled={busy || !link.trim()}>{busy ? "Đang tải…" : "Thêm từ link"}</button>
      </form>
      <label>
        Loại nhạc của chủ đề
        <textarea rows={2} value={style} disabled={busy} onChange={(e) => setStyle(e.target.value)} />
      </label>
      <label className="music-volume">
        Âm lượng nhạc nền: {volume}%
        <input type="range" min={0} max={60} step={1} value={volume} disabled={busy} onChange={(e) => setVolume(Number(e.target.value))} />
      </label>
      {dirty && (
        <div className="actions">
          <button className="btn small" onClick={() => { setStyle(topic.music_style); setVolume(Math.round(topic.music_volume * 100)); }}>Huỷ</button>
          <button className="btn small primary" disabled={busy} onClick={() => run(() => api.put(`/music/topics/${topic.topic_id}`, { music_style: style, music_volume: volume / 100 }))}>Lưu</button>
        </div>
      )}
      {topic.tracks.length ? (
        <ul className="track-list">
          {topic.tracks.map((t) => <Track key={t.id} track={t} disabled={busy} run={run} />)}
        </ul>
      ) : (
        <p className="muted small">Chưa có nhạc — video của chủ đề này sẽ không có nhạc nền.</p>
      )}
    </section>
  );
}

// Mixkit tracks matching the topic (one listing page at a time, read by the server): listen, then add
// the ones you like — each "+ Thêm" downloads exactly that file.
// Other Mixkit listings to browse when the topic's own one runs short (path under /free-stock-music/).
const MIXKIT_MORE = [
  ["mood/calm", "Calm — êm dịu"], ["mood/happy", "Happy — vui"], ["mood/uplifting", "Uplifting — tích cực"], ["mood/motivating", "Motivating — truyền động lực"],
  ["mood/epic", "Epic — hoành tráng"], ["mood/dramatic", "Dramatic — kịch tính"], ["mood/mysterious", "Mysterious — bí ẩn"], ["mood/suspenseful", "Suspenseful — hồi hộp"],
  ["mood/dark", "Dark — u tối"], ["mood/emotional", "Emotional — cảm xúc"], ["mood/romantic", "Romantic — lãng mạn"], ["mood/playful", "Playful — tinh nghịch"],
  ["mood/quirky", "Quirky — ngộ nghĩnh"], ["mood/futuristic", "Futuristic — tương lai"], ["mood/peaceful", "Peaceful — bình yên"], ["mood/energetic", "Energetic — sôi động"],
  ["cinematic", "Cinematic"], ["ambient", "Ambient"], ["corporate-music", "Corporate"], ["lo-fi-beats", "Lo-fi beats"], ["chillout", "Chillout"],
  ["electronic", "Electronic"], ["classical", "Classical"], ["film-score", "Film score"], ["hip-hop", "Hip hop"], ["folk", "Folk"], ["children", "Children"],
];

function MixkitBrowser({ topic, busy, run, onError }) {
  const [path, setPath] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(
    (p) => {
      setLoading(true);
      api
        .get(`/music/mixkit/${topic.topic_id}${p ? `?path=${encodeURIComponent(p)}` : ""}`)
        .then(setData, (e) => onError(e.message))
        .finally(() => setLoading(false));
    },
    [topic.topic_id, onError],
  );
  useEffect(() => {
    load(path);
  }, [load, path]);
  const add = (t) =>
    run(async () => {
      await api.post(`/music/topics/${topic.topic_id}/tracks/from-url`, { url: t.file, name: t.title, mood: t.moods.join(", ") });
      load(path);
    });
  return (
    <div className="mixkit">
      <div className="mixkit-head">
        <span className="muted small">
          Nhạc Mixkit hợp chủ đề — miễn phí, không cần ghi nguồn.{" "}
          <a href={data?.url || topic.browse_url} target="_blank" rel="noreferrer">Mở trên Mixkit ↗</a>
        </span>
        <select value={path} disabled={loading} onChange={(e) => setPath(e.target.value)}>
          <option value="">Danh mục của chủ đề</option>
          {MIXKIT_MORE.map(([p, label]) => <option key={p} value={p}>{label}</option>)}
        </select>
      </div>
      {loading ? (
        <p className="muted small">Đang đọc danh sách…</p>
      ) : data?.tracks.length ? (
        <ul className="mixkit-list">
          {data.tracks.map((t) => (
            <li key={t.id}>
              <div className="mixkit-info">
                <strong>{t.title}</strong>
                <span className="muted small">{[t.author, t.duration, t.moods.join(", ")].filter(Boolean).join(" · ")}</span>
              </div>
              <audio src={t.file} controls preload="none" />
              <button className="btn small" disabled={busy || t.added} onClick={() => add(t)}>{t.added ? "Đã có" : "+ Thêm"}</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Không có bài nào ở trang này.</p>
      )}
    </div>
  );
}

function Track({ track, disabled, run }) {
  const [name, setName] = useState(track.name);
  const [mood, setMood] = useState(track.mood || "");
  const dirty = name !== track.name || mood !== (track.mood || "");
  const len = track.duration ? `${Math.floor(track.duration / 60)}:${String(Math.round(track.duration % 60)).padStart(2, "0")}` : "?";
  return (
    <li className="track">
      <div className="track-head">
        <input value={name} disabled={disabled} onChange={(e) => setName(e.target.value)} />
        <span className="muted small">{len}</span>
        <button className="btn small danger" disabled={disabled} onClick={() => confirm(`Xoá bản nhạc "${track.name}"?`) && run(() => api.del(`/music/tracks/${track.id}`))}>✕</button>
      </div>
      <input value={mood} disabled={disabled} placeholder="Tâm trạng (AI đọc để chọn): vd. vui tươi, hồi hộp, sâu lắng…" onChange={(e) => setMood(e.target.value)} />
      <audio src={track.url} controls preload="none" />
      {dirty && (
        <div className="actions">
          <button className="btn small primary" disabled={disabled} onClick={() => run(() => api.put(`/music/tracks/${track.id}`, { name, mood }))}>Lưu</button>
        </div>
      )}
    </li>
  );
}
