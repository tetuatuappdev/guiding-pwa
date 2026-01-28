"use client";

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { apiFetch } from "../lib/api";

type TicketScan = {
  id: string;
  kind: string;
  persons: number | null;
  ticket_code: string | null;
  tourist_name: string | null;
  scanned_at: string | null;
  photo_path: string | null;
};

export default function HistoryDetail() {
  const { slotId } = useParams();
  const [scans, setScans] = useState<TicketScan[]>([]);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!slotId) return;
      setErr(null);
      setLoading(true);

      const { data: scansData, error: sErr } = await supabase
        .from("ticket_scans")
        .select("id, kind, persons, ticket_code, tourist_name, scanned_at, photo_path")
        .eq("slot_id", slotId)
        .order("scanned_at", { ascending: false });

      if (sErr) {
        setErr(sErr.message);
        setLoading(false);
        return;
      }

      setScans((scansData ?? []) as TicketScan[]);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (token) {
          const resp = await apiFetch(`/api/tours/${slotId}/invoice-url`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const contentType = resp.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const body = await resp.json();
            if (resp.ok && body?.url) {
              setInvoiceUrl(body.url);
            }
          } else if (!resp.ok) {
            setErr("Failed to load invoice link.");
          }
        }
      } catch (e: any) {
        setErr(e.message ?? "Failed to load invoice link.");
      }

      setLoading(false);
    })();
  }, [slotId]);

  const photoUrl = (path: string | null) => {
    if (!path) return null;
    const { data } = supabase.storage.from("ticket-photos").getPublicUrl(path);
    return data?.publicUrl ?? null;
  };

  return (
    <div className="page">
      <h1>Tour details</h1>
      {invoiceUrl && (
        <div className="inline-actions" style={{ marginBottom: 12 }}>
          <a className="button" href={invoiceUrl} target="_blank" rel="noreferrer">
            Open invoice
          </a>
        </div>
      )}
      {err && <p className="error">{err}</p>}
      {loading && <p className="muted">Loading...</p>}

      <div className="list">
        {scans.map((scan) => {
          const url = photoUrl(scan.photo_path);
          return (
            <div key={scan.id} className="list-item">
              <div>
                <strong>{scan.kind}</strong> · {scan.persons ?? 1}p
                {scan.ticket_code ? ` · ${scan.ticket_code}` : ""}
              </div>
              <div className="inline-actions">
                {url && (
                  <a className="button ghost" href={url} target="_blank" rel="noreferrer">
                    View photo
                  </a>
                )}
                <span className="tag">{scan.scanned_at?.slice(11, 16) ?? "-"}</span>
              </div>
            </div>
          );
        })}
        {!loading && scans.length === 0 && <p className="muted">No scans for this tour.</p>}
      </div>
    </div>
  );
}
