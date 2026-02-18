
require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { extractText } = require("./parser");
const { hybridIndex, saveIndex } = require("./vector");
const { chatHandler } = require("./rag");

const app = express();
console.log("XAI_API_KEY Loaded:", process.env.XAI_API_KEY ? `Yes (Starts with ${process.env.XAI_API_KEY.slice(0, 4)}...)` : "No");
app.use(cors({ origin: "*" }));
app.use(express.json());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, "../client/dist")));

const upload = multer({ 
  dest: path.join(__dirname, "uploads/"),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB in bytes
});

function cleanText(text) {
  // 1. Join hyphenated words that are split across lines.
  let cleaned = text.replace(/-\n/g, '');
  // 2. Replace single newlines with a space (joins lines within a paragraph).
  cleaned = cleaned.replace(/(?<!\n)\n(?!\n)/g, ' ');
  // 3. Reduce multiple spaces to a single space.
  cleaned = cleaned.replace(/ +/g, ' ');
  // 4. Remove leading/trailing whitespace from the whole text.
  cleaned = cleaned.trim();
  return cleaned;
}

/**
 * Chunks text by splitting it into paragraphs.
 * @param {string} text - The text to chunk.
 * @returns {string[]} - An array of text chunks.
 */
function chunkTextByParagraph(text) {
  // Split by two or more newlines, which typically separate paragraphs.
  // Filter out any very short or empty paragraphs.
  return text.split(/\n\n+/).filter(p => p.trim().length > 50);
}

const FILENAMES_PATH = path.join(__dirname, "data/filenames.json");
const DATA_DIR = path.join(__dirname, "data");
const UPLOADS_DIR = path.join(__dirname, "uploads");

// Ensure data and uploads directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Initialize filenames.json if it doesn't exist
if (!fs.existsSync(FILENAMES_PATH)) {
  fs.writeFileSync(FILENAMES_PATH, JSON.stringify([]));
}

// Helper to get/set filenames
function getIndexedFiles() {
  try {
    if (!fs.existsSync(FILENAMES_PATH)) return [];
    return JSON.parse(fs.readFileSync(FILENAMES_PATH, "utf-8"));
  } catch (e) {
    console.error("Error reading filenames.json:", e);
    return [];
  }
}

function addIndexedFile(filename) {
  const files = getIndexedFiles();
  if (!files.includes(filename)) {
    files.push(filename);
    fs.writeFileSync(FILENAMES_PATH, JSON.stringify(files));
  }
}

app.post("/upload", (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Multer error: ${err.message}` });
    } else if (err) {
      return res.status(500).json({ error: `Upload error: ${err.message}` });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Check if file is already indexed
    const indexedFiles = getIndexedFiles();
    if (indexedFiles.includes(req.file.originalname)) {
      console.log(`File already indexed: ${req.file.originalname}. Skipping.`);
      return res.json({ message: "File already exists in knowledge base", chunks: 0 });
    }

    try {
      console.log(`Processing file: ${req.file.originalname} (${req.file.size} bytes)`);
      const text = await extractText(req.file.path, req.file.mimetype);
      
      if (!text || text.trim().length === 0) {
        return res.status(400).json({ error: "Could not extract text from file" });
      }

      // Clean and chunk the text
      const cleanedText = cleanText(text);
      const chunks = chunkTextByParagraph(cleanedText);
      console.log(`Created ${chunks.length} paragraph-based chunks`);

      for (let c of chunks) {
        await hybridIndex(c);
      }
      saveIndex();

      // Add to global list of indexed files
      addIndexedFile(req.file.originalname);

      res.json({ message: "Indexed successfully", chunks: chunks.length });
    } catch (error) {
      console.error("Extraction/Indexing error:", error);
      res.status(500).json({ error: `Processing failed: ${error.message}` });
    } finally {
      // Clean up uploaded file
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
  });
});

app.get("/files", (req, res) => {
  res.json(getIndexedFiles());
});

app.post("/chat", async (req, res) => {
  const { sessionId, role, question } = req.body;
  res.setHeader("Content-Type", "text/plain");
  chatHandler(sessionId, role || "user", question, res);
});

// Catch-all: serve React app for any unmatched route (SPA support)
// Express 5 requires named wildcard params instead of bare "*"
app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
