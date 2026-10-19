import { createFileRoute, redirect, Outlet, Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
export const Route = createFileRoute('/_authenticated')({ ssr: false, beforeLoad: async () => { const { data, error } = await supabase.auth.getUser(); if (error || !data.user) throw redirect({ to: '/auth' }); }, component: AccountLayout });
function AccountLayout() {
 const queryClient = useQueryClient(); const navigate = useNavigate();
 async function signOut() { await queryClient.cancelQueries(); queryClient.clear(); await supabase.auth.signOut(); await navigate({ to: '/auth', replace: true }); }
 return <><nav className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 border-b px-5 py-4"><Button variant="ghost" asChild><Link to="/check">Check a bill</Link></Button><Button variant="ghost" asChild><Link to="/my-bills">My bills</Link></Button><Button variant="outline" className="ml-auto" onClick={signOut}>Sign out</Button></nav><Outlet /></>;
}
