import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { getDevFakeSlot, isDevFakeTourEnabled } from "../lib/devFakeTour";
import { supabase } from "../lib/supabase";

export default function Layout() {
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
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
              <Link to="/schedule" onClick={() => setMenuOpen(false)}>Schedule</Link>
              <button className="menu-highlight" type="button" onClick={onStartTour}>
                Start a tour
              </button>
              <Link to="/availability" onClick={() => setMenuOpen(false)}>Availability</Link>
              <Link to="/history" onClick={() => setMenuOpen(false)}>History</Link>
              <Link to="/profile" onClick={() => setMenuOpen(false)}>Profile</Link>
              <button className="menu-logout" onClick={onLogout}>Sign out</button>
            </div>
          )}
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
