import { BrowserMultiFormatReader } from "@zxing/browser";
import { useEffect, useMemo, useRef, useState } from "react";
import { getDevFakeSlot, isDevFakeSlotId, isDevFakeTourEnabled } from "../lib/devFakeTour";
import { supabase } from "../lib/supabase";

type SlotRow = {
  id: string;
  slot_date: string;
  slot_time: string;
};

type ScanRow = {
  id: string;
  ticket_code: string;
  kind: string;
  persons: number | null;
  scanned_at: string | null;
};

export default function Scan() {
  const [slotId, setSlotId] = useState<string>("");
  const [activeSlot, setActiveSlot] = useState<SlotRow | null>(null);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [ticketCode, setTicketCode] = useState("");
  const [kind, setKind] = useState("scanned");
  const [persons, setPersons] = useState("1");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [autoAdd, setAutoAdd] = useState(true);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);
  const addingRef = useRef(false);
  const scannedCodesRef = useRef<Set<string>>(new Set());

  const canScan = useMemo(
    () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    []
  );
  const canNativeScan = useMemo(() => "BarcodeDetector" in window, []);

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

      const guideId = guides?.[0]?.id;
      if (!guideId) {
        setErr("No guide profile linked to this user.");
        setLoading(false);
        return;
      }

      const { data: slotRows, error: sErr } = await supabase
        .from("schedule_slots")
        .select("id, slot_date, slot_time")
        .eq("guide_id", guideId)
        .order("slot_date", { ascending: true })
        .order("slot_time", { ascending: true });

      if (sErr) {
        setErr(sErr.message);
        setLoading(false);
        return;
      }

      let nextSlots = (slotRows ?? []) as SlotRow[];
      if (isDevFakeTourEnabled()) {
        nextSlots = [getDevFakeSlot(guideId), ...nextSlots];
      }

      const nowMs = Date.now();
      const oneHourMs = 60 * 60 * 1000;
      const nextSlot = nextSlots.find((slot) => {
        if (!slot.slot_date || !slot.slot_time) return false;
        const dt = new Date(`${slot.slot_date}T${slot.slot_time}`);
        const diff = dt.getTime() - nowMs;
        return diff >= 0 && diff <= oneHourMs;
      });
      if (!nextSlot && !isDevFakeTourEnabled()) {
        setErr("There is no tour starting within the next hour.");
        setSlotId("");
        setActiveSlot(null);
        setLoading(false);
        return;
      }
      const resolvedSlot = nextSlot ?? (isDevFakeTourEnabled() ? getDevFakeSlot(guideId) : null);
      if (resolvedSlot) {
        setActiveSlot(resolvedSlot);
        setSlotId(resolvedSlot.id);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!slotId) return;
      if (isDevFakeSlotId(slotId)) return;
      const { data, error } = await supabase
        .from("ticket_scans")
        .select("id, ticket_code, kind, persons, scanned_at")
        .eq("slot_id", slotId)
        .order("scanned_at", { ascending: false });

      if (error) {
        setErr(error.message);
        return;
      }
      const nextScans = (data ?? []) as ScanRow[];
      setScans(nextScans);
      scannedCodesRef.current = new Set(nextScans.map((scan) => scan.ticket_code));
    })();
  }, [slotId]);

  const addScan = async (
    code: string,
    kindOverride?: string,
    options?: { fromScanner?: boolean; showAlert?: boolean }
  ) => {
    if (!slotId) return;
    if (addingRef.current) return;
    addingRef.current = true;
    setErr(null);

    const personsNum = Number(persons);
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      setErr("Ticket code is required.");
      addingRef.current = false;
      return;
    }
    if (scannedCodesRef.current.has(normalizedCode)) {
      if (!options?.fromScanner) {
        setErr("Ticket already scanned.");
      }
      addingRef.current = false;
      return;
    }
    if (!Number.isFinite(personsNum) || personsNum <= 0) {
      setErr("Persons must be a positive number.");
      addingRef.current = false;
      return;
    }

    if (isDevFakeSlotId(slotId)) {
      scannedCodesRef.current.add(normalizedCode);
      setScans((prev) => [
        {
          id: `fake-${Date.now()}`,
          ticket_code: normalizedCode,
          kind: kindOverride ?? kind,
          persons: personsNum,
          scanned_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setTicketCode("");
      setPersons("1");
      if (options?.showAlert) {
        window.alert(`Ticket ${code.trim()} added.`);
      }
      addingRef.current = false;
      return;
    }

    const { data: existing, error: existingErr } = await supabase
      .from("ticket_scans")
      .select("id")
      .eq("slot_id", slotId)
      .eq("ticket_code", normalizedCode)
      .limit(1);

    if (existingErr) {
      setErr(existingErr.message);
      addingRef.current = false;
      return;
    }
    if (existing?.length) {
      if (!options?.fromScanner) {
        setErr("Ticket already scanned.");
      }
      addingRef.current = false;
      return;
    }

    const { error } = await supabase.from("ticket_scans").insert({
      slot_id: slotId,
      ticket_code: normalizedCode,
      kind: kindOverride ?? kind,
      persons: personsNum,
    });

    if (error) {
      setErr(error.message);
      addingRef.current = false;
      return;
    }
    setTicketCode("");
    setPersons("1");
    scannedCodesRef.current.add(normalizedCode);
    const { data } = await supabase
      .from("ticket_scans")
      .select("id, ticket_code, kind, persons, scanned_at")
      .eq("slot_id", slotId)
      .order("scanned_at", { ascending: false });
    const nextScans = (data ?? []) as ScanRow[];
    setScans(nextScans);
    scannedCodesRef.current = new Set(nextScans.map((scan) => scan.ticket_code));
      if (options?.showAlert) {
        window.alert(`Ticket ${normalizedCode} added.`);
      }
    addingRef.current = false;
  };

  const deleteScan = async (scanId: string) => {
    const scanToDelete = scans.find((scan) => scan.id === scanId);
    if (!window.confirm("Delete this ticket scan?")) {
      return;
    }
    if (isDevFakeSlotId(slotId)) {
      if (scanToDelete?.ticket_code) {
        scannedCodesRef.current.delete(scanToDelete.ticket_code);
      }
      setScans((prev) => prev.filter((scan) => scan.id !== scanId));
      return;
    }

    const { error } = await supabase.from("ticket_scans").delete().eq("id", scanId);
    if (error) {
      setErr(error.message);
      return;
    }
    if (scanToDelete?.ticket_code) {
      scannedCodesRef.current.delete(scanToDelete.ticket_code);
    }
    setScans((prev) => prev.filter((scan) => scan.id !== scanId));
  };

  const onAdd = async () => {
    setErr(null);
    if (!slotId) return;
    await addScan(ticketCode);
  };

  useEffect(() => {
    if (!cameraOn || !canScan) return;

    let cancelled = false;
    let detector: BarcodeDetector | null = null;
    const reader = new BrowserMultiFormatReader();
    zxingRef.current = reader;

    const startCamera = async () => {
      try {
        if (!videoRef.current) {
          throw new Error("Camera is not ready.");
        }
        if (canNativeScan) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false,
          });
          streamRef.current = stream;
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          detector = new BarcodeDetector({
            formats: [
              "qr_code",
              "code_128",
              "ean_13",
              "ean_8",
              "code_39",
              "code_93",
              "upc_a",
              "upc_e",
              "itf",
              "codabar",
            ],
          });
        } else {
          await reader.decodeFromVideoDevice(
            undefined,
            videoRef.current,
            async (result, error) => {
              if (cancelled) return;
              if (!result) return;
              const code = result.getText().trim();
              const now = Date.now();
              if (code && (code !== lastScanRef.current || now - lastScanTimeRef.current > 2000)) {
                lastScanRef.current = code;
                lastScanTimeRef.current = now;
                setTicketCode(code);
                setScanStatus(`Detected ${code}`);
                if (autoAdd) {
                  await addScan(code, "scanned", { fromScanner: true, showAlert: true });
                }
              }
            }
          );
          return;
        }

        const scanLoop = async () => {
          if (cancelled || !videoRef.current || !detector) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            const now = Date.now();
            const code = barcodes?.[0]?.rawValue?.trim();
            if (code && (code !== lastScanRef.current || now - lastScanTimeRef.current > 2000)) {
              lastScanRef.current = code;
              lastScanTimeRef.current = now;
              setTicketCode(code);
              setScanStatus(`Detected ${code}`);
              if (autoAdd) {
                await addScan(code, "scanned", { fromScanner: true, showAlert: true });
              }
            }
          } catch {
            // ignore scan errors
          }
          requestAnimationFrame(scanLoop);
        };
        requestAnimationFrame(scanLoop);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to access camera.");
        setCameraOn(false);
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (videoRef.current) {
        videoRef.current.pause();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (zxingRef.current) {
        if (typeof zxingRef.current.reset === "function") {
          zxingRef.current.reset();
        }
        zxingRef.current = null;
      }
    };
  }, [autoAdd, cameraOn, canNativeScan, canScan]);

  return (
    <div className="page">
      <h1>Start a tour</h1>
      {err && <p className="error">{err}</p>}
      {loading && <p className="muted">Loading...</p>}

      <div className="card">
        <div className="inline-actions">
          <span className="muted">Camera scan</span>
          <button
            className={`button ${cameraOn ? "ghost" : ""}`}
            onClick={() => setCameraOn(false)}
            disabled={!canScan}
          >
            Off
          </button>
          <button
            className={`button ${cameraOn ? "" : "ghost"}`}
            onClick={() => setCameraOn(true)}
            disabled={!canScan}
          >
            On
          </button>
          <label className="muted" style={{ marginLeft: "auto" }}>
            <input
              type="checkbox"
              checked={autoAdd}
              onChange={(e) => setAutoAdd(e.target.checked)}
            />{" "}
            Auto add
          </label>
        </div>
        {!canScan && (
          <p className="muted" style={{ marginTop: 10 }}>
            Live scanning requires a browser with camera access enabled.
          </p>
        )}
        {cameraOn && (
          <div style={{ marginTop: 12 }}>
            <div className="scan-frame">
              <video ref={videoRef} muted playsInline />
            </div>
            {scanStatus && <p className="muted">{scanStatus}</p>}
          </div>
        )}
      </div>

      <div className="card">
        <div className="stack">
          <label className="muted">Tour</label>
          <div className="input" style={{ display: "flex", alignItems: "center" }}>
            {activeSlot
              ? isDevFakeSlotId(activeSlot.id)
                ? "FAKE (DEBUG)"
                : `${activeSlot.slot_date} · ${activeSlot.slot_time?.slice(0, 5)}`
              : "No tour available"}
          </div>
          <label className="muted">Ticket code</label>
          <input className="input" value={ticketCode} onChange={(e) => setTicketCode(e.target.value)} />
          <div className="grid-3">
            <div>
              <label className="muted">Type</label>
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="scanned">Scanned</option>
                <option value="paper">Paper</option>
                <option value="online">Online</option>
              </select>
            </div>
            <div>
              <label className="muted">Persons</label>
              <input className="input" value={persons} onChange={(e) => setPersons(e.target.value)} />
            </div>
            <div className="inline-actions" style={{ alignItems: "flex-end" }}>
              <button className="button" onClick={onAdd}>Add scan</button>
            </div>
          </div>
        </div>
      </div>

      <div className="list">
        {scans.map((scan) => (
          <div key={scan.id} className="list-item">
            <div>
              <strong>{scan.ticket_code}</strong> · {scan.kind} · {scan.persons ?? 1}p
            </div>
            <div className="inline-actions">
              <span className="tag">{scan.scanned_at?.slice(11, 16) ?? "-"}</span>
              <button
                className="icon-button"
                type="button"
                aria-label="Delete scan"
                onClick={() => deleteScan(scan.id)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M9 3h6l1 2h4v2H4V5h4l1-2zm-2 6h2v9H7V9zm4 0h2v9h-2V9zm4 0h2v9h-2V9z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
          </div>
        ))}
        {!loading && scans.length === 0 && <p className="muted">No scans yet.</p>}
      </div>
    </div>
  );
}
