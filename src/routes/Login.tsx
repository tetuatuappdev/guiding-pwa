import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

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
    const storedFirstName = localStorage.getItem("authFirstName");
    const storedLastName = localStorage.getItem("authLastName");
    if (storedEmail) setEmail(storedEmail);
    if (storedPassword) setPassword(storedPassword);
    if (storedFirstName) setInfo((prev) => prev ?? `Welcome back ${storedFirstName}.`);
    if (storedLastName && !storedFirstName) setInfo((prev) => prev ?? `Welcome back.`);
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
    localStorage.setItem("authEmail", normalizedEmail);
    localStorage.setItem("authPassword", password);
    const userId = data.user?.id;
    if (userId) {
      const { data: guides, error: guideErr } = await supabase
        .from("guides")
        .select("id")
        .eq("user_id", userId)
        .limit(1);

      if (guideErr) {
        setErr(guideErr.message);
        return;
      }

      if (!guides?.length) {
        const firstName = localStorage.getItem("authFirstName") ?? "";
        const lastName = localStorage.getItem("authLastName") ?? "";
        const { data: isAdmin, error: adminErr } = await supabase.rpc("check_admin_whitelist", {
          email_input: normalizedEmail,
        });

        if (adminErr) {
          setErr(adminErr.message);
          return;
        }

        const { error: insertErr } = await supabase.from("guides").insert({
          user_id: userId,
          first_name: firstName,
          last_name: lastName,
          is_admin: Boolean(isAdmin),
        });

        if (insertErr) {
          setErr(insertErr.message);
          return;
        }
      }
    }
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
