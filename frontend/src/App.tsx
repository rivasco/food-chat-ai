import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
} from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import RestaurantRegister from "./pages/RestaurantRegister";
import Bidding from "./pages/Bidding";
import ChatUI from "./components/ChatUI";
import {
  isAuthed,
  logout,
  getUserUsername,
  getRestaurantName,
  getUserType,
} from "./api/auth";
import "./App.css";

function RequireAuth() {
  if (!isAuthed()) {
    return <Navigate to="/login" replace />;
  }
  const userType = getUserType();
  if (userType === "restaurant") {
    return <Navigate to="/bidding" replace />;
  }
  return <Outlet />;
}

function RequireRestaurantAuth() {
  if (!isAuthed()) {
    return <Navigate to="/login/restaurant" replace />;
  }
  const userType = getUserType();
  if (userType !== "restaurant") {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function ChatPage() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const username = getUserUsername() || "User";

  return (
    <div>
      <div className="topnav">
        <div className="topnav-left">
          <span className="brand">Mingle AI</span>
        </div>
        <div className="topnav-right">
          <div className="profile">
            <button
              className="avatar-button"
              aria-haspopup="true"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              title={username}
            >
              <span className="avatar-letter">
                {(username || "U").charAt(0).toUpperCase()}
              </span>
            </button>
            {menuOpen && (
              <div className="dropdown" role="menu">
                <div className="dropdown-email">{username}</div>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    logout();
                    setMenuOpen(false);
                    navigate("/");
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <ChatUI />
    </div>
  );
}

function RestaurantPage() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const restaurantName = getRestaurantName() || "Restaurant";

  return (
    <div>
      <div className="topnav">
        <div className="topnav-left">
          <span className="brand">Mingle AI</span>
        </div>
        <div className="topnav-right">
          <div className="profile">
            <button
              className="avatar-button"
              aria-haspopup="true"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              title={restaurantName}
            >
              <span className="avatar-letter">
                {(restaurantName || "R").charAt(0).toUpperCase()}
              </span>
            </button>
            {menuOpen && (
              <div className="dropdown" role="menu">
                <div className="dropdown-email">{restaurantName}</div>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    logout();
                    setMenuOpen(false);
                    navigate("/");
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <Bidding />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<RequireAuth />}>
          <Route path="/app" element={<ChatPage />} />
        </Route>
        <Route element={<RequireRestaurantAuth />}>
          <Route path="/bidding" element={<RestaurantPage />} />
        </Route>
        <Route path="/login" element={<Login />} />
        <Route
          path="/login/restaurant"
          element={<Login isRestaurant={true} />}
        />
        <Route path="/register" element={<Register />} />
        <Route path="/register/restaurant" element={<RestaurantRegister />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
