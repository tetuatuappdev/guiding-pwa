import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearGuestSession, isGuestAllowed } from "../lib/guest";
import { supabase } from "../lib/supabase";
import { registerWebPush } from "../lib/webPush";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const storedEmail = localStorage.getItem("authEmail");
    const storedPassword = localStorage.getItem("authPassword");
    if (storedEmail) setEmail(storedEmail);
    if (storedPassword) setPassword(storedPassword);
  }, []);

  useEffect(() => {
    const message = sessionStorage.getItem("authMessage");
    if (message) {
      setInfo(message);
      sessionStorage.removeItem("authMessage");
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("confirmed") === "1") {
      setInfo("Email confirmed. Please sign in.");
      window.history.replaceState({}, document.title, "/login");
      return;
    }
    const hasAccessToken =
      window.location.hash.includes("access_token") ||
      window.location.search.includes("access_token=");
    if (!hasAccessToken) return;
    supabase.auth.signOut().finally(() => {
      setInfo("Email confirmed. Please sign in.");
      window.history.replaceState({}, document.title, "/login");
    });
  }, []);

  const onLogin = async () => {
    setErr(null);
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    setLoading(false);
    if (error) return setErr(error.message);
    if (data?.session?.access_token) {
      console.log("PWA access token:", data.session.access_token);
    }
    localStorage.setItem("authEmail", normalizedEmail);
    localStorage.setItem("authPassword", password);
    const userId = data.user?.id;
    if (userId) {
      const firstName = (localStorage.getItem("authFirstName") ?? "").trim();
      const lastName = (localStorage.getItem("authLastName") ?? "").trim();
      if (!firstName || !lastName) {
        setErr("Missing profile name. Please sign up again.");
        return;
      }

      const { error: ensureErr } = await supabase.rpc("ensure_guide_profile", {
        first_name_input: firstName,
        last_name_input: lastName,
        email_input: normalizedEmail,
      });

      if (ensureErr) {
        setErr(ensureErr.message);
        return;
      }
    }
    navigate("/schedule", { replace: true });
  };

  const onGuest = async () => {
    setErr(null);
    setLoading(true);
    clearGuestSession();
    const { error } = await supabase.auth.signInWithPassword({
      email: "sylvain.chester@gmail.com",
      password: "12345678",
    });
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    registerWebPush().catch(() => {});
    navigate("/schedule", { replace: true });
  };

  return (
    <div className="auth-shell">
      <div className="card">
        <h1>Sign in</h1>
        <p className="muted">Use your guide account to continue.</p>
        <div className="stack">
          <input
            className="input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="button" onClick={onLogin} disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
          {isGuestAllowed() && (
            <button
              className="button ghost"
              type="button"
              onClick={onGuest}
            >
              Enter as a guest
            </button>
          )}
        </div>
        {info && <p className="muted">{info}</p>}
        <p className="muted" style={{ marginTop: 12 }}>
          No account?{" "}
          <Link className="auth-link" to="/signup">
            Sign up
          </Link>
        </p>
        {err && <p className="error">{err}</p>}
      </div>
    </div>
  );
}
