import React, { useState, useRef, useEffect } from "react";
import { fetchWithAuth } from "../api/fetchWithAuth";
import { getUserUsername, getToken } from "../api/auth";
import axios from "axios";
import ReactMarkdown from "react-markdown";

interface Message {
  id: number;
  content: string;
  sender: "user" | "bot" | "system";
  sender_username?: string | null;
}

interface Chat {
  id: number;
  title: string;
  last_updated: string;
  owner_username?: string;
}

interface PDF {
  id: number;
  filename: string;
}

interface User {
  id: number;
  email: string;
  username: string;
}

export default function ChatUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingBot, setPendingBot] = useState(false);
  const [uploadedPdfs, setUploadedPdfs] = useState<PDF[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");

  // Mention autocomplete state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const currentUserUsername = getUserUsername();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const didMountRef = useRef(false);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!currentChatId) {
      return;
    }

    const token = getToken();
    if (!token) return;

    // Determine WebSocket protocol
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Backend is on port 8000, not window.location.host which is 3000
    const wsHost = window.location.hostname;
    const wsUrl = `${wsProtocol}//${wsHost}:8000/ws/${currentChatId}?token=${token}`;

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log("WebSocket connected");
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      setMessages((prev) => {
        let next = [...prev];
        // If a real bot message arrives, remove any loading placeholder and append it
        if (message.sender === "bot") {
          setPendingBot(false);
          next = next.filter((m) => !(m as any).loading);
          next.push(message);
          return next;
        }
        // Append incoming non-bot message
        next.push(message);
        // After our own @recme message echo, append loader as the last item (no duplicates)
        if (
          message.sender === "user" &&
          message.sender_username === currentUserUsername &&
          /@recme\b/i.test(message.content || "") &&
          !next.some((m: any) => m.loading)
        ) {
          next.push({
            id: -1,
            content: "",
            sender: "bot",
            sender_username: "Mingle AI",
            loading: true,
          } as any);
        }
        return next;
      });
    };

    ws.current.onclose = () => {
      console.log("WebSocket disconnected");
    };

    ws.current.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    // Cleanup on component unmount or when chat changes
    return () => {
      ws.current?.close();
    };
  }, [currentChatId]);

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

  const removeMember = async (memberId: number) => {
    if (!currentChatId) return;
    try {
      const res = await fetchWithAuth(
        `/chats/${currentChatId}/members/${memberId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        setNotification("Failed to remove member.");
      } else {
        setNotification("Member removed.");
        // Refresh member list
        const newMembers = chatMembers.filter((m) => m.id !== memberId);
        setChatMembers(newMembers);
      }
    } catch (e) {
      console.error("Error removing member:", e);
      setNotification("An error occurred while removing the member.");
    }
  };

  const deleteChat = async () => {
    if (!chatToDelete) return;
    try {
      const res = await fetchWithAuth(`/chats/${chatToDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setNotification("Failed to delete chat.");
      } else {
        setNotification(`Chat "${chatToDelete.title}" deleted.`);
        setChats((prev) => prev.filter((c) => c.id !== chatToDelete.id));
        if (currentChatId === chatToDelete.id) {
          setCurrentChatId(null);
          setMessages([]);
        }
      }
    } catch (e) {
      console.error("Error deleting chat:", e);
      setNotification("An error occurred while deleting the chat.");
    } finally {
      setChatToDelete(null);
    }
  };

  const handleRenameChat = async () => {
    if (!currentChatId || !renameTitle.trim()) return;
    try {
      const res = await fetchWithAuth(`/chats/${currentChatId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: renameTitle }),
      });
      if (!res.ok) {
        setNotification("Failed to rename chat.");
        return;
      }
      // Update local state
      setChats((prev) =>
        prev.map((c) =>
          c.id === currentChatId ? { ...c, title: renameTitle } : c
        )
      );
      setNotification("Chat renamed successfully.");
      setIsRenaming(false);
    } catch (e) {
      console.error("Error renaming chat:", e);
      setNotification("An error occurred while renaming the chat.");
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

  // Proactively load members when switching chats (for mentions)
  useEffect(() => {
    if (currentChatId) {
      loadChatMembersForInvite();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChatId]);

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
    if (
      !inputMessage.trim() ||
      !ws.current ||
      ws.current.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    // If invoking @recme, mark pending; loader will be appended after our user echo arrives
    if (/@recme\b/i.test(inputMessage)) {
      setPendingBot(true);
    }
    ws.current.send(inputMessage);
    setInputMessage("");
    setMentionOpen(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen) return; // don't send while selecting mention
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Mentions: compute options (all chat member usernames + 'recme')
  const mentionOptions = [
    { label: "recme", value: "recme" },
    ...chatMembers
      .filter((m) => m.username !== currentUserUsername)
      .map((m) => ({ label: m.username, value: m.username })),
  ];

  const updateMentionState = (value: string, caret: number) => {
    // Find the last '@' before caret without spaces
    const uptoCaret = value.slice(0, caret);
    const atIndex = uptoCaret.lastIndexOf("@");
    if (atIndex === -1) {
      setMentionOpen(false);
      setMentionQuery("");
      setMentionIndex(0);
      return;
    }
    // Ensure there's no whitespace between '@' and caret
    const afterAt = uptoCaret.slice(atIndex + 1);
    if (/\s/.test(afterAt)) {
      setMentionOpen(false);
      setMentionQuery("");
      setMentionIndex(0);
      return;
    }
    setMentionOpen(true);
    setMentionQuery(afterAt.toLowerCase());
    setMentionIndex(0);
  };

  const filteredMentions = mentionOptions.filter((opt) =>
    opt.label.toLowerCase().startsWith(mentionQuery)
  );

  const insertMention = (username: string) => {
    const textarea = document.querySelector(
      ".input-container textarea"
    ) as HTMLTextAreaElement | null;
    if (!textarea) return;
    const caret = textarea.selectionStart;
    const val = inputMessage;
    const uptoCaret = val.slice(0, caret);
    const atIndex = uptoCaret.lastIndexOf("@");
    if (atIndex === -1) return;
    const before = val.slice(0, atIndex);
    const after = val.slice(caret);
    const insertion = `@${username} `;
    const newVal = before + insertion + after;
    setInputMessage(newVal);
    setMentionOpen(false);
    setMentionQuery("");
    setMentionIndex(0);
    // place caret after insertion
    requestAnimationFrame(() => {
      const pos = before.length + insertion.length;
      textarea.selectionStart = textarea.selectionEnd = pos;
      textarea.focus();
    });
  };

  const onTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputMessage(val);
    updateMentionState(val, e.target.selectionStart || val.length);
  };

  const onTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIndex((i) =>
        Math.min(i + 1, Math.max(filteredMentions.length - 1, 0))
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (filteredMentions.length > 0) {
        e.preventDefault();
        insertMention(filteredMentions[Math.max(mentionIndex, 0)].value);
      }
    } else if (e.key === "Escape") {
      setMentionOpen(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      // Use axios directly for file upload to handle FormData correctly
      // Note: The backend endpoint is /upload-pdf (no /api prefix based on backend.py)
      const response = await axios.post(
        "http://localhost:8000/upload-pdf",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      setNotification(`PDF "${file.name}" uploaded successfully!`);
      // Refresh the list of PDFs
      loadPdfs();
    } catch (error) {
      console.error("Error uploading PDF:", error);
      setNotification("Failed to upload PDF.");
    } finally {
      setIsUploading(false);
      // Reset the input value so the same file can be selected again if needed
      e.target.value = "";
    }
  };

  const deletePdf = async (pdfId: number) => {
    try {
      await axios.delete(`http://localhost:8000/pdfs/${pdfId}`);
      setNotification("PDF deleted successfully.");
      loadPdfs();
    } catch (error) {
      console.error("Error deleting PDF:", error);
      setNotification("Failed to delete PDF.");
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
          {currentChat && isRenaming ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                style={{
                  fontSize: "1.1rem",
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  background: "white",
                  color: "#333",
                  minWidth: "200px",
                }}
                autoFocus
                onKeyPress={(e) => e.key === "Enter" && handleRenameChat()}
              />
              <button
                onClick={handleRenameChat}
                style={{
                  background: "rgba(255,255,255,0.2)",
                  border: "1px solid rgba(255,255,255,0.4)",
                  color: "white",
                  cursor: "pointer",
                  padding: "6px 10px",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Save"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
              <button
                onClick={() => setIsRenaming(false)}
                style={{
                  background: "rgba(255,255,255,0.2)",
                  border: "1px solid rgba(255,255,255,0.4)",
                  color: "white",
                  cursor: "pointer",
                  padding: "6px 10px",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Cancel"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h1 style={{ margin: 0 }}>
                {currentChat ? currentChat.title : "Group Chat"}
              </h1>
              {currentChat &&
                currentChat.owner_username === currentUserUsername && (
                  <button
                    onClick={() => {
                      setRenameTitle(currentChat.title);
                      setIsRenaming(true);
                    }}
                    title="Rename Chat"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "rgba(255,255,255,0.6)",
                      cursor: "pointer",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "color 0.2s",
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.color = "rgba(255,255,255,1)")
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.color = "rgba(255,255,255,0.6)")
                    }
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                )}
            </div>
          )}
        </div>
        <div className="upload-section">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
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
                «
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
                        Owner: {chat.owner_username}
                      </span>
                    </div>
                    {currentUserUsername === chat.owner_username && (
                      <button
                        className="delete-chat-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setChatToDelete(chat);
                        }}
                        title="Delete Chat"
                      >
                        ×
                      </button>
                    )}
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
                      <button
                        className="delete-pdf"
                        onClick={() => deletePdf(pdf.id)}
                        title="Delete PDF"
                      >
                        ×
                      </button>
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
                msg.sender === "user" &&
                msg.sender_username === currentUserUsername;
              const isBot = msg.sender === "bot";
              return (
                <div
                  key={msg.id}
                  className={`message ${
                    mine ? "user" : isBot ? "bot" : "other"
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
                        {mine ? "You" : msg.sender_username || "User"}
                      </div>
                    )}
                    {isBot && (
                      <div
                        style={{
                          fontSize: "0.65rem",
                          opacity: 0.8,
                          marginBottom: 4,
                        }}
                      >
                        Mingle AI
                      </div>
                    )}
                    {(msg as any).loading ? (
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    ) : (
                      <div className="markdown-content">
                        <ReactMarkdown
                          components={{
                            a: ({ node, ...props }) => (
                              <a
                                {...props}
                                target="_blank"
                                rel="noopener noreferrer"
                              />
                            ),
                          }}
                        >
                          {msg.content || ""}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <div className="input-container">
            <textarea
              value={inputMessage}
              onChange={onTextareaChange}
              onKeyDown={onTextareaKeyDown}
              onKeyPress={handleKeyPress}
              placeholder={
                currentChatId ? "Type..." : "Create or select a chat first"
              }
              disabled={isUploading || !currentChatId}
              rows={1}
            />
            {mentionOpen && filteredMentions.length > 0 && (
              <div className="mention-dropdown">
                {filteredMentions.slice(0, 6).map((opt, idx) => (
                  <div
                    key={opt.value}
                    className={`mention-item ${
                      idx === mentionIndex ? "active" : ""
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(opt.value);
                    }}
                  >
                    @{opt.label}
                  </div>
                ))}
              </div>
            )}
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
                  {user.username} ({user.email})
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
              {chatMembers.map((member) => {
                const isOwner = currentChat?.owner_username === member.username;
                return (
                  <li
                    key={member.id}
                    style={{
                      padding: "6px 0",
                      borderBottom: "1px solid #eee",
                      fontSize: "0.9rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>
                      {member.username} {isOwner && "(Owner)"}
                    </span>
                    {currentChat?.owner_username === currentUserUsername &&
                      !isOwner && (
                        <button
                          className="remove-member-button"
                          onClick={() => removeMember(member.id)}
                        >
                          Remove
                        </button>
                      )}
                  </li>
                );
              })}
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
      {chatToDelete && (
        <div className="popup-backdrop">
          <div className="popup-container" style={{ width: 360 }}>
            <h3 style={{ marginTop: 0 }}>Delete Chat?</h3>
            <p style={{ margin: "8px 0 16px" }}>
              Are you sure you want to delete "<b>{chatToDelete.title}</b>"?
              This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                className="popup-button"
                style={{ flex: 1, background: "#ef4444" }}
                onClick={deleteChat}
              >
                Delete
              </button>
              <button
                className="popup-button"
                style={{ flex: 1, background: "#64748b" }}
                onClick={() => setChatToDelete(null)}
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
