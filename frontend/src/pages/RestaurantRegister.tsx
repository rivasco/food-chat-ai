import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerRestaurant } from "api/auth";

const RestaurantRegister: React.FC = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await registerRestaurant({ name, email, password, website });
      navigate("/login/restaurant");
    } catch (err) {
      setError("Failed to register. Please try again.");
    }
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
        {error && <p className="text-error mt-8">{error}</p>}
        <button type="submit" className="btn btn-success mt-8">
          Create restaurant account
        </button>
      </form>
    </div>
  );
};

export default RestaurantRegister;
