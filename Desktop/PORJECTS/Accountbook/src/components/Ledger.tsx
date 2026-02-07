import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Contact, ContactSummary, Entry, EntryType } from '../types';

type LedgerProps = {
  userId: string;
};

export function Ledger({ userId }: LedgerProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<EntryType>('gave');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const selectedEntries = useMemo(
    () => entries.filter((entry) => entry.contact_id === selectedContactId),
    [entries, selectedContactId]
  );

  const summaries: ContactSummary[] = useMemo(() => {
    return contacts
      .map((contact) => {
        const balance = entries
          .filter((entry) => entry.contact_id === contact.id)
          .reduce((total, entry) => {
            return entry.type === 'gave' ? total + entry.amount : total - entry.amount;
          }, 0);

        return { ...contact, balance };
      })
      .sort((a, b) => b.balance - a.balance);
  }, [contacts, entries]);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const [{ data: contactRows, error: contactError }, { data: entryRows, error: entryError }] =
      await Promise.all([
        supabase
          .from('contacts')
          .select('*')
          .eq('owner_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('entries')
          .select('*')
          .eq('owner_id', userId)
          .order('created_at', { ascending: false }),
      ]);

    if (contactError || entryError) {
      alert(contactError?.message ?? entryError?.message ?? 'Failed to load data');
      setLoading(false);
      return;
    }

    const loadedContacts = (contactRows ?? []) as Contact[];
    const loadedEntries = (entryRows ?? []).map((entry) => ({
      ...entry,
      amount: Number(entry.amount),
    })) as Entry[];

    setContacts(loadedContacts);
    setEntries(loadedEntries);
    if (!selectedContactId && loadedContacts[0]) {
      setSelectedContactId(loadedContacts[0].id);
    }
    setLoading(false);
  }

  async function addContact(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const { error } = await supabase.from('contacts').insert({
      owner_id: userId,
      name: name.trim(),
      phone: phone.trim() || null,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setName('');
    setPhone('');
    await loadData();
  }

  async function addEntry(e: FormEvent) {
    e.preventDefault();
    if (!selectedContactId || !amount) return;

    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Enter a valid amount');
      return;
    }

    const { error } = await supabase.from('entries').insert({
      owner_id: userId,
      contact_id: selectedContactId,
      type,
      amount: parsedAmount,
      note: note.trim() || null,
      entry_date: new Date().toISOString().slice(0, 10),
    });

    if (error) {
      alert(error.message);
      return;
    }

    setAmount('');
    setNote('');
    await loadData();
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return <p>Loading...</p>;
  }

  return (
    <div className="layout">
      <aside className="card">
        <div className="row">
          <h2>Parties</h2>
          <button className="link" onClick={signOut}>
            Sign out
          </button>
        </div>

        <form onSubmit={addContact} className="stack">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Party name"
            required
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (optional)"
          />
          <button type="submit">Add party</button>
        </form>

        <div className="list">
          {summaries.map((contact) => (
            <button
              key={contact.id}
              className={`contact ${selectedContactId === contact.id ? 'active' : ''}`}
              onClick={() => setSelectedContactId(contact.id)}
            >
              <span>{contact.name}</span>
              <span className={contact.balance >= 0 ? 'gave' : 'got'}>
                {contact.balance >= 0 ? '+' : ''}
                {contact.balance.toFixed(2)}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main className="card">
        <h2>Entries</h2>
        {!selectedContactId ? (
          <p className="muted">Add a party to start recording entries.</p>
        ) : (
          <>
            <form onSubmit={addEntry} className="stack inline-form">
              <select value={type} onChange={(e) => setType(e.target.value as EntryType)}>
                <option value="gave">You gave</option>
                <option value="got">You got</option>
              </select>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                min="0"
                step="0.01"
                placeholder="Amount"
                required
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note"
              />
              <button type="submit">Save</button>
            </form>

            <div className="entries">
              {selectedEntries.map((entry) => (
                <div key={entry.id} className="entry-row">
                  <div>
                    <strong>{entry.type === 'gave' ? 'You gave' : 'You got'}</strong>
                    <p className="muted">{entry.note ?? 'No note'}</p>
                  </div>
                  <div className={entry.type === 'gave' ? 'gave' : 'got'}>
                    {entry.type === 'gave' ? '+' : '-'}
                    {entry.amount.toFixed(2)}
                  </div>
                </div>
              ))}
              {selectedEntries.length === 0 && <p className="muted">No entries yet.</p>}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
