const { InferenceClient } = require('@huggingface/inference');

// Switched from English-only all-MiniLM-L6-v2 to a cross-lingual multilingual model.
// paraphrase-multilingual-MiniLM-L12-v2 supports 50+ languages (Hindi, Tamil, Telugu,
// Kannada, Malayalam, Bengali, Gujarati, Marathi, Arabic, Chinese, Japanese, Korean …)
// and shares a 384-dim embedding space so XAI_EMBEDDING_DIM stays the same.
// Cross-lingual property: a Hindi query can match an English document about the same topic.
const EMBED_MODEL = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2';

async function embed(text) {
  const apiKey = (process.env.HF_API_KEY || '').trim();

  if (!apiKey) {
    console.error('HF_API_KEY is not set.');
    return simpleHash(text);
  }

  const hf = new InferenceClient(apiKey);

  try {
    const output = await hf.featureExtraction({
      model: EMBED_MODEL,
      inputs: text,
    });

    return Array.from(output);
  } catch (error) {
    console.error('HF EMBEDDING FAILED:', error.message);
    return simpleHash(text);
  }
}

function simpleHash(str) {
  const dim = parseInt(process.env.XAI_EMBEDDING_DIM) || 384;
  const hash = new Array(dim).fill(0);
  for (let i = 0; i < str.length; i++) {
    hash[i % dim] = (hash[i % dim] + str.charCodeAt(i)) % 256;
  }
  return hash.map(x => x / 256);
}

module.exports = { embed, EMBED_MODEL };
