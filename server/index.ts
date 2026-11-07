import Anthropic from '@anthropic-ai/sdk';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assistantRequestSchema, assistantResponseSchema, assistantToolSchema } from './schemas.js';

try {
  process.loadEnvFile?.();
} catch {
  // A .env file is optional; deployment environments normally inject variables.
}

const app = express();
const port = Number(process.env.PORT || 8787);
const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const apiKey = process.env.ANTHROPIC_API_KEY;

app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, aiConfigured: Boolean(apiKey), model });
});

app.post('/api/assistant', async (request, response) => {
  const parsed = assistantRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: 'Please check the details you entered and try again.', code: 'INVALID_REQUEST' });
    return;
  }
  if (!apiKey) {
    response.status(503).json({
      message: 'Cora’s AI service has not been connected yet. You can still use all manual controls and the demo.',
      code: 'AI_NOT_CONFIGURED',
    });
    return;
  }

  try {
    const client = new Anthropic({ apiKey });
    const currentDate = new Date().toISOString().slice(0, 10);
    const result = await client.messages.create({
      model,
      max_tokens: 1400,
      system: `You are Cora, a concise, empathetic UK banking assistant for a concept prototype. Interpret the customer's message and propose exactly one validated action. You never mutate money directly, promise affordability, shame spending, or invent an ambiguous date. Ask for clarification when a schedule or requested change cannot be safely identified. All monetary amounts in tool input MUST be integer pennies (for example £12.34 is 1234). Dates MUST be YYYY-MM-DD. Today is ${currentDate}. Use IDs exactly as given in the financial state. Distinguish temporary changes from permanent ones. An allocation is earmarking, not a payment. Keep the customer-facing message under 90 words.`,
      messages: [
        {
          role: 'user',
          content: `Customer message:\n${parsed.data.message}\n\nCurrent financial state:\n${JSON.stringify(parsed.data.state)}`,
        },
      ],
      tools: [
        {
          name: 'propose_financial_action',
          description: 'Propose one safe, structured financial action for application-side validation and customer confirmation.',
          input_schema: assistantToolSchema as unknown as Anthropic.Messages.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'auto' },
    });
    const toolUse = result.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('No structured proposal returned');
    const validated = assistantResponseSchema.safeParse(toolUse.input);
    if (!validated.success) throw new Error('The structured proposal did not pass validation');
    response.json(validated.data);
  } catch (error) {
    console.error('Cora AI request failed:', error instanceof Error ? error.message : error);
    response.status(502).json({
      message: 'Cora could not reach the AI service just now. Nothing has changed — please try again or use the manual controls.',
      code: 'AI_UNAVAILABLE',
    });
  }
});

const directory = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(directory, '..', 'dist');
app.use(express.static(distPath));
app.use((request, response, next) => {
  if (request.method === 'GET' && !request.path.startsWith('/api/')) {
    response.sendFile(path.join(distPath, 'index.html'));
    return;
  }
  next();
});

app.listen(port, () => {
  console.log(`Cora Smart Pots API listening on http://localhost:${port}`);
});
