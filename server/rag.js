const axios = require("axios");
const { hybridSearch } = require("./vector");
const { save, load } = require("./memory");

// ─── Language detection ───────────────────────────────────────────────────────
// Returns the name of the language detected in `inputText`.
// Order matters: more-specific Unicode ranges are checked before broad ones.
// For scripts shared by multiple languages, word-based heuristics are used.
function detectLanguage(inputText) {
  const text = inputText.slice(0, 500);
  const words = text.split(/[\s,।?!।॥૱ஃఁంఃಂಃംഃංසก-๛।॥᳡]+/).filter(Boolean);

  // ── Devanagari (Hindi / Marathi / Sanskrit / Nepali / Konkani / Bhojpuri / Maithili / Dogri) ─────────────────────
  if (/[\u0900-\u097F]/.test(text)) {
    // ळ (\u0933) and ऍ (\u090D) are strong Marathi indicators
    if (/[\u0933\u090D]/.test(text)) return 'Marathi';

    const strongMarathi = ['आणि','आहे','आहेत','कसा','केला','चाललंय','नाहीत','होतेस','होतीस',
      'येतोय','करायचं','काय','कधी','कुठे','कशाला','कसे','कशी','नाही','झाले','केले',
      'सांगितले','माहिती','पाहिजे','होता','होती','होते'];
    const strongHindi = ['और','है','हैं','कैसा','किया','रहा','रही','नहीं','होता','होती',
      'करना','क्या','कब','कहाँ','क्यों','कैसे','कैसी','हुआ','कहा','जानकारी','चाहिए',
      'था','थी','थे'];
    // Bhojpuri markers
    const strongBhojpuri = ['बानी', 'बानीं', 'रहल', 'रहली', 'रहलें', 'गइल', 'गेली', 'गेलें',
      'करत', 'करती', 'देखत', 'सुनत', 'मते', 'तोरा', 'मोरा', 'हमनी', 'तोहनी', 'ओकर',
      'एकर', 'कइसे', 'काहे', 'कबहू', 'जहिया', 'तहिया', 'नीक', 'बड़का', 'छोटका'];
    // Maithili markers
    const strongMaithili = ['अछि', 'अछी', 'थिक', 'थीक', 'गेल', 'गेलह', 'गेलै', 'रहल',
      'हम', 'तों', 'ओकर', 'एकर', 'सभ', 'सब', 'कोन', 'केओ', 'किछु', 'कोनो', 'अपना'];
    // Nepali markers
    const strongNepali = ['छ', 'हो', 'होइन', 'भयो', 'गर्छ', 'गयो', 'आयो', 'पो', 'ले',
      'लाई', 'बाट', 'मा', 'को', 'का', 'की', 'हामी', 'तिमी', 'ऊ', 'उनी', 'म', 'मेरो'];
    // Konkani markers (Devanagari script)
    const strongKonkani = ['आसा', 'आसता', 'जाला', 'जाता', 'करता', 'म्हजे', 'तुजे', 'ताचे',
      'तिचे', 'आमचे', 'तुमचे', 'हांगा', 'थंय', 'कित्याक', 'कसो', 'केदना', 'खंय'];
    // Dogri markers
    const strongDogri = ['हैन', 'हैना', 'गया', 'गई', 'होया', 'होई', 'करदा', 'करदी', 'आखे',
      'बोलदा', 'सुणदा', 'वेखदा', 'मेरा', 'तेरा', 'जे', 'जिन्हां', 'किन्हां'];

    let mScore = 0, hScore = 0, bScore = 0, maScore = 0, nScore = 0, kScore = 0, dScore = 0;
    words.forEach(w => {
      if (strongMarathi.includes(w)) mScore += 2;
      if (strongHindi.includes(w))   hScore += 2;
      if (strongBhojpuri.includes(w)) bScore += 2;
      if (strongMaithili.includes(w)) maScore += 2;
      if (strongNepali.includes(w)) nScore += 2;
      if (strongKonkani.includes(w)) kScore += 2;
      if (strongDogri.includes(w)) dScore += 2;
      // Marathi weak markers
      if (['मी','मला','तुला','आपण','हे','ते','त्या','त्यांना','माझे','तुझे'].includes(w)) mScore += 1;
      // Hindi weak markers
      if (['मैं','मुझे','हम','यह','वो','वे','उनको','मेरा','तेरा','में'].includes(w)) hScore += 1;
    });

    const maxScore = Math.max(mScore, hScore, bScore, maScore, nScore, kScore, dScore);
    if (maxScore === 0) return 'Hindi'; // default
    if (mScore === maxScore) return 'Marathi';
    if (bScore === maxScore) return 'Bhojpuri';
    if (maScore === maxScore) return 'Maithili';
    if (nScore === maxScore) return 'Nepali';
    if (kScore === maxScore) return 'Konkani';
    if (dScore === maxScore) return 'Dogri';
    return 'Hindi';
  }

  // ── South Indian scripts ───────────────────────────────────────────────────
  // Tamil
  if (/[\u0B80-\u0BFF]/.test(text)) {
    // Tamil has unique letters ழ, ற, ன, ண
    return 'Tamil';
  }
  // Telugu
  if (/[\u0C00-\u0C7F]/.test(text)) return 'Telugu';
  // Malayalam
  if (/[\u0D00-\u0D7F]/.test(text)) return 'Malayalam';
  // Kannada
  if (/[\u0C80-\u0CFF]/.test(text)) return 'Kannada';

  // ── East / North-East Indian scripts ──────────────────────────────────────
  // Bengali-Assamese script (shared) - need word-based differentiation
  if (/[\u0980-\u09FF]/.test(text)) {
    // Assamese-specific characters: ৰ (ra), ৱ (va), ক্ষ (khyo)
    // Bengali uses র and ব instead
    const hasAssameseChars = /[\u09F0\u09F1\u09DC\u09DD]/.test(text); // ৰ, ৱ, ড়, ঢ়
    
    const strongAssamese = ['আৰু', 'হৈছে', 'আছে', 'কৰিছে', 'গৈছে', 'আহিছে', 'পাইছে',
      'দিছে', 'লৈছে', 'হ\u09CD\u200Cল', 'কৰা', 'গ\u09CD\u200Cল', 'আহিল', 'পালে', 'দিলে', 'ল\u09CD\u200Cলে',
      'মোৰ', 'তোৰ', 'তেওঁৰ', 'ইয়াৰ', 'সেই', 'এই', 'কি', 'কিয়', 'ক\u09CD\u200Cত', 'কেনেকৈ',
      'কলি', 'বোলি', 'সোণ', 'ধৰ্ম', 'জন', 'নহয়', 'হব', 'পৰা', 'যাব', 'আহব'];
    const strongBengali = ['এবং', 'হয়েছে', 'আছে', 'করেছে', 'গেছে', 'এসেছে', 'পেয়েছে',
      'দিয়েছে', 'নিয়েছে', 'হলো', 'করা', 'গেল', 'এল', 'পেল', 'দিল', 'নিল',
      'আমার', 'তোমার', 'তার', 'এর', 'সেই', 'এই', 'কি', 'কেন', 'কোথায়', 'কীভাবে',
      'বলি', 'কলি', 'সোনা', 'ধর্ম', 'জন', 'নয়', 'হবে', 'পারা', 'যাবে', 'আসবে'];

    let aScore = hasAssameseChars ? 3 : 0;
    let bScore = 0;
    words.forEach(w => {
      if (strongAssamese.includes(w)) aScore += 2;
      if (strongBengali.includes(w)) bScore += 2;
    });

    if (aScore > bScore) return 'Assamese';
    return 'Bengali';
  }
  // Gujarati
  if (/[\u0A80-\u0AFF]/.test(text)) return 'Gujarati';
  // Punjabi (Gurmukhi)
  if (/[\u0A00-\u0A7F]/.test(text)) return 'Punjabi';
  // Odia
  if (/[\u0B00-\u0B7F]/.test(text)) return 'Odia';
  // Manipuri (Meitei Mayek)
  if (/[\uABC0-\uABFF]/.test(text)) return 'Manipuri';
  // Santhali (Ol Chiki)
  if (/[\u1C50-\u1C7F]/.test(text)) return 'Santhali';

  // ── Arabic-family scripts ──────────────────────────────────────────────────
  // Urdu, Kashmiri (Perso-Arabic), Sindhi (Perso-Arabic), Kashmiri, Sindhi
  if (/[\u0600-\u06FF]/.test(text)) {
    // Urdu-specific chars: ے گ ک پ چ ژ ڑ ں
    // Kashmiri-specific: ہ ے ی (different usage patterns)
    // Sindhi-specific: ٿ ٽ پ ڇ ڍ ڏ ڙ
    
    const strongUrdu = ['ہے', 'ہیں', 'تھا', 'تھی', 'تھے', 'ہوں', 'ہو', 'ہے', 'کا', 'کی',
      'کے', 'میں', 'سے', 'کو', 'نے', 'پر', 'اور', 'یہ', 'وہ', 'میرا', 'تمہارا', 'ہمارا'];
    const strongKashmiri = ['چھُ', 'چھِ', 'اوس', 'اۆس', 'گژھ', 'گۆش', 'یہ', 'سہ', 'ہِمہ',
      'تِمہ', 'سُہ', 'کہ', 'مہ', 'تہ', 'ہند', 'تند', 'سند', 'آس', 'گژھن', 'کرن'];
    const strongSindhi = ['آهي', 'آهن', 'هو', 'هئي', 'هئا', 'ٿو', 'ٿي', 'ٿيا', 'ڪري',
      'ڪيو', 'ڪيا', 'منهنجو', 'تنهنجو', 'ان جو', 'هي', 'هو', 'اهو', 'جيڪو', 'جيڪا'];

    let urduScore = 0, kashmiriScore = 0, sindhiScore = 0;
    words.forEach(w => {
      if (strongUrdu.includes(w)) urduScore += 2;
      if (strongKashmiri.includes(w)) kashmiriScore += 2;
      if (strongSindhi.includes(w)) sindhiScore += 2;
    });

    // Check for Urdu-specific characters
    if (/[\u06BE\u06C1\u06CC\u067E\u0686\u0691\u06BA]/.test(text)) urduScore += 2;

    const maxScore = Math.max(urduScore, kashmiriScore, sindhiScore);
    if (maxScore === 0) return 'Arabic';
    if (kashmiriScore === maxScore) return 'Kashmiri';
    if (sindhiScore === maxScore) return 'Sindhi';
    return 'Urdu';
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
    // Devanagari-script languages
    Hindi:      'Devanagari',
    Marathi:    'Devanagari',
    Sanskrit:   'Devanagari',
    Nepali:     'Devanagari',
    Bhojpuri:   'Devanagari',
    Maithili:   'Devanagari',
    Konkani:    'Devanagari',
    Dogri:      'Devanagari',
    // South Indian scripts
    Tamil:      'Tamil',
    Telugu:     'Telugu',
    Kannada:    'Kannada',
    Malayalam:  'Malayalam',
    // East/North-East Indian scripts
    Bengali:    'Bengali',
    Assamese:   'Bengali',
    Gujarati:   'Gujarati',
    Punjabi:    'Gurmukhi',
    Odia:       'Odia',
    Manipuri:   'Meitei Mayek',
    Santhali:   'Ol Chiki',
    // Arabic-family scripts
    Arabic:     'Arabic',
    Urdu:       'Nastaliq (Arabic)',
    Kashmiri:   'Nastaliq (Arabic)',
    Sindhi:     'Nastaliq (Arabic)',
    // East Asian scripts
    Chinese:    'Chinese (Hanzi)',
    Japanese:   'Japanese (Hiragana/Katakana/Kanji)',
    Korean:     'Korean (Hangul)',
    // Default
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
