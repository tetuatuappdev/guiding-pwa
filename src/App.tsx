import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./routes/Layout";
import Login from "./routes/Login";
import Schedule from "./routes/Schedule";
import Availability from "./routes/Availability";
import History from "./routes/History";
import HistoryDetail from "./routes/HistoryDetail";
import Scan from "./routes/Scan";
import Profile from "./routes/Profile";

export default function App() {
  const baseName = import.meta.env.BASE_URL?.replace(/\/$/, "") || "/";
  return (
    <BrowserRouter basename={baseName}>
      <Routes>
        <Route path="/login" element={<Login />} />
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
