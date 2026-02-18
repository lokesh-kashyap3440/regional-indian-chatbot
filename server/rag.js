const axios = require("axios");
const { hybridSearch } = require("./vector");
const { save, load } = require("./memory");

function detectLanguage(inputText) {
  const text = inputText.slice(0, 500);
  if (/[\u0900-\u097F]/.test(text)) {
    if (/[\u0933\u090D]/.test(text)) return 'Marathi';
    const strongMarathi = ['आणि', 'आहे', 'आहेत', 'कसा', 'केला', 'चाललंय', 'नाहीत', 'होतेस', 'होतीस', 'येतोय', 'करायचं', 'काय', 'कधी', 'कुठे', 'कशाला', 'कसे', 'कशी', 'नाही', 'झाले', 'केले', 'सांगितले', 'माहिती', 'पाहिजे', 'होता', 'होती', 'होते'];
    const strongHindi = ['और', 'है', 'हैं', 'कैसा', 'किया', 'रहा', 'रही', 'नहीं', 'होता', 'होती', 'करना', 'क्या', 'कब', 'कहाँ', 'क्यों', 'कैसे', 'कैसी', 'नहीं', 'हुआ', 'किया', 'कहा', 'जानकारी', 'चाहिए', 'था', 'थी', 'थे'];
    const words = text.split(/[\s,।?!]+/).filter(Boolean);
    let marathiScore = 0;
    let hindiScore = 0;
    words.forEach(word => {
      if (strongMarathi.includes(word)) marathiScore += 2;
      if (strongHindi.includes(word)) hindiScore += 2;
      if (['मी', 'मला', 'तुला', 'आपण', 'हे', 'ते', 'त्या', 'त्यांना', 'माझे', 'तुझे'].includes(word)) marathiScore += 1;
      if (['मैं', 'मुझे', 'तुझे', 'हम', 'यह', 'वो', 'वे', 'उनको', 'मेरा', 'तेरा', 'में'].includes(word)) hindiScore += 1;
    });
    if (marathiScore > hindiScore) return 'Marathi';
    if (hindiScore > marathiScore) return 'Hindi';
    return 'Hindi';
  }
  if (/[\u0B80-\u0BFF]/.test(text)) return 'Tamil';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'Telugu';
  if (/[\u0D00-\u0D7F]/.test(text)) return 'Malayalam';
  if (/[\u0C80-\u0CFF]/.test(text)) return 'Kannada';
  if (/[\u0980-\u09FF]/.test(text)) return 'Bengali';
  if (/[\u0A80-\u0AFF]/.test(text)) return 'Gujarati';
  if (/[\u0600-\u06FF]/.test(text)) return 'Arabic';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'Chinese';
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'Japanese';
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) return 'Korean';
  return 'English';
}

async function chatHandler(sessionId, role, question, resStream) {
  save(sessionId, role, question).catch(err => console.error("Background save failed", err));

  const [docs, fullMemory] = await Promise.all([
    hybridSearch(question, 3),
    load(sessionId)
  ]);
  
  const recentMemory = fullMemory.slice(-6);
  const contextText = docs.join("\n").slice(0, 1500);

  const detectedLang = detectLanguage(question);
  console.log(`SESSION ${sessionId} | Detected Language: ${detectedLang} | Query: "${question.slice(0, 50)}"`);

  const prompt = `
You are a specialized AI assistant for multilingual question answering. Your task is to answer a user's question in their own language, using only the provided English context.

**Follow these steps carefully:**
1.  **Analyze the User's Question:** The user's question is in ${detectedLang}: "${question}". Understand what they are asking for.
2.  **Scan the Context:** Read the "Context" section below to find relevant information. The context is in English.
3.  **Synthesize the Answer:** Based *only* on the English context, formulate a concise answer to the user's question.
4.  **Translate and Respond:** Translate your synthesized answer into ${detectedLang} and provide that as the final response.

**Strict Rules:**
-   **Use ONLY the Context:** Do not use any outside knowledge. If the answer is not in the context, you MUST say (in ${detectedLang}): "I am sorry, but the provided documents do not have information on this topic."
-   **Language Purity:** Your final response must be ONLY in ${detectedLang}. Do not include any English words or phrases, unless they are proper nouns present in the context.
-   **No PII**: Do not repeat or ask for any Personally Identifiable Information.

**Context (English):**
${contextText || "No context available."}

**Conversation History:**
${recentMemory.map(m => `${m.role}: ${m.content}`).join("\n")}

**User Question (${detectedLang}):** ${question}
`;

  const apiKey = process.env.XAI_API_KEY;
  const model = process.env.XAI_CHAT_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    resStream.write("Error: XAI_API_KEY is not set.");
    resStream.end();
    return;
  }

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: model,
        messages: [
          { role: "system", content: "You are a helpful assistant that follows instructions strictly." },
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

    // xAI returns stream in OpenAI format (data: {...})
    // We need to extract the content delta
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
              // Wrap in JSON for frontend compatibility
              resStream.write(JSON.stringify({ response: content }) + "\n");
            }
          } catch (e) {
            // Ignore parse errors for partial chunks
          }
        }
      }
    });

    response.data.on('end', () => resStream.end());
    response.data.on('error', (err) => {
        console.error("Stream Error:", err);
        resStream.end();
    });

  } catch (error) {
    console.error("Generation Error:", error.response ? error.response.data : error.message);
    resStream.write("Error generating response.");
    resStream.end();
  }
}

module.exports = { chatHandler };
