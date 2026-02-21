function extractSection(text, start, end = null) {
  if (!text) return "";

  if (end) {
    const regex = new RegExp(start + "([\\s\\S]*?)" + end);
    const match = text.match(regex);
    return match ? match[1].trim() : "";
  } else {
    const regex = new RegExp(start + "([\\s\\S]*)");
    const match = text.match(regex);
    return match ? match[1].trim() : "";
  }
}

function getValue(label, text) {
  const match = text.match(new RegExp(label + ":\\s*(.*)"));
  return match ? match[1].trim() : "-";
}

// Parse different document types
async function parseDocument(file) {
  const fileName = file.name.toLowerCase();
  
  if (fileName.endsWith('.txt')) {
    return await file.text();
  } 
  else if (fileName.endsWith('.pdf')) {
    return await parsePDF(file);
  }
  else if (fileName.endsWith('.docx')) {
    return await parseDocx(file);
  }
  else if (fileName.endsWith('.doc')) {
    return await parseDoc(file);
  }
  else {
    throw new Error("Unsupported file type. Please upload: PDF, DOCX, DOC, or TXT");
  }
}

// Parse PDF using pdf.js
async function parsePDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
  let fullText = "";
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(" ");
    fullText += pageText + "\n";
  }
  
  return fullText;
}

// Parse DOCX using mammoth
async function parseDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
  return result.value;
}

// Parse DOC (old format) using jszip
async function parseDoc(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    // Try to read document.xml if it exists
    if (zip.file('word/document.xml')) {
      const xmlContent = await zip.file('word/document.xml').async('text');
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
      const textElements = xmlDoc.querySelectorAll('w\\:t');
      let fullText = "";
      textElements.forEach(el => {
        fullText += el.textContent + " ";
      });
      return fullText.trim();
    }
    
    // Fallback: Extract text from binary structure
    const uint8Array = new Uint8Array(arrayBuffer);
    let extractedText = "";
    let currentWord = "";
    
    for (let i = 0; i < uint8Array.length; i++) {
      const byte = uint8Array[i];
      if ((byte >= 32 && byte <= 126) || byte === 10 || byte === 13) {
        currentWord += String.fromCharCode(byte);
      } else {
        if (currentWord.length > 2) {
          extractedText += currentWord + " ";
        }
        currentWord = "";
      }
    }
    
    if (currentWord.length > 2) {
      extractedText += currentWord;
    }
    
    return extractedText.trim();
  } catch (error) {
    console.error('Error parsing DOC file:', error);
    return "Could not parse DOC file. Please convert to DOCX or PDF for best results.";
  }
}

async function analyze() {

  const role = document.getElementById("role").value.trim();
  const file = document.getElementById("resume").files[0];
  const spinner = document.getElementById("loadingSpinner");
  const scanLine = document.getElementById("scanLine");

  if (!file) {
    alert("Upload resume first");
    return;
  }

  spinner.classList.remove("d-none");
  if (scanLine) scanLine.classList.remove("d-none");

  try {

    const text = await parseDocument(file);
    document.getElementById("resumePreview").innerText = text;

    const response = await fetch("http://localhost:3000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `
You are a strict senior technical recruiter.

Analyze this resume for the role: ${role}

Return output EXACTLY in this format:

Recruiter 6-Second Scan:
Verdict:
First Impression:
Key Strength:
Key Weakness:
Immediate Recruiter Action:

Industry Readiness Score:
Overall: XX%

Score Breakdown:
Skill Depth: XX%
Project Quality: XX%
Practical Exposure: XX%
Tools Usage: XX%

Missing Skills Detector:
1.
2.
3.
4.
5.

Brutally Honest Feedback:
Line 1
Line 2

AI Suggestions:
1.
2.
3.
4.
5.

Be strict.
Be concise.
No extra commentary.

Resume:
${text}
`
      })
    });

    if (!response.ok) {
      throw new Error("Server error");
    }

    const data = await response.json();

    if (!data.candidates || !data.candidates.length) {
      throw new Error("Invalid AI response");
    }

    const result = data.candidates[0].content.parts[0].text;
    console.log("AI RAW RESULT:", result);

    // ---------------------------
    // Recruiter 6 Second Scan
    // ---------------------------
    const sixScanText = extractSection(
      result,
      "Recruiter 6-Second Scan:",
      "Industry Readiness Score:"
    );

    document.getElementById("sixScan").innerText = sixScanText;

    // ---------------------------
    // Dashboard Scores
    // ---------------------------
    document.getElementById("overallScore").innerText =
      getValue("Overall", result);

    document.getElementById("skillDepth").innerText =
      getValue("Skill Depth", result);

    document.getElementById("projectQuality").innerText =
      getValue("Project Quality", result);

    document.getElementById("practicalExposure").innerText =
      getValue("Practical Exposure", result);

    document.getElementById("toolsUsage").innerText =
      getValue("Tools Usage", result);

    // ---------------------------
    // Missing Skills
    // ---------------------------
    const missingText = extractSection(
      result,
      "Missing Skills Detector:",
      "Brutally Honest Feedback:"
    );

    const missingList = document.getElementById("missingSkills");
    missingList.innerHTML = "";

    missingText.split("\n").slice(0, 5).forEach(line => {
      if (line.trim()) {
        const li = document.createElement("li");
        li.innerText = line.replace(/^\d+\./, "").trim();
        missingList.appendChild(li);
      }
    });

    // ---------------------------
    // Brutally Honest Feedback
    // ---------------------------
    const brutalText = extractSection(
      result,
      "Brutally Honest Feedback:",
      "AI Suggestions:"
    );

    document.getElementById("brutalFeedback").innerText =
      brutalText.split("\n").slice(0, 2).join("\n");

    // ---------------------------
    // AI Suggestions
    // ---------------------------
    const suggestionText = extractSection(
      result,
      "AI Suggestions:"
    );

    const suggestionList = document.getElementById("aiSuggestions");
    suggestionList.innerHTML = "";

    suggestionText.split("\n").slice(0, 5).forEach(line => {
      if (line.trim()) {
        const li = document.createElement("li");
        li.innerText = line.replace(/^\d+\./, "").trim();
        suggestionList.appendChild(li);
      }
    });

  } catch (error) {
    console.error(error);
    alert("Something went wrong. Check server or response format.");
  } finally {
    spinner.classList.add("d-none");
    if (scanLine) scanLine.classList.add("d-none");
  }
}