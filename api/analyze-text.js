export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { text, targetLang, nativeLang } = req.body;
  
  // Validation
  if (!text || !targetLang || !nativeLang) {
    return res.status(400).json({ error: 'Missing text, targetLang, or nativeLang' });
  }
  
  // Sanitize inputs
  const cleanText = String(text).slice(0, 5000);
  const cleanTargetLang = String(targetLang).slice(0, 50);
  const cleanNativeLang = String(nativeLang).slice(0, 50);
  
  // Languages that use morpheme splitting
  const morphemeSplitLanguages = ['ko', 'ja', 'zh'];
  const shouldSplitMorphemes = morphemeSplitLanguages.includes(cleanTargetLang);
  
  const morphemeInstructions = shouldSplitMorphemes
    ? `For this language: Break the text into meaningful morphemes (not just spaces). Separate grammatical particles from content word stems.`
    : `Keep whole words together as single units. Do NOT split words into morphemes, prefixes, suffixes, or grammatical endings.`;

  const prompt = `Analyze this ${cleanTargetLang} text for a ${cleanNativeLang} speaker.

IMPORTANT: Preserve the EXACT original text. Do not modify any characters.

${morphemeInstructions}

For each segment, provide:
- word: the EXACT text segment as it appears
- cleanWord: same as word but without punctuation
- isContentWord: true for nouns/verbs/adjectives/adverbs, false for particles/grammar/spaces
- difficulty: 1-100 (1=very common, 100=rare)
- translation: ${cleanNativeLang} translation (null if function word or space)
- partOfSpeech: grammatical category

For spaces: {"word": " ", "cleanWord": " ", "isContentWord": false, "difficulty": 0, "translation": null, "partOfSpeech": "space"}
For line breaks: {"word": "\\n", "cleanWord": "\\n", "isContentWord": false, "difficulty": 0, "translation": null, "partOfSpeech": "linebreak"}

The concatenation of all "word" fields MUST exactly equal the original input text.

Text:
${cleanText}

CRITICAL: Output ONLY a raw JSON array. No explanation, no markdown, no code fences. Start with [ and end with ]`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    const data = await response.json();
    
    if (data.content && data.content[0] && data.content[0].text) {
      let textContent = data.content[0].text.trim();
      
      // Clean markdown fences if present
      if (textContent.startsWith('```json')) {
        textContent = textContent.slice(7);
      } else if (textContent.startsWith('```')) {
        textContent = textContent.slice(3);
      }
      if (textContent.endsWith('```')) {
        textContent = textContent.slice(0, -3);
      }
      textContent = textContent.trim();
      
      // Try to parse, with repair for truncated responses
      try {
        const words = JSON.parse(textContent);
        return res.status(200).json({ words });
      } catch (parseErr) {
        const lastCompleteObject = textContent.lastIndexOf('}');
        if (lastCompleteObject > 0) {
          let repaired = textContent.slice(0, lastCompleteObject + 1);
          repaired = repaired.replace(/,\s*$/, '');
          if (!repaired.endsWith(']')) {
            repaired = repaired + ']';
          }
          try {
            const words = JSON.parse(repaired);
            return res.status(200).json({ words, truncated: true });
          } catch (repairErr) {
            return res.status(500).json({ error: 'Failed to parse response' });
          }
        }
        return res.status(500).json({ error: 'Failed to parse response' });
      }
    }
    
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
