const { InferenceClient } = require('@huggingface/inference');

async function embed(text) {
  const apiKey = (process.env.HF_API_KEY || '').trim();
  const model = 'sentence-transformers/all-MiniLM-L6-v2';

  if (!apiKey) {
    console.error('HF_API_KEY is not set.');
    return simpleHash(text);
  }

  const hf = new InferenceClient(apiKey);

  try {
    const output = await hf.featureExtraction({
      model: model,
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

module.exports = { embed };