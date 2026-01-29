import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const storedEmail = localStorage.getItem("authEmail");
    const storedPassword = localStorage.getItem("authPassword");
    const storedFirstName = localStorage.getItem("authFirstName");
    const storedLastName = localStorage.getItem("authLastName");
    if (storedEmail) setEmail(storedEmail);
    if (storedPassword) setPassword(storedPassword);
    if (storedFirstName) setFirstName(storedFirstName);
    if (storedLastName) setLastName(storedLastName);
  }, []);

  const onSignUp = async () => {
    setErr(null);
    setMessage(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErr("Email is required.");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setErr("First name and last name are required.");
      return;
    }
    if (!password) {
      setErr("Password is required.");
      return;
    }
    if (password !== confirmPassword) {
      setErr("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { data: allowed, error: inviteErr } = await supabase.rpc("check_invite_allowlist", {
      email_input: normalizedEmail,
    });

    if (inviteErr) {
      setErr(inviteErr.message);
      setLoading(false);
      return;
    }
    if (!allowed) {
      setErr("This email is not on the invite list.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login?confirmed=1`,
      },
    });
    setLoading(false);
    if (error) return setErr(error.message);

    localStorage.setItem("authEmail", normalizedEmail);
    localStorage.setItem("authPassword", password);
    localStorage.setItem("authFirstName", firstName.trim());
    localStorage.setItem("authLastName", lastName.trim());
    setMessage("Check your email to confirm your account, then sign in.");
  };

  return (
    <div className="auth-shell">
      <div className="card">
        <h1>Sign up</h1>
        <p className="muted">Create your guide account.</p>
        <div className="stack">
          <input
            className="input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input"
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <input
            className="input"
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <input
            className="input"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            className="input"
            placeholder="Confirm password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <button className="button" onClick={onSignUp} disabled={loading}>
            {loading ? "Sending invite..." : "Create account"}
          </button>
        </div>
        {message && <p className="muted">{message}</p>}
        {err && <p className="error">{err}</p>}
        <p className="muted" style={{ marginTop: 12 }}>
          Already have an account?{" "}
          <Link className="auth-link" to="/login">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
