const DEFAULT_MODEL = 'gpt-5.5';

function getBody(req) {
  if (typeof req.body === 'object' && req.body !== null) return req.body;

  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return {};
  }
}

function extractText(payload) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || '')
    .join('')
    .trim();
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Metodo nao permitido.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Configure OPENAI_API_KEY no ambiente do backend.' });
  }

  const body = getBody(req);
  const prompt = String(body.prompt || '').trim();

  if (!prompt) {
    return res.status(400).json({ error: 'Envie um prompt para a IA.' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        reasoning: { effort: 'low' },
        text: { verbosity: 'low' },
        input: [
          {
            role: 'system',
            content:
              'Voce e uma IA de planejamento pessoal dentro de um habit tracker. Responda em portugues do Brasil, com tom direto, humano e pratico. Use no maximo 5 linhas.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              pedido: prompt,
              data: body.date,
              habitos: body.habits || [],
              tarefas: body.tasks || [],
              diario: body.journal || {},
            }),
          },
        ],
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: payload.error?.message || 'A OpenAI nao conseguiu responder agora.' });
    }

    return res.status(200).json({ answer: extractText(payload) || 'Nao recebi uma resposta em texto.' });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro inesperado ao chamar a OpenAI.',
    });
  }
}
