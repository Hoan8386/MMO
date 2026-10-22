import { libraryUrl } from "./api.js";

// Edits a video plan scene by scene. Input fields are generated from each frame's meta.json,
// so a new frame in server/frames/ shows up here without UI changes.
const TRANSITIONS = [
  { value: "fade", label: "Mờ dần" },
  { value: "wipe", label: "Quét màu (đổi chủ đề)" },
];

// library: assets of the project's topic, { illustration: [], logo: [], photo: [] }.
export default function PlanEditor({ plan, frames, images, library = {}, errors, audio, disabled, onChange }) {
  const byId = Object.fromEntries(frames.map((f) => [f.frame_id, f]));
  const scenes = plan.scenes;
  const update = (i, patch) => onChange({ ...plan, scenes: scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i, d) => {
    const next = [...scenes];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange({ ...plan, scenes: next });
  };
  const remove = (i) => onChange({ ...plan, scenes: scenes.filter((_, j) => j !== i) });
  const add = (frameId) => {
    const at = Math.max(1, scenes.length - 1); // before the outro
    const scene = { frame_id: frameId, voice_text: "", keywords: [], transition_out: "fade", inputs: {} };
    onChange({ ...plan, scenes: [...scenes.slice(0, at), scene, ...scenes.slice(at)] });
  };
  const general = errors.filter((e) => !e.startsWith("scenes["));

  return (
    <div className="plan-editor">
      <label>
        Tiêu đề video
        <input value={plan.title || ""} disabled={disabled} onChange={(e) => onChange({ ...plan, title: e.target.value })} />
      </label>
      {general.map((e) => <div key={e} className="note error">{e}</div>)}
      {scenes.map((s, i) => (
        <SceneEditor
          key={i}
          index={i}
          scene={s}
          frame={byId[s.frame_id]}
          frames={frames}
          images={images}
          library={library}
          errors={errors.filter((e) => e.startsWith(`scenes[${i}]`)).map((e) => e.replace(/^scenes\[\d+\]\.?/, ""))}
          audio={audio[s.id]}
          disabled={disabled}
          first={i === 0}
          last={i === scenes.length - 1}
          onChange={(patch) => update(i, patch)}
          onMove={(d) => move(i, d)}
          onRemove={() => remove(i)}
        />
      ))}
      <div className="add-scene">
        <span className="muted">Thêm cảnh (chèn trước cảnh kết):</span>
        <select value="" disabled={disabled} onChange={(e) => e.target.value && add(e.target.value)}>
          <option value="">Chọn frame…</option>
          {frames.filter((f) => !["intro", "outro"].includes(f.scene_type)).map((f) => (
            <option key={f.frame_id} value={f.frame_id}>{f.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function SceneEditor({ index, scene, frame, frames, images, library, errors, audio, disabled, first, last, onChange, onMove, onRemove }) {
  const setInput = (k, v) => onChange({ inputs: { ...scene.inputs, [k]: v } });
  // Switching frame keeps only the inputs the new frame understands.
  const switchFrame = (id) => {
    const next = frames.find((f) => f.frame_id === id);
    const inputs = Object.fromEntries(Object.entries(scene.inputs || {}).filter(([k]) => next?.inputs[k]));
    onChange({ frame_id: id, inputs });
  };

  return (
    <article className={`plan-scene ${errors.length ? "invalid" : ""}`}>
      <div className="plan-scene-head">
        <span className="scene-index">Cảnh {index + 1}{scene.id ? ` · ${scene.id}` : ""}</span>
        <select value={scene.frame_id} disabled={disabled} onChange={(e) => switchFrame(e.target.value)}>
          {frames.map((f) => <option key={f.frame_id} value={f.frame_id}>{f.name}</option>)}
        </select>
        <div className="actions">
          <button type="button" className="btn small" disabled={disabled || first} onClick={() => onMove(-1)} title="Lên">↑</button>
          <button type="button" className="btn small" disabled={disabled || last} onClick={() => onMove(1)} title="Xuống">↓</button>
          <button type="button" className="btn small danger" disabled={disabled} onClick={onRemove} title="Xoá cảnh">✕</button>
        </div>
      </div>
      {frame && <p className="muted small frame-desc">{frame.description}</p>}

      <div className="plan-scene-body">
        <div>
          <label>
            Lời đọc
            <textarea rows={3} value={scene.voice_text} disabled={disabled} onChange={(e) => onChange({ voice_text: e.target.value })} />
          </label>
          {audio && (
            <div className="audio-row">
              <audio src={audio.url} controls preload="none" />
              <span className="muted small">{Number(audio.duration).toFixed(1)}s đọc · cảnh {Number(audio.scene_duration).toFixed(1)}s</span>
            </div>
          )}
          <div className="grid-2">
            <label>
              Từ khoá canh chuyển động
              <input
                value={(scene.keywords || []).join(", ")}
                disabled={disabled}
                placeholder={frame?.keywords === "không cần" ? "không cần" : "cách nhau bằng dấu phẩy"}
                onChange={(e) => onChange({ keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })}
              />
              {frame && frame.keywords !== "không cần" && <small className="muted">{frame.keywords}</small>}
            </label>
            <label>
              Chuyển sang cảnh sau
              <select value={scene.transition_out || "fade"} disabled={disabled} onChange={(e) => onChange({ transition_out: e.target.value })}>
                {TRANSITIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="plan-inputs">
          {frame ? (
            Object.entries(frame.inputs).map(([k, spec]) => (
              <InputField key={k} name={k} spec={spec} value={scene.inputs?.[k]} images={images} library={library} disabled={disabled} onChange={(v) => setInput(k, v)} />
            ))
          ) : (
            <p className="note error">Frame “{scene.frame_id}” không có trong thư viện.</p>
          )}
        </div>
      </div>
      {errors.map((e) => <div key={e} className="note error">{e}</div>)}
    </article>
  );
}

function InputField({ name, spec, value, images, library, disabled, onChange }) {
  const label = (
    <span className="input-label">
      {name}{spec.required ? " *" : ""}
      {spec.description && <small className="muted"> — {spec.description}</small>}
    </span>
  );
  if (spec.type === "number") {
    return (
      <label>
        {label}
        <input type="number" step="any" value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
      </label>
    );
  }
  if (spec.type === "numbers") {
    const nums = Array.isArray(value) ? value : [];
    return (
      <label>
        {label}
        <input
          defaultValue={nums.join("; ")}
          key={nums.join(";")}
          disabled={disabled}
          placeholder="vd. 12; 30.5; 48"
          onBlur={(e) => onChange(e.target.value.split(";").map((x) => x.trim().replace(",", ".")).filter(Boolean).map(Number))}
        />
        <small className="count">{nums.length}/{spec.maxItems ?? "∞"} số, cách nhau bằng dấu chấm phẩy</small>
      </label>
    );
  }
  if (spec.type === "list") {
    const items = Array.isArray(value) ? value : [];
    const over = items.some((x) => spec.itemMaxLength && x.length > spec.itemMaxLength);
    return (
      <label>
        {label}
        <textarea
          rows={Math.max(2, items.length)}
          value={items.join("\n")}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.split("\n"))}
          onBlur={() => onChange(items.map((x) => x.trimEnd()).filter((x) => x.trim()))}
        />
        <small className={over ? "count over" : "count"}>
          {items.filter(Boolean).length}/{spec.maxItems ?? "∞"} ý, mỗi dòng một ý, tối đa {spec.itemMaxLength} ký tự
        </small>
      </label>
    );
  }
  if (spec.type === "image") {
    const photos = library.photo || [];
    const preview = images.find((img) => img.name === value)?.url || (photos.some((a) => a.name === value) ? libraryUrl.photo(value) : null);
    return (
      <label>
        {label}
        <span className="asset-pick">
          {preview && <img className="asset-thumb photo" src={preview} alt="" />}
          <select value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">{images.length || photos.length ? "Chọn ảnh…" : "Chưa có ảnh — tải ảnh lên ở mục Ảnh"}</option>
            {images.length > 0 && <optgroup label="Ảnh của dự án">{images.map((img) => <option key={img.name} value={img.name}>{img.name}</option>)}</optgroup>}
            {photos.length > 0 && <optgroup label="Ảnh thư viện">{photos.map((a) => <option key={a.name} value={a.name}>{a.label}</option>)}</optgroup>}
          </select>
        </span>
      </label>
    );
  }
  if (spec.type === "icon" || spec.type === "logo") {
    const kind = spec.type === "icon" ? "illustration" : "logo";
    return (
      <label>
        {label}
        <AssetSelect kind={kind} list={library[kind] || []} value={value} disabled={disabled} onChange={onChange} />
      </label>
    );
  }
  if (spec.type === "icons") {
    const names = Array.isArray(value) ? value : [];
    const setAt = (i, v) => onChange(v ? names.map((n, j) => (j === i ? v : n)) : names.filter((_, j) => j !== i));
    return (
      <div className="field">
        {label}
        <div className="asset-list">
          {names.map((n, i) => <AssetSelect key={i} kind="illustration" list={library.illustration || []} value={n} disabled={disabled} onChange={(v) => setAt(i, v)} />)}
          {names.length < (spec.maxItems ?? 4) && (
            <AssetSelect kind="illustration" list={library.illustration || []} value="" placeholder="+ Thêm icon…" disabled={disabled} onChange={(v) => v && onChange([...names, v])} />
          )}
        </div>
        <small className="count">{names.length}/{spec.maxItems ?? 4} icon, theo thứ tự các ý</small>
      </div>
    );
  }
  const text = value ?? "";
  const over = spec.maxLength && text.length > spec.maxLength;
  return (
    <label>
      {label}
      <input value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      {spec.maxLength && <small className={over ? "count over" : "count"}>{text.length}/{spec.maxLength}</small>}
    </label>
  );
}

// Dropdown of library icons or logos with a preview of the chosen one.
function AssetSelect({ kind, list, value, placeholder, disabled, onChange }) {
  const known = !value || list.some((a) => a.name === value);
  return (
    <span className="asset-pick">
      {value ? <img className="asset-thumb" src={libraryUrl[kind](value)} alt="" /> : <span className="asset-thumb empty" />}
      <select value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{placeholder || (list.length ? "Chọn…" : "Thư viện trống — chạy npm run assets:download")}</option>
        {!known && <option value={value}>{value}</option>}
        {list.map((a) => <option key={a.name} value={a.name}>{a.label || a.name}</option>)}
      </select>
    </span>
  );
}
