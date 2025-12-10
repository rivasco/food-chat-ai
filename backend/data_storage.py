import os
import hashlib
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from dotenv import load_dotenv
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from backend.pdf_utilities import clean_text, get_pdf_text

load_dotenv()
index_path = os.path.join(os.path.dirname(__file__), "faiss_index")

def get_text_chunks(text, chunk_size=1500, chunk_overlap=500):
    # Use recursive splitter with multiple fallback separators to avoid giant chunks
    splitter = RecursiveCharacterTextSplitter(
        separators=["\n\n", "\n", ". ", " ", ""],
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
    )
    chunks = splitter.split_text(text)
    print(f"[INFO] Created {len(chunks)} text chunks")
    return chunks


def get_or_load_vectorstore(text_chunks, path="faiss_index"):
    # Reduce batch size to avoid 300k token/request cap
    embeddings = OpenAIEmbeddings(model="text-embedding-3-large", chunk_size=64)
    print("[INFO] Using OpenAI embeddings: text-embedding-3-large (batch size=64)")
    if os.path.exists(path):
        print(f"[INFO] Loading existing vectorstore from '{path}'...")
        print("[WARN] Ensure this index was built with the same embedding model; otherwise run with --rebuild-index or a different --index-path.")
        vectorstore = FAISS.load_local(path, embeddings, allow_dangerous_deserialization=True)
        if text_chunks:
            print("[INFO] Adding new chunks to existing vectorstore...")
            vectorstore.add_texts(text_chunks)
            vectorstore.save_local(path)
            print(f"[INFO] Updated vectorstore saved to '{path}'")
        return vectorstore

    print("[INFO] Creating new vectorstore...")
    vectorstore = FAISS.from_texts(text_chunks, embedding=embeddings)
    vectorstore.save_local(path)
    print(f"[INFO] Vectorstore saved to '{path}'")
    return vectorstore

# Fallback LLM-only response
def generate_general_response(question, history_messages):
    """LLM-only response (no retrieval), acts as a fallback."""
    llm = ChatOpenAI(model_name="gpt-4o", temperature=0)
    messages = [
        SystemMessage(content="You are a helpful, concise assistant."),
        *history_messages,
        HumanMessage(content=question),
    ]
    resp = llm.invoke(messages)
    answer = (getattr(resp, "content", "") or "").strip()
    if not answer:
        # Single retry without history if blank
        resp = llm.invoke([SystemMessage(content="You are a helpful, concise assistant."), HumanMessage(content=question)])
        answer = (getattr(resp, "content", "") or "").strip()
    return answer

# In case of duplicate docs
def _dedup_docs(docs):
    seen, out = set(), []
    for d in docs:
        content = (getattr(d, "page_content", "") or "")
        digest = hashlib.md5(content.encode("utf-8")).hexdigest()
        if digest in seen:
            continue
        seen.add(digest)
        out.append(d)
    return out

def format_history_from_db(chat_messages_db):
    """Convert DB rows to LangChain messages, skipping blanks."""
    msgs = []
    for msg in chat_messages_db:
        content = (msg.get("content") or "").strip()
        if not content:
            continue
        if msg.get("sender") == "user":
            msgs.append(HumanMessage(content=content))
        elif msg.get("sender") == "bot":
            msgs.append(AIMessage(content=content))
    return msgs

def generate_rag_response(vectorstore, question, history_messages, k=8, return_docs=False):
    """Retrieve -> prompt with context -> LLM, with safe fallback."""
    llm = ChatOpenAI(model_name="gpt-4o", temperature=0)

    # Use similarity_search_with_score to filter irrelevant docs
    # FAISS L2 distance: lower is better. 
    # Threshold is empirical; 1.0 is usually a safe cutoff for "somewhat relevant" with OpenAI embeddings,
    # but it depends on the embedding scale. text-embedding-3-large is normalized?
    # Let's try a strict threshold first.
    try:
        results_with_scores = vectorstore.similarity_search_with_score(question, k=k)
    except Exception as e:
        print(f"[WARN] similarity_search failed: {e}")
        results_with_scores = []

    # Filter by score (distance). 
    # Note: OpenAI embeddings are normalized, so cosine similarity is dot product.
    # FAISS IndexFlatL2 returns squared Euclidean distance.
    # For normalized vectors u, v: |u-v|^2 = 2 - 2(u.v).
    # If u.v (cosine sim) is 0.7, distance is 2 - 1.4 = 0.6.
    # If u.v is 0.5, distance is 1.0.
    # Let's set a threshold of 1.2 (approx 0.4 cosine similarity) to be generous but exclude total noise.
    threshold = 1.2
    sim_docs = []
    for doc, score in results_with_scores:
        if score < threshold:
            sim_docs.append(doc)
        else:
            print(f"[INFO] Filtered out doc with distance {score:.4f}")

    merged = _dedup_docs(sim_docs)[:k]
    print(f"[INFO] Retrieved {len(results_with_scores)} raw, kept {len(sim_docs)} within threshold, merged {len(merged)}")

    if not merged:
        print("[INFO] No relevant docs retrieved (all filtered); falling back to general response.")
        # Return a specific string indicating no info, so the caller knows not to use it
        return {"answer": "No relevant information found in documents.", "documents": []} if return_docs else "No relevant information found in documents."

    context_text = "\n\n---\n\n".join(getattr(d, "page_content", "") for d in merged)
    system_prompt = (
        "You are a helpful assistant. Carefully analyze the provided context "
        "from the user's uploaded documents. "
        "If the documents contain relevant information about restaurants, food, or the user's preferences, "
        "summarize it concisely. If not, state that no relevant information was found in the documents.\n\n"
        f"Context:\n{context_text}"
    )
    messages = [
        SystemMessage(content=system_prompt),
        *history_messages,
        HumanMessage(content=question),
    ]
    resp = llm.invoke(messages)
    # print(f"[CHAT] Retrieved response from RAG chain: {resp}")
    answer = (getattr(resp, "content", "") or "").strip()

    if not answer:
        print("[INFO] Empty RAG answer; retrying without context...")
        answer = generate_general_response(question, history_messages)

    return {"answer": answer, "documents": merged} if return_docs else answer


# Local run function
def run_conversational_agent(pdf_files):
    print("[INFO] Checking for existing FAISS vectorstore...")
    if not os.path.exists(index_path):
        print("[INFO] No vectorstore found. Extracting from PDFs...")
        raw_text = get_pdf_text(pdf_files)
        if not raw_text.strip():
            print("[ERROR] No text extracted. Exiting.")
            return
        cleaned_text = clean_text(raw_text)
        text_chunks = get_text_chunks(cleaned_text)
    else:
        text_chunks = []

    vectorstore = get_or_load_vectorstore(text_chunks, path=index_path)

    print("\n[READY] Ask questions about the document. Type 'exit' to quit.\n")

    # Maintain chat history as LangChain messages for follow-ups
    history_msgs = []

    while True:
        query = input("You: ").strip()
        if query.lower() == "exit":
            print("[INFO] Exiting conversation.")
            break

        # RAG response using the latest pipeline
        answer = generate_rag_response(vectorstore, query, history_messages=history_msgs, k=5)
        print("Bot:", answer)

        # Update history for follow-up questions
        history_msgs.append(HumanMessage(content=query))
        history_msgs.append(AIMessage(content=answer))


# Local runner for testing
if __name__ == "__main__":
    print("[INFO] RAG pipeline module loaded.")
    # You can add local testing logic here if needed

