import React, { useState, useRef, useEffect } from "react";
import { fetchWithAuth } from "../api/fetchWithAuth.ts";
import { getUserEmail } from "../api/auth.ts";
import axios from "axios";

interface Message {
  id: number;
  content: string;
  sender: "user" | "bot" | "system";
  sender_email?: string | null;
}

interface Chat {
  id: number;
  title: string;
  last_updated: string;
  owner_email?: string; // added for sidebar display
}

interface PDF {
  id: number;
  filename: string;
}

interface User {
  id: number;
  email: string;
}

export default function ChatUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedPdfs, setUploadedPdfs] = useState<PDF[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<number | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [selectedInviteEmails, setSelectedInviteEmails] = useState<string[]>(
    []
  );
  const [newChatTitle, setNewChatTitle] = useState("New Chat");
  const [showMembers, setShowMembers] = useState(false);
  const [showCreateChatModal, setShowCreateChatModal] = useState(false);
  const [chatMembers, setChatMembers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const currentUserEmail = getUserEmail();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const didMountRef = useRef(false);

  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  };

  useEffect(() => {
    // Avoid auto-scroll on first render so the top nav remains visible
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    scrollToBottom();
  }, [messages]);

  const loadPdfs = async () => {
    try {
      const response = await axios.get<{ pdfs: PDF[] }>(
        "http://localhost:8000/pdfs"
      );
      setUploadedPdfs(response.data.pdfs);
    } catch (error) {
      console.error("Error loading PDFs:", error);
    }
  };

  const loadChats = async () => {
    try {
      const res = await fetchWithAuth("/chats");
      if (!res.ok) return;
      const data = await res.json();
      setChats(data.chats || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadAllUsers = async () => {
    try {
      const res = await fetchWithAuth("/users");
      if (!res.ok) return;
      const data = await res.json();
      setAllUsers(data || []);
    } catch (e) {
      console.error("Error loading users:", e);
    }
  };

  const loadChatMessages = async (chatId: number) => {
    try {
      const res = await fetchWithAuth(`/chats/${chatId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (e) {
      console.error(e);
    }
  };

  const createNewChat = async () => {
    if (!newChatTitle.trim()) return;
    try {
      const res = await fetchWithAuth("/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newChatTitle }),
      });
      if (!res.ok) {
        setNotification("Failed to create chat.");
        return;
      }
      const data = await res.json();
      setCurrentChatId(data.chat_id);
      setMessages([]);
      await loadChats();
      setNotification(`Chat "${newChatTitle}" created!`);
      setNewChatTitle("New Chat");
      setShowCreateChatModal(false);
    } catch (e) {
      console.error("Error creating chat:", e);
      setNotification("An error occurred while creating the chat.");
    }
  };

  const handleShowMembers = async () => {
    if (!currentChatId) return;
    try {
      const res = await fetchWithAuth(`/chats/${currentChatId}/members`);
      if (!res.ok) return;
      const data = await res.json();
      setChatMembers(data.members || []);
      setShowMembers(true);
    } catch (e) {
      console.error("Error fetching members:", e);
    }
  };

  const loadChatMembersForInvite = async () => {
    if (!currentChatId) return;
    try {
      const res = await fetchWithAuth(`/chats/${currentChatId}/members`);
      if (!res.ok) return;
      const data = await res.json();
      setChatMembers(data.members || []);
    } catch (e) {
      console.error("Error fetching members:", e);
    }
  };

  const inviteUsers = async () => {
    if (!currentChatId || selectedInviteEmails.length === 0) return;
    try {
      const res = await fetchWithAuth(`/chats/${currentChatId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: selectedInviteEmails }),
      });
      if (!res.ok) {
        console.error(await res.text());
        setNotification("Failed to invite users.");
      } else {
        const data = await res.json();
        setNotification(data.message || "Users invited successfully!");
      }
    } catch (e) {
      console.error(e);
      setNotification("An error occurred while inviting users.");
    } finally {
      setShowInvite(false);
      setSelectedInviteEmails([]);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;
    const userMessage: Message = {
      id: Date.now(),
      content: inputMessage,
      sender: "user",
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);
    try {
      const res = await fetchWithAuth("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: inputMessage, chat_id: currentChatId }),
      });
      if (!res.ok) throw new Error("Send failed");
      const data = await res.json();
      const botMessage: Message = {
        id: Date.now() + 1,
        content: data.response,
        sender: "bot",
        sender_email: "AI",
      };
      setMessages((prev) => [...prev, botMessage]);
      if (!currentChatId && data.chat_id) {
        setCurrentChatId(data.chat_id);
        await loadChats();
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, content: "Error.", sender: "bot" },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Initial loads
  useEffect(() => {
    loadPdfs();
    loadChats();
    loadAllUsers();
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const inviteOptions = allUsers.filter(
    (u) => !chatMembers.some((m) => m.email === u.email)
  );

  const currentChat = chats.find((c) => c.id === currentChatId);

  return (
    <div className="app">
      {notification && <div className="toast-notification">{notification}</div>}
      <div className="header">
        <div className="header-left">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            ☰
          </button>
          <button
            className="new-chat-button"
            onClick={() => setShowCreateChatModal(true)}
          >
            + Chat
          </button>
          {currentChatId && (
            <>
              <button
                className="new-chat-button"
                style={{ background: "rgba(255,255,255,0.25)" }}
                onClick={() => {
                  loadChatMembersForInvite().then(() => setShowInvite(true));
                }}
              >
                Invite
              </button>
              <button
                className="new-chat-button"
                style={{ background: "rgba(255,255,255,0.25)" }}
                onClick={handleShowMembers}
              >
                Members
              </button>
            </>
          )}
          <h1>{currentChat ? currentChat.title : "Group Chat"}</h1>
        </div>
        <div className="upload-section">
          <input
            type="file"
            accept=".pdf"
            // onChange={handleFileUpload}
            disabled={isUploading}
            id="file-upload"
            style={{ display: "none" }}
          />
          <label htmlFor="file-upload" className="upload-button">
            {isUploading ? "Uploading..." : "Upload PDF"}
          </label>
        </div>
      </div>
      <div className="main-content">
        {sidebarOpen && (
          <div className="sidebar">
            <div className="sidebar-header">
              <h3>Your Chats</h3>
              <button
                className="close-sidebar"
                onClick={() => setSidebarOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="chat-list">
              {chats.length === 0 ? (
                <p className="no-chats">No chats yet</p>
              ) : (
                chats.map((chat) => (
                  <div
                    key={chat.id}
                    className={`chat-item ${
                      currentChatId === chat.id ? "active" : ""
                    }`}
                    onClick={() => {
                      setCurrentChatId(chat.id);
                      loadChatMessages(chat.id);
                    }}
                  >
                    <div className="chat-info">
                      <span className="chat-title">{chat.title}</span>
                      <span className="chat-date">
                        {new Date(chat.last_updated).toLocaleDateString()}
                      </span>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "#555",
                          fontStyle: "italic",
                        }}
                      >
                        owner: {chat.owner_email}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="sidebar-footer">
              <h4>PDFs</h4>
              <div className="pdf-list">
                {uploadedPdfs.length === 0 ? (
                  <p className="no-pdfs">No PDFs</p>
                ) : (
                  uploadedPdfs.map((pdf) => (
                    <div key={pdf.id} className="pdf-item">
                      <span className="pdf-name">📄 {pdf.filename}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
        <div className="chat-container">
          <div className="messages" ref={messagesContainerRef}>
            {messages.length === 0 && (
              <div className="welcome-message">
                <p>Select or create a chat to start.</p>
              </div>
            )}
            {messages.map((msg) => {
              const mine =
                msg.sender === "user" && msg.sender_email === currentUserEmail;
              return (
                <div
                  key={msg.id}
                  className={`message ${
                    mine ? "user" : msg.sender === "bot" ? "bot" : "system"
                  }`}
                >
                  <div className="message-content">
                    {msg.sender === "user" && (
                      <div
                        style={{
                          fontSize: "0.65rem",
                          opacity: 0.8,
                          marginBottom: 4,
                        }}
                      >
                        {mine ? "You" : msg.sender_email || "User"}
                      </div>
                    )}
                    <div
                      dangerouslySetInnerHTML={{
                        __html: msg.content.replace(/\n/g, "<br>"),
                      }}
                    />
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <div className="input-container">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                currentChatId ? "Type..." : "Create or select a chat first"
              }
              disabled={isUploading || !currentChatId}
              rows={1}
            />
            <button
              onClick={sendMessage}
              disabled={!inputMessage.trim() || isLoading || !currentChatId}
              className="send-button"
            >
              Send
            </button>
          </div>
        </div>
      </div>
      {showCreateChatModal && (
        <div className="popup-backdrop">
          <div className="popup-container" style={{ width: 360 }}>
            <h3 style={{ marginTop: 0 }}>Create New Chat</h3>
            <p style={{ fontSize: "0.8rem", color: "#555" }}>
              Enter a title for your new group chat.
            </p>
            <input
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #ccc",
                margin: "8px 0 16px",
              }}
              value={newChatTitle}
              onChange={(e) => setNewChatTitle(e.target.value)}
              placeholder="E.g., Q3 Earnings Analysis"
              onKeyPress={(e) => e.key === "Enter" && createNewChat()}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="popup-button"
                style={{ flex: 1, background: "#0ea5e9" }}
                onClick={createNewChat}
              >
                Create
              </button>
              <button
                className="popup-button"
                style={{ flex: 1, background: "#64748b" }}
                onClick={() => {
                  setShowCreateChatModal(false);
                  setNewChatTitle("New Chat");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {showInvite && (
        <div className="popup-backdrop">
          <div className="popup-container" style={{ width: 360 }}>
            <h3 style={{ marginTop: 0 }}>Invite users</h3>
            <p style={{ fontSize: "0.8rem", color: "#555" }}>
              Select users to add to this chat.
            </p>
            <select
              multiple
              style={{
                width: "100%",
                minHeight: 120,
                padding: 10,
                borderRadius: 8,
                border: "1px solid #ccc",
              }}
              value={selectedInviteEmails}
              onChange={(e) =>
                setSelectedInviteEmails(
                  Array.from(e.target.selectedOptions, (option) => option.value)
                )
              }
            >
              {inviteOptions.map((user) => (
                <option key={user.id} value={user.email}>
                  {user.email}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                className="popup-button"
                style={{ flex: 1, background: "#0ea5e9" }}
                onClick={inviteUsers}
              >
                Add
              </button>
              <button
                className="popup-button"
                style={{ flex: 1, background: "#64748b" }}
                onClick={() => {
                  setShowInvite(false);
                  setSelectedInviteEmails([]);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {showMembers && (
        <div className="popup-backdrop">
          <div className="popup-container" style={{ width: 360 }}>
            <h3 style={{ marginTop: 0 }}>Chat Members</h3>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "12px 0",
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {chatMembers.map((member) => (
                <li
                  key={member.id}
                  style={{
                    padding: "6px 0",
                    borderBottom: "1px solid #eee",
                    fontSize: "0.9rem",
                  }}
                >
                  {member.email}
                </li>
              ))}
            </ul>
            <button
              className="popup-button"
              style={{ background: "#64748b" }}
              onClick={() => setShowMembers(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
