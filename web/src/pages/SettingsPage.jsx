import { useEffect, useState } from "react";
import { api } from "../api.js";
import { ErrorNote } from "../components.jsx";

const EFFORT_LABEL = { low: "Thấp — nhanh, ít suy nghĩ", medium: "Vừa", high: "Cao — kỹ hơn", max: "Tối đa" };
const BILLING = {
  token: { label: "Tính theo token", tone: "warn", note: "Mỗi video gửi ít frame, effort thấp để tiết kiệm token." },
  request: { label: "Theo lượt — unlimited", tone: "ok", note: "Giá mỗi lượt gọi như nhau; lập kế hoạch giống hệt chế độ theo token." },
};

// "Cấu hình AI": model presets for planning, which one is active, and what each has been used for.
export default function SettingsPage({ onSaved }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [models, setModels] = useState([]);
  const [tests, setTests] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = () =>
    api
      .get("/settings")
      .then((d) => {
        setData(d);
        setDraft(d.settings);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api.get("/settings/models").then(setModels).catch(() => {});
  }, []);
  if (!draft) return <div className="page"><ErrorNote error={error} />{!error && <p className="muted">Đang tải…</p>}</div>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings);
  const setPreset = (id, patch) => setDraft((d) => ({ ...d, presets: d.presets.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const addPreset = () => {
    const id = `preset-${Date.now().toString(36)}`;
    setDraft((d) => ({ ...d, presets: [...d.presets, { id, label: "Cấu hình mới", model: "req/claude-opus-5-5", billing: "request", effort: "high", max_tokens: 32000 }] }));
  };
  const removePreset = (id) => setDraft((d) => ({ ...d, presets: d.presets.filter((p) => p.id !== id), active: d.active === id ? d.presets.find((p) => p.id !== id)?.id : d.active }));

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api.put("/settings", draft);
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function test(p) {
    setTests((t) => ({ ...t, [p.id]: { running: true } }));
    const r = await api.post("/settings/test", p).catch((e) => ({ ok: false, error: e.message }));
    setTests((t) => ({ ...t, [p.id]: r }));
  }

  return (
    <div className="page settings-page">
      <header className="page-head">
        <div>
          <h1>Cấu hình AI</h1>
          <p className="sub">
            Model dùng để lập kế hoạch video và viết kịch bản hoạt hình, gọi qua <code>{data.gateway}</code>. Chọn một cấu hình đang dùng; mọi dự án lập kế hoạch sau đó sẽ dùng nó.
          </p>
        </div>
        <div className="actions">
          <button className="btn" onClick={addPreset}>+ Thêm cấu hình</button>
          <button className="btn primary" disabled={!dirty || saving} onClick={save}>{saving ? "Đang lưu…" : saved ? "Đã lưu ✓" : "Lưu cấu hình"}</button>
        </div>
      </header>
      <ErrorNote error={error} />
      <datalist id="model-ids">{models.map((m) => <option key={m} value={m} />)}</datalist>

      <div className="preset-grid">
        {draft.presets.map((p) => {
          const b = BILLING[p.billing];
          const active = draft.active === p.id;
          const t = tests[p.id];
          return (
            <section key={p.id} className={`preset-card ${active ? "active" : ""}`}>
              <div className="preset-head">
                <label className="preset-radio">
                  <input type="radio" name="active" checked={active} onChange={() => setDraft((d) => ({ ...d, active: p.id }))} />
                  <span>{active ? "Đang dùng" : "Dùng cấu hình này"}</span>
                </label>
                <span className={`pill ${b.tone}`}>{b.label}</span>
              </div>
              <input className="preset-name" value={p.label} onChange={(e) => setPreset(p.id, { label: e.target.value })} aria-label="Tên cấu hình" />
              <div className="grid-2">
                <label>
                  Model
                  <input list="model-ids" value={p.model} onChange={(e) => setPreset(p.id, { model: e.target.value.trim() })} placeholder="vd. req/claude-opus-5-5" />
                </label>
                <label>
                  Tính tiền
                  <select value={p.billing} onChange={(e) => setPreset(p.id, { billing: e.target.value })}>
                    <option value="token">Theo token</option>
                    <option value="request">Theo lượt (unlimited)</option>
                  </select>
                </label>
                <label>
                  Mức suy nghĩ (effort)
                  <select value={p.effort} onChange={(e) => setPreset(p.id, { effort: e.target.value })}>
                    {data.efforts.map((x) => <option key={x} value={x}>{EFFORT_LABEL[x] || x}</option>)}
                  </select>
                </label>
                <label>
                  Token trả lời tối đa
                  <input type="number" min={2000} max={64000} step={1000} value={p.max_tokens} onChange={(e) => setPreset(p.id, { max_tokens: Number(e.target.value) })} />
                </label>
              </div>
              <p className="muted small">{b.note}</p>
              <div className="preset-foot">
                <button className="btn small" onClick={() => test(p)} disabled={t?.running}>{t?.running ? "Đang thử…" : "Thử kết nối"}</button>
                {t && !t.running && (
                  <span className={`small ${t.ok ? "ok-text" : "error-text"}`}>
                    {t.ok ? `OK · ${t.ms} ms · trả lời bởi ${t.model}: "${t.text}"` : t.error}
                  </span>
                )}
                {draft.presets.length > 1 && (
                  <button className="btn small danger push" onClick={() => removePreset(p.id)}>Xoá</button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <label className="check fallbacks">
        <input type="checkbox" checked={draft.fallbacks} onChange={(e) => setDraft((d) => ({ ...d, fallbacks: e.target.checked }))} />
        <span><strong>Cho phép model dự phòng</strong><small>Gửi tham số fallbacks; tắt nếu cổng API báo lỗi tham số này.</small></span>
      </label>

      <h2 className="section-title">Đã dùng</h2>
      {data.usage.length ? (
        <table className="table">
          <thead>
            <tr><th>Model</th><th>Tính tiền</th><th>Lượt gọi</th><th>Dự án</th><th>Token vào</th><th>Token ra</th><th>Lần cuối</th></tr>
          </thead>
          <tbody>
            {data.usage.map((u) => (
              <tr key={`${u.model}-${u.billing}`}>
                <td><code>{u.model}</code></td>
                <td><span className={`pill ${BILLING[u.billing]?.tone}`}>{u.billing === "request" ? "theo lượt" : "theo token"}</span></td>
                <td>{u.calls}</td>
                <td>{u.projects}</td>
                <td>{u.billing === "request" ? "—" : Number(u.input_tokens).toLocaleString("vi-VN")}</td>
                <td>{u.billing === "request" ? "—" : Number(u.output_tokens).toLocaleString("vi-VN")}</td>
                <td className="muted small">{new Date(u.last_used).toLocaleString("vi-VN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">Chưa có lượt gọi AI nào.</p>
      )}
    </div>
  );
}
