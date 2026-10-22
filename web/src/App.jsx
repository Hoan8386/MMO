import { NavLink, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import VideosPage from "./pages/VideosPage.jsx";
import VideoDetail from "./pages/VideoDetail.jsx";
import TypesPage from "./pages/TypesPage.jsx";
import ProjectsPage from "./pages/ProjectsPage.jsx";
import ProjectDetail from "./pages/ProjectDetail.jsx";
import FramesPage from "./pages/FramesPage.jsx";
import { api } from "./api.js";

export default function App() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    api.get("/health").then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">✎</span>
          <div>
            <strong>Video Studio</strong>
            <small>AI + HyperFrames</small>
          </div>
        </div>
        <nav>
          <NavLink to="/" end>Dự án video</NavLink>
          <NavLink to="/frames">Thư viện frame</NavLink>
          <span className="nav-group">Luồng cũ (AI vẽ tay)</span>
          <NavLink to="/legacy">Video vẽ tay</NavLink>
          <NavLink to="/types">Loại video</NavLink>
        </nav>
        <div className="sidebar-foot">
          {health?.ok ? (
            <span className={`pill ${health.ai === "mock" ? "warn" : "ok"}`}>
              AI: {health.ai === "mock" ? "chế độ thử (mock)" : health.model}
            </span>
          ) : (
            <span className="pill error">{health ? "Không kết nối được server" : "Đang kết nối…"}</span>
          )}
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/frames" element={<FramesPage />} />
          <Route path="/legacy" element={<VideosPage />} />
          <Route path="/videos/:id" element={<VideoDetail />} />
          <Route path="/types" element={<TypesPage />} />
        </Routes>
      </main>
    </div>
  );
}
