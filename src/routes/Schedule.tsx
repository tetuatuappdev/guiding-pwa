"use client";

import { useEffect, useState } from "react";
import { getDevFakeSlot, isDevFakeTourEnabled } from "../lib/devFakeTour";
import { isGuestSession } from "../lib/guest";
import { supabase } from "../lib/supabase";

type SlotRow = {
  id: string;
  slot_date: string;
  slot_time: string;
  status: string;
  guide_id: string | null;
  guide_name?: string | null;
  guide?: {
    first_name: string | null;
    last_name: string | null;
  } | null;
};

const todayIso = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatDateLabel = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-").map((part) => Number(part));
  if (!year || !month || !day) return isoDate;
  const suffix =
    day % 10 === 1 && day % 100 !== 11
      ? "st"
      : day % 10 === 2 && day % 100 !== 12
        ? "nd"
        : day % 10 === 3 && day % 100 !== 13
          ? "rd"
          : "th";
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const monthName = monthNames[month - 1];
  if (!monthName) return isoDate;
  return `${day}${suffix} of ${monthName}`;
};

export default function Schedule() {
  const [rows, setRows] = useState<SlotRow[]>([]);
  const [guideNamesById, setGuideNamesById] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlyMine, setOnlyMine] = useState(true);
  const [guideId, setGuideId] = useState<string | null>(null);
  const [guideName, setGuideName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (isGuestSession()) {
        setRows([]);
        setLoading(false);
        return;
      }
      setErr(null);
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        setErr("Not logged in.");
        setLoading(false);
        return;
      }

      const { data: guides, error: gErr } = await supabase
        .from("guides")
        .select("id, first_name, last_name")
        .eq("user_id", userId)
        .limit(1);

      if (gErr) {
        setErr(gErr.message);
        setLoading(false);
        return;
      }

      const gid = guides?.[0]?.id ?? null;
      const name = [guides?.[0]?.first_name, guides?.[0]?.last_name].filter(Boolean).join(" ") || null;
      setGuideId(gid);
      setGuideName(name);
      if (!gid) {
        setErr("No guide profile linked to this user.");
        setLoading(false);
        return;
      }

      let query = supabase
        .from("schedule_slots")
        .select("id, slot_date, slot_time, status, guide_id, guide:guides(first_name,last_name)")
        .gte("slot_date", todayIso())
        .order("slot_date", { ascending: true })
        .order("slot_time", { ascending: true });

      if (onlyMine) {
        query = query.eq("guide_id", gid);
      } else {
        query = query.not("guide_id", "is", null);
      }

      const { data: slots, error: sErr } = await query;

      if (sErr) {
        setErr(sErr.message);
        setLoading(false);
        return;
      }

      let nextRows = (slots ?? []) as SlotRow[];
      setRows(nextRows);
      setGuideNamesById({});

      if (!onlyMine) {
        const ids = Array.from(
          new Set(nextRows.map((slot) => slot.guide_id).filter(Boolean) as string[])
        );
        if (ids.length) {
          const { data: guideRows, error: guideErr } = await supabase.rpc("get_guides_by_ids", {
            ids,
          });
          if (!guideErr && Array.isArray(guideRows)) {
            const mapped: Record<string, string> = {};
            guideRows.forEach((row: any) => {
              const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
              if (row.id && name) {
                mapped[row.id] = name;
              }
            });
            setGuideNamesById(mapped);
          }
        }
      }
      setLoading(false);
    })();
  }, [onlyMine]);

  return (
    <div className="page">
      <h1>My schedule</h1>
      {err && <p className="error">{err}</p>}
      {loading && <p className="muted">Loading...</p>}
      <div className="card">
        <div className="inline-actions">
          <span className="muted">Only my tours</span>
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
            disabled={!guideId}
          />
        </div>
      </div>
      <div className="list">
        {rows.map((row) => {
          const rowGuideName =
            row.guide_name
              ? row.guide_name
              : row.guide
              ? [row.guide.first_name, row.guide.last_name].filter(Boolean).join(" ")
              : row.guide_id && row.guide_id === guideId
                ? guideName
                : onlyMine
                  ? null
                  : row.guide_id && guideNamesById[row.guide_id]
                    ? guideNamesById[row.guide_id]
                    : "Unassigned";
          return (
            <div key={row.id} className="list-item">
              <div>
                <strong>{formatDateLabel(row.slot_date)}</strong> · {row.slot_time?.slice(0, 5)}
              {rowGuideName && <div className="muted">{rowGuideName}</div>}
            </div>
            <span className="tag">{row.status}</span>
          </div>
          );
        })}
        {!loading && rows.length === 0 && <p className="muted">No upcoming tours.</p>}
      </div>
    </div>
  );
}
