"use client";

import { useEffect, useState } from "react";
import HistoryDetail from "./HistoryDetail";
import { supabase } from "../lib/supabase";

type SlotRow = {
  id: string;
  slot_date: string;
  slot_time: string;
  status: string;
};

export default function History() {
  const [rows, setRows] = useState<SlotRow[]>([]);
  const [participantsBySlot, setParticipantsBySlot] = useState<Record<string, number>>({});
  const [paymentBySlot, setPaymentBySlot] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlyMine, setOnlyMine] = useState(true);
  const [guideId, setGuideId] = useState<string | null>(null);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);

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

      const slotRows = (slots ?? []) as SlotRow[];
      setRows(slotRows);

      const slotIds = slotRows.map((slot) => slot.id);
      if (!slotIds.length) {
        setParticipantsBySlot({});
        setPaymentBySlot({});
        setLoading(false);
        return;
      }

      const { data: scans, error: scanErr } = await supabase
        .from("ticket_scans")
        .select("slot_id, persons")
        .in("slot_id", slotIds);

      if (scanErr) {
        setErr(scanErr.message);
        setLoading(false);
        return;
      }

      const totals: Record<string, number> = {};
      (scans ?? []).forEach((scan) => {
        const slotId = (scan as { slot_id: string }).slot_id;
        const persons = (scan as { persons: number | null }).persons ?? 1;
        totals[slotId] = (totals[slotId] ?? 0) + persons;
      });
      setParticipantsBySlot(totals);

      if (onlyMine) {
        const { data: payments, error: payErr } = await supabase
          .from("tour_payments")
          .select("slot_id, status")
          .in("slot_id", slotIds);

        if (payErr) {
          setErr(payErr.message);
          setLoading(false);
          return;
        }

        const paymentMap: Record<string, string> = {};
        (payments ?? []).forEach((payment) => {
          const row = payment as { slot_id: string; status: string | null };
          if (row.status) {
            paymentMap[row.slot_id] = row.status;
          }
        });
        setPaymentBySlot(paymentMap);
      } else {
        setPaymentBySlot({});
      }
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
        {rows.map((row) => {
          const paymentStatus = paymentBySlot[row.id] ?? "pending";
          return (
          <button
            key={row.id}
            type="button"
            className="list-item link-row"
            onClick={() => setActiveSlotId(row.id)}
          >
            <div>
              <strong>{row.slot_date}</strong> · {row.slot_time?.slice(0, 5)}
              <div className="muted">{participantsBySlot[row.id] ?? 0} participants</div>
            </div>
            <div className="inline-actions">
              {!onlyMine && <span className="tag">Completed</span>}
              {onlyMine && (
                <span
                  className={`tag ${paymentStatus === "paid" ? "tag-paid" : "tag-pending"}`}
                >
                  {paymentStatus}
                </span>
              )}
            </div>
          </button>
        )})}
        {!loading && rows.length === 0 && <p className="muted">No history yet.</p>}
      </div>
      {activeSlotId && (
        <HistoryDetail slotId={activeSlotId} onClose={() => setActiveSlotId(null)} />
      )}
    </div>
  );
}
