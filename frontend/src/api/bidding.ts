const API_BASE = ""; // package.json proxy -> http://localhost:8000

export type BiddingRules = {
  bid_amount: number;
  max_budget: number;
  charged_amount: number;
};

export async function getBiddingRules(token: string): Promise<BiddingRules> {
  const res = await fetch(`${API_BASE}/api/bidding`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch bidding rules");
  return (await res.json()) as BiddingRules;
}

export async function updateBiddingRules(
  token: string,
  rules: { bid_amount: number; max_budget: number }
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/bidding`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(rules),
  });
  if (!res.ok) throw new Error("Failed to update bidding rules");
}
