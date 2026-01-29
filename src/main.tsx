import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const errorRoot = document.createElement("div");
errorRoot.id = "error-overlay";
document.body.appendChild(errorRoot);

const showOverlay = (message: string) => {
  errorRoot.textContent = message;
  errorRoot.setAttribute("data-visible", "true");
};

window.addEventListener("error", (event) => {
  showOverlay(`Error: ${event.message}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  showOverlay(`Unhandled: ${reason}`);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ignore SW registration errors for now.
    });
  });
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
