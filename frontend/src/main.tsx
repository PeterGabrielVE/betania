import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import { AuthProvider } from "./context/AuthContext.tsx";
import { ThemeProvider } from "./context/ThemeContext.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AppWrapper>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AppWrapper>
    </ThemeProvider>
  </StrictMode>,
);
