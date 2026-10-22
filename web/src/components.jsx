import { PROJECT_STATUS } from "./api.js";

export function ProjectStatusBadge({ status }) {
  const s = PROJECT_STATUS[status] || PROJECT_STATUS.draft;
  return <span className={`pill ${s.tone}`}>{s.label}</span>;
}

export function Progress({ value }) {
  return (
    <div className="progress">
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <div className="note error">{error}</div>;
}
