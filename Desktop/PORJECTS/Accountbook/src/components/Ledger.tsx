import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Contact, Entry, EntryType } from '../types';

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
  const [searchText, setSearchText] = useState('');
  const [showAddPartyForm, setShowAddPartyForm] = useState(false);
  const [type, setType] = useState<EntryType>('gave');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const selectedEntries = useMemo(
    () => entries.filter((entry) => entry.contact_id === selectedContactId),
    [entries, selectedContactId]
  );

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === selectedContactId) ?? null,
    [contacts, selectedContactId]
  );

  const contactBalances = useMemo(() => {
    return contacts.map((contact) => {
      const balance = entries
        .filter((entry) => entry.contact_id === contact.id)
        .reduce((total, entry) => {
          return entry.type === 'gave' ? total + entry.amount : total - entry.amount;
        }, 0);

      return { ...contact, balance };
    });
  }, [contacts, entries]);

  const totals = useMemo(() => {
    const youHaveToGet = contactBalances
      .filter((contact) => contact.balance > 0)
      .reduce((total, contact) => total + contact.balance, 0);

    const youHaveToGive = contactBalances
      .filter((contact) => contact.balance < 0)
      .reduce((total, contact) => total + Math.abs(contact.balance), 0);

    const totalBalance = youHaveToGet - youHaveToGive;
    return { totalBalance, youHaveToGet, youHaveToGive };
  }, [contactBalances]);

  const filteredContacts = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return contactBalances;

    return contactBalances.filter((contact) => contact.name.toLowerCase().includes(query));
  }, [contactBalances, searchText]);

  const selectedBalance = useMemo(
    () =>
      selectedEntries.reduce((total, entry) => {
        return entry.type === 'gave' ? total + entry.amount : total - entry.amount;
      }, 0),
    [selectedEntries]
  );

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
    if (selectedContactId && !loadedContacts.some((contact) => contact.id === selectedContactId)) {
      setSelectedContactId('');
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
    setShowAddPartyForm(false);
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

  function formatRelativeTime(value: string): string {
    const diffMs = Date.now() - new Date(value).getTime();
    const mins = Math.max(1, Math.floor(diffMs / 60000));
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hours ago`;
    const days = Math.floor(hrs / 24);
    return `${days} days ago`;
  }

  if (loading) {
    return <p>Loading...</p>;
  }

  return (
    <div className="ledger-shell">
      {!selectedContact ? (
        <section className="ledger-home">
          <div className="home-top">
            <div className="home-header-row">
              <div className="brand-row">
                <span className="book-icon">|</span>
                <h2>Krish</h2>
              </div>
              <button className="icon-btn" onClick={signOut} aria-label="Sign out">
                ↦
              </button>
            </div>

            <div className="tab-row">
              <button className="tab-btn active">Customers</button>
              <button className="tab-btn">Suppliers</button>
              <span className="tab-new">NEW</span>
            </div>

            <div className="summary-card">
              <div className="summary-stats">
                <div>
                  <p className="muted">You will give</p>
                  <strong className="gave">₹{totals.youHaveToGive.toFixed(0)}</strong>
                </div>
                <div>
                  <p className="muted">You will get</p>
                  <strong className="get-blue">₹{totals.youHaveToGet.toFixed(0)}</strong>
                </div>
              </div>
              <div className="summary-actions">
                <span>VIEW REPORT</span>
                <span>OPEN CASHBOOK</span>
              </div>
            </div>
          </div>

          <div className="home-body">
            <div className="search-row">
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search Customer"
              />
              <button className="icon-btn" type="button" aria-label="Sort">
                ⇅
              </button>
              <button className="icon-btn" type="button" aria-label="PDF">
                PDF
              </button>
            </div>

            <div className="summary-inline">
              <span>Total: {totals.totalBalance >= 0 ? '+' : ''}{totals.totalBalance.toFixed(2)}</span>
              <span className="gave">Get: +{totals.youHaveToGet.toFixed(2)}</span>
              <span className="got">Give: -{totals.youHaveToGive.toFixed(2)}</span>
            </div>

            <div className="party-list">
              {filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  className="party-row"
                  onClick={() => setSelectedContactId(contact.id)}
                >
                  <div className="party-avatar">{contact.name[0]?.toUpperCase() ?? '?'}</div>
                  <div className="party-main">
                    <strong>{contact.name}</strong>
                    <p className="muted">{formatRelativeTime(contact.created_at)}</p>
                  </div>
                  <div className="party-balance">
                    <strong className={contact.balance >= 0 ? 'gave' : 'got'}>
                      ₹{Math.abs(contact.balance).toFixed(0)}
                    </strong>
                    <p className="muted">{contact.balance >= 0 ? "You'll Get" : "You'll Give"}</p>
                  </div>
                </button>
              ))}
              {filteredContacts.length === 0 && <p className="muted empty-text">No parties found.</p>}
            </div>

            {showAddPartyForm && (
              <form onSubmit={addContact} className="add-party-sheet stack">
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
                <div className="row">
                  <button type="button" className="link" onClick={() => setShowAddPartyForm(false)}>
                    Cancel
                  </button>
                  <button type="submit">Save</button>
                </div>
              </form>
            )}

            <button className="fab-add" onClick={() => setShowAddPartyForm(true)}>
              + Add Customer
            </button>

            <div className="bottom-nav">
              <button className="active">HOME</button>
              <button>MORE</button>
            </div>
          </div>
        </section>
      ) : (
        <section className="card ledger-card">
          <div className="row">
            <button className="link" onClick={() => setSelectedContactId('')}>
              Back
            </button>
            <button className="link" onClick={signOut}>
              Sign out
            </button>
          </div>

          <h2>{selectedContact.name}</h2>
          {selectedContact.phone && <p className="muted">{selectedContact.phone}</p>}
          <p className={`balance-pill ${selectedBalance >= 0 ? 'gave' : 'got'}`}>
            Balance: {selectedBalance >= 0 ? '+' : ''}
            {selectedBalance.toFixed(2)}
          </p>

          <form onSubmit={addEntry} className="stack">
            <div className="entry-type-toggle">
              <button
                type="button"
                className={type === 'gave' ? 'active' : ''}
                onClick={() => setType('gave')}
              >
                You gave
              </button>
              <button
                type="button"
                className={type === 'got' ? 'active' : ''}
                onClick={() => setType('got')}
              >
                You got
              </button>
            </div>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              required
            />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" />
            <button type="submit">Save entry</button>
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
        </section>
      )}
    </div>
  );
}
