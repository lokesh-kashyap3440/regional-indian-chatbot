const { HierarchicalNSW } = require('hnswlib-node');
const fs = require("fs");
const path = require("path");
const { embed, EMBED_MODEL } = require("./embed");
const natural = require("natural");

const dim = parseInt(process.env.XAI_EMBEDDING_DIM) || 384;
const indexPath      = path.join(__dirname, "data/vector.index");
const docsPath       = path.join(__dirname, "data/docs.json");
const filenamesPath  = path.join(__dirname, "data/filenames.json");
const modelVerPath   = path.join(__dirname, "data/model_version.txt");

// ─── Unicode-aware tokenizer ──────────────────────────────────────────────────
// natural.WordTokenizer strips every non-ASCII character, which silently drops
// all Devanagari, Tamil, Telugu, Arabic … tokens, making BM25 useless for
// regional languages.  This simple splitter preserves Unicode text while still
// splitting on whitespace and common punctuation.
function unicodeTokenize(text) {
  return text
    .split(/[\s\u0964\u0965\u104A\u104B.,!?;:()\[\]{}"'\-\/\\]+/)
    .map(t => t.trim())
    .filter(t => t.length > 1);
}

// ─── Embedding model version guard ───────────────────────────────────────────
// If the persisted index was built with a different embedding model the vectors
// live in incompatible spaces.  Detect that and wipe the stale data so users
// get a clean slate (they just need to re-upload their documents).
function checkAndResetIndex() {
  if (!fs.existsSync(modelVerPath)) return false;          // fresh install
  const savedModel = fs.readFileSync(modelVerPath, 'utf-8').trim();
  if (savedModel === EMBED_MODEL) return true;              // same model – all good

  console.warn(`⚠️  Embedding model changed:`);
  console.warn(`    was : ${savedModel}`);
  console.warn(`    now : ${EMBED_MODEL}`);
  console.warn(`   Clearing stale vector index. Please re-upload your documents.`);

  if (fs.existsSync(indexPath))    fs.unlinkSync(indexPath);
  if (fs.existsSync(docsPath))     fs.unlinkSync(docsPath);
  if (fs.existsSync(filenamesPath)) fs.writeFileSync(filenamesPath, '[]');

  return false;   // signal: no valid index on disk
}

const indexExists = checkAndResetIndex();

// ─── Index initialisation ─────────────────────────────────────────────────────
let index;
let documents = [];

if (indexExists && fs.existsSync(indexPath)) {
  index = new HierarchicalNSW('cosine', dim);
  index.readIndexSync(indexPath);
  documents = JSON.parse(fs.readFileSync(docsPath));
  console.log(`Loaded vector index (${documents.length} docs, model: ${EMBED_MODEL})`);
} else {
  index = new HierarchicalNSW('cosine', dim);
  index.initIndex(20000);
  console.log(`Initialised fresh vector index (model: ${EMBED_MODEL})`);
}

// ─── BM25 bootstrap ──────────────────────────────────────────────────────────
const bm25 = new natural.BayesClassifier();

if (documents.length > 0) {
  documents.forEach(doc => bm25.addDocument(unicodeTokenize(doc), doc));
  bm25.train();
}

// ─── Public API ───────────────────────────────────────────────────────────────
async function hybridIndex(text) {
  const vector = await embed(text);
  const id = documents.length;

  if (index.getMaxElements() <= id) {
    const newSize = Math.max(index.getMaxElements() * 2, id + 1);
    index.resizeIndex(newSize);
  }

  index.addPoint(vector, id);
  documents.push(text);

  const tokens = unicodeTokenize(text);
  if (tokens.length > 0) {
    bm25.addDocument(tokens, text);
  }
}

function saveIndex() {
  index.writeIndexSync(indexPath);
  fs.writeFileSync(docsPath, JSON.stringify(documents));
  // Persist the model that was used so we can detect future model changes.
  fs.writeFileSync(modelVerPath, EMBED_MODEL);
  bm25.train();
}

async function hybridSearch(query, k = 5, alpha = 0.6) {
  if (documents.length === 0) return [];

  const queryTokens = unicodeTokenize(query);
  const queryVector = await embed(query);
  const vectorResults = index.searchKnn(queryVector, Math.min(k, documents.length));
  const keywordResults = bm25.getClassifications(queryTokens);

  const fusedScores = {};

  vectorResults.neighbors.forEach((docId, i) => {
    const rank = i + 1;
    const doc = documents[docId];
    if (!fusedScores[doc]) fusedScores[doc] = 0;
    fusedScores[doc] += alpha * (1 / (rank + 60));
  });

  keywordResults.forEach((item, i) => {
    const rank = i + 1;
    const doc = item.label;
    if (!fusedScores[doc]) fusedScores[doc] = 0;
    fusedScores[doc] += (1 - alpha) * (1 / (rank + 60));
  });

  const sortedDocs = Object.keys(fusedScores).sort((a, b) => fusedScores[b] - fusedScores[a]);
  return sortedDocs.slice(0, k);
}

module.exports = { hybridIndex, hybridSearch, saveIndex };
