import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { ErrorNote } from "./components.jsx";

// "5 phút trước", "3 giờ trước", or the date for older articles.
function ago(iso) {
  if (!iso) return "";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 60) return `${Math.max(1, min)} phút trước`;
  if (min < 24 * 60) return `${Math.round(min / 60)} giờ trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

// Material for the planner: the article's own words plus where they come from.
export function articleMaterial(a) {
  const body = a.text || a.summary || "";
  return [a.title, a.summary && !body.startsWith(a.summary) ? a.summary : "", body, `Nguồn: ${a.source} — ${a.url}`].filter(Boolean).join("\n\n");
}

// Two groups of sources per topic: Vietnamese papers and foreign sites specialised in the topic.
const REGIONS = [
  { id: "vn", label: "Báo Việt Nam", feeds: (t) => t.news_feeds || [] },
  { id: "intl", label: "Báo nước ngoài", feeds: (t) => t.news_foreign || [] },
];

// Latest articles of a topic from its news feeds (server/assets/news-sources.json).
// onPick receives { title, summary, text, image, source, url } of the chosen article.
export default function NewsPicker({ topic, onPick, onClose }) {
  const regions = REGIONS.filter((r) => r.feeds(topic).length);
  const [region, setRegion] = useState(regions[0]?.id || "vn");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(null);
  const current = REGIONS.find((r) => r.id === region);

  // Ignores a slow answer for the tab the user already left.
  const latest = useRef(0);
  function load(refresh = false) {
    const id = ++latest.current;
    setLoading(true);
    setError("");
    setData(null);
    api
      .get(`/news/topics/${topic.topic_id}?region=${region}${refresh ? "&refresh=1" : ""}`)
      .then((d) => id === latest.current && setData(d))
      .catch((e) => id === latest.current && setError(e.message))
      .finally(() => id === latest.current && setLoading(false));
  }
  useEffect(() => load(), [topic.topic_id, region]);

  // Reads the whole article; falls back to the feed's summary when the page cannot be read.
  async function pick(item) {
    setPicking(item.link);
    setError("");
    try {
      const full = await api.get(`/news/article?url=${encodeURIComponent(item.link)}`);
      onPick({ title: item.title || full.title, summary: full.summary || item.summary, text: full.text, image: full.image || item.image, source: item.source, url: item.link });
    } catch (e) {
      onPick({ title: item.title, summary: item.summary, text: "", image: item.image, source: item.source, url: item.link });
    }
  }

  const failed = data?.feeds.filter((f) => f.error) || [];
  return (
    // Opened from inside the project form's modal: stop clicks here from closing that one too.
    <div
      className="modal-backdrop news-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="modal news-picker" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <h2>Tin mới — {topic.name}</h2>
        {regions.length > 1 && (
          <div className="news-tabs" role="tablist">
            {regions.map((r) => (
              <button type="button" role="tab" key={r.id} aria-selected={r.id === region} className={`news-tab ${r.id === region ? "active" : ""}`} onClick={() => setRegion(r.id)}>
                {r.label} <small>{r.feeds(topic).length} trang</small>
              </button>
            ))}
          </div>
        )}
        <p className="muted small news-sources">
          Nguồn: {current.feeds(topic).join(" · ")}
          {data && ` · cập nhật ${new Date(data.fetched_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`}{" "}
          <button type="button" className="btn small" onClick={() => load(true)} disabled={loading}>{loading ? "Đang tải…" : "Tải lại"}</button>
        </p>
        <ErrorNote error={error} />
        {failed.length > 0 && <p className="muted small">Không đọc được: {failed.map((f) => `${f.name} (${f.error})`).join(", ")}</p>}
        {loading && !data && <p className="muted">Đang lấy tin từ các trang báo…</p>}
        {data && !data.articles.length && <p className="muted">Chưa có bài nào phù hợp với chủ đề.</p>}
        {region === "intl" && data?.articles.length > 0 && <p className="muted small">Bài tiếng Anh: AI vẫn viết lời đọc bằng tiếng Việt từ nội dung bài.</p>}
        <div className="news-list">
          {data?.articles.map((a) => (
            <article key={a.link} className="news-item">
              {a.image ? <img className="news-thumb" src={a.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="news-thumb empty">Không có ảnh</div>}
              <div className="news-body">
                <strong>{a.title}</strong>
                <small className="muted">{a.source} · {ago(a.published)}</small>
                {a.summary && <p>{a.summary}</p>}
                <div className="news-actions">
                  <button type="button" className="btn small primary" disabled={!!picking} onClick={() => pick(a)}>{picking === a.link ? "Đang đọc bài…" : "Dùng bài này"}</button>
                  <a className="small" href={a.link} target="_blank" rel="noreferrer">Mở bài gốc ↗</a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
