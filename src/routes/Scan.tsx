import { BrowserQRCodeReader } from "@zxing/browser";
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

const QR_PREFIX = "Chester walking tour";

const normalizeQrCode = (value: string) =>
  value.replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");

const parseQrPayload = (value: string) => {
  const normalized = normalizeQrCode(value);
  if (!normalized.toLowerCase().startsWith(QR_PREFIX.toLowerCase())) {
    return null;
  }
  const match = normalized.match(
    /^Chester walking tour sold by VIC\s*-\s*(\d+)\s*person\(s\)\s*-\s*reference\s*#(.+)$/i
  );
  if (!match) return null;
  const persons = Number(match[1]);
  const reference = match[2]?.trim();
  if (!reference || !Number.isFinite(persons) || persons <= 0) return null;
  return { persons, reference };
};

export default function Scan() {
  const [slotId, setSlotId] = useState<string>("");
  const [activeSlot, setActiveSlot] = useState<SlotRow | null>(null);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [ticketCode, setTicketCode] = useState("");
  const kind = "scanned";
  const [persons, setPersons] = useState("1");
  const [manualSource, setManualSource] = useState<"vic" | "online">("vic");
  const [manualPhoto, setManualPhoto] = useState<File | null>(null);
  const [manualPhotoUrl, setManualPhotoUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [mode, setMode] = useState<"scan" | "manual">("scan");
  const [autoAdd] = useState(true);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanRef = useRef<string>("");
  const lastSeenRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);
  const addingRef = useRef(false);
  const scannedCodesRef = useRef<Set<string>>(new Set());

  const canScan = useMemo(
    () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    []
  );

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
    options?: {
      fromScanner?: boolean;
      showAlert?: boolean;
      personsOverride?: number;
      photoFile?: File | null;
    }
  ) => {
    if (!slotId) return;
    if (addingRef.current) return;
    addingRef.current = true;
    setErr(null);

    const personsNum = options?.personsOverride ?? Number(persons);
    const normalizedCode = normalizeQrCode(code);
    if (!normalizedCode) {
      setErr("Ticket code is required.");
      addingRef.current = false;
      return;
    }
    if (scannedCodesRef.current.has(normalizedCode)) {
      if (options?.fromScanner) {
        window.alert(`Ticket ${normalizedCode} already scanned.`);
      } else {
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
      setManualPhoto(null);
      if (manualPhotoUrl) {
        URL.revokeObjectURL(manualPhotoUrl);
        setManualPhotoUrl(null);
      }
      if (options?.showAlert) {
        window.alert(`Added ${personsNum}p · ref ${normalizedCode}`);
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
      if (options?.fromScanner) {
        window.alert(`Ticket ${normalizedCode} already scanned.`);
      } else {
        setErr("Ticket already scanned.");
      }
      addingRef.current = false;
      return;
    }

    let photoPath: string | null = null;
    if (options?.photoFile && ["paper", "online"].includes(kindOverride ?? kind)) {
      const extension = options.photoFile.type.split("/").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
      photoPath = `manual/${slotId}/${fileName}`;
      const { error: uploadErr } = await supabase.storage
        .from("ticket-photos")
        .upload(photoPath, options.photoFile, { upsert: true });

      if (uploadErr) {
        setErr(uploadErr.message);
        addingRef.current = false;
        return;
      }
    }

    const { error } = await supabase.from("ticket_scans").insert({
      slot_id: slotId,
      ticket_code: normalizedCode,
      kind: kindOverride ?? kind,
      persons: personsNum,
      photo_path: photoPath,
    });

    if (error) {
      setErr(error.message);
      addingRef.current = false;
      return;
    }
    setTicketCode("");
    setPersons("1");
    setManualPhoto(null);
    if (manualPhotoUrl) {
      URL.revokeObjectURL(manualPhotoUrl);
      setManualPhotoUrl(null);
    }
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
      window.alert(`Added ${personsNum}p · ref ${normalizedCode}`);
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
    if (!manualPhoto) {
      window.alert("Please take a ticket photo before adding.");
      return;
    }
    const code = `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const kindOverride = manualSource === "vic" ? "paper" : "online";
    await addScan(code, kindOverride, { photoFile: manualPhoto });
  };

  useEffect(() => {
    if (!cameraOn || !canScan) return;

    let cancelled = false;
    const reader = new BrowserQRCodeReader();
    zxingRef.current = reader;

    const startCamera = async () => {
      try {
        if (!videoRef.current) {
          throw new Error("Camera is not ready.");
        }
        await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          async (result) => {
            if (cancelled) return;
            if (!result) return;
            const code = result.getText().trim();
            const now = Date.now();
            if (!code) return;
            const parsed = parseQrPayload(code);
            const display = parsed ? null : "QR unknown";
            const normalizedRef = parsed?.reference;
            if (normalizedRef && normalizedRef !== lastSeenRef.current) {
              lastSeenRef.current = normalizedRef;
              setScanStatus(display);
            } else if (!normalizedRef) {
              setScanStatus(display);
              return;
            }
            if (
              normalizedRef &&
              (normalizedRef !== lastScanRef.current || now - lastScanTimeRef.current > 2000)
            ) {
              lastScanRef.current = normalizedRef;
              lastScanTimeRef.current = now;
              setTicketCode(normalizedRef);
              if (autoAdd) {
                await addScan(normalizedRef, "scanned", {
                  fromScanner: true,
                  showAlert: true,
                  personsOverride: parsed?.persons,
                });
              }
            }
          }
        );
        return;
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
  }, [autoAdd, cameraOn, canScan]);

  useEffect(() => {
    if (mode === "manual" && cameraOn) {
      setCameraOn(false);
    }
    if (mode === "scan" && !cameraOn) {
      setCameraOn(true);
    }
  }, [cameraOn, mode]);

  useEffect(() => {
    return () => {
      if (manualPhotoUrl) {
        URL.revokeObjectURL(manualPhotoUrl);
      }
    };
  }, [manualPhotoUrl]);

  return (
    <div className="page">
      <h1>Start a tour</h1>
      {err && <p className="error">{err}</p>}
      {loading && <p className="muted">Loading...</p>}

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
          <div className="inline-actions" style={{ justifyContent: "flex-start" }}>
            <button
              className={`button ${mode === "scan" ? "" : "ghost"}`}
              type="button"
              onClick={() => setMode("scan")}
            >
              Scan
            </button>
            <button
              className={`button ${mode === "manual" ? "" : "ghost"}`}
              type="button"
              onClick={() => setMode("manual")}
            >
              Manual entry
            </button>
          </div>
        </div>
      </div>

      {mode === "scan" && (
        <div className="card">
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
      )}

      {mode === "manual" && (
        <div className="card">
          <div className="stack">
            <label className="muted">Photo</label>
            <div className="inline-actions">
              {!manualPhotoUrl && (
                <label className="button ghost" style={{ cursor: "pointer" }}>
                  Take photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (!file) return;
                      if (manualPhotoUrl) URL.revokeObjectURL(manualPhotoUrl);
                      setManualPhoto(file);
                      setManualPhotoUrl(URL.createObjectURL(file));
                    }}
                  />
                </label>
              )}
              {manualPhotoUrl && (
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(manualPhotoUrl);
                    setManualPhoto(null);
                    setManualPhotoUrl(null);
                  }}
                >
                  Remove
                </button>
              )}
            </div>
            {manualPhotoUrl && <img className="photo-preview" src={manualPhotoUrl} alt="Ticket photo" />}
            <label className="muted">Source</label>
            <div className="inline-actions">
              <button
                className={`button ${manualSource === "vic" ? "" : "ghost"}`}
                type="button"
                onClick={() => setManualSource("vic")}
              >
                VIC
              </button>
              <button
                className={`button ${manualSource === "online" ? "" : "ghost"}`}
                type="button"
                onClick={() => setManualSource("online")}
              >
                Online
              </button>
            </div>
            <div className="grid-3">
              <div>
                <label className="muted">Persons</label>
                <input className="input" value={persons} onChange={(e) => setPersons(e.target.value)} />
              </div>
              <div className="inline-actions" style={{ alignItems: "flex-end" }}>
                <button className="button" onClick={onAdd}>
                  Add ticket
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="list">
        {scans.map((scan) => (
          <div key={scan.id} className="list-item">
            <div>
              <strong>{scan.ticket_code}</strong> · {scan.kind === "paper" ? "VIC" : scan.kind} · {scan.persons ?? 1}p
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
