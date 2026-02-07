import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { AuthPanel } from './components/AuthPanel';
import { Ledger } from './components/Ledger';
import { supabase } from './lib/supabase';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      {session?.user ? <Ledger userId={session.user.id} /> : <AuthPanel />}
    </div>
  );
}
