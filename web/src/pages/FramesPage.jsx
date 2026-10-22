import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { ErrorNote, AspectIcon, useAspects } from "../components.jsx";
import { TopicChip } from "./ProjectsPage.jsx";

const TYPE_LABEL = { string: "chữ", number: "số", list: "danh sách", numbers: "dãy số", image: "ảnh", icon: "icon", icons: "danh sách icon", logo: "logo" };
const CATEGORY_LABEL = { intro: "Mở đầu", title: "Tiêu đề", content: "Nội dung", data: "Số liệu", media: "Hình ảnh", outro: "Kết thúc" };
const categoryLabel = (c) => CATEGORY_LABEL[c] || c;

// Stills made by `npm --prefix server run preview:frames` (16:9 at the root, other formats in a sub-folder).
const previewUrl = (topicId, frameId, ratio) =>
  ratio === "16:9" ? `/storage/frame-previews/${topicId}/${frameId}.png` : `/storage/frame-previews/${ratio.replace(":", "x")}/${topicId}/${frameId}.png`;

const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

export default function FramesPage() {
  const [frames, setFrames] = useState([]);
  const [topics, setTopics] = useState([]);
  const [topicId, setTopicId] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [ratio, setRatio] = useState("16:9");
  const [open, setOpen] = useState(null);
  const [view, setView] = useState("frames");
  const [icons, setIcons] = useState([]);
  const [error, setError] = useState("");
  const aspects = useAspects();
  useEffect(() => {
    api.get("/frames").then(setFrames).catch((e) => setError(e.message));
    api.get("/topics").then(setTopics).catch((e) => setError(e.message));
    api.get("/library?kind=illustration").then(setIcons).catch((e) => setError(e.message));
  }, []);

  const current = topics.find((t) => t.topic_id === topicId);
  const topicsOf = (f) => topics.filter((t) => t.frame_ids.includes(f.frame_id));
  // Preview in the selected topic's colors, or the first topic that uses the frame.
  const previewTopic = (f) => current || topicsOf(f)[0];

  // Known categories first, in story order, then any new ones.
  const categories = useMemo(() => {
    const used = new Set(frames.map((f) => f.category));
    return [...Object.keys(CATEGORY_LABEL).filter((c) => used.has(c)), ...[...used].filter((c) => !CATEGORY_LABEL[c])];
  }, [frames]);
  const shown = frames.filter(
    (f) =>
      (!current || current.frame_ids.includes(f.frame_id)) &&
      (!category || f.category === category) &&
      (!search || fold(`${f.name} ${f.frame_id} ${f.description} ${f.tags.join(" ")}`).includes(fold(search))),
  );
  const tall = ratio === "9:16" || ratio === "4:5";

  return (
    <div className="page wide">
      <header className="lib-hero">
        <div>
          <span className="eyebrow">Thư viện</span>
          <h1>Frame cho video</h1>
          <p className="sub">
            Template dùng lại cho mọi video. AI chỉ thấy phần mô tả và biến đầu vào, không thấy HTML; mỗi chủ đề chỉ đưa cho AI các frame có tag phù hợp.
          </p>
        </div>
        <div className="lib-stats">
          <div><strong>{frames.length}</strong><span>frame</span></div>
          <div><strong>{topics.length}</strong><span>chủ đề</span></div>
          <div><strong>{icons.length}</strong><span>icon</span></div>
          <div><strong>{aspects.length || "—"}</strong><span>khung hình</span></div>
        </div>
      </header>
      <ErrorNote error={error} />
      <div className="lib-tabs" role="tablist">
        <button role="tab" aria-selected={view === "frames"} className={view === "frames" ? "active" : ""} onClick={() => setView("frames")}>
          Frame <span className="chip-count">{frames.length}</span>
        </button>
        <button role="tab" aria-selected={view === "icons"} className={view === "icons" ? "active" : ""} onClick={() => setView("icons")}>
          Kho icon <span className="chip-count">{icons.length}</span>
        </button>
      </div>

      <div className="lib-toolbar">
        <div className="lib-search">
          <span aria-hidden>⌕</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={view === "icons" ? "Tìm icon theo tên tiếng Anh, vd. rocket…" : "Tìm theo tên, mô tả, tag…"} />
        </div>
        <select className="lib-select" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          <option value="">Mọi chủ đề</option>
          {topics.map((t) => <option key={t.topic_id} value={t.topic_id}>{t.name} ({t.frame_ids.length})</option>)}
        </select>
        {view === "frames" && <div className="segmented" role="radiogroup" aria-label="Khung hình xem trước">
          {(aspects.length ? aspects.map((a) => a.id) : ["16:9"]).map((id) => (
            <button key={id} role="radio" aria-checked={ratio === id} className={ratio === id ? "active" : ""} onClick={() => setRatio(id)} title={aspects.find((a) => a.id === id)?.platforms}>
              <AspectIcon ratio={id} size={14} /> {id}
            </button>
          ))}
        </div>}
      </div>
      {view === "frames" && <div className="chips scene-chips">
        <button className={`chip ${category === "" ? "active" : ""}`} onClick={() => setCategory("")}>
          Tất cả <span className="chip-count">{frames.length}</span>
        </button>
        {categories.map((c) => (
          <button key={c} className={`chip ${category === c ? "active" : ""}`} onClick={() => setCategory(c)}>
            {categoryLabel(c)} <span className="chip-count">{frames.filter((f) => f.category === c).length}</span>
          </button>
        ))}
      </div>}
      {current && (
        <div className="topic-banner" style={{ background: current.theme.bg, color: current.theme.ink, borderColor: current.theme.accent }}>
          <span className="swatch"><i style={{ background: current.theme.accent }} /><i style={{ background: current.theme.accent2 }} /></span>
          <div>
            <strong>{current.name}</strong>
            <small style={{ color: current.theme.muted }}>{current.description} Giọng văn: {current.tone}.</small>
          </div>
        </div>
      )}

      {view === "icons" ? (
        <IconLibrary icons={icons} topic={current} search={search} />
      ) : (
        <>
          <p className="muted small result-count">{shown.length} frame</p>
          <div className={`frame-grid ${tall ? "tall" : ""}`}>
            {shown.map((f, i) => (
              <FrameCard key={f.frame_id} index={i} frame={f} topic={previewTopic(f)} topics={topicsOf(f)} ratio={ratio} onOpen={() => setOpen(f)} />
            ))}
            {!shown.length && <div className="empty-state">Không có frame nào khớp bộ lọc.</div>}
          </div>
          <p className="muted small">
            Thêm frame trong <code>server/frames/</code>. Ảnh xem trước tạo bằng <code>npm --prefix server run preview:frames -- --aspect all</code> sau khi thêm hoặc sửa frame.
          </p>
        </>
      )}

      {open && <FrameDetail frame={open} topic={previewTopic(open)} topics={topicsOf(open)} aspects={aspects} initialRatio={ratio} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Preview({ frame, topic, ratio }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [frame.frame_id, topic?.topic_id, ratio]);
  const theme = topic?.theme;
  const supported = frame.aspect_ratios.includes(ratio);
  return (
    <div
      className="frame-thumb"
      style={{ aspectRatio: ratio.replace(":", " / "), background: theme ? `radial-gradient(ellipse at 20% 0%, ${theme.bg2}, ${theme.bg} 70%)` : undefined }}
    >
      {topic && supported && !failed ? (
        <img src={previewUrl(topic.topic_id, frame.frame_id, ratio)} alt={frame.name} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="thumb-fallback" style={{ color: theme?.ink }}>
          <strong>{frame.name}</strong>
          <small style={{ color: theme?.muted }}>{supported ? "Chưa có ảnh xem trước" : `Không hỗ trợ ${ratio}`}</small>
        </div>
      )}
    </div>
  );
}

// Library illustrations (Fluent Emoji) that frames can show; click copies the name for the plan editor.
function IconLibrary({ icons, topic, search }) {
  const [copied, setCopied] = useState("");
  const list = icons.filter((a) => (!topic || a.common || a.topics.includes(topic.topic_id)) && (!search || fold(`${a.name} ${a.label}`).includes(fold(search))));
  async function copy(name) {
    try {
      await navigator.clipboard.writeText(name);
    } catch {
      // Clipboard needs a secure context; the name is still shown in the toast.
    }
    setCopied(name);
    setTimeout(() => setCopied((c) => (c === name ? "" : c)), 1600);
  }
  return (
    <>
      <p className="muted small result-count">
        {list.length} icon{topic ? ` dùng được cho chủ đề ${topic.name}` : ""} · bấm để chép tên icon
      </p>
      <div className="icon-grid">
        {list.map((a, i) => (
          <button key={a.name} className="icon-tile" style={{ "--i": Math.min(i, 40) }} onClick={() => copy(a.name)} title={a.name}>
            <img src={a.url} alt="" loading="lazy" />
            <span>{a.label}</span>
            {a.common && <small className="icon-common">chung</small>}
          </button>
        ))}
        {!list.length && <div className="empty-state">Không có icon nào khớp.</div>}
      </div>
      {copied && <div className="toast">Đã chép <code>{copied}</code></div>}
    </>
  );
}

function FrameCard({ frame: f, index, topic, topics, ratio, onOpen }) {
  return (
    <button className={`frame-card ${f.status !== "active" ? "inactive" : ""}`} style={{ "--i": Math.min(index, 24) }} onClick={onOpen}>
      <div className="thumb-wrap">
        <Preview frame={f} topic={topic} ratio={ratio} />
        <span className="thumb-badge left">{categoryLabel(f.category)}</span>
        <span className="thumb-badge right">{f.duration.recommended}s</span>
      </div>
      <div className="frame-card-body">
        <div className="frame-card-title">
          <h2>{f.name}</h2>
          {f.status !== "active" && <span className="pill muted">{f.status}</span>}
        </div>
        <p className="frame-card-desc">{f.description}</p>
        <div className="frame-card-foot">
          <span className="topic-dots" title={topics.map((t) => t.name).join(", ")}>
            {topics.slice(0, 6).map((t) => <i key={t.topic_id} style={{ background: t.theme.accent }} />)}
            <small>{topics.length} chủ đề</small>
          </span>
          <span className="ratio-icons" title={`Hỗ trợ: ${f.aspect_ratios.join(", ")}`}>
            {f.aspect_ratios.map((r) => <AspectIcon key={r} ratio={r} size={12} />)}
          </span>
        </div>
      </div>
    </button>
  );
}

function FrameDetail({ frame: f, topic: initialTopic, topics, aspects, initialRatio, onClose }) {
  const [ratio, setRatio] = useState(initialRatio);
  const [topicId, setTopicId] = useState(initialTopic?.topic_id);
  const topic = topics.find((t) => t.topic_id === topicId) || initialTopic;
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal frame-detail" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={f.name}>
        <button className="modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <div className={`frame-detail-grid ${ratio === "16:9" ? "" : "narrow"}`}>
          <div className="frame-detail-media">
            <Preview frame={f} topic={topic} ratio={ratio} />
            <div className="segmented small">
              {aspects.map((a) => (
                <button key={a.id} className={ratio === a.id ? "active" : ""} onClick={() => setRatio(a.id)} title={a.platforms}>
                  <AspectIcon ratio={a.id} size={12} /> {a.id}
                </button>
              ))}
            </div>
            {topics.length > 1 && (
              <div className="chips">
                {topics.map((t) => (
                  <button key={t.topic_id} className={`chip-plain ${t.topic_id === topic?.topic_id ? "active" : ""}`} onClick={() => setTopicId(t.topic_id)}>
                    <TopicChip topic={t} />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="frame-detail-info">
            <span className="eyebrow">{categoryLabel(f.category)} · {f.scene_type}</span>
            <h2>{f.name}</h2>
            <p className="muted small">
              <code>{f.frame_id}</code> · v{f.version} · {f.duration.min}–{f.duration.max}s (đề xuất {f.duration.recommended}s) ·{" "}
              <span className={`pill ${f.status === "active" ? "ok" : "muted"}`}>{f.status}</span>
            </p>
            <p>{f.description}</p>

            <h3>Biến đầu vào</h3>
            <table className="table compact">
              <tbody>
                {Object.entries(f.inputs).map(([k, i]) => (
                  <tr key={k}>
                    <td><code>{k}</code>{i.required ? <span className="req"> *</span> : ""}</td>
                    <td className="muted">
                      {TYPE_LABEL[i.type] || i.type}
                      {i.maxLength ? ` ≤${i.maxLength}` : ""}
                      {["list", "numbers", "icons"].includes(i.type) ? ` ${i.minItems ?? 1}–${i.maxItems} mục` : ""}
                      {i.description ? ` — ${i.description}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>Canh chuyển động</h3>
            <p className="muted small">{f.keywords}</p>
            {f.sample?.voice_text && (
              <>
                <h3>Lời thoại mẫu</h3>
                <blockquote className="sample">{f.sample.voice_text}</blockquote>
              </>
            )}
            <h3>Tag</h3>
            <div className="chips">{f.tags.map((t) => <span key={t} className="chip static">{t}</span>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
