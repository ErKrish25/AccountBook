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

  const selectedEntriesWithBalance = useMemo(() => {
    const chronological = [...selectedEntries].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    let runningBalance = 0;
    const withBalance = chronological.map((entry) => {
      runningBalance += entry.type === 'gave' ? entry.amount : -entry.amount;
      return { ...entry, runningBalance };
    });

    return withBalance.reverse();
  }, [selectedEntries]);

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

  async function addEntry(entryType: EntryType) {
    if (!selectedContactId) return;

    const amountInput = window.prompt(
      `Enter amount for "${entryType === 'gave' ? 'You Gave' : 'You Got'}"`
    );
    if (!amountInput) return;

    const parsedAmount = Number(amountInput);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Enter a valid amount');
      return;
    }

    const noteInput = window.prompt('Enter note (optional)') ?? '';

    const { error } = await supabase.from('entries').insert({
      owner_id: userId,
      contact_id: selectedContactId,
      type: entryType,
      amount: parsedAmount,
      note: noteInput.trim() || null,
      entry_date: new Date().toISOString().slice(0, 10),
    });

    if (error) {
      alert(error.message);
      return;
    }

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

  function formatEntryDate(value: string): string {
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
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
                <h2>Krish</h2>
              </div>
              <button className="icon-btn" onClick={signOut} aria-label="Sign out">
                ↦
              </button>
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
            </div>
          </div>

          <div className="home-body">
            <div className="search-row">
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search Customer"
              />
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
          </div>
        </section>
      ) : (
        <section className="ledger-detail">
          <div className="detail-top">
            <div className="detail-header-row">
              <button className="icon-btn detail-back" onClick={() => setSelectedContactId('')}>
                ←
              </button>
              <div className="detail-party">
                <div className="party-avatar detail-avatar">
                  {selectedContact.name[0]?.toUpperCase() ?? '?'}
                </div>
                <div>
                  <h3>{selectedContact.name}</h3>
                  <p>{selectedContact.phone ?? 'Click here to view settings'}</p>
                </div>
              </div>
              <button className="icon-btn" onClick={signOut} aria-label="Sign out">
                ↦
              </button>
            </div>

            <div className="detail-balance-card">
              <span>{selectedBalance >= 0 ? 'You will get' : 'You will give'}</span>
              <strong className={selectedBalance >= 0 ? 'gave' : 'got'}>
                ₹{Math.abs(selectedBalance).toFixed(0)}
              </strong>
            </div>
          </div>

          <div className="detail-body">
            <div className="entry-head-row">
              <span>Entries</span>
              <span>You gave</span>
              <span>You got</span>
            </div>

            <div className="entries detail-entries">
              {selectedEntriesWithBalance.map((entry) => (
                <div key={entry.id} className="entry-grid-row">
                  <div className="entry-left">
                    <p className="entry-time">{formatEntryDate(entry.created_at)}</p>
                    <p className="entry-balance-tag">Bal. ₹{entry.runningBalance.toFixed(0)}</p>
                    <strong>{entry.note ?? 'No note'}</strong>
                  </div>
                  <div className="entry-mid">
                    {entry.type === 'gave' && <strong className="got">₹{entry.amount.toFixed(0)}</strong>}
                  </div>
                  <div className="entry-right">
                    {entry.type === 'got' && <strong className="gave">₹{entry.amount.toFixed(0)}</strong>}
                  </div>
                </div>
              ))}
              {selectedEntriesWithBalance.length === 0 && (
                <p className="muted empty-text">No previous entries.</p>
              )}
            </div>
          </div>

          <div className="detail-action-bar">
            <button className="give-action-btn" onClick={() => void addEntry('gave')}>
              YOU GAVE ₹
            </button>
            <button className="get-action-btn" onClick={() => void addEntry('got')}>
              YOU GOT ₹
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
