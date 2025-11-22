import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerRestaurant } from "api/auth";

const RestaurantRegister: React.FC = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [showPopup, setShowPopup] = useState(false);
  const navigate = useNavigate();

  const CUISINE_OPTIONS = [
    "Italian",
    "Chinese",
    "Japanese",
    "Mexican",
    "Indian",
    "Thai",
    "French",
    "American",
    "Mediterranean",
    "Korean",
    "Vietnamese",
    "Other",
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await registerRestaurant({
        name,
        email,
        password,
        website,
        cuisine,
        location,
      });
      setShowPopup(true);
    } catch (err) {
      setError("Failed to register. Please try again.");
    }
  };

  const handleContinue = () => {
    setShowPopup(false);
    navigate("/login/restaurant");
  };

  return (
    <div className="card">
      <h2 className="mt-0">Restaurant Registration</h2>
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-row">
          <input
            className="form-input"
            placeholder="Restaurant Name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="form-row">
          <input
            className="form-input"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="form-row">
          <input
            className="form-input"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="form-row">
          <input
            className="form-input"
            placeholder="Restaurant Website"
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            required
          />
        </div>
        <div className="form-row">
          <select
            className="form-input"
            value={cuisine}
            onChange={(e) => setCuisine(e.target.value)}
            required
          >
            <option value="" disabled>
              Select Cuisine
            </option>
            {CUISINE_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <input
            className="form-input"
            placeholder="Location (e.g., Santa Monica, CA)"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-error mt-8">{error}</p>}
        <button type="submit" className="btn btn-success mt-8">
          Create restaurant account
        </button>
      </form>
      {showPopup && (
        <div className="popup-backdrop">
          <div className="popup-container">
            <h3 style={{ marginTop: 0 }}>Registration successful!</h3>
            <p style={{ margin: "8px 0 16px" }}>
              Your restaurant account has been created.
            </p>
            <button className="popup-button" onClick={handleContinue}>
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RestaurantRegister;
