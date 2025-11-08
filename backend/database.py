import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "chatbot.db")

@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    """Initialize the database with required tables"""
    with get_conn() as conn:
        cur = conn.cursor()
        
        # Create PDFs table
        cur.execute('''
            CREATE TABLE IF NOT EXISTS pdfs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                file_size INTEGER,
                status TEXT DEFAULT 'processed'
            )
        ''')
        
        # Create chats table
        cur.execute('''
            CREATE TABLE IF NOT EXISTS chats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create messages table
        cur.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                sender TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (chat_id) REFERENCES chats (id)
            )
        ''')
        
        # Users table (email unique)
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        # Ensure chats has owner_user_id
        cur.execute("PRAGMA table_info(chats)")
        cols = [r[1] for r in cur.fetchall()]
        if "owner_user_id" not in cols:
            try:
                cur.execute("ALTER TABLE chats ADD COLUMN owner_user_id INTEGER")
            except Exception:
                pass
        # Ensure messages has user_id
        cur.execute("PRAGMA table_info(messages)")
        mcols = [r[1] for r in cur.fetchall()]
        if "user_id" not in mcols:
            try:
                cur.execute("ALTER TABLE messages ADD COLUMN user_id INTEGER")
            except Exception:
                pass
        # Chat members join table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS chat_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                added_at TEXT NOT NULL,
                UNIQUE(chat_id, user_id),
                FOREIGN KEY (chat_id) REFERENCES chats(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        """)
        conn.commit()

def add_pdf(filename, file_size):
    """Add a new PDF to the database"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO pdfs (filename, file_size)
        VALUES (?, ?)
    ''', (filename, file_size))
    
    pdf_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return pdf_id

def get_all_pdfs():
    """Get all uploaded PDFs"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, filename, upload_date, file_size, status
        FROM pdfs
        ORDER BY upload_date DESC
    ''')
    
    pdfs = cursor.fetchall()
    conn.close()
    
    return [
        {
            "id": pdf[0],
            "filename": pdf[1],
            "upload_date": pdf[2],
            "file_size": pdf[3],
            "status": pdf[4]
        }
        for pdf in pdfs
    ]

def delete_pdf(pdf_id):
    """Delete a PDF from the database"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM pdfs WHERE id = ?', (pdf_id,))
    
    conn.commit()
    conn.close()

# Chat functions
def create_chat(title="New Chat", owner_user_id=None):
    """Create a new chat"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('INSERT INTO chats (title, owner_user_id) VALUES (?, ?)', (title, owner_user_id))
    chat_id = cursor.lastrowid
    
    # Add owner as member
    cursor.execute(
        "INSERT OR IGNORE INTO chat_members (chat_id, user_id, added_at) VALUES (?, ?, ?)",
        (chat_id, owner_user_id, datetime.utcnow().isoformat()),
    )
    
    conn.commit()
    conn.close()
    
    return chat_id

def get_all_chats():
    """Get all chats"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, title, created_date, last_updated
        FROM chats
        ORDER BY last_updated DESC
    ''')
    
    chats = cursor.fetchall()
    conn.close()
    
    return [
        {
            "id": chat[0],
            "title": chat[1],
            "created_date": chat[2],
            "last_updated": chat[3]
        }
        for chat in chats
    ]

def add_chat_member(chat_id: int, user_id: int):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT OR IGNORE INTO chat_members (chat_id, user_id, added_at) VALUES (?, ?, ?)",
            (chat_id, user_id, datetime.utcnow().isoformat()),
        )
        conn.commit()

def is_member(chat_id: int, user_id: int) -> bool:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?",
            (chat_id, user_id),
        )
        return cur.fetchone() is not None

def get_chat_members(chat_id: int):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT u.id, u.email
            FROM chat_members cm
            JOIN users u ON u.id = cm.user_id
            WHERE cm.chat_id = ?
            ORDER BY u.email
        """, (chat_id,))
        return [{"id": r[0], "email": r[1]} for r in cur.fetchall()]

def get_user_chats(user_id: int):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT c.id, c.title, c.created_date, c.last_updated,
                   u.email as owner_email
            FROM chats c
            JOIN users u ON u.id = c.owner_user_id
            JOIN chat_members cm ON cm.chat_id = c.id
            WHERE cm.user_id = ?
            ORDER BY c.last_updated DESC
        """, (user_id,))
        rows = cur.fetchall()
        return [
            {
                "id": r[0],
                "title": r[1],
                "created_date": r[2],
                "last_updated": r[3],
                "owner_email": r[4],
            } for r in rows
        ]

def get_chat_messages(chat_id):
    """Get all messages for a chat"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, content, sender, timestamp
        FROM messages
        WHERE chat_id = ?
        ORDER BY timestamp ASC
    ''', (chat_id,))
    
    messages = cursor.fetchall()
    conn.close()
    
    return [
        {
            "id": msg[0],
            "content": msg[1],
            "sender": msg[2],
            "timestamp": msg[3]
        }
        for msg in messages
    ]

def add_message(chat_id, content, sender_type, user_id=None):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO messages (chat_id, content, sender, user_id)
            VALUES (?, ?, ?, ?)
        """, (chat_id, content, sender_type, user_id))
        cur.execute("UPDATE chats SET last_updated = CURRENT_TIMESTAMP WHERE id = ?", (chat_id,))
        mid = cur.lastrowid
        conn.commit()
        return mid

def update_chat_title(chat_id, title):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE chats SET title = ? WHERE id = ?", (title, chat_id))
        conn.commit()

def delete_chat(chat_id):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM messages WHERE chat_id = ?", (chat_id,))
        cur.execute("DELETE FROM chat_members WHERE chat_id = ?", (chat_id,))
        cur.execute("DELETE FROM chats WHERE id = ?", (chat_id,))
        conn.commit()

# --- User helpers ---
def create_user(email: str, password_hash: str):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
            (email.lower(), password_hash, datetime.utcnow().isoformat()),
        )
        conn.commit()
        return cur.lastrowid

def get_user_by_email(email: str):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE email = ?", (email.lower(),))
        row = cur.fetchone()
        return dict(row) if row else None

def get_all_users():
    """Returns all users (id and email)."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, email FROM users ORDER BY email")
        return [{"id": r[0], "email": r[1]} for r in cur.fetchall()]

def ensure_user(email: str, password_hash: str = "placeholder"):
    user = get_user_by_email(email)
    if user:
        return user["id"]
    return create_user(email, password_hash)
