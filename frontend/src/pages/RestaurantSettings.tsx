import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchWithAuth } from "../api/fetchWithAuth";
import { logout } from "../api/auth";

export default function RestaurantSettings() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleDelete = async () => {
    try {
      const res = await fetchWithAuth("/api/restaurant", {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to delete account.");
      }

      logout();
      navigate("/");
    } catch (err: any) {
      setError(err.message);
      setShowConfirm(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-form">
        <h2 className="auth-title">Restaurant Settings</h2>
        <div
          style={{
            borderTop: "1px solid #eee",
            paddingTop: "20px",
            marginTop: "20px",
          }}
        >
          <h3 style={{ color: "#ef4444" }}>Danger Zone</h3>
          <p style={{ fontSize: "0.9rem", color: "#555" }}>
            This action is permanent and cannot be undone. This will permanently
            delete your account and all associated data.
          </p>
          <button
            onClick={() => setShowConfirm(true)}
            className="auth-button"
            style={{ background: "#ef4444", width: "100%" }}
          >
            Delete My Account
          </button>
          {error && <p className="error-message">{error}</p>}
        </div>
      </div>

      {showConfirm && (
        <div className="popup-backdrop">
          <div className="popup-container" style={{ width: 380 }}>
            <h3 style={{ marginTop: 0 }}>Are you sure?</h3>
            <p style={{ margin: "8px 0 16px" }}>
              This will permanently delete your restaurant account. This action
              cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                className="popup-button"
                style={{ flex: 1, background: "#ef4444" }}
                onClick={handleDelete}
              >
                Yes, Delete My Account
              </button>
              <button
                className="popup-button"
                style={{ flex: 1, background: "#64748b" }}
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
