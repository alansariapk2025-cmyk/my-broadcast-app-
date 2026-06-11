import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import App from "./App.jsx";
import "./index.css";

const router = createBrowserRouter(
  [
    { path: "/", element: <App /> },
    { path: "/*", element: <App /> },
  ],
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  }
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    <Toaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        style: {
          background: "#1a1a1f",
          border: "1px solid rgba(251, 191, 36, 0.3)",
          color: "#fafafa",
        },
      }}
    />
  </React.StrictMode>
);
