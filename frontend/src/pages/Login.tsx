import React, { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { login, loginRestaurant, isAuthed, getUserType } from "../api/auth";

export default function Login({
  isRestaurant = false,
}: {
  isRestaurant?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  if (isAuthed()) {
    const userType = getUserType();
    if (userType === "restaurant") {
      return <Navigate to="/bidding" replace />;
    }
    return <Navigate to="/app" replace />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      if (isRestaurant) {
        await loginRestaurant(email, password);
        navigate("/bidding");
      } else {
        await login(email, password);
        navigate("/app");
      }
    } catch (e: any) {
      setErr(e.message || "Login failed");
    }
  };

  return (
    <div
      style={{
        maxWidth: 400,
        margin: "80px auto",
        padding: 24,
        background: "white",
        borderRadius: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      }}
    >
      <h2 style={{ marginTop: 0 }}>
        {isRestaurant ? "Restaurant Login" : "Login"}
      </h2>
      <form onSubmit={onSubmit}>
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{
            width: "100%",
            padding: 10,
            marginBottom: 12,
            borderRadius: 6,
            border: "1px solid #ccc",
          }}
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{
            width: "100%",
            padding: 10,
            marginBottom: 12,
            borderRadius: 6,
            border: "1px solid #ccc",
          }}
        />
        <button
          type="submit"
          style={{
            width: "100%",
            padding: 12,
            background: "#0ea5e9",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Login
        </button>
      </form>
      {err && <p style={{ color: "red", marginTop: 12 }}>{err}</p>}
      <p style={{ marginTop: 16, textAlign: "center" }}>
        No account?{" "}
        <Link to={isRestaurant ? "/register/restaurant" : "/register"}>
          Register
        </Link>
      </p>
      <p style={{ marginTop: 16, textAlign: "center" }}>
        {isRestaurant ? (
          <Link to="/login">User Login</Link>
        ) : (
          <Link to="/login/restaurant">Restaurant Login</Link>
        )}
      </p>
    </div>
  );
}
