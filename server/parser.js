
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const Tesseract = require("tesseract.js");
const fs = require("fs");

async function extractText(filePath, mimetype) {
  try {
    console.log(`Extracting text from: ${filePath} (${mimetype})`);
    
    if (mimetype.includes("pdf")) {
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      console.log(`PDF parse successful, extracted ${data.text?.length || 0} chars`);
      
      // If PDF has no text (e.g., scanned images), OCR might be needed.
      // For now, return what we have.
      return data.text || "";
    }

    if (mimetype.includes("word") || mimetype.includes("officedocument.wordprocessingml")) {
      const result = await mammoth.extractRawText({ path: filePath });
      console.log(`Word parse successful, extracted ${result.value?.length || 0} chars`);
      return result.value || "";
    }

    if (mimetype.includes("text/plain")) {
      const text = fs.readFileSync(filePath, "utf-8");
      console.log(`Text file read successful, extracted ${text.length} chars`);
      return text;
    }

    if (mimetype.includes("image")) {
      console.log("Starting OCR with Tesseract...");
      const { data: { text } } = await Tesseract.recognize(
        filePath,
        "eng+hin+mar", // Reduced languages for speed and reliability
        { logger: m => console.log(`OCR Progress: ${m.status} - ${Math.round(m.progress * 100)}%`) }
      );
      console.log(`OCR successful, extracted ${text?.length || 0} chars`);
      return text || "";
    }

    console.warn(`Unsupported mimetype: ${mimetype}`);
    return "";
  } catch (err) {
    console.error(`Extraction failed: ${err.message}`);
    throw err;
  }
}

module.exports = { extractText };
