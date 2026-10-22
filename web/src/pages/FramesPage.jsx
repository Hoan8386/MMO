import { useEffect, useState } from "react";
import { api } from "../api.js";
import { ErrorNote } from "../components.jsx";

const TYPE_LABEL = { string: "chữ", number: "số", list: "danh sách", numbers: "dãy số", image: "ảnh" };

export default function FramesPage() {
  const [frames, setFrames] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api.get("/frames").then(setFrames).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Thư viện frame</h1>
          <p className="sub">Template dùng lại cho mọi video. AI chỉ thấy phần mô tả và biến đầu vào, không thấy HTML. Thêm frame mới trong <code>server/frames/</code>.</p>
        </div>
      </header>
      <ErrorNote error={error} />
      <div className="frame-grid">
        {frames.map((f) => (
          <article key={f.frame_id} className="card frame-card">
            <div className="card-head">
              <h2>{f.name}</h2>
              <span className={`pill ${f.status === "active" ? "ok" : "muted"}`}>{f.status}</span>
            </div>
            <p className="muted small">
              <code>{f.frame_id}</code> · v{f.version} · {f.scene_type} · {f.duration.min}–{f.duration.max}s · {f.aspect_ratios.join(", ")}
            </p>
            <p>{f.description}</p>
            <table className="table compact">
              <tbody>
                {Object.entries(f.inputs).map(([k, i]) => (
                  <tr key={k}>
                    <td><code>{k}</code>{i.required ? " *" : ""}</td>
                    <td className="muted">
                      {TYPE_LABEL[i.type] || i.type}
                      {i.maxLength ? ` ≤${i.maxLength}` : ""}
                      {i.type === "list" ? ` ${i.minItems ?? 1}–${i.maxItems} ý` : ""}
                      {i.description ? ` — ${i.description}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">Từ khoá: {f.keywords}</p>
            <div className="chips">{f.tags.map((t) => <span key={t} className="chip static">{t}</span>)}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
