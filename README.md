# Multilingual RAG Assistant (Grok Edition)

This is a production-ready RAG (Retrieval-Augmented Generation) application designed for deployment on Render. It uses xAI's Grok API for both embeddings and chat completions, making it lightweight and high-performance.

## Features
- **Grok Powered:** Uses Grok-2 for reasoning and Grok embeddings for search.
- **Multilingual:** Automatically detects user language and responds accordingly using English context.
- **Hybrid Search:** Combines HNSW (vector) and BM25 (keyword) search for maximum accuracy.
- **Render Ready:** Pre-configured for easy deployment on Render.com.

## Setup

### 1. Environment Variables
Create a `.env` file in the root directory (use `.env.example` as a template):
```env
XAI_API_KEY=your_xai_api_key
XAI_CHAT_MODEL=grok-2
XAI_EMBEDDING_MODEL=v1-embeddings
XAI_EMBEDDING_DIM=1536
```

### 2. Local Development
1. Install dependencies:
   ```bash
   npm install
   cd client && npm install && cd ..
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Start the client:
   ```bash
   cd client && npm run dev
   ```

## Deployment on Render

1. **Create a new Web Service** on Render.
2. **Connect your Repository**.
3. **Configuration:**
   - **Environment:** Node
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
4. **Environment Variables:**
   Add all variables from your `.env` file to the Render dashboard.
5. **Disk (Optional):**
   Render's filesystem is ephemeral. For persistent document storage, attach a **Persistent Disk** and mount it to `/server/data`.

## Tech Stack
- **Frontend:** React, Tailwind CSS, Vite
- **Backend:** Node.js, Express, HNSWLib, Natural
- **AI:** xAI Grok API
