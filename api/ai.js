import { handleError, json, rateLimit, readBody, requireUser } from './_kv.js';

const DEFAULT_MODEL = 'gpt-5.5';

function extractText(payload) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || '')
    .join('')
    .trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });

  try {
    const user = await requireUser(req);
    await rateLimit(`ai:${user.id}`, 20, 60 * 60);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return json(res, 503, { error: 'A IA ainda não foi configurada no ambiente.' });

    const body = await readBody(req);
    const prompt = String(body.prompt || '').trim().slice(0, 1200);
    if (!prompt) return json(res, 400, { error: 'Envie um pedido para a IA.' });

    const tasks = Array.isArray(body.tasks) ? body.tasks.slice(0, 80).map((task) => ({
      title: String(task?.title || '').slice(0, 180),
      time: String(task?.time || '').slice(0, 5),
      priority: String(task?.priority || 'media'),
      project: String(task?.project || '').slice(0, 100),
      done: Boolean(task?.done),
    })) : [];

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        reasoning: { effort: 'low' },
        text: { verbosity: 'low' },
        input: [
          {
            role: 'system',
            content: 'Você é o copiloto de produtividade do Ritmo. Responda em português do Brasil, de forma direta, humana e realista. Priorize no máximo três ações, respeite horários e não use tom de cobrança. Limite a resposta a 700 caracteres.',
          },
          {
            role: 'user',
            content: JSON.stringify({ pedido: prompt, data: String(body.date || '').slice(0, 10), tarefas: tasks }),
          },
        ],
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error?.message || 'A IA não conseguiu responder agora.');
      error.status = response.status >= 500 ? 502 : response.status;
      throw error;
    }

    return json(res, 200, { answer: extractText(payload) || 'Não recebi uma resposta em texto.' });
  } catch (error) {
    return handleError(res, error);
  }
}
