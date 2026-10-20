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

export const STATUS = {
  draft: { label: "Nháp", tone: "muted" },
  generating: { label: "Đang tạo cảnh", tone: "info" },
  ready: { label: "Sẵn sàng render", tone: "ok" },
  rendering: { label: "Đang render", tone: "info" },
  done: { label: "Hoàn thành", tone: "done" },
  error: { label: "Lỗi", tone: "error" },
};

export const parsePalette = (p) => (typeof p === "string" ? JSON.parse(p) : p || []);
export const parsePaths = (p) => (typeof p === "string" ? JSON.parse(p) : p || []);
