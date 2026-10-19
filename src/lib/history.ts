import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
export const billsQuery = queryOptions({ queryKey: ['bills'], queryFn: async () => {
 const { data, error } = await supabase.from('bills').select('*').order('created_at', { ascending: false });
 if (error) throw new Error('Could not load your bills'); return data;
} });
export const billQuery = (id: string) => queryOptions({ queryKey: ['bill', id], queryFn: async () => {
 const { data: bill, error } = await supabase.from('bills').select('*').eq('id', id).single();
 if (error) throw new Error('Bill not found');
 const { data: lines, error: lineError } = await supabase.from('line_items').select('*').eq('bill_id', id);
 if (lineError) throw new Error('Could not load bill lines');
 const ids = lines.map(l => l.id);
 const { data: messages, error: messageError } = ids.length ? await supabase.from('messages').select('*').in('line_item_id', ids) : { data: [], error: null };
 if (messageError) throw new Error('Could not load messages');
 return { bill, lines, message: messages?.[0] ?? null };
} });
export const inr = (n: number | null) => n === null ? '—' : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
