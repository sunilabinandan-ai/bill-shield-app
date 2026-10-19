import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
export function AuthForm() {
  const navigate = useNavigate();
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => { if (data.user) void navigate({ to: '/check', replace: true }); }); }, [navigate]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setNotice('');
    try {
      if (signup) {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) { setNotice('Check your email to confirm your account, then sign in.'); return; }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error;
      }
      await navigate({ to: '/check', replace: true });
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not sign in'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-md px-5 py-12"><h1 className="font-display text-4xl font-semibold">Bill<span className="text-primary">Shield</span></h1><h2 className="mt-8 text-xl font-semibold">{signup ? 'Create an account' : 'Sign in'}</h2><form onSubmit={submit} className="mt-6 space-y-5"><label className="block text-sm">Email<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-md border bg-background p-3" /></label><label className="block text-sm">Password<input required type="password" minLength={8} autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-md border bg-background p-3" /></label><Button type="submit" className="w-full" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Sign up' : 'Sign in'}</Button>{notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}</form><Button variant="link" className="mt-4 px-0" onClick={() => {setSignup(!signup); setNotice('');}}>{signup ? 'Already have an account? Sign in' : 'Create an account'}</Button></main>;
}
