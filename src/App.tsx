import { Link, Route, Routes } from "react-router-dom";
import { DesignPage } from "./pages/DesignPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={
        <div className="min-h-dvh grid place-items-center p-4 text-center">
          <div className="space-y-3">
            <h1 className="font-display text-display uppercase">Hoops GM</h1>
            <p className="text-text-muted">還在建置中。先看看 <Link className="text-accent-text underline" to="/design">設計系統</Link>。</p>
          </div>
        </div>
      } />
      <Route path="/design" element={<DesignPage />} />
    </Routes>
  );
}
