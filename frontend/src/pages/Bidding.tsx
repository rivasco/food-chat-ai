import React, { useState, useEffect } from "react";
import { getBiddingRules, updateBiddingRules } from "api/bidding";
import { getToken } from "api/auth";

const Bidding: React.FC = () => {
  const [bidAmountStr, setBidAmountStr] = useState("");
  const [maxBudgetStr, setMaxBudgetStr] = useState("");
  const [chargedAmount, setChargedAmount] = useState(0);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const fetchBiddingRules = async () => {
      try {
        const token = getToken();
        if (!token) {
          setError("Authentication token not found.");
          return;
        }
        const rules = await getBiddingRules(token);
        setBidAmountStr(String(rules.bid_amount ?? ""));
        setMaxBudgetStr(String(rules.max_budget ?? ""));
        setChargedAmount(rules.charged_amount);
      } catch (err) {
        setError("Failed to fetch bidding rules.");
      }
    };

    fetchBiddingRules();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    // clear toast and errors
    setToast(null);
    try {
      const token = getToken();
      if (!token) {
        setError("Authentication token not found.");
        return;
      }
      const bid = parseFloat(bidAmountStr);
      const max = parseFloat(maxBudgetStr);
      if (isNaN(bid) || isNaN(max)) {
        setError("Please enter valid numbers.");
        return;
      }
      await updateBiddingRules(token, {
        bid_amount: bid,
        max_budget: max,
      });
      setToast("Bidding rules updated");
      window.setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setError("Failed to update bidding rules.");
    }
  };

  return (
    <>
      {toast && <div className="toast-notification">{toast}</div>}
      <div className="card">
        <h2 className="mt-0">Bidding Settings</h2>
        <p className="muted mt-0 mb-16">
          Set your bid per recommendation and your maximum monthly budget.
        </p>
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label className="form-label">Bid Amount ($)</label>
            <input
              className="form-input"
              type="number"
              step={1}
              min={0}
              value={bidAmountStr}
              onChange={(e) => setBidAmountStr(e.target.value)}
              required
            />
          </div>
          <div className="form-row">
            <label className="form-label">Max Monthly Budget ($)</label>
            <input
              className="form-input"
              type="number"
              step={1}
              min={0}
              value={maxBudgetStr}
              onChange={(e) => setMaxBudgetStr(e.target.value)}
              required
            />
          </div>
          <div className="form-row">
            <label className="form-label">Amount Charged This Month ($)</label>
            <input
              className="form-input"
              type="number"
              readOnly
              value={Number.isFinite(chargedAmount) ? chargedAmount : 0}
            />
          </div>
          {error && <p className="text-error mt-8">{error}</p>}

          <button type="submit" className="btn btn-primary mt-8">
            Save changes
          </button>
        </form>
      </div>
    </>
  );
};

export default Bidding;
