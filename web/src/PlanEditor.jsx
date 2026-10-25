import { libraryUrl } from "./api.js";

// Edits a video plan scene by scene. Input fields are generated from each frame's meta.json,
// so a new frame in server/frames/ shows up here without UI changes.
const TRANSITIONS = [
  { value: "fade", label: "Mờ dần" },
  { value: "wipe", label: "Quét màu (đổi chủ đề)" },
];

// library: assets of the project's topic, { illustration: [], logo: [], photo: [] }.
// enumLabels: display names for fixed choices (characters, settings, actions…), keyed by value.
export default function PlanEditor({ plan, frames, images, library = {}, enumLabels = {}, errors, audio, disabled, onChange }) {
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
          enumLabels={enumLabels}
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

function SceneEditor({ index, scene, frame, frames, images, library, enumLabels, errors, audio, disabled, first, last, onChange, onMove, onRemove }) {
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
              <InputField key={k} name={k} spec={spec} value={scene.inputs?.[k]} images={images} library={library} enumLabels={enumLabels} disabled={disabled} onChange={(v) => setInput(k, v)} />
            ))
          ) : (
            <p className="note error">Frame “{scene.frame_id}” không có trong thư viện.</p>
          )}
        </div>
      </div>
      <SceneMedia scene={scene} images={images} library={library} disabled={disabled} onChange={onChange} />
      {errors.map((e) => <div key={e} className="note error">{e}</div>)}
    </article>
  );
}

// The scene's own photos (shown one after another behind the frame) and icons (popping in at its edge).
function SceneMedia({ scene, images, library, disabled, onChange }) {
  const visuals = scene.visuals || [];
  const icons = scene.icons || [];
  const urlOf = (name) => images.find((img) => img.name === name)?.url || libraryUrl.photo(name);
  const setVisual = (i, patch) => onChange({ visuals: visuals.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  return (
    <div className="scene-media">
      <div>
        <span className="field-label">Ảnh của cảnh ({visuals.length}) — hiện phía sau, lần lượt theo lời đọc</span>
        <div className="scene-photos">
          {visuals.map((v, i) => (
            <figure key={i}>
              <img src={urlOf(v.image)} alt={v.label || v.image} />
              <figcaption>
                <span title={v.image}>{v.label || v.image}</span>
                <button type="button" className="btn small danger" disabled={disabled} onClick={() => onChange({ visuals: visuals.filter((_, j) => j !== i) })}>✕</button>
              </figcaption>
              <input value={v.keyword || ""} disabled={disabled} placeholder="hiện khi đọc tới…" onChange={(e) => setVisual(i, { keyword: e.target.value })} />
            </figure>
          ))}
          {images.length > 0 && (
            <select value="" disabled={disabled} onChange={(e) => e.target.value && onChange({ visuals: [...visuals, { image: e.target.value, label: images.find((img) => img.name === e.target.value)?.label || "", keyword: "" }] })}>
              <option value="">+ Thêm ảnh dự án…</option>
              {images.map((img) => <option key={img.name} value={img.name}>{img.label || img.name}</option>)}
            </select>
          )}
        </div>
      </div>
      <div>
        <span className="field-label">Icon của cảnh</span>
        <div className="scene-icons">
          {icons.map((n, i) => (
            <span key={i} className="scene-icon">
              <AssetSelect kind="illustration" list={library.illustration || []} value={n} disabled={disabled} onChange={(v) => onChange({ icons: v ? icons.map((x, j) => (j === i ? v : x)) : icons.filter((_, j) => j !== i) })} />
            </span>
          ))}
          {icons.length < 3 && <AssetSelect kind="illustration" list={library.illustration || []} value="" placeholder="+ Thêm icon…" disabled={disabled} onChange={(v) => v && onChange({ icons: [...icons, v] })} />}
        </div>
      </div>
    </div>
  );
}

function InputField({ name, spec, value, images, library, enumLabels = {}, disabled, onChange }) {
  const label = (
    <span className="input-label">
      {name}{spec.required ? " *" : ""}
      {spec.description && <small className="muted"> — {spec.description}</small>}
    </span>
  );
  const nameOf = (v) => enumLabels[v] || v;
  if (spec.enum && spec.type === "string") {
    return (
      <label>
        {label}
        <select value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value || undefined)}>
          {!spec.required && <option value="">— mặc định —</option>}
          {spec.required && !value && <option value="">Chọn…</option>}
          {spec.enum.map((v) => <option key={v} value={v}>{nameOf(v)}</option>)}
        </select>
      </label>
    );
  }
  if (spec.enum && spec.type === "list") {
    // Toggle chips; the order of the list is the order they were picked (left to right on screen).
    const chosen = Array.isArray(value) ? value : [];
    const toggle = (v) => onChange(chosen.includes(v) ? chosen.filter((x) => x !== v) : chosen.length < (spec.maxItems ?? 9) ? [...chosen, v] : chosen);
    return (
      <div className="field">
        {label}
        <div className="chips enum-chips">
          {spec.enum.map((v) => (
            <button type="button" key={v} disabled={disabled} className={`chip ${chosen.includes(v) ? "active" : ""}`} onClick={() => toggle(v)}>
              {chosen.includes(v) && <b>{chosen.indexOf(v) + 1}</b>} {nameOf(v)}
            </button>
          ))}
        </div>
        <small className="count">{chosen.length}/{spec.maxItems ?? "∞"} — thứ tự chọn là thứ tự từ trái sang phải</small>
      </div>
    );
  }
  if (spec.type === "code") {
    const code = value ?? "";
    return (
      <label className="code-field">
        {label}
        <textarea className="code" rows={Math.min(14, Math.max(4, code.split("\n").length + 1))} spellCheck={false} value={code} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        <small className={spec.maxLength && code.length > spec.maxLength ? "count over" : "count"}>{code.length}/{spec.maxLength}</small>
      </label>
    );
  }
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
  if (["icon", "logo", "cutout", "character"].includes(spec.type)) {
    const kind = { icon: "illustration", logo: "logo", cutout: "cutout", character: "character" }[spec.type];
    return (
      <label>
        {label}
        <AssetSelect kind={kind} list={library[kind] || []} value={value} disabled={disabled} onChange={onChange} />
      </label>
    );
  }
  if (spec.type === "icons" || spec.type === "characters") {
    const kind = spec.type === "icons" ? "illustration" : "character";
    const noun = spec.type === "icons" ? "icon" : "nhân vật";
    const names = Array.isArray(value) ? value : [];
    const setAt = (i, v) => onChange(v ? names.map((n, j) => (j === i ? v : n)) : names.filter((_, j) => j !== i));
    return (
      <div className="field">
        {label}
        <div className="asset-list">
          {names.map((n, i) => <AssetSelect key={i} kind={kind} list={library[kind] || []} value={n} disabled={disabled} onChange={(v) => setAt(i, v)} />)}
          {names.length < (spec.maxItems ?? 4) && (
            <AssetSelect kind={kind} list={library[kind] || []} value="" placeholder={`+ Thêm ${noun}…`} disabled={disabled} onChange={(v) => v && onChange([...names, v])} />
          )}
        </div>
        <small className="count">{names.length}/{spec.maxItems ?? 4} {noun}, theo thứ tự</small>
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

const CHARACTER_GROUP = { people: "Người", animals: "Động vật", faces: "Gương mặt cảm xúc" };

// Dropdown of library icons or logos with a preview of the chosen one.
function AssetSelect({ kind, list, value, placeholder, disabled, onChange }) {
  const known = !value || list.some((a) => a.name === value);
  return (
    <span className="asset-pick">
      {value ? <img className="asset-thumb" src={list.find((a) => a.name === value)?.url || libraryUrl[kind](value)} alt="" /> : <span className="asset-thumb empty" />}
      <select value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{placeholder || (list.length ? "Chọn…" : "Thư viện trống — chạy npm run assets:download")}</option>
        {!known && <option value={value}>{value}</option>}
        {kind === "character"
          ? // Characters are labelled "group: name"; show them under one heading per group.
            Object.entries(Object.groupBy(list, (a) => a.label.split(":")[0])).map(([g, items]) => (
              <optgroup key={g} label={CHARACTER_GROUP[g] || g}>
                {items.map((a) => <option key={a.name} value={a.name}>{a.label.split(": ")[1] || a.name}</option>)}
              </optgroup>
            ))
          : list.map((a) => <option key={a.name} value={a.name}>{a.label || a.name}</option>)}
      </select>
    </span>
  );
}
