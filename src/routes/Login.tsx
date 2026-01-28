import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onLogin = async () => {
    setErr(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (error) return setErr(error.message);
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
        {err && <p className="error">{err}</p>}
      </div>
    </div>
  );
}
