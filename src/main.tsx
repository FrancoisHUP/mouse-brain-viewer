import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App";
import ExampleParentEmbed from "./ExampleParentEmbed";
import "./index.css";

function ViewerAppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/externalembedding" element={<ExampleParentEmbed />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ViewerAppRouter />
  </React.StrictMode>
);
