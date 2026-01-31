import { useNavigate } from "react-router-dom";
import ProfileModal from "../components/ProfileModal";
import { isGuestSession } from "../lib/guest";

export default function Profile() {
  const navigate = useNavigate();
  if (isGuestSession()) {
    return (
      <div className="page">
        <h1>Profile</h1>
        <p className="muted">Guest mode</p>
        <div className="card">
          <div className="stack">
            <label className="muted">First name</label>
            <input className="input" value="Guest" disabled />
            <label className="muted">Last name</label>
            <input className="input" value="" disabled />
            <label className="muted">Sort code</label>
            <input className="input" value="" disabled />
            <label className="muted">Account number</label>
            <input className="input" value="" disabled />
          </div>
        </div>
      </div>
    );
  }
  return <ProfileModal open onClose={() => navigate("/schedule", { replace: true })} />;
}
