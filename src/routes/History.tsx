"use client";

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

type SlotRow = {
  id: string;
  slot_date: string;
  slot_time: string;
  status: string;
};

export default function History() {
  const [rows, setRows] = useState<SlotRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlyMine, setOnlyMine] = useState(true);
  const [guideId, setGuideId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
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
        .select("id")
        .eq("user_id", userId)
        .limit(1);

      if (gErr) {
        setErr(gErr.message);
        setLoading(false);
        return;
      }

      const gid = guides?.[0]?.id ?? null;
      setGuideId(gid);
      if (!gid) {
        setErr("No guide profile linked to this user.");
        setLoading(false);
        return;
      }

      let query = supabase
        .from("schedule_slots")
        .select("id, slot_date, slot_time, status")
        .eq("status", "completed")
        .order("slot_date", { ascending: false })
        .order("slot_time", { ascending: false });

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

      setRows((slots ?? []) as SlotRow[]);
      setLoading(false);
    })();
  }, [onlyMine]);

  return (
    <div className="page">
      <h1>History</h1>
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
        {rows.map((row) => (
          <Link key={row.id} to={`/history/${row.id}`} className="list-item link-row">
            <div>
              <strong>{row.slot_date}</strong> · {row.slot_time?.slice(0, 5)}
            </div>
            <span className="tag">{row.status}</span>
          </Link>
        ))}
        {!loading && rows.length === 0 && <p className="muted">No history yet.</p>}
      </div>
    </div>
  );
}
