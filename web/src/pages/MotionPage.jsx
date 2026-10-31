import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { ErrorNote, AspectIcon, useAspects } from "../components.jsx";

// Motion Canvas animation library (server/motion/): each component is a real, tested animation the
// AI can drop into a video through the frame "anim-clip". Videos of a topic only get the components
// whose category or tags match the topic's tags — the same filter shown here.

const CATEGORY_LABEL = { science: "Khoa học", physics: "Vật lý", biology: "Sinh học", space: "Vũ trụ", chemistry: "Hoá học" };
const categoryLabel = (c) => CATEGORY_LABEL[c] || c;
const DOMAIN_LABEL = { astronomy: "Vũ trụ & Thiên văn", mathematics: "Toán học", biology: "Sinh học", physics: "Vật lý" };
const STYLE_LABEL = { cinematic: "Điện ảnh", scientific: "Mô phỏng khoa học", "3d": "Mô phỏng 3D", educational: "Đồ hoạ giáo dục", infographic: "Infographic", minimalist: "Tối giản", futuristic: "Tương lai", organic: "Tự nhiên" };
const STATUS = {
  dev: { label: "Đang phát triển", tone: "warn", hint: "chưa qua kiểm thử — AI không dùng" },
  tested: { label: "Đã kiểm thử", tone: "info", hint: "render đạt ở 16:9, 9:16, 1:1 — AI được dùng" },
  ready: { label: "Sẵn sàng", tone: "ok", hint: "đã được người duyệt — AI được dùng" },
};
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
const usable = (c) => c.status === "tested" || c.status === "ready";

export default function MotionPage() {
  const [items, setItems] = useState([]);
  const [topics, setTopics] = useState([]);
  const [topicId, setTopicId] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  // "all": every component; "long": the science library as long videos use it (by domain and topic).
  const [tab, setTab] = useState(() => {
    try {
      return localStorage.getItem("motion-tab") || "all";
    } catch {
      return "all";
    }
  });
  const pickTab = (t) => {
    setTab(t);
    try {
      localStorage.setItem("motion-tab", t);
    } catch {
      // the tab is a convenience only
    }
  };
  const load = () => api.get("/motion").then(setItems).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api.get("/topics").then(setTopics).catch((e) => setError(e.message));
  }, []);

  const current = topics.find((t) => t.topic_id === topicId);
  const topicsOf = (c) => topics.filter((t) => c.topics.includes(t.topic_id));
  const categories = useMemo(() => [...new Set(items.map((c) => c.category))], [items]);
  const shown = items.filter(
    (c) =>
      (!current || c.topics.includes(current.topic_id)) &&
      (!category || c.category === category) &&
      (!status || c.status === status) &&
      (!search || fold(`${c.id} ${c.name} ${c.description} ${c.tags.join(" ")} ${(c.keywords || []).join(" ")}`).includes(fold(search))),
  );

  return (
    <div className="page wide">
      <header className="lib-hero">
        <div>
          <span className="eyebrow">Thư viện</span>
          <h1>Animation khoa học</h1>
          <p className="sub">
            Hoạt hình Motion Canvas tính theo công thức thật (quỹ đạo, sóng, va chạm, tế bào…). Khi tạo video, AI chỉ nhận mô tả của các animation hợp với chủ đề video — ưu tiên những cái kịch bản nhắc tới — rồi chọn và điền tham số.
          </p>
        </div>
        <div className="lib-stats">
          <div><strong>{items.length}</strong><span>animation</span></div>
          <div><strong>{items.filter(usable).length}</strong><span>AI được dùng</span></div>
          <div><strong>{items.filter((c) => c.status === "ready").length}</strong><span>đã duyệt</span></div>
          <div><strong>{categories.length}</strong><span>nhóm</span></div>
        </div>
      </header>
      <ErrorNote error={error} />

      <div className="segmented lib-tabs">
        <button className={tab === "all" ? "active" : ""} onClick={() => pickTab("all")}>Tất cả animation</button>
        <button className={tab === "long" ? "active" : ""} onClick={() => pickTab("long")}>Animation cho video dài</button>
      </div>

      {tab === "long" ? (
        <LongLibrary items={items} onOpen={(c) => setOpen({ ...c, long: true })} />
      ) : (
      <>
      <MatchBox topics={topics} items={items} onOpen={setOpen} />

      <div className="lib-toolbar">
        <div className="lib-search">
          <span aria-hidden>⌕</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, mô tả, từ khoá…" />
        </div>
        <select className="lib-select" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          <option value="">Mọi chủ đề</option>
          {topics.map((t) => (
            <option key={t.topic_id} value={t.topic_id}>
              {t.name} ({items.filter((c) => c.topics.includes(t.topic_id)).length})
            </option>
          ))}
        </select>
        <select className="lib-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Mọi trạng thái</option>
          {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
      </div>
      <div className="chips scene-chips">
        <button className={`chip ${category === "" ? "active" : ""}`} onClick={() => setCategory("")}>
          Tất cả <span className="chip-count">{items.length}</span>
        </button>
        {categories.map((c) => (
          <button key={c} className={`chip ${category === c ? "active" : ""}`} onClick={() => setCategory(c)}>
            {categoryLabel(c)} <span className="chip-count">{items.filter((x) => x.category === c).length}</span>
          </button>
        ))}
      </div>
      {current && (
        <div className="topic-banner" style={{ background: current.theme.bg, color: current.theme.ink, borderColor: current.theme.accent }}>
          <span className="swatch"><i style={{ background: current.theme.accent }} /><i style={{ background: current.theme.accent2 }} /></span>
          <div>
            <strong>{current.name}</strong>
            <small style={{ color: current.theme.muted }}>
              Video chủ đề này được dùng {shown.filter(usable).length} animation (tag: {[...current.default_tags, ...current.related_tags].join(", ")}). Muốn thêm nhóm, thêm tag nhóm đó (vd. space, biology) vào chủ đề.
            </small>
          </div>
        </div>
      )}

      <p className="muted small result-count">{shown.length} animation</p>
      <div className="frame-grid">
        {shown.map((c, i) => (
          <MotionCard key={c.id} index={i} item={c} topics={topicsOf(c)} onOpen={() => setOpen(c)} />
        ))}
        {!shown.length && <div className="empty-state">Không có animation nào khớp bộ lọc.</div>}
      </div>
      <p className="muted small">
        Thêm component trong <code>server/motion/components/</code>, rồi chạy <code>npm --prefix server run anim:test</code> để kiểm thử và tạo bản xem trước. Xem <code>server/motion/README.md</code>.
      </p>
      </>
      )}

      {open && (
        <MotionDetail
          item={items.find((c) => c.id === open.id) || open}
          long={!!open.long}
          topics={topics}
          initialTopic={current || topicsOf(open)[0]}
          onClose={() => setOpen(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// Preview still; the clip plays while the pointer is over the card.
function Thumb({ item, playing }) {
  const ref = useRef(null);
  const webm = item.preview?.find((p) => p.endsWith(".webm"));
  const png = item.preview?.find((p) => p.endsWith(".png"));
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (playing) v.play().catch(() => {});
    else {
      v.pause();
      v.currentTime = 0;
    }
  }, [playing]);
  return (
    <div className="frame-thumb motion-thumb" style={{ aspectRatio: "16 / 9" }}>
      {png && <img src={png} alt="" loading="lazy" />}
      {webm && <video ref={ref} src={webm} muted loop playsInline preload="none" className={playing ? "on" : ""} />}
      {!png && !webm && <div className="thumb-fallback"><strong>{item.name}</strong><small>Chưa có bản xem trước</small></div>}
    </div>
  );
}

function MotionCard({ item: c, index, topics, onOpen }) {
  const [hover, setHover] = useState(false);
  const s = STATUS[c.status] || STATUS.dev;
  return (
    <button className={`frame-card ${usable(c) ? "" : "inactive"}`} style={{ "--i": Math.min(index, 24) }} onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <div className="thumb-wrap">
        <Thumb item={c} playing={hover} />
        <span className="thumb-badge left">{categoryLabel(c.category)}</span>
        <span className="thumb-badge right">{c.duration.min}–{c.duration.max}s</span>
      </div>
      <div className="frame-card-body">
        <div className="frame-card-title">
          <h2>{c.name}</h2>
          <span className={`pill ${s.tone}`} title={s.hint}>{s.label}</span>
        </div>
        <p className="frame-card-desc">{c.description}</p>
        <div className="frame-card-foot">
          {!topics.length && c.subtopic ? (
            <small className="muted card-subtopic">{c.subtopic}</small>
          ) : (
            <span className="topic-dots" title={topics.map((t) => t.name).join(", ")}>
              {topics.slice(0, 6).map((t) => <i key={t.topic_id} style={{ background: t.theme.accent }} />)}
              <small>{topics.length} chủ đề</small>
            </span>
          )}
          <code className="muted small">{c.id}</code>
        </div>
      </div>
    </button>
  );
}

// "Try a script": which animations the AI would receive for a video of this topic and material.
function MatchBox({ topics, items, onOpen }) {
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      setResult(await api.post("/motion/match", { topic, text }));
    } finally {
      setBusy(false);
    }
  }
  const byId = (id) => items.find((c) => c.id === id);
  return (
    <details className="card match-box">
      <summary>
        <strong>Thử với kịch bản</strong> <span className="muted small">— xem AI sẽ nhận những animation nào khi tạo video</span>
      </summary>
      <div className="match-form">
        <select value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">Chọn chủ đề video…</option>
          {topics.map((t) => <option key={t.topic_id} value={t.topic_id}>{t.name}</option>)}
        </select>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Dán một đoạn kịch bản, vd. Trái Đất quay quanh Mặt Trời và tự quay quanh trục của nó…" />
        <button className="btn primary" onClick={run} disabled={busy || !topic}>{busy ? "Đang lọc…" : "Lọc"}</button>
      </div>
      {result && (
        <div className="match-result">
          {result.ids.length ? (
            <>
              <p className="small">AI sẽ nhận <strong>{result.ids.length}</strong> animation (theo thứ tự ưu tiên):</p>
              <div className="chips">
                {result.ids.map((id) => {
                  const m = result.mentioned.find((x) => x.id === id);
                  return (
                    <button key={id} className={`chip ${m ? "active" : ""}`} onClick={() => byId(id) && onOpen(byId(id))} title={m ? `kịch bản nhắc tới: ${m.hits.join(", ")}` : "hợp chủ đề"}>
                      {byId(id)?.name || id}
                    </button>
                  );
                })}
              </div>
              <p className="muted small">Nút đậm: kịch bản nhắc tới hiện tượng của animation đó.</p>
            </>
          ) : (
            <p className="small">Chủ đề này chưa có animation phù hợp — video sẽ chỉ dùng frame thường.</p>
          )}
          {result.mentioned.some((m) => !result.ids.includes(m.id)) && (
            <p className="muted small">
              Kịch bản cũng nhắc tới animation khác chủ đề (không gửi cho AI): {result.mentioned.filter((m) => !result.ids.includes(m.id)).map((m) => byId(m.id)?.name || m.id).join(", ")}.
            </p>
          )}
        </div>
      )}
    </details>
  );
}

const typeText = (s) =>
  s.type === "array"
    ? `mảng ${s.minItems ?? 0}–${s.maxItems ?? "n"} ${s.items.type === "object" ? "đối tượng" : s.items.enum ? `(${s.items.enum.join(" | ")})` : s.items.type}`
    : s.enum
      ? s.enum.filter(Boolean).join(" | ")
      : s.type === "object"
        ? `{ ${Object.keys(s.properties).join(", ")} }`
        : `${s.type}${s.min != null || s.max != null ? ` ${s.min ?? ""}…${s.max ?? ""}` : ""}${s.maxLength ? ` ≤${s.maxLength}` : ""}`;

function MotionDetail({ item: c, topics, initialTopic, onClose, onChanged, long = false }) {
  const aspects = useAspects();
  const [json, setJson] = useState(() => JSON.stringify(c.example?.props || {}, null, 2));
  const [check, setCheck] = useState(null);
  const [topicId, setTopicId] = useState(initialTopic?.topic_id || "");
  const [aspect, setAspect] = useState("16:9");
  const [duration, setDuration] = useState(c.example?.duration || c.duration.default);
  const [trial, setTrial] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const s = STATUS[c.status] || STATUS.dev;
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Live check of the props against the component's schema.
  useEffect(() => {
    let props;
    try {
      props = JSON.parse(json || "{}");
    } catch (e) {
      setCheck({ errors: [`JSON lỗi: ${e.message}`] });
      return;
    }
    const t = setTimeout(() => api.post(`/motion/${c.id}/validate`, { props }).then(setCheck).catch((e) => setCheck({ errors: [e.message] })), 250);
    return () => clearTimeout(t);
  }, [json, c.id]);

  async function render() {
    setBusy(true);
    setError("");
    try {
      setTrial(await api.post(`/motion/${c.id}/render`, { props: JSON.parse(json || "{}"), duration: Number(duration), topic: topicId, aspect, long }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function approve(status) {
    try {
      await api.put(`/motion/${c.id}/status`, { status });
      onChanged();
    } catch (e) {
      setError(e.message);
    }
  }
  const webm = c.preview?.find((p) => p.endsWith(".webm"));
  const tall = trial && trial.height > trial.width;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal frame-detail" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={c.name}>
        <button className="modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <div className="frame-detail-grid">
          <div className="frame-detail-media">
            <div className={`motion-player ${tall ? "tall" : ""}`}>
              {trial ? <video key={trial.url} src={trial.url} controls autoPlay loop muted playsInline /> : webm ? <video src={webm} controls autoPlay loop muted playsInline /> : <div className="thumb-fallback">Chưa có bản xem trước</div>}
            </div>
            <p className="muted small">{trial ? `Bản render thử · ${trial.width}×${trial.height}` : "Bản xem trước từ cấu hình mẫu (kiểm thử)."}</p>

            <CommonControls inputs={c.inputs} json={json} setJson={setJson} />
            <h3 className="detail-h3">Tham số (JSON)</h3>
            <textarea className="code json-editor" rows={10} spellCheck={false} value={json} onChange={(e) => setJson(e.target.value)} />
            {check && (check.errors?.length ? (
              <ul className="check-errors">{check.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            ) : (
              <p className="check-ok small">✓ Tham số hợp lệ</p>
            ))}
            <div className="render-row">
              {long ? <span className="muted small">Như trong video dài: 1920×1080, nền đen</span> : (
              <>
              <select value={topicId} onChange={(e) => setTopicId(e.target.value)} title="Màu theo chủ đề">
                <option value="">Màu mặc định</option>
                {topics.map((t) => <option key={t.topic_id} value={t.topic_id}>{t.name}</option>)}
              </select>
              <div className="segmented small">
                {(aspects.length ? aspects : [{ id: "16:9" }]).map((a) => (
                  <button key={a.id} className={aspect === a.id ? "active" : ""} onClick={() => setAspect(a.id)}>
                    <AspectIcon ratio={a.id} size={12} /> {a.id}
                  </button>
                ))}
              </div>
              </>
              )}
              <label className="inline dur">
                <input type="number" min={1} max={60} step={0.5} value={duration} onChange={(e) => setDuration(e.target.value)} /> giây
              </label>
              <button className="btn primary" onClick={render} disabled={busy || !!check?.errors?.length}>{busy ? "Đang render… (10–30 s)" : "Render thử"}</button>
            </div>
            <ErrorNote error={error} />
          </div>

          <div className="frame-detail-info">
            <span className="eyebrow">{categoryLabel(c.category)} · Motion Canvas</span>
            <h2>{c.name}</h2>
            <p className="muted small">
              <code>{c.id}</code> · v{c.version} · {c.duration.min}–{c.duration.max}s (mặc định {c.duration.default}s) · 30 fps · nền trong suốt
            </p>
            <p className="status-line">
              <span className={`pill ${s.tone}`}>{s.label}</span> <span className="muted small">{s.hint}</span>
              {c.status === "tested" && <button className="btn small" onClick={() => approve("ready")}>Duyệt — đánh dấu sẵn sàng</button>}
              {c.status === "ready" && <button className="btn small" onClick={() => approve("tested")}>Bỏ duyệt</button>}
            </p>
            <p>{c.description}</p>
            {c.domain && (
              <p className="science-tags">
                <span className="pill info">{DOMAIN_LABEL[c.domain] || c.domain}</span>
                {c.topic && <span className="pill">{c.topic}</span>}
                {c.dimension && <span className="pill">{c.dimension.toUpperCase()}</span>}
                {(c.styles || []).map((s) => <span key={s} className="pill muted">{STYLE_LABEL[s] || s}</span>)}
              </p>
            )}
            {c.subtopic && <p className="muted small">{c.subtopic}</p>}
            {c.accuracy && (
              <>
                <h3>Mô hình khoa học</h3>
                <p className="small">{c.accuracy}</p>
              </>
            )}
            {c.limitations && (
              <>
                <h3>Giới hạn</h3>
                <p className="small">{c.limitations}</p>
              </>
            )}
            {c.example_usage && (
              <>
                <h3>Ví dụ dùng</h3>
                <pre className="code small">{c.example_usage}</pre>
              </>
            )}
            {c.cues && (
              <>
                <h3>Canh theo lời thoại</h3>
                <p className="muted small">{c.cues}</p>
              </>
            )}
            <h3>Tham số</h3>
            <table className="table compact">
              <tbody>
                {Object.entries(c.inputs).map(([k, i]) => (
                  <tr key={k}>
                    <td><code>{k}</code>{i.required ? <span className="req"> *</span> : ""}</td>
                    <td className="muted">
                      {typeText(i)}
                      {i.default !== undefined && typeof i.default !== "object" ? ` · mặc định ${JSON.stringify(i.default)}` : ""} — {i.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>Chủ đề dùng được</h3>
            <div className="chips">
              {topics.filter((t) => c.topics.includes(t.topic_id)).map((t) => (
                <span key={t.topic_id} className="chip static" style={{ borderColor: t.theme.accent }}>{t.name}</span>
              ))}
              {!c.topics.length && <span className="muted small">Chưa có chủ đề nào có tag hợp — thêm tag "{c.category}" vào một chủ đề.</span>}
            </div>
            {(c.combines_with?.length > 0 || c.wanted?.length > 0) && (
              <>
                <h3>Kết hợp với</h3>
                <div className="chips">
                  {c.combines_with.map((id) => <span key={id} className="chip static">{id}</span>)}
                  {c.wanted.map((id) => <span key={id} className="chip static planned" title="Chưa có — cần phát triển">{id}</span>)}
                </div>
              </>
            )}
            <h3>Từ khoá tìm kiếm</h3>
            <div className="chips">{[...new Set([...(c.keywords || []), ...c.tags])].map((t) => <span key={t} className="chip static">{t}</span>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// The science library as long videos use it: domain → topic (with its palette), the components of
// each topic, the topics still without one, filters by style and dimension, and "try a script" with
// the same selection the long-video planner makes.
function LongLibrary({ items, onOpen }) {
  const [tax, setTax] = useState(null);
  const [domain, setDomain] = useState("astronomy");
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("");
  const [dim, setDim] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api.get("/motion/taxonomy").then(setTax).catch((e) => setError(e.message));
  }, []);
  if (!tax) return <ErrorNote error={error} />;
  const D = tax.domains.find((d) => d.id === domain) || tax.domains[0];
  const inDomain = items.filter((c) => c.domain === D.id);
  const T = D.topics.find((t) => t.id === topic);
  const shown = inDomain.filter((c) => (!topic || c.topic === topic) && (!style || (c.styles || []).includes(style)) && (!dim || c.dimension === dim));
  const pal = (T || D).palette;
  return (
    <div className="long-lib">
      <LongMatchBox items={items} onOpen={onOpen} />
      <div className="domain-tabs">
        {tax.domains.map((d) => {
          const n = items.filter((c) => c.domain === d.id).length;
          return (
            <button key={d.id} className={`domain-tab ${d.id === D.id ? "active" : ""}`} style={{ "--a": d.palette.primary, "--b": d.palette.secondary, "--bg": d.palette.bg }} onClick={() => (setDomain(d.id), setTopic(""))}>
              <span className="domain-swatch" />
              <strong>{d.label}</strong>
              <small>{n} animation · {d.topics.filter((t) => items.some((c) => c.topic === t.id)).length}/{d.topics.length} topic</small>
            </button>
          );
        })}
      </div>
      <div className="long-lib-body">
        <aside className="topic-list">
          <button className={!topic ? "active" : ""} onClick={() => setTopic("")}>
            Tất cả <span className="chip-count">{inDomain.length}</span>
          </button>
          {D.topics.map((t) => {
            const n = inDomain.filter((c) => c.topic === t.id).length;
            return (
              <button key={t.id} className={`${topic === t.id ? "active" : ""} ${n ? "" : "uncovered"}`} onClick={() => setTopic(t.id)} title={n ? "" : "Chưa có animation — đang phát triển"}>
                <i style={{ background: t.palette.primary }} />
                {t.label} <span className="chip-count">{n || "–"}</span>
              </button>
            );
          })}
        </aside>
        <section>
          <div className="palette-strip" style={{ background: `linear-gradient(135deg, ${pal.bg}, ${pal.bg2})` }}>
            <div>
              <strong style={{ color: pal.ink }}>{T ? T.label : D.label}</strong>
              <small style={{ color: pal.muted }}>Bảng màu {T ? "của topic" : `"${D.palette.name}"`} — component tự dùng khi palette = auto</small>
            </div>
            <span className="swatches">
              {["primary", "secondary", "accent", "highlight"].map((k) => <i key={k} title={`${k} ${pal[k]}`} style={{ background: pal[k] }} />)}
              {(pal.series || []).map((c, i) => <i key={i} className="small" title={c} style={{ background: c }} />)}
            </span>
          </div>
          <div className="lib-toolbar">
            <select className="lib-select" value={style} onChange={(e) => setStyle(e.target.value)}>
              <option value="">Mọi phong cách</option>
              {Object.entries(tax.styles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="lib-select" value={dim} onChange={(e) => setDim(e.target.value)}>
              <option value="">2D / 2.5D / 3D</option>
              <option value="2d">2D</option>
              <option value="2.5d">2.5D</option>
              <option value="3d">3D</option>
            </select>
            <span className="muted small">{shown.length} animation</span>
          </div>
          <div className="frame-grid">
            {shown.map((c, i) => <MotionCard key={c.id} index={i} item={c} topics={[]} onOpen={() => onOpen(c)} />)}
            {!shown.length && <div className="empty-state">{T && !inDomain.some((c) => c.topic === T.id) ? `Topic "${T.label}" chưa có animation — đang phát triển.` : "Không có animation nào khớp bộ lọc."}</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

// "Try a long-video script": the animations the long-video planner would send to the AI.
function LongMatchBox({ items, onOpen }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      setResult(await api.post("/motion/long-match", { text }));
    } finally {
      setBusy(false);
    }
  }
  const byId = (id) => items.find((c) => c.id === id);
  return (
    <details className="card match-box">
      <summary>
        <strong>Thử với kịch bản video dài</strong> <span className="muted small">— AI chỉ nhận animation hợp nội dung và cùng lĩnh vực</span>
      </summary>
      <div className="match-form">
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Dán đoạn bài viết, vd. Hố đen siêu khối lượng ở tâm thiên hà nuốt cả ánh sáng…" />
        <button className="btn primary" onClick={run} disabled={busy || !text.trim()}>{busy ? "Đang lọc…" : "Lọc"}</button>
      </div>
      {result && (
        <div className="match-result">
          <p className="small">AI sẽ nhận <strong>{result.ids.length}</strong> animation{result.ids.length === items.filter(usable).length ? " (kịch bản không khớp lĩnh vực nào — gửi tất cả)" : ""}:</p>
          <div className="chips">
            {result.ids.map((id) => {
              const m = result.mentioned.find((x) => x.id === id);
              return (
                <button key={id} className={`chip ${m && m.score >= 4 ? "active" : ""}`} onClick={() => byId(id) && onOpen(byId(id))} title={m ? `khớp: ${m.hits.join(", ")}` : "cùng lĩnh vực"}>
                  {byId(id)?.name || id}
                </button>
              );
            })}
          </div>
          <p className="muted small">Nút đậm: kịch bản nhắc tới hiện tượng của animation đó; còn lại cùng lĩnh vực.</p>
        </div>
      )}
    </details>
  );
}

// Shared knobs of the science components (registry/common.mjs) as controls that edit the props JSON.
const COMMON_LABEL = { palette: "Bảng màu", mode: "Nền", backdrop: "Phông nền", speed: "Tốc độ", scale: "Cỡ", easing: "Chuyển bước", camera: "Camera" };
function CommonControls({ inputs, json, setJson }) {
  const keys = Object.keys(COMMON_LABEL).filter((k) => inputs[k]);
  if (!keys.length) return null;
  let props = {};
  try {
    props = JSON.parse(json || "{}");
  } catch {
    return null;
  }
  const set = (k, v) => setJson(JSON.stringify({ ...props, [k]: v }, null, 2));
  return (
    <div className="common-controls">
      {keys.map((k) => {
        const spec = inputs[k], v = props[k] ?? spec.default;
        return (
          <label key={k}>
            <span>{COMMON_LABEL[k]}</span>
            {spec.enum ? (
              <select value={v} onChange={(e) => set(k, e.target.value)}>
                {spec.enum.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <span className="range">
                <input type="range" min={spec.min} max={spec.max} step={0.05} value={v} onChange={(e) => set(k, Number(e.target.value))} />
                <b>{Number(v).toFixed(2)}</b>
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
