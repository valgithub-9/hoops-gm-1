import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter, MemoryRouter } from "react-router-dom";
import { App } from "./App";
import "./styles/index.css";

// Where the game is hosted decides how pages are addressed:
//   default  - normal URLs (your own domain)
//   "hash"   - #/l/... URLs, for static hosts without rewrites (GitHub Pages)
//   "memory" - no URL changes at all, for embedded pages that cannot touch the address bar
const mode = import.meta.env.VITE_ROUTER as string | undefined;
const Router = mode === "memory" ? MemoryRouter : mode === "hash" ? HashRouter : BrowserRouter;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router><App /></Router>
  </StrictMode>,
);
