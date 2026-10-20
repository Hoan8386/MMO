import { STATUS, parsePaths } from "./api.js";

export function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.draft;
  return <span className={`pill ${s.tone}`}>{s.label}</span>;
}

export function Progress({ value }) {
  return (
    <div className="progress">
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

// Static preview of a scene: the finished drawing with fills applied.
export function ScenePreview({ paths, type }) {
  const list = parsePaths(paths);
  const w = type?.width || 1920;
  const h = type?.height || 1080;
  return (
    <svg className="scene-preview" viewBox={`0 0 ${w} ${h}`} style={{ background: type?.background_color || "#fff" }}>
      {list.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={p.stroke}
          fill={p.fill || "none"}
          strokeWidth={type?.stroke_width || 5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {!list.length && (
        <text x={w / 2} y={h / 2} textAnchor="middle" fontSize={h * 0.05} fill="#9aa3af">
          Chưa có hình
        </text>
      )}
    </svg>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <div className="note error">{error}</div>;
}
