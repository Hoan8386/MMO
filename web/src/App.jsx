import { NavLink, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import ProjectsPage from "./pages/ProjectsPage.jsx";
import ProjectDetail from "./pages/ProjectDetail.jsx";
import FramesPage from "./pages/FramesPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import MusicPage from "./pages/MusicPage.jsx";
import LongVideoPage, { LongVideoDetail } from "./pages/LongVideoPage.jsx";
import { api } from "./api.js";

export default function App() {
  const [health, setHealth] = useState(null);
  const loadHealth = () => api.get("/health").then(setHealth).catch(() => setHealth({ ok: false }));
  useEffect(() => {
    loadHealth();
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
          <NavLink to="/long">Video dài</NavLink>
          <NavLink to="/frames">Thư viện frame</NavLink>
          <NavLink to="/music">Nhạc nền</NavLink>
          <NavLink to="/settings">Cấu hình AI</NavLink>
        </nav>
        <div className="sidebar-foot">
          {health?.ok ? (
            <NavLink to="/settings" className={`pill ${health.ai === "mock" ? "warn" : "ok"}`} title={health.preset}>
              AI: {health.ai === "mock" ? "chế độ thử (mock)" : health.model}
              {health.ai !== "mock" && <small className="pill-sub">{health.billing === "request" ? "unlimited · theo lượt" : "theo token"}</small>}
            </NavLink>
          ) : (
            <span className="pill error">{health ? "Không kết nối được server" : "Đang kết nối…"}</span>
          )}
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/long" element={<LongVideoPage />} />
          <Route path="/long/:slug" element={<LongVideoDetail />} />
          <Route path="/frames" element={<FramesPage />} />
          <Route path="/music" element={<MusicPage />} />
          <Route path="/settings" element={<SettingsPage onSaved={loadHealth} />} />
        </Routes>
      </main>
    </div>
  );
}
