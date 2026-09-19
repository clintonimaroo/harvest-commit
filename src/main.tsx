import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import { WorkspaceGate } from "./components/WorkspaceGate";
import "./styles.css";
import "./sidebar.css";
import "./weather.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WorkspaceGate />
  </React.StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js").catch(() => {}),
  );
}
