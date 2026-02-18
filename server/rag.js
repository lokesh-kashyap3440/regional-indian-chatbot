const axios = require("axios");
const { hybridSearch } = require("./vector");
const { save, load } = require("./memory");

// ─── Language detection ───────────────────────────────────────────────────────
// Returns the name of the language detected in `inputText`.
// Order matters: more-specific Unicode ranges are checked before broad ones.
function detectLanguage(inputText) {
  const text = inputText.slice(0, 500);

  // ── Devanagari (Hindi / Marathi / Sanskrit / Nepali) ─────────────────────
  if (/[\u0900-\u097F]/.test(text)) {
    // ळ (\u0933) and ऍ (\u090D) are strong Marathi indicators
    if (/[\u0933\u090D]/.test(text)) return 'Marathi';

    const strongMarathi = ['आणि','आहे','आहेत','कसा','केला','चाललंय','नाहीत','होतेस','होतीस',
      'येतोय','करायचं','काय','कधी','कुठे','कशाला','कसे','कशी','नाही','झाले','केले',
      'सांगितले','माहिती','पाहिजे','होता','होती','होते'];
    const strongHindi = ['और','है','हैं','कैसा','किया','रहा','रही','नहीं','होता','होती',
      'करना','क्या','कब','कहाँ','क्यों','कैसे','कैसी','हुआ','कहा','जानकारी','चाहिए',
      'था','थी','थे'];

    const words = text.split(/[\s,।?!]+/).filter(Boolean);
    let mScore = 0, hScore = 0;
    words.forEach(w => {
      if (strongMarathi.includes(w)) mScore += 2;
      if (strongHindi.includes(w))   hScore += 2;
      if (['मी','मला','तुला','आपण','हे','ते','त्या','त्यांना','माझे','तुझे'].includes(w)) mScore += 1;
      if (['मैं','मुझे','हम','यह','वो','वे','उनको','मेरा','तेरा','में'].includes(w)) hScore += 1;
    });
    if (mScore > hScore) return 'Marathi';
    return 'Hindi';   // default for Devanagari
  }

  // ── South Indian scripts ───────────────────────────────────────────────────
  if (/[\u0B80-\u0BFF]/.test(text)) return 'Tamil';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'Telugu';
  if (/[\u0D00-\u0D7F]/.test(text)) return 'Malayalam';
  if (/[\u0C80-\u0CFF]/.test(text)) return 'Kannada';

  // ── East / North-East Indian scripts ──────────────────────────────────────
  if (/[\u0980-\u09FF]/.test(text)) return 'Bengali';
  if (/[\u0A80-\u0AFF]/.test(text)) return 'Gujarati';
  if (/[\u0A00-\u0A7F]/.test(text)) return 'Punjabi';
  if (/[\u0B00-\u0B7F]/.test(text)) return 'Odia';

  // ── Arabic-family scripts ──────────────────────────────────────────────────
  // Urdu check first (common Urdu-specific chars: ے گ ک پ چ ژ)
  if (/[\u0600-\u06FF]/.test(text)) {
    if (/[\u06BE\u06C1\u06CC\u067E\u0686]/.test(text)) return 'Urdu';
    return 'Arabic';
  }

  // ── East Asian scripts ─────────────────────────────────────────────────────
  if (/[\u4E00-\u9FFF]/.test(text)) return 'Chinese';
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'Japanese';
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) return 'Korean';

  return 'English';
}

// Returns the native script name for a given language – used in prompts to
// explicitly instruct the model which script to use.
function getScriptName(lang) {
  const scripts = {
    Hindi:      'Devanagari',
    Marathi:    'Devanagari',
    Sanskrit:   'Devanagari',
    Nepali:     'Devanagari',
    Tamil:      'Tamil',
    Telugu:     'Telugu',
    Kannada:    'Kannada',
    Malayalam:  'Malayalam',
    Bengali:    'Bengali',
    Gujarati:   'Gujarati',
    Punjabi:    'Gurmukhi',
    Odia:       'Odia',
    Arabic:     'Arabic',
    Urdu:       'Nastaliq (Arabic)',
    Chinese:    'Chinese (Hanzi)',
    Japanese:   'Japanese (Hiragana/Katakana/Kanji)',
    Korean:     'Korean (Hangul)',
    English:    'Latin',
  };
  return scripts[lang] || lang;
}

// ─── Chat handler ─────────────────────────────────────────────────────────────
async function chatHandler(sessionId, role, question, resStream) {
  save(sessionId, role, question).catch(err => console.error("Background save failed", err));

  const [docs, fullMemory] = await Promise.all([
    hybridSearch(question, 3),
    load(sessionId)
  ]);

  const recentMemory = fullMemory.slice(-6);
  const contextText  = docs.join("\n").slice(0, 1500);

  const detectedLang = detectLanguage(question);
  const scriptName   = getScriptName(detectedLang);
  console.log(`SESSION ${sessionId} | Lang: ${detectedLang} (${scriptName}) | Query: "${question.slice(0, 60)}"`);

  // Send language metadata as the very first stream chunk so the frontend can
  // display a language badge without waiting for the full response.
  resStream.write(JSON.stringify({ type: "meta", lang: detectedLang }) + "\n");

  const hasContext = contextText && contextText.trim().length > 0;

  const prompt = `
You are a helpful multilingual AI assistant.

═══════════════════════════════════════════════════════
⚠️  CRITICAL LANGUAGE RULE — READ FIRST
═══════════════════════════════════════════════════════
The user wrote in ${detectedLang}.
You MUST write your ENTIRE response in ${detectedLang} using the native ${scriptName} script.
• Do NOT switch to English mid-response.
• Do NOT transliterate ${detectedLang} words into Latin characters.
• Technical terms, proper nouns, and brand names that have no ${detectedLang} equivalent may remain in their original form.
• If you find it difficult to express something in ${detectedLang}, choose simple ${detectedLang} words rather than falling back to English.
═══════════════════════════════════════════════════════

**How to use the provided Context:**
${hasContext
  ? `- Relevant excerpts from the user's uploaded documents are shown below under "Context".
- If the answer is clearly present in the Context, use it as your PRIMARY source.
- If the Context is partially relevant, combine it with your general knowledge for a complete answer.
- If the Context is irrelevant to the question, ignore it and answer from general knowledge.`
  : `- No document context is available for this query.  Answer from your general knowledge.`}

**Additional rules:**
- Be concise yet complete.
- Do not repeat or ask for Personally Identifiable Information.
- Always respond in ${detectedLang} using ${scriptName} script.

${hasContext ? `**Context (from uploaded documents):**\n${contextText}\n` : ""}
**Conversation History:**
${recentMemory.map(m => `${m.role}: ${m.content}`).join("\n")}

**User Question (${detectedLang}):** ${question}

**Your response (${detectedLang}, ${scriptName} script):**
`;

  const apiKey = process.env.XAI_API_KEY;
  const model  = process.env.XAI_CHAT_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    resStream.write(JSON.stringify({ response: "Error: XAI_API_KEY is not set." }) + "\n");
    resStream.end();
    return;
  }

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model,
        messages: [
          {
            role: "system",
            content: `You are a strict multilingual assistant. When the user writes in a non-English language you MUST respond entirely in that same language using its native script. Never switch to English.`
          },
          ...recentMemory.map(m => ({ role: m.role, content: m.content })),
          { role: "user", content: prompt }
        ],
        stream: true,
        temperature: 0.7
      },
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        responseType: "stream"
      }
    );

    response.data.on('data', chunk => {
      const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
      for (const line of lines) {
        if (line === 'data: [DONE]') {
          resStream.end();
          return;
        }
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices[0].delta.content;
            if (content) {
              resStream.write(JSON.stringify({ response: content }) + "\n");
            }
          } catch (e) {
            // Ignore parse errors for partial/incomplete SSE chunks
          }
        }
      }
    });

    response.data.on('end',   ()    => resStream.end());
    response.data.on('error', (err) => { console.error("Stream Error:", err); resStream.end(); });

  } catch (error) {
    console.error("Generation Error:", error.response ? error.response.data : error.message);
    resStream.write(JSON.stringify({ response: "Error generating response." }) + "\n");
    resStream.end();
  }
}

module.exports = { chatHandler };
