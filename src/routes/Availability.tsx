"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type DayRow = {
  dateString: string;
  label: string;
};

const formatDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getDaysInMonth = (year: number, month: number) => {
  const date = new Date(year, month, 1);
  const days: Date[] = [];
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

export default function Availability() {
  const [myGuideId, setMyGuideId] = useState<string | null>(null);
  const [availableDays, setAvailableDays] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const nextMonthMeta = useMemo(() => {
    const today = new Date();
    const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return {
      year: nextMonthDate.getFullYear(),
      month: nextMonthDate.getMonth(),
      label: nextMonthDate.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      }),
    };
  }, []);

  const days = useMemo<DayRow[]>(() => {
    const list = getDaysInMonth(nextMonthMeta.year, nextMonthMeta.month);
    return list.map((d) => ({
      dateString: formatDate(d),
      label: d.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "short",
      }),
    }));
  }, [nextMonthMeta]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        setErr("Not logged in.");
        setLoading(false);
        return;
      }

      const { data: guides, error: gErr } = await supabase
        .from("guides")
        .select("id")
        .eq("user_id", userId)
        .limit(1);

      if (gErr) {
        setErr(gErr.message);
        setLoading(false);
        return;
      }

      const gid = guides?.[0]?.id ?? null;
      setMyGuideId(gid);
      if (!gid) {
        setErr("No guide profile linked to this user.");
        setLoading(false);
        return;
      }

      const start = `${nextMonthMeta.year}-${String(nextMonthMeta.month + 1).padStart(2, "0")}-01`;
      const endDate = new Date(nextMonthMeta.year, nextMonthMeta.month + 1, 0);
      const end = `${nextMonthMeta.year}-${String(nextMonthMeta.month + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

      const { data, error } = await supabase
        .from("guide_availability")
        .select("date, is_available")
        .eq("guide_id", gid)
        .gte("date", start)
        .lte("date", end);

      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }

      const set = new Set((data ?? []).filter((d) => d.is_available).map((d) => d.date));
      setAvailableDays(set);
      setLoading(false);
    })();
  }, [nextMonthMeta]);

  const toggleDay = async (dateString: string) => {
    if (!myGuideId) return;
    const isAvailable = !availableDays.has(dateString);
    const next = new Set(availableDays);
    if (isAvailable) next.add(dateString);
    else next.delete(dateString);
    setAvailableDays(next);

    const { error } = await supabase
      .from("guide_availability")
      .upsert(
        {
          guide_id: myGuideId,
          date: dateString,
          is_available: isAvailable,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "guide_id,date" }
      );

    if (error) {
      setErr(error.message);
      setAvailableDays(new Set(availableDays));
    }
  };

  return (
    <div className="page">
      <h1>Availability</h1>
      <p className="muted">Set your availability for {nextMonthMeta.label}.</p>
      {err && <p className="error">{err}</p>}
      {loading && <p className="muted">Loading...</p>}
      <div className="list">
        {days.map((day) => {
          const isSelected = availableDays.has(day.dateString);
          return (
            <button
              key={day.dateString}
              className={`list-item ${isSelected ? "selected" : ""}`}
              onClick={() => toggleDay(day.dateString)}
              disabled={!myGuideId}
            >
              <span>{day.label}</span>
              <span className="tag">{isSelected ? "Available" : "Unavailable"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
