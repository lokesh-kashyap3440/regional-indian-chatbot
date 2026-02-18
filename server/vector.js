const { HierarchicalNSW } = require('hnswlib-node');
const fs = require("fs");
const path = require("path");
const { embed } = require("./embed");
const natural = require("natural");

// Make dimension configurable
const dim = parseInt(process.env.XAI_EMBEDDING_DIM) || 384; 
const indexPath = path.join(__dirname, "data/vector.index");

let index;
let documents = [];

if (fs.existsSync(indexPath)) {
  index = new HierarchicalNSW('cosine', dim);
  index.readIndexSync(indexPath);
  documents = JSON.parse(fs.readFileSync(path.join(__dirname, "data/docs.json")));
} else {
  index = new HierarchicalNSW('cosine', dim);
  index.initIndex(20000);
}

const tokenizer = new natural.WordTokenizer();
const bm25 = new natural.BayesClassifier();

if (documents.length > 0) {
  documents.forEach(doc => bm25.addDocument(tokenizer.tokenize(doc), doc));
  bm25.train();
}

async function hybridIndex(text) {
  const vector = await embed(text);
  const id = documents.length;

  if (index.getMaxElements() <= id) {
    const newSize = Math.max(index.getMaxElements() * 2, id + 1);
    index.resizeIndex(newSize);
  }

  index.addPoint(vector, id);
  documents.push(text);

  const tokens = tokenizer.tokenize(text);
  if (tokens.length > 0) {
    bm25.addDocument(tokens, text);
  }
}

function saveIndex() {
  index.writeIndexSync(indexPath);
  fs.writeFileSync(path.join(__dirname, "data/docs.json"), JSON.stringify(documents));
  bm25.train();
}

async function hybridSearch(query, k = 5, alpha = 0.6) {
  const queryTokens = tokenizer.tokenize(query);
  const queryVector = await embed(query);
  const vectorResults = index.searchKnn(queryVector, k);
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
