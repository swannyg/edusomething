export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Only accept region + year — nothing else can be sent to Anthropic
  const { region, year } = req.body;
  if (!region || !year) return res.status(400).json({ error: 'Missing region or year' });

  const cleanRegion = String(region).slice(0, 100);
  const cleanYear   = String(year).slice(0, 20);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      system: 'You are a specialist historian of global education. Return ONLY valid JSON — no markdown fences, no preamble, no extra text.',
      messages: [{
        role: 'user',
        content: `Educational history for "${cleanRegion}" around ${cleanYear}.

Return ONLY this JSON object:
{
  "region": "Political entity name at this time",
  "period": "Short era descriptor",
  "access": "Who had access: gender, class, age, urban/rural",
  "curriculum": "What was taught: subjects, texts, methods",
  "institutions": "Key schools, academies, scholars or texts",
  "literacy": "Literacy rate or honest note if unknown",
  "isColonial": false,
  "indigenous": null,
  "colonial": null
}

If colonial period: set isColonial to true and populate indigenous and colonial fields. One to three sentences per field.`
      }]
    })
  });

  const data = await response.json();
  res.status(response.status).json(data);
}
