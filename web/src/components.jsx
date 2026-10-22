import { useEffect, useState } from "react";
import { api, PROJECT_STATUS } from "./api.js";

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

// Output formats (server/src/video/aspects.js), fetched once and shared.
let aspectsPromise = null;
export function useAspects() {
  const [aspects, setAspects] = useState([]);
  useEffect(() => {
    aspectsPromise ||= api.get("/projects/aspects").catch(() => ((aspectsPromise = null), []));
    aspectsPromise.then(setAspects);
  }, []);
  return aspects;
}

// A small rectangle with the format's proportions.
export function AspectIcon({ ratio, size = 18 }) {
  const [w, h] = ratio.split(":").map(Number);
  const k = size / Math.max(w, h);
  return <span className="aspect-icon" style={{ width: Math.round(w * k), height: Math.round(h * k) }} />;
}

export function AspectBadge({ ratio }) {
  return (
    <span className="aspect-badge">
      <AspectIcon ratio={ratio || "16:9"} size={12} />
      {ratio || "16:9"}
    </span>
  );
}

export function AspectPicker({ value, onChange, disabled }) {
  const aspects = useAspects();
  return (
    <div className="aspect-pick" role="radiogroup">
      {aspects.map((a) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === a.id}
          key={a.id}
          disabled={disabled}
          className={`aspect-option ${value === a.id ? "active" : ""}`}
          onClick={() => onChange(a.id)}
        >
          <span className="aspect-frame"><AspectIcon ratio={a.id} size={34} /></span>
          <strong>{a.label}</strong>
          <small>{a.platforms}</small>
          <small className="muted">{a.width}×{a.height}</small>
        </button>
      ))}
    </div>
  );
}
