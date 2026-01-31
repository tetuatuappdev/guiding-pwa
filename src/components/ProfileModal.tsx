import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { isGuestSession } from "../lib/guest";
import { registerWebPush } from "../lib/webPush";

type GuideRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  sort_code: string | null;
  account_number: string | null;
};

type ProfileModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function ProfileModal({ open, onClose }: ProfileModalProps) {
  const [guideId, setGuideId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [sortCode, setSortCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [initial, setInitial] = useState({
    firstName: "",
    lastName: "",
    sortCode: "",
    accountNumber: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (isGuestSession()) {
      setLoading(false);
      setErr(null);
      setMsg(null);
      setGuideId(null);
      setFirstName("Guest");
      setLastName("");
      setSortCode("");
      setAccountNumber("");
      setInitial({
        firstName: "Guest",
        lastName: "",
        sortCode: "",
        accountNumber: "",
      });
      return;
    }
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

      const gid = guides?.[0]?.id;
      if (!gid) {
        setErr("No guide profile linked to this user.");
        setLoading(false);
        return;
      }

      setGuideId(gid);

      const { data: guide, error: dErr } = await supabase
        .from("guides")
        .select("id, first_name, last_name, sort_code, account_number")
        .eq("id", gid)
        .maybeSingle();

      if (dErr) {
        setErr(dErr.message);
        setLoading(false);
        return;
      }

      const row = guide as GuideRow | null;
      setFirstName(row?.first_name ?? "");
      setLastName(row?.last_name ?? "");
      setSortCode(row?.sort_code ?? "");
      setAccountNumber(row?.account_number ?? "");
      setInitial({
        firstName: row?.first_name ?? "",
        lastName: row?.last_name ?? "",
        sortCode: row?.sort_code ?? "",
        accountNumber: row?.account_number ?? "",
      });
      setLoading(false);
    })();
  }, [open]);

  const isDirty = useMemo(
    () =>
      firstName !== initial.firstName ||
      lastName !== initial.lastName ||
      sortCode !== initial.sortCode ||
      accountNumber !== initial.accountNumber,
    [accountNumber, firstName, initial, lastName, sortCode]
  );

  const onCloseModal = () => {
    if (isDirty && !window.confirm("You have unsaved changes. Close anyway?")) {
      return;
    }
    setMsg(null);
    onClose();
  };

  const onSave = async () => {
    setErr(null);
    setMsg(null);
    if (!guideId) return;
    setSaving(true);
    const { error } = await supabase
      .from("guides")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        sort_code: sortCode.trim(),
        account_number: accountNumber.trim(),
      })
      .eq("id", guideId);

    if (error) {
      setErr(error.message);
      setSaving(false);
      return;
    }

    setInitial({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      sortCode: sortCode.trim(),
      accountNumber: accountNumber.trim(),
    });
    setMsg("Profile updated.");
    setSaving(false);
  };

  const onEnableNotifications = async () => {
    setPushMsg(null);
    try {
      await registerWebPush();
      setPushMsg("Notifications enabled.");
    } catch (e: any) {
      setPushMsg(e?.message ?? "Failed to enable notifications.");
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="inline-actions">
          <h1 style={{ margin: 0 }}>Profile</h1>
          <button className="button ghost" type="button" onClick={onCloseModal} style={{ marginLeft: "auto" }}>
            Close
          </button>
        </div>
        <p className="muted">Update your guide profile.</p>
        {err && <p className="error">{err}</p>}
        {msg && <p className="muted">{msg}</p>}
        {pushMsg && <p className="muted">{pushMsg}</p>}
        {loading && <p className="muted">Loading...</p>}

        <div className="card">
          <div className="stack">
            <label className="muted">First name</label>
            <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <label className="muted">Last name</label>
            <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            <label className="muted">Sort code</label>
            <input className="input" value={sortCode} onChange={(e) => setSortCode(e.target.value)} />
            <label className="muted">Account number</label>
            <input className="input" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
            <button className="button" onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button className="button ghost" type="button" onClick={onEnableNotifications}>
              Enable notifications
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
