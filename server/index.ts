import Anthropic from '@anthropic-ai/sdk';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assistantRequestSchema, assistantResponseSchema, assistantToolSchema } from './schemas.js';
import { guardGoalDates, resolvePendingClarification } from './conversation.js';

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
  const now = new Date();
  const resolvedPending = resolvePendingClarification(parsed.data.pending, parsed.data.message, now);
  if (resolvedPending) {
    response.json(resolvedPending);
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
    const currentDate = now.toISOString().slice(0, 10);
    const conversation = parsed.data.history
      .slice(-20)
      .map((item) => `${item.role === 'user' ? 'Customer' : 'Cora'}: ${item.text}`)
      .join('\n');
    const result = await client.messages.create({
      model,
      max_tokens: 1400,
      system: `You are Cora, a concise, empathetic UK banking assistant for a concept prototype. Interpret the customer's latest message in the context of the recent conversation, pending clarification, and current financial state, then propose exactly one validated action.

Rules:
- Never mutate money directly, promise affordability, shame spending, or invent a missing fact.
- Continue a pending clarification when the latest reply supplies the missing detail. If the customer clearly changes topic, handle the new topic instead.
- Do not ask for information already present in the conversation or state.
- All money in tool input MUST be integer pennies (£12.34 is 1234). All dates MUST be YYYY-MM-DD. Today is ${currentDate}.
- A regular monthly allowance without an exact payment date MUST use schedule {"kind":"monthly_allowance"}; never invent a date for groceries, transport, or similar allowances.
- A financial_profile must include extracted savings goals. Use profileMode=create for an empty profile, replace only when the customer is replacing it, and merge for added details.
- Never silently add an emergency contribution. Only set emergencyFundContribution when the customer asks for an emergency buffer or explicitly agrees to one. If you recommend one, say so plainly in the message (for example: "I'd suggest putting £75 into an emergency buffer each month, if that's affordable. Would you like to include that?") and explain it is weighed against essential bills, other savings goals and income. The application checks affordability and the customer must confirm before it is added.
- state.emergencyFundOrigin tells you whether the current buffer was chosen by the customer ('customer'), recommended by Cora and approved ('cora'), or is an existing planned contribution the customer has not yet reviewed ('existing'). state.emergencyFundPaused means no contribution is planned. To change the buffer amount, use a financial_profile with profileMode=merge, empty incomes and expenses, and the new emergencyFundContribution.
- Use information_request for questions about stored figures. Do not calculate or quote independent totals in the message; the application will provide the deterministic answer.
- Distinguish new_goal, update_goal, goal_contribution, and goal_progress. Do not overwrite a goal unless the customer intends an update.
- If a goal date is missing or ambiguous, return clarification with a structured pending action containing every known value.
- Use IDs exactly as given. Distinguish temporary from permanent changes. An allocation is earmarking, not a payment.
- Keep the customer-facing message under 90 words.`,
      messages: [
        {
          role: 'user',
          content: `Recent conversation (oldest first):\n${conversation || '(no earlier messages)'}\n\nPending clarification:\n${JSON.stringify(parsed.data.pending ?? null)}\n\nLatest customer message:\n${parsed.data.message}\n\nCurrent financial state:\n${JSON.stringify(parsed.data.state)}`,
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
    response.json(guardGoalDates(validated.data, now));
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
app.use(express.static(distPath, {
  setHeaders: (response, filePath) => {
    if (path.basename(filePath) === 'index.html') {
      response.set('Cache-Control', 'no-store');
    }
  },
}));
app.use((request, response, next) => {
  if (request.method === 'GET' && !request.path.startsWith('/api/')) {
    response.set('Cache-Control', 'no-store');
    response.sendFile(path.join(distPath, 'index.html'));
    return;
  }
  next();
});

app.listen(port, () => {
  console.log(`Cora Smart Pots API listening on http://localhost:${port}`);
});
