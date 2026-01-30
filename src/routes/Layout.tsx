import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import ProfileModal from "../components/ProfileModal";
import { registerWebPush } from "../lib/webPush";
import { getDevFakeSlot, isDevFakeTourEnabled } from "../lib/devFakeTour";
import { supabase } from "../lib/supabase";

export default function Layout() {
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate("/login", { replace: true });
        return;
      }
      const { data: guides, error: guideErr } = await supabase
        .from("guides")
        .select("id")
        .eq("user_id", data.session.user.id)
        .limit(1);

      if (guideErr || !guides?.length) {
        await supabase.auth.signOut();
        sessionStorage.setItem("authMessage", "No guide profile linked to this user.");
        navigate("/login", { replace: true });
        return;
      }
      registerWebPush().catch(() => {});
      setLoading(false);
    })();
  }, [navigate]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const onLogout = async () => {
    await supabase.auth.signOut();
    setMenuOpen(false);
    navigate("/login", { replace: true });
  };

  const onStartTour = async () => {
    setMenuOpen(false);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      navigate("/login", { replace: true });
      return;
    }

    const { data: guides, error: gErr } = await supabase
      .from("guides")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    if (gErr) {
      window.alert("Unable to check your schedule right now.");
      navigate("/schedule", { replace: true });
      return;
    }

    const guideId = guides?.[0]?.id;
    if (!guideId) {
      window.alert("No guide profile linked to this user.");
      navigate("/schedule", { replace: true });
      return;
    }

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const todayIso = `${y}-${m}-${d}`;

    const { data: slots, error: sErr } = await supabase
      .from("schedule_slots")
      .select("slot_date, slot_time")
      .eq("guide_id", guideId)
      .gte("slot_date", todayIso)
      .order("slot_date", { ascending: true })
      .order("slot_time", { ascending: true });

    if (sErr) {
      window.alert("Unable to check your schedule right now.");
      navigate("/schedule", { replace: true });
      return;
    }

    let rows = slots ?? [];
    if (guideId && isDevFakeTourEnabled()) {
      rows = [getDevFakeSlot(guideId), ...rows];
    }

    const nowMs = Date.now();
    const oneHourMs = 60 * 60 * 1000;
    const hasSoonTour = rows.some((slot: any) => {
      if (!slot.slot_date || !slot.slot_time) return false;
      const dt = new Date(`${slot.slot_date}T${slot.slot_time}`);
      const diff = dt.getTime() - nowMs;
      return diff >= 0 && diff <= oneHourMs;
    });

    if (!hasSoonTour && !isDevFakeTourEnabled()) {
      window.alert("There is no tour starting within the next hour.");
      navigate("/schedule", { replace: true });
      return;
    }

    navigate("/scan");
  };

  if (loading) {
    return <div className="page"><p className="muted">Loading...</p></div>;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src="/title_black_2.png" alt="The Chester Tour" />
        </div>
        <div className="menu-wrap" ref={menuRef}>
          <button
            className="button ghost"
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Open menu"
          >
            <span className="hamburger">
              <span />
              <span />
              <span />
              <span />
            </span>
          </button>
          {menuOpen && (
            <div className="menu-panel">
              <button
                className="menu-logout"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setProfileOpen(true);
                }}
              >
                Profile
              </button>
              <button className="menu-logout" onClick={onLogout}>Sign out</button>
            </div>
          )}
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
      <footer className="bottom-nav">
        <NavLink to="/schedule" className="bottom-link">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm12 6H5v12h14V8zM7 10h4v4H7v-4z"
            />
          </svg>
          <span>Schedule</span>
        </NavLink>
        <NavLink to="/availability" className="bottom-link">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M3 3h18v18H3V3zm4 9l3 3 7-7-1.4-1.4L10 12.2 8.4 10.6 7 12z"
            />
          </svg>
          <span>Availability</span>
        </NavLink>
        <button className="bottom-link" type="button" onClick={onStartTour}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M5 2h2v20H5V2zm3 2h11l-2 4 2 4H8V4z"
            />
          </svg>
          <span>Start</span>
        </button>
        <NavLink to="/history" className="bottom-link">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M13 3a9 9 0 1 0 8.4 12h-2.1A7 7 0 1 1 13 5v3l4-4-4-4v3zm-1 4h2v6l5 3-1 1.7-6-3.7V7z"
            />
          </svg>
          <span>History</span>
        </NavLink>
      </footer>
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
