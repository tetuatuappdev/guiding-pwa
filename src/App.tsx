import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./routes/Layout";
import Login from "./routes/Login";
import Schedule from "./routes/Schedule";
import Availability from "./routes/Availability";
import History from "./routes/History";
import HistoryDetail from "./routes/HistoryDetail";
import Scan from "./routes/Scan";
import Profile from "./routes/Profile";
import SignUp from "./routes/SignUp";
import { supabase } from "./lib/supabase";

export default function App() {
  const baseName = import.meta.env.BASE_URL?.replace(/\/$/, "") || "/";
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const hasAccessToken =
      url.hash.includes("access_token") ||
      url.search.includes("access_token=");
    const hasSignupType = url.hash.includes("type=signup") || url.search.includes("type=signup");
    const confirmed = url.searchParams.get("confirmed") === "1";
    if (!hasAccessToken && !hasSignupType && !confirmed) return;
    setRedirecting(true);
    supabase.auth.signOut().finally(() => {
      window.location.replace("/login?confirmed=1");
    });
  }, []);

  if (redirecting) {
    return null;
  }
  return (
    <BrowserRouter basename={baseName}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/schedule" replace />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/availability" element={<Availability />} />
          <Route path="/history" element={<History />} />
          <Route path="/history/:slotId" element={<HistoryDetail />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
