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
  const [editEntryDraft, setEditEntryDraft] = useState<{
    id: string;
    amount: string;
    note: string;
    type: EntryType;
  } | null>(null);

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

  async function editSelectedContact() {
    if (!selectedContact) return;

    const newName = window.prompt('Edit customer name', selectedContact.name);
    if (newName === null) return;
    const trimmedName = newName.trim();
    if (!trimmedName) {
      alert('Name cannot be empty');
      return;
    }

    const newPhone = window.prompt('Edit phone (optional)', selectedContact.phone ?? '');
    if (newPhone === null) return;

    const { error } = await supabase
      .from('contacts')
      .update({
        name: trimmedName,
        phone: newPhone.trim() || null,
      })
      .eq('id', selectedContact.id)
      .eq('owner_id', userId);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  }

  async function deleteSelectedContact() {
    if (!selectedContact) return;

    const confirmed = window.confirm(
      `Delete "${selectedContact.name}" and all related entries? This action cannot be undone.`
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', selectedContact.id)
      .eq('owner_id', userId);

    if (error) {
      alert(error.message);
      return;
    }

    setSelectedContactId('');
    await loadData();
  }

  function editEntry(entry: Entry) {
    setEditEntryDraft({
      id: entry.id,
      amount: String(entry.amount),
      note: entry.note ?? '',
      type: entry.type,
    });
  }

  async function saveEditedEntry() {
    if (!editEntryDraft) return;

    const parsedAmount = Number(editEntryDraft.amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Enter a valid amount');
      return;
    }

    const { error } = await supabase
      .from('entries')
      .update({
        amount: parsedAmount,
        note: editEntryDraft.note.trim() || null,
        type: editEntryDraft.type,
      })
      .eq('id', editEntryDraft.id)
      .eq('owner_id', userId);

    if (error) {
      alert(error.message);
      return;
    }

    setEditEntryDraft(null);
    await loadData();
  }

  async function deleteEntry(entry: Entry) {
    const confirmed = window.confirm('Delete this entry?');
    if (!confirmed) return;

    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('id', entry.id)
      .eq('owner_id', userId);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
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
                  {selectedContact.phone && <p>{selectedContact.phone}</p>}
                </div>
              </div>
              <div className="detail-header-actions">
                <button
                  className="icon-btn detail-action-icon"
                  onClick={() => void editSelectedContact()}
                  aria-label="Edit customer"
                >
                  ✎
                </button>
                <button
                  className="icon-btn detail-action-icon detail-action-danger"
                  onClick={() => void deleteSelectedContact()}
                  aria-label="Delete customer"
                >
                  🗑
                </button>
              </div>
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
                    <div className="entry-item-actions">
                      <button type="button" onClick={() => editEntry(entry)}>
                        Edit
                      </button>
                      <button type="button" className="danger" onClick={() => void deleteEntry(entry)}>
                        Delete
                      </button>
                    </div>
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

          {editEntryDraft && (
            <div className="entry-edit-overlay">
              <form
                className="entry-edit-modal stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveEditedEntry();
                }}
              >
                <h4>Edit Entry</h4>
                <input
                  value={editEntryDraft.amount}
                  onChange={(e) =>
                    setEditEntryDraft((draft) => (draft ? { ...draft, amount: e.target.value } : draft))
                  }
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount"
                  required
                />
                <input
                  value={editEntryDraft.note}
                  onChange={(e) =>
                    setEditEntryDraft((draft) => (draft ? { ...draft, note: e.target.value } : draft))
                  }
                  placeholder="Note (optional)"
                />
                <select
                  value={editEntryDraft.type}
                  onChange={(e) =>
                    setEditEntryDraft((draft) =>
                      draft ? { ...draft, type: e.target.value as EntryType } : draft
                    )
                  }
                >
                  <option value="gave">You gave</option>
                  <option value="got">You got</option>
                </select>
                <div className="row">
                  <button type="button" className="link" onClick={() => setEditEntryDraft(null)}>
                    Cancel
                  </button>
                  <button type="submit">Save</button>
                </div>
              </form>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
