import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { markMessageSent } from '@/lib/saved-bills.functions';
export function SavedMessage({ id, draft, edited, sent, changed, sentAt }: { id: string; draft: string; edited?: string | null; sent: boolean; changed?: number; sentAt?: string | null }) {
 const [text, setText] = useState(edited ?? draft); const [done, setDone] = useState(sent); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [count, setCount] = useState(changed ?? 0); const [time, setTime] = useState(sentAt); const [copied, setCopied] = useState(false);
 const mark = useServerFn(markMessageSent); const cache = useQueryClient();
 async function send() {setBusy(true); setError(''); try { const result = await mark({ data: { messageId: id, editedText: text } }); setText(result.editedText); setCount(result.wordsChanged); setTime(result.sentAt); setDone(true); await cache.invalidateQueries({ queryKey: ['bill'] }); } catch(e) {setError(e instanceof Error ? e.message : 'Could not save');} finally {setBusy(false);} }
 return <section className="mt-6 border-t pt-6"><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg font-semibold">Draft complaint</h2><Button variant="outline" size="icon" title={copied ? 'Copied' : 'Copy message'} aria-label="Copy message" onClick={async () => { try {await navigator.clipboard.writeText(text);setCopied(true);} catch {setError('Could not copy. Please select and copy the text.');} }}><Copy /></Button></div><textarea aria-label="Complaint message" value={text} readOnly={done} onChange={e => setText(e.target.value)} rows={16} className="w-full rounded-md border bg-background p-4 text-sm leading-relaxed" /><Button className="mt-3" disabled={done || busy || !text.trim()} onClick={send}>{done ? 'Marked sent' : busy ? 'Saving…' : 'I sent this'}</Button>{done && <p className="mt-3 text-sm text-muted-foreground">{count} words changed · Sent {time ? new Date(time).toLocaleString() : ''}</p>}{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}</section>;
}
