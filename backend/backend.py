import os
import tempfile
import traceback
from typing import Optional, List
import asyncio
import re
from fastapi import FastAPI, File, UploadFile, HTTPException, Header, Depends, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, constr
from backend.data_storage import (
    get_pdf_text, get_text_chunks, get_or_load_vectorstore, clean_text,
    format_history_from_db, generate_rag_response, generate_general_response
)
from langchain_community.tools import DuckDuckGoSearchRun
from backend.database import add_pdf, get_all_pdfs, delete_pdf, create_chat, get_all_chats, get_chat_messages, add_message, update_chat_title, delete_chat, get_message_with_sender, search_registered_restaurants
from . import database
from . import auth
from .auth import hash_password, verify_password, create_access_token, get_email_from_token

index_path = os.path.join(os.path.dirname(__file__), "faiss_index")

app = FastAPI(title="Chatbot API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React app URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global vectorstore (shared across all chats)
vectorstore = None

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, chat_id: int):
        await websocket.accept()
        if chat_id not in self.active_connections:
            self.active_connections[chat_id] = []
        self.active_connections[chat_id].append(websocket)

    def disconnect(self, websocket: WebSocket, chat_id: int):
        if chat_id in self.active_connections:
            self.active_connections[chat_id].remove(websocket)

    async def broadcast(self, message: str, chat_id: int):
        if chat_id in self.active_connections:
            for connection in self.active_connections[chat_id]:
                await connection.send_text(message)

manager = ConnectionManager()

class ChatMessage(BaseModel):
    message: str
    chat_id: Optional[int] = None

class ChatResponse(BaseModel):
    response: str
    chat_id: Optional[int] = None

class CreateChatRequest(BaseModel):
    title: str = "New Chat"

class ChatListResponse(BaseModel):
    chats: list

class RegisterRequest(BaseModel):
    email: EmailStr
    username: constr(min_length=3, max_length=20) # type: ignore
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str

class AuthRestaurantResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    name: str

class RestaurantRegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    website: str
    cuisine: str = ""
    location: str = ""

class BiddingRulesRequest(BaseModel):
    bid_amount: float
    max_budget: float

@app.on_event("startup")
def startup():
    """Initialize the app on startup"""
    global vectorstore
    # Initialize database
    database.init_db()
    
    # Try to load existing vectorstore if it exists
    try:
        if os.path.exists(index_path):
            print("[STARTUP] Loading existing vectorstore...")
            vectorstore = get_or_load_vectorstore([], path=index_path)  # Load without adding chunks
            print("[STARTUP] Loaded existing vectorstore")
        else:
            print("[STARTUP] No existing vectorstore found")
    except Exception as e:
        print(f"[STARTUP] Error loading vectorstore: {e}")
        vectorstore = None
    
    print("Backend started successfully!")

def get_current_user(authorization: str = Header(...)):
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth header")
    token = authorization.split(" ", 1)[1].strip()
    email = get_email_from_token(token)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = database.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user  # dict with id, email, ...

def get_current_restaurant(authorization: str = Header(...)):
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth header")
    token = authorization.split(" ", 1)[1].strip()
    email = get_email_from_token(token)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user_type = auth.get_user_type_from_token(token)
    if user_type != "restaurant":
        raise HTTPException(status_code=403, detail="Not a restaurant user")

    restaurant = database.get_restaurant_by_email(email)
    if not restaurant:
        raise HTTPException(status_code=401, detail="Restaurant not found")
    return restaurant

async def get_current_user_ws(token: str = Query(...)):
    if not token:
        return None
    email = get_email_from_token(token)
    if not email:
        return None
    user = database.get_user_by_email(email)
    return user

class InviteRequest(BaseModel):
    emails: List[EmailStr]

# --- Auth unchanged ---

@app.post("/auth/register", response_model=AuthResponse)
def register(body: RegisterRequest):
    if database.get_user_by_email(body.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    try:
        database.create_user(body.email, body.username, hash_password(body.password))
    except database.sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Username already taken")
    token = create_access_token(sub=body.email)
    return AuthResponse(access_token=token, username=body.username)

@app.post("/auth/login", response_model=AuthResponse)
def login(body: LoginRequest):
    user = database.get_user_by_email(body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(sub=body.email, user_type="user")
    return AuthResponse(access_token=token, username=user["username"])

@app.post("/api/register_restaurant", response_model=AuthRestaurantResponse)
def register_restaurant(body: RestaurantRegisterRequest):
    if database.get_restaurant_by_email(body.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    try:
        database.create_restaurant(body.name, body.email, hash_password(body.password), body.website, body.cuisine, body.location)
    except database.sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Restaurant with this email already exists")

    token = create_access_token(sub=body.email, user_type="restaurant")
    return AuthRestaurantResponse(access_token=token, name=body.name)

@app.post("/api/login_restaurant", response_model=AuthRestaurantResponse)
def login_restaurant(body: LoginRequest):
    restaurant = database.get_restaurant_by_email(body.email)
    if not restaurant or not verify_password(body.password, restaurant["password_hash"]):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(sub=body.email, user_type="restaurant")
    return AuthRestaurantResponse(access_token=token, name=restaurant["name"])

@app.get("/api/bidding", response_model=BiddingRulesRequest)
def get_bidding_rules(restaurant: dict = Depends(get_current_restaurant)):
    rules = database.get_restaurant_bidding_rules(restaurant["id"])
    if not rules:
        raise HTTPException(status_code=404, detail="Bidding rules not found")
    return rules

@app.post("/api/bidding", status_code=204)
def update_bidding_rules(body: BiddingRulesRequest, restaurant: dict = Depends(get_current_restaurant)):
    database.update_restaurant_bidding_rules(restaurant["id"], body.bid_amount, body.max_budget)
    return {}

@app.delete("/api/restaurant", status_code=204)
def delete_restaurant_account(restaurant: dict = Depends(get_current_restaurant)):
    """Deletes the currently authenticated restaurant's account."""
    database.delete_restaurant(restaurant["id"])
    return {}

@app.get("/users", response_model=List[dict])
def get_all_users_endpoint(user=Depends(get_current_user)):
    """Returns a list of all users (id and email)."""
    users = database.get_all_users()
    return users


# --- Group Chat Endpoints ---

@app.post("/chats", response_model=dict)
def create_new_chat(request: CreateChatRequest, user=Depends(get_current_user)):
    chat_id = database.create_chat(request.title, owner_user_id=user["id"])
    return {"chat_id": chat_id, "title": request.title}

@app.get("/chats", response_model=ChatListResponse)
def get_chats(user=Depends(get_current_user)):
    chats = database.get_user_chats(user["id"])
    return ChatListResponse(chats=chats)

@app.post("/chats/{chat_id}/invite", response_model=dict)
def invite_users(chat_id: int, body: InviteRequest, user=Depends(get_current_user)):
    # Verify requester is member
    if not database.is_member(chat_id, user["id"]):
        raise HTTPException(status_code=403, detail="Not a member of chat")
    added_count = 0
    for email in body.emails:
        target_user = database.get_user_by_email(email)
        if target_user:
            database.add_chat_member(chat_id, target_user["id"])
            added_count += 1
    return {"message": f"Successfully added {added_count} user(s)."}

class UpdateChatRequest(BaseModel):
    title: str

@app.put("/chats/{chat_id}", response_model=dict)
def update_chat(chat_id: int, body: UpdateChatRequest, user=Depends(get_current_user)):
    """Updates a chat title. Only the owner can update it."""
    owner_id = database.get_chat_owner(chat_id)
    if not owner_id or owner_id != user["id"]:
        raise HTTPException(status_code=403, detail="Only the chat owner can update the chat.")
    database.update_chat_title(chat_id, body.title)
    return {"id": chat_id, "title": body.title}

@app.delete("/chats/{chat_id}", status_code=204)
def delete_chat_endpoint(chat_id: int, user: dict = Depends(get_current_user)):
    """Deletes a chat. Only the owner can delete it."""
    owner_id = database.get_chat_owner(chat_id)
    if not owner_id or owner_id != user["id"]:
        raise HTTPException(status_code=403, detail="Only the chat owner can delete the chat.")
    database.delete_chat(chat_id)
    return {}

@app.delete("/chats/{chat_id}/members/{member_id}", status_code=204)
def remove_member_endpoint(chat_id: int, member_id: int, user: dict = Depends(get_current_user)):
    """Removes a member from a chat. Only the owner can do this."""
    owner_id = database.get_chat_owner(chat_id)
    if not owner_id or owner_id != user["id"]:
        raise HTTPException(status_code=403, detail="Only the chat owner can remove members.")
    if owner_id == member_id:
        raise HTTPException(status_code=400, detail="The owner cannot be removed from the chat.")
    database.remove_chat_member(chat_id, member_id)
    return {}

@app.get("/chats/{chat_id}/members", response_model=dict)
def list_members(chat_id: int, user=Depends(get_current_user)):
    if not database.is_member(chat_id, user["id"]):
        raise HTTPException(status_code=403, detail="Not a member")
    return {"members": database.get_chat_members(chat_id)}

@app.get("/chats/{chat_id}/messages")
def get_chat_messages_endpoint(chat_id: int, user=Depends(get_current_user)):
    if not database.is_member(chat_id, user["id"]):
        raise HTTPException(status_code=403, detail="Not a member")
    messages = database.get_chat_messages(chat_id)
    return {"messages": messages}

@app.websocket("/ws/{chat_id}")
async def websocket_endpoint(websocket: WebSocket, chat_id: int, user: dict = Depends(get_current_user_ws)):
    if not user or not database.is_member(chat_id, user["id"]):
        await websocket.close(code=4001)
        return

    await manager.connect(websocket, chat_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Save message to DB
            message_id = database.add_message(chat_id, data, "user", user_id=user["id"])
            # Get full message to broadcast
            message = database.get_message_with_sender(message_id)
            import json
            await manager.broadcast(json.dumps(message), chat_id)

            # Detect @recme trigger (case-insensitive, word boundary)
            if re.search(r"@recme\b", data, flags=re.IGNORECASE):
                # Offload summary generation to a thread to avoid blocking event loop
                async def _summarize_and_broadcast():
                    try:
                        # Fetch recent chat history (last 100 messages)
                        rows = await asyncio.to_thread(database.get_chat_messages, chat_id)
                        history_msgs = format_history_from_db(rows)

                        # RAG Retrieval
                        rag_info = ""
                        if vectorstore:
                            print(f"[RAG] Querying vectorstore with: {data}")
                            try:
                                rag_response = await asyncio.to_thread(
                                    generate_rag_response,
                                    vectorstore,
                                    data,
                                    history_messages=history_msgs[-6:]
                                )
                                if "no relevant information" not in rag_response.lower():
                                    rag_info = rag_response
                                    print("[RAG] Relevant info found.")
                                else:
                                    print("[RAG] No relevant info found in docs.")
                            except Exception as e:
                                print(f"[RAG] Error: {e}")

                        # Build a concise summary using LLM without retrieval
                        from langchain_openai import ChatOpenAI
                        from langchain_core.messages import SystemMessage, HumanMessage
                        import json

                        llm = ChatOpenAI(model_name="gpt-4o", temperature=0)
                        
                        # Step 1: Identify Intent
                        print(f"[RECOMMENDATION] Analyzing intent for chat {chat_id}...")
                        
                        # Inject RAG info into the system prompt for intent analysis
                        intent_system_content = (
                            "You are a helpful assistant. Analyze the conversation to identify the user's desired cuisine and location.\n"
                            "Return ONLY a JSON object with keys 'cuisine' and 'location'.\n"
                            "Example: {\"cuisine\": \"Chinese\", \"location\": \"Los Angeles\"}\n"
                            "If you cannot determine them, return {\"cuisine\": null, \"location\": null}."
                        )
                        
                        if rag_info:
                            intent_system_content += f"\n\nAdditional Context from User Documents:\n{rag_info}\nUse this context to infer preferences if not explicitly stated in the chat."

                        system_intent = SystemMessage(content=intent_system_content)
                        prompt_intent = HumanMessage(content="Analyze this chat history.")
                        
                        resp_intent = await asyncio.to_thread(llm.invoke, [system_intent, *history_msgs[-40:], prompt_intent])
                        content_intent = (getattr(resp_intent, "content", "") or "").strip()
                        print(f"[RECOMMENDATION] Intent raw response: {content_intent}")
                        
                        # Clean up potential markdown code blocks
                        if content_intent.startswith("```json"):
                            content_intent = content_intent[7:-3]
                        elif content_intent.startswith("```"):
                            content_intent = content_intent[3:-3]
                            
                        try:
                            intent_data = json.loads(content_intent)
                        except:
                            print(f"[RECOMMENDATION] Failed to parse intent JSON")
                            intent_data = {"cuisine": None, "location": None}
                            
                        cuisine = intent_data.get("cuisine")
                        location = intent_data.get("location")
                        print(f"[RECOMMENDATION] Extracted: Cuisine='{cuisine}', Location='{location}'")

                        if not cuisine or not location:
                            bot_text = "I couldn't identify what you're looking for. Please specify cuisine and location."
                        else:
                            # Step 2: Search Registered Restaurants
                            print(f"[RECOMMENDATION] Searching registered restaurants...")
                            registered = await asyncio.to_thread(database.search_registered_restaurants, cuisine, location)
                            print(f"[RECOMMENDATION] Found {len(registered)} registered restaurants")
                            
                            recommendations = []
                            # Add registered restaurants (already sorted by bid)
                            for r in registered:
                                recommendations.append({
                                    "name": r["name"],
                                    "website": r["website"],
                                    "source": "sponsored"
                                })
                            
                            # Step 3: Fill gaps with Web Search
                            if len(recommendations) < 5:
                                needed = 5 - len(recommendations)
                                print(f"[RECOMMENDATION] Need {needed} more from web search...")
                                search = DuckDuckGoSearchRun()
                                # Improved query: prioritize official sites but allow aggregators for discovery
                                query = f"official website {cuisine} restaurant {location}"
                                print(f"[RECOMMENDATION] Running web search: '{query}'")
                                search_results = await asyncio.to_thread(search.run, query)
                                print(f"[RECOMMENDATION] Web search raw results length: {len(search_results)}")
                                
                                # Use LLM to parse search results
                                system_parse = SystemMessage(content=(
                                    f"Extract exactly {needed} distinct real restaurants from the search results text.\n"
                                    "Return ONLY a JSON array of objects with 'name' and 'website' keys.\n"
                                    "For 'website', prioritize the official site. If not found, use a Yelp/TripAdvisor/OpenTable link from the results.\n"
                                    "Ensure the restaurant matches the cuisine '{cuisine}'."
                                ))
                                prompt_parse = HumanMessage(content=f"Search Results Text: {search_results}")
                                
                                resp_parse = await asyncio.to_thread(llm.invoke, [system_parse, prompt_parse])
                                content_parse = (getattr(resp_parse, "content", "") or "").strip()
                                print(f"[RECOMMENDATION] Parsed web results: {content_parse}")
                                
                                if content_parse.startswith("```json"):
                                    content_parse = content_parse[7:-3]
                                elif content_parse.startswith("```"):
                                    content_parse = content_parse[3:-3]
                                
                                try:
                                    external_recs = json.loads(content_parse)
                                    if isinstance(external_recs, list):
                                        for r in external_recs:
                                            if len(recommendations) < 5:
                                                # Fallback for null website: Google Search link
                                                website = r.get("website")
                                                if not website:
                                                    website = f"https://www.google.com/search?q={r.get('name')} {location} official website"
                                                
                                                recommendations.append({
                                                    "name": r.get("name"),
                                                    "website": website,
                                                    "source": "organic"
                                                })
                                except Exception as e:
                                    print(f"[RECOMMENDATION] Error parsing web results: {e}")

                            # Step 4: Format Response
                            bot_text = f"Here are some {cuisine} recommendations in {location}:\n\n"
                            
                            # Split into Sponsored and Organic
                            sponsored = [r for r in recommendations if r.get("source") == "sponsored"]
                            organic = [r for r in recommendations if r.get("source") == "organic"]
                            
                            if sponsored:
                                bot_text += "**Top Recommended**\n"
                                for i, rec in enumerate(sponsored, 1):
                                    website = rec.get('website', '')
                                    if not website.startswith(('http://', 'https://')):
                                        website = 'http://' + website
                                    bot_text += f"{i}. **{rec['name']}**\n   [{rec['website']}]({website})\n"
                                bot_text += "\n"
                                
                            if organic:
                                bot_text += "**Other Recommended**\n"
                                for i, rec in enumerate(organic, 1):
                                    website = rec.get('website', '')
                                    if not website.startswith(('http://', 'https://')):
                                        website = 'http://' + website
                                    bot_text += f"{i}. **{rec['name']}**\n   [{rec['website']}]({website})\n"

                        # Save bot message and broadcast
                        bot_id = await asyncio.to_thread(database.add_message, chat_id, bot_text, "bot", None)
                        bot_msg = await asyncio.to_thread(database.get_message_with_sender, bot_id)
                        await manager.broadcast(json.dumps(bot_msg), chat_id)
                    except Exception as e:
                        # On any failure, send a safe fallback once
                        print(f"Error in recommendation: {e}")
                        try:
                            fallback = (
                                "I encountered an error while finding recommendations. Please try again."
                            )
                            bot_id = await asyncio.to_thread(database.add_message, chat_id, fallback, "bot", None)
                            bot_msg = await asyncio.to_thread(database.get_message_with_sender, bot_id)
                            await manager.broadcast(json.dumps(bot_msg), chat_id)
                        except Exception:
                            pass

                asyncio.create_task(_summarize_and_broadcast())
    except WebSocketDisconnect:
        manager.disconnect(websocket, chat_id)
    except Exception as e:
        print(f"WebSocket Error: {e}")
        manager.disconnect(websocket, chat_id)

# Make upload async (it awaits file.read()); keep public for now
@app.post("/upload-pdf")
async def upload_pdf_endpoint(  # type: ignore[func-annotations]
    file: UploadFile = File(...)
):
    """Upload and process a PDF file"""
    global vectorstore
    
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file_path = tmp_file.name
            file_size = len(content)
        
        # Process the PDF
        print(f"Processing PDF: {file.filename}")
        raw_text = get_pdf_text([tmp_file_path])
        
        if not raw_text.strip():
            raise HTTPException(status_code=400, detail="No text could be extracted from the PDF")
        
        # Clean and chunk the text
        cleaned_text = clean_text(raw_text)
        text_chunks = get_text_chunks(cleaned_text)
        
        # Add to database
        pdf_id = add_pdf(file.filename, file_size)
        
        # Create or update vectorstore (this will add to existing if it exists)
        if vectorstore is None:
            # First time: create vectorstore
            vectorstore = get_or_load_vectorstore(text_chunks, path=index_path)
        else:
            if text_chunks:
                vectorstore.add_texts(text_chunks)
                vectorstore.save_local(index_path)
                print(f"[INFO] Added {len(text_chunks)} chunks to existing vectorstore")
        
        # Clean up temporary file
        os.unlink(tmp_file_path)
        
        return {"message": f"PDF '{file.filename}' processed successfully!", "filename": file.filename, "id": pdf_id}
        
    except Exception as e:
        print(f"Error processing PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")

@app.get("/pdfs")
async def get_pdfs():
    """Get all uploaded PDFs"""
    try:
        pdfs = get_all_pdfs()
        return {"pdfs": pdfs}
    except Exception as e:
        print(f"Error getting PDFs: {str(e)}")
        raise HTTPException(status_code=500, detail="Error retrieving PDFs")

@app.delete("/pdfs/{pdf_id}")
async def delete_pdf_endpoint(pdf_id: int):
    """Delete a PDF"""
    try:
        delete_pdf(pdf_id)
        return {"message": "PDF deleted successfully"}
    except Exception as e:
        print(f"Error deleting PDF: {str(e)}")
        raise HTTPException(status_code=500, detail="Error deleting PDF")

@app.delete("/api/restaurant", status_code=204)
def delete_restaurant_account(restaurant: dict = Depends(get_current_restaurant)):
    """Deletes the currently authenticated restaurant's account."""
    database.delete_restaurant(restaurant["id"])
    return {}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "message": "API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)