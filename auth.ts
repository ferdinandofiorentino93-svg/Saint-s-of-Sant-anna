import { createClient } from 'npm:@supabase/supabase-js@2';

export async function requireUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Error('Autenticazione richiesta.');
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false }
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Sessione non valida o scaduta.');
  return data.user;
}

export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Secrets Supabase mancanti nel server.');
  return createClient(url, key, { auth: { persistSession: false } });
}
