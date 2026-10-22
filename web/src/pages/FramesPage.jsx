import { useEffect, useState } from "react";
import { api } from "../api.js";
import { ErrorNote } from "../components.jsx";
import { TopicChip } from "./ProjectsPage.jsx";

const TYPE_LABEL = { string: "chữ", number: "số", list: "danh sách", numbers: "dãy số", image: "ảnh" };

export default function FramesPage() {
  const [frames, setFrames] = useState([]);
  const [topics, setTopics] = useState([]);
  const [tab, setTab] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api.get("/frames").then(setFrames).catch((e) => setError(e.message));
    api.get("/topics").then(setTopics).catch((e) => setError(e.message));
  }, []);

  const current = topics.find((t) => t.topic_id === tab);
  const shown = current ? frames.filter((f) => current.frame_ids.includes(f.frame_id)) : frames;
  // Preview in the selected topic's colors, or the first topic that uses the frame.
  const previewTopic = (f) => current || topics.find((t) => t.frame_ids.includes(f.frame_id));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Thư viện frame</h1>
          <p className="sub">
            {frames.length} template dùng lại cho mọi video. AI chỉ thấy phần mô tả và biến đầu vào, không thấy HTML. Mỗi chủ đề chỉ đưa cho AI
            các frame có tag phù hợp. Thêm frame trong <code>server/frames/</code>, chủ đề trong <code>server/topics/</code>.
          </p>
        </div>
      </header>
      <ErrorNote error={error} />
      <div className="toolbar">
        <div className="chips">
          <button className={`chip ${tab === "" ? "active" : ""}`} onClick={() => setTab("")}>Tất cả ({frames.length})</button>
          {topics.map((t) => (
            <button key={t.topic_id} className={`chip ${tab === t.topic_id ? "active" : ""}`} onClick={() => setTab(t.topic_id)}>
              {t.name} ({t.frame_ids.length})
            </button>
          ))}
        </div>
      </div>
      {current && <p className="muted small">{current.description} Giọng văn: {current.tone}.</p>}
      <div className="frame-grid">
        {shown.map((f) => {
          const pt = previewTopic(f);
          return (
            <article key={f.frame_id} className="card frame-card">
              {pt && <img className="frame-preview" src={`/storage/frame-previews/${pt.topic_id}/${f.frame_id}.png`} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />}
              <div className="card-head">
                <h2>{f.name}</h2>
                <span className={`pill ${f.status === "active" ? "ok" : "muted"}`}>{f.status}</span>
              </div>
              <p className="muted small">
                <code>{f.frame_id}</code> · v{f.version} · {f.scene_type} · {f.duration.min}–{f.duration.max}s
              </p>
              <div className="frame-topics">
                {topics.filter((t) => t.frame_ids.includes(f.frame_id)).map((t) => <TopicChip key={t.topic_id} topic={t} />)}
              </div>
              <p>{f.description}</p>
              <table className="table compact">
                <tbody>
                  {Object.entries(f.inputs).map(([k, i]) => (
                    <tr key={k}>
                      <td><code>{k}</code>{i.required ? " *" : ""}</td>
                      <td className="muted">
                        {TYPE_LABEL[i.type] || i.type}
                        {i.maxLength ? ` ≤${i.maxLength}` : ""}
                        {["list", "numbers"].includes(i.type) ? ` ${i.minItems ?? 1}–${i.maxItems} mục` : ""}
                        {i.description ? ` — ${i.description}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">Từ khoá: {f.keywords}</p>
              <div className="chips">{f.tags.map((t) => <span key={t} className="chip static">{t}</span>)}</div>
            </article>
          );
        })}
      </div>
      <p className="muted small">
        Ảnh xem trước tạo bằng <code>npm --prefix server run preview:frames</code> sau khi thêm hoặc sửa frame.
      </p>
    </div>
  );
}
