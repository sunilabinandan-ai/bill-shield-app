import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { checkBill } from './bill-math';
import { privateText, wordsChanged } from './saving-rules';

const extractedSchema = z.object({ charges: z.array(z.object({ label: z.string(), amount: z.number().finite(), isPlan: z.boolean() })), taxes: z.array(z.object({ label: z.string(), amount: z.number().finite() })), statedTotal: z.number().finite().nullable(), currency: z.string().max(3).nullable().optional(), provider: z.string().max(100).nullable().optional(), totalParts: z.array(z.object({ label: z.string(), amount: z.number().finite() })).nullable().optional(), billPeriod: z.string().max(100).nullable().optional(), docType: z.enum(['bill', 'card_statement']).nullable().optional() });
export const saveBill = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
.inputValidator((input) => z.object({ provider: z.string().min(1).max(100), billPeriod: z.string().max(100), filePath: z.string(), promise: z.string().max(500), focus: z.string().max(300).optional(), message: z.string().max(20000), extracted: extractedSchema }).parse(input))
.handler(async ({ data, context }) => {
  if (!data.filePath.startsWith(`${context.userId}/`)) throw new Error('Invalid file path');
  const promise = privateText(data.promise);
  const check = checkBill(data.extracted, promise, privateText(data.focus ?? ''));
  const { data: saved, error } = await context.supabase.rpc('save_bill_check', { payload: {
    provider: privateText(data.provider), bill_period: privateText(data.billPeriod), file_path: data.filePath,
    promise, promised_price: check.promisedPrice, total_on_bill: check.billTotal, calculated_total: check.computedTotal,
    lines: check.lines.map(l => ({ ...l, label: privateText(l.label), reason: privateText(l.reason) })), message: privateText(data.message),
  } });
  if (error) throw new Error('Could not save your bill. Please retry.');
  return saved as { billId: string; messageId: string };
});
export const markMessageSent = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
.inputValidator(input => z.object({ messageId: z.string().uuid(), editedText: z.string().min(1).max(20000) }).parse(input))
.handler(async ({ data, context }) => {
  const { data: original, error: readError } = await context.supabase.from('messages').select('message_text,sent').eq('id', data.messageId).single();
  if (readError || !original) throw new Error('Message not found');
  if (original.sent) throw new Error('This message is already marked sent');
  const edited = privateText(data.editedText);
  const changes = wordsChanged(original.message_text, edited);
  const sentAt = new Date().toISOString();
  const { error } = await context.supabase.from('messages').update({ edited_text: edited, words_changed: changes, sent: true, sent_at: sentAt }).eq('id', data.messageId).eq('sent', false);
  if (error) throw new Error('Could not mark your message sent');
  return { wordsChanged: changes, sentAt, editedText: edited };
});
