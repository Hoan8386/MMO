async function request(method, url, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(`/api${url}`, {
    method,
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}

export const api = {
  get: (url) => request("GET", url),
  post: (url, body) => request("POST", url, body),
  put: (url, body) => request("PUT", url, body),
  del: (url) => request("DELETE", url),
};

// Files of the shared asset library (storage/library/).
export const libraryUrl = {
  illustration: (name) => `/storage/library/illustrations/${name}.svg`,
  logo: (name) => `/storage/library/logos/${name}.svg`,
  photo: (name) => `/storage/library/photos/${name}`,
};

export const PROJECT_STATUS = {
  draft: { label: "Nháp", tone: "muted" },
  planning: { label: "AI đang lập kế hoạch", tone: "info" },
  awaiting_approval: { label: "Chờ duyệt kế hoạch", tone: "warn" },
  building: { label: "Đang dựng", tone: "info" },
  built: { label: "Đã dựng", tone: "ok" },
  rendering: { label: "Đang render", tone: "info" },
  completed: { label: "Hoàn thành", tone: "done" },
  failed: { label: "Lỗi", tone: "error" },
};

export const PROJECT_BUSY = ["planning", "building", "rendering"];
