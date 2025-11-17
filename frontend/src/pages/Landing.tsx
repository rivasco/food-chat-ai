import React, { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { isAuthed, getUserType } from "../api/auth";
import { FiUser } from "react-icons/fi";
import { MdRestaurant } from "react-icons/md";
// Some TS setups flag react-icons types; coerce to React.FC to satisfy JSX
const UserIcon = FiUser as unknown as React.FC;
const RestaurantIcon = MdRestaurant as unknown as React.FC;

export default function Landing() {
  const [selected, setSelected] = useState<"user" | "restaurant" | null>(null);
  const authed = isAuthed();
  const type = authed ? getUserType() : null;
  if (authed) {
    return (
      <Navigate to={type === "restaurant" ? "/bidding" : "/app"} replace />
    );
  }
  return (
    <div className="landing-background">
      <div className="landing-wrapper">
        <h1 className="landing-title">Mingle AI</h1>
        <p className="landing-subtitle">
          Chat with your PDFs and collaborate in real-time. Choose your path to
          get started.
        </p>
        <div className="landing-grid">
          <div
            className={`card landing-card selectable ${
              selected === "user" ? "selected" : ""
            }`}
            onClick={() => setSelected(selected === "user" ? null : "user")}
            role="button"
            aria-pressed={selected === "user"}
          >
            <div className="landing-icon" aria-hidden>
              <UserIcon />
            </div>
            <h3 className="mt-0">For Users</h3>
            <p className="landing-desc">
              Chat with your friends and get AI-generated recommendations.
            </p>
            <div className="landing-cta">
              <div className="btn-group">
                <Link
                  to="/login"
                  className="btn btn-primary"
                  onClick={(e) => e.stopPropagation()}
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="btn btn-success"
                  onClick={(e) => e.stopPropagation()}
                >
                  Register
                </Link>
              </div>
            </div>
          </div>
          <div
            className={`card landing-card selectable ${
              selected === "restaurant" ? "selected" : ""
            }`}
            onClick={() =>
              setSelected(selected === "restaurant" ? null : "restaurant")
            }
            role="button"
            aria-pressed={selected === "restaurant"}
          >
            <div className="landing-icon" aria-hidden>
              <RestaurantIcon />
            </div>
            <h3 className="mt-0">For Restaurants</h3>
            <p className="landing-desc">
              Manage bidding, track charges, and reach new customers.
            </p>
            <div className="landing-cta">
              <div className="btn-group">
                <Link
                  to="/login/restaurant"
                  className="btn btn-primary"
                  onClick={(e) => e.stopPropagation()}
                >
                  Log in
                </Link>
                <Link
                  to="/register/restaurant"
                  className="btn btn-success"
                  onClick={(e) => e.stopPropagation()}
                >
                  Register
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
