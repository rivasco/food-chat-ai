const API_BASE = ""; // package.json proxy -> http://localhost:8000

export type AuthResponse = {
  access_token: string;
  token_type: string;
  username: string;
};

export type AuthRestaurantResponse = {
  access_token: string;
  token_type: string;
  name: string;
};

export async function register(
  email: string,
  username: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password }),
  });
  if (!res.ok) throw new Error((await res.text()) || "Registration failed");
  const data = (await res.json()) as AuthResponse;
  localStorage.setItem("token", data.access_token);
  localStorage.setItem("email", email);
  localStorage.setItem("username", data.username);
  localStorage.setItem("userType", "user");
  return data;
}

export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error((await res.text()) || "Login failed");
  const data = (await res.json()) as AuthResponse;
  localStorage.setItem("token", data.access_token);
  localStorage.setItem("email", email);
  localStorage.setItem("username", data.username);
  localStorage.setItem("userType", "user");
  return data;
}

export async function registerRestaurant(body: {
  name: string;
  email: string;
  password: string;
  website?: string;
  cuisine?: string;
  location?: string;
}): Promise<AuthRestaurantResponse> {
  const res = await fetch(`${API_BASE}/api/register_restaurant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.text()) || "Registration failed");
  const data = (await res.json()) as AuthRestaurantResponse;
  localStorage.setItem("token", data.access_token);
  localStorage.setItem("email", body.email);
  localStorage.setItem("restaurantName", data.name);
  localStorage.setItem("userType", "restaurant");
  return data;
}

export async function loginRestaurant(
  email: string,
  password: string
): Promise<AuthRestaurantResponse> {
  const res = await fetch(`${API_BASE}/api/login_restaurant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error((await res.text()) || "Login failed");
  const data = (await res.json()) as AuthRestaurantResponse;
  localStorage.setItem("token", data.access_token);
  localStorage.setItem("email", email);
  localStorage.setItem("restaurantName", data.name);
  localStorage.setItem("userType", "restaurant");
  return data;
}

export function isAuthed() {
  return Boolean(localStorage.getItem("token"));
}

export function getUserEmail(): string | null {
  return localStorage.getItem("email");
}

export function getUserUsername(): string | null {
  return localStorage.getItem("username");
}

export function getRestaurantName(): string | null {
  return localStorage.getItem("restaurantName");
}

export function getUserType(): string | null {
  return localStorage.getItem("userType");
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("email");
  localStorage.removeItem("username");
  localStorage.removeItem("restaurantName");
  localStorage.removeItem("userType");
}

export function getToken(): string | null {
  return localStorage.getItem("token");
}
