import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Contact, Entry, EntryType, InventoryItem, InventoryMovement, InventoryMovementType } from '../types';

type LedgerProps = {
  userId: string;
  displayName: string;
};

type AppSection = 'dashboard' | 'inventory';

export function Ledger({ userId, displayName }: LedgerProps) {
  const [section, setSection] = useState<AppSection>('dashboard');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [searchText, setSearchText] = useState('');
  const [inventorySearchText, setInventorySearchText] = useState('');
  const [showAddPartyForm, setShowAddPartyForm] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<
    | { kind: 'contact'; id: string; name: string }
    | { kind: 'entry'; id: string }
    | null
  >(null);
  const [editContactDraft, setEditContactDraft] = useState<{
    id: string;
    name: string;
    phone: string;
  } | null>(null);
  const [entryDraft, setEntryDraft] = useState<{
    type: EntryType;
    amount: string;
    note: string;
    entryDate: string;
  } | null>(null);
  const [inventoryDraft, setInventoryDraft] = useState<{
    itemName: string;
    unit: string;
    type: InventoryMovementType;
    quantity: string;
    note: string;
    movementDate: string;
  } | null>(null);
  const [editEntryDraft, setEditEntryDraft] = useState<{
    id: string;
    amount: string;
    note: string;
    type: EntryType;
    entryDate: string;
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

  const inventoryItemsWithStock = useMemo(() => {
    return inventoryItems.map((item) => {
      const stock = inventoryMovements
        .filter((movement) => movement.item_id === item.id)
        .reduce((total, movement) => {
          return movement.type === 'in' ? total + movement.quantity : total - movement.quantity;
        }, 0);

      return { ...item, stock };
    });
  }, [inventoryItems, inventoryMovements]);

  const filteredInventoryItems = useMemo(() => {
    const query = inventorySearchText.trim().toLowerCase();
    if (!query) return inventoryItemsWithStock;

    return inventoryItemsWithStock.filter((item) => item.name.toLowerCase().includes(query));
  }, [inventoryItemsWithStock, inventorySearchText]);

  const inventoryTotals = useMemo(() => {
    const totalUnits = inventoryItemsWithStock.reduce((total, item) => total + item.stock, 0);
    const lowStock = inventoryItemsWithStock.filter((item) => item.stock > 0 && item.stock <= 5).length;
    const outOfStock = inventoryItemsWithStock.filter((item) => item.stock <= 0).length;
    return {
      totalUnits,
      totalItems: inventoryItemsWithStock.length,
      lowStock,
      outOfStock,
    };
  }, [inventoryItemsWithStock]);

  const recentInventoryMovements = useMemo(() => {
    const nameMap = new Map(inventoryItems.map((item) => [item.id, item.name]));
    return inventoryMovements.slice(0, 20).map((movement) => ({
      ...movement,
      itemName: nameMap.get(movement.item_id) ?? 'Unknown item',
    }));
  }, [inventoryMovements, inventoryItems]);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData(silent = false) {
    if (!silent) {
      setLoading(true);
    }

    try {
      setLoadError(null);
      const [contactsRes, entriesRes, itemsRes, movementsRes] = await Promise.all([
        supabase.from('contacts').select('*').eq('owner_id', userId).order('created_at', { ascending: false }),
        supabase.from('entries').select('*').eq('owner_id', userId).order('created_at', { ascending: false }),
        supabase
          .from('inventory_items')
          .select('*')
          .eq('owner_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('inventory_movements')
          .select('*')
          .eq('owner_id', userId)
          .order('created_at', { ascending: false }),
      ]);

      const message =
        contactsRes.error?.message ??
        entriesRes.error?.message ??
        itemsRes.error?.message ??
        movementsRes.error?.message ??
        null;

      if (message) {
        setLoadError(message);
        if (silent) {
          alert(message);
        }
        return;
      }

      const loadedContacts = (contactsRes.data ?? []) as Contact[];
      const loadedEntries = (entriesRes.data ?? []).map((entry) => ({
        ...entry,
        amount: Number(entry.amount),
      })) as Entry[];
      const loadedItems = (itemsRes.data ?? []) as InventoryItem[];
      const loadedMovements = (movementsRes.data ?? []).map((movement) => ({
        ...movement,
        quantity: Number(movement.quantity),
      })) as InventoryMovement[];

      setContacts(loadedContacts);
      setEntries(loadedEntries);
      setInventoryItems(loadedItems);
      setInventoryMovements(loadedMovements);

      if (selectedContactId && !loadedContacts.some((contact) => contact.id === selectedContactId)) {
        setSelectedContactId('');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load data';
      setLoadError(message);
      if (silent) {
        alert(message);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
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
    await loadData(true);
  }

  function startEntry(entryType: EntryType) {
    setEntryDraft({
      type: entryType,
      amount: '',
      note: '',
      entryDate: new Date().toISOString().slice(0, 10),
    });
  }

  function startInventoryMovement(type: InventoryMovementType) {
    setInventoryDraft({
      itemName: '',
      unit: 'pcs',
      type,
      quantity: '',
      note: '',
      movementDate: new Date().toISOString().slice(0, 10),
    });
  }

  async function saveEntryDraft() {
    if (!selectedContactId || !entryDraft) return;

    const parsedAmount = Number(entryDraft.amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Enter a valid amount');
      return;
    }

    const { error } = await supabase.from('entries').insert({
      owner_id: userId,
      contact_id: selectedContactId,
      type: entryDraft.type,
      amount: parsedAmount,
      note: entryDraft.note.trim() || null,
      entry_date: entryDraft.entryDate,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setEntryDraft(null);
    await loadData(true);
  }

  async function saveInventoryDraft() {
    if (!inventoryDraft) return;

    const itemName = inventoryDraft.itemName.trim();
    const quantity = Number(inventoryDraft.quantity);

    if (!itemName) {
      alert('Item name is required');
      return;
    }

    if (Number.isNaN(quantity) || quantity <= 0) {
      alert('Enter a valid quantity');
      return;
    }

    const normalized = itemName.toLowerCase();
    let item = inventoryItems.find((existing) => existing.name.trim().toLowerCase() === normalized) ?? null;

    if (!item) {
      const { data, error } = await supabase
        .from('inventory_items')
        .insert({
          owner_id: userId,
          name: itemName,
          unit: inventoryDraft.unit.trim() || null,
        })
        .select('*')
        .single();

      if (error) {
        alert(error.message);
        return;
      }

      item = data as InventoryItem;
    }

    const { error } = await supabase.from('inventory_movements').insert({
      owner_id: userId,
      item_id: item.id,
      type: inventoryDraft.type,
      quantity,
      note: inventoryDraft.note.trim() || null,
      movement_date: inventoryDraft.movementDate,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setInventoryDraft(null);
    await loadData(true);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  function editSelectedContact() {
    if (!selectedContact) return;

    setEditContactDraft({
      id: selectedContact.id,
      name: selectedContact.name,
      phone: selectedContact.phone ?? '',
    });
  }

  async function saveEditedContact() {
    if (!editContactDraft) return;

    const trimmedName = editContactDraft.name.trim();
    if (!trimmedName) {
      alert('Name cannot be empty');
      return;
    }

    const { error } = await supabase
      .from('contacts')
      .update({
        name: trimmedName,
        phone: editContactDraft.phone.trim() || null,
      })
      .eq('id', editContactDraft.id)
      .eq('owner_id', userId);

    if (error) {
      alert(error.message);
      return;
    }

    setEditContactDraft(null);
    await loadData(true);
  }

  async function deleteSelectedContact(contactId: string) {
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', contactId)
      .eq('owner_id', userId);

    if (error) {
      alert(error.message);
      return;
    }

    setSelectedContactId('');
    await loadData(true);
  }

  function editEntry(entry: Entry) {
    setEditEntryDraft({
      id: entry.id,
      amount: String(entry.amount),
      note: entry.note ?? '',
      type: entry.type,
      entryDate: entry.entry_date,
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
        entry_date: editEntryDraft.entryDate,
      })
      .eq('id', editEntryDraft.id)
      .eq('owner_id', userId);

    if (error) {
      alert(error.message);
      return;
    }

    setEditEntryDraft(null);
    await loadData(true);
  }

  async function deleteEntry(entryId: string) {
    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('id', entryId)
      .eq('owner_id', userId);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData(true);
  }

  async function confirmDeleteDialog() {
    if (!deleteDialog) return;

    if (deleteDialog.kind === 'contact') {
      await deleteSelectedContact(deleteDialog.id);
    } else {
      await deleteEntry(deleteDialog.id);
    }

    setDeleteDialog(null);
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

  const showFooter = true;

  if (loading) {
    return (
      <div className="card auth-card">
        <h3>Loading KhataPlus...</h3>
        <p className="muted">Fetching your latest data.</p>
      </div>
    );
  }

  if (loadError && contacts.length === 0 && entries.length === 0 && inventoryItems.length === 0) {
    return (
      <div className="card auth-card stack">
        <h3>Could not load data</h3>
        <p className="muted">{loadError}</p>
        <button onClick={() => void loadData()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="ledger-shell">
      {section === 'dashboard' ? (
        !selectedContact ? (
          <section className="ledger-home">
            <div className="home-top">
              <div className="home-header-row">
                <div className="brand-row">
                  <h2>{displayName}</h2>
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

            <div className="home-body with-footer-space">
              <div className="search-row">
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search Customer"
                  autoCapitalize="words"
                />
              </div>

              <div className="party-list">
                {filteredContacts.map((contact) => (
                  <button key={contact.id} className="party-row" onClick={() => setSelectedContactId(contact.id)}>
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
                <div className="add-party-overlay">
                  <form onSubmit={addContact} className="add-party-sheet stack">
                    <h4>Add Customer</h4>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Party name"
                      autoCapitalize="words"
                      required
                    />
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Phone (optional)"
                    />
                    <div className="row">
                      <button type="button" className="add-party-cancel-btn" onClick={() => setShowAddPartyForm(false)}>
                        Cancel
                      </button>
                      <button type="submit" className="add-party-save-btn">
                        Save
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <button className="fab-add with-footer" onClick={() => setShowAddPartyForm(true)}>
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
                  <div className="party-avatar detail-avatar">{selectedContact.name[0]?.toUpperCase() ?? '?'}</div>
                  <div>
                    <h3>{selectedContact.name}</h3>
                    {selectedContact.phone && <p>{selectedContact.phone}</p>}
                  </div>
                </div>
                <div className="detail-header-actions">
                  <button className="icon-btn detail-action-icon" onClick={() => editSelectedContact()} aria-label="Edit customer">
                    ✎
                  </button>
                  <button
                    className="icon-btn detail-action-icon detail-action-danger"
                    onClick={() =>
                      selectedContact &&
                      setDeleteDialog({
                        kind: 'contact',
                        id: selectedContact.id,
                        name: selectedContact.name,
                      })
                    }
                    aria-label="Delete customer"
                  >
                    🗑
                  </button>
                </div>
              </div>

              <div className="detail-balance-card">
                <span>{selectedBalance >= 0 ? 'You will get' : 'You will give'}</span>
                <strong className={selectedBalance >= 0 ? 'gave' : 'got'}>₹{Math.abs(selectedBalance).toFixed(0)}</strong>
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
                      <p className="entry-note">{entry.note ?? 'No note'}</p>
                      <div className="entry-item-actions">
                        <button type="button" onClick={() => editEntry(entry)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => setDeleteDialog({ kind: 'entry', id: entry.id })}
                        >
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
                {selectedEntriesWithBalance.length === 0 && <p className="muted empty-text">No previous entries.</p>}
              </div>
            </div>

            <div className="detail-action-bar">
              <button className="give-action-btn" onClick={() => startEntry('gave')}>
                YOU GAVE ₹
              </button>
              <button className="get-action-btn" onClick={() => startEntry('got')}>
                YOU GOT ₹
              </button>
            </div>
          </section>
        )
      ) : (
        <section className="ledger-home inventory-home">
          <div className="home-top inventory-top">
            <div className="home-header-row">
              <div className="brand-row">
                <h2>Inventory</h2>
              </div>
              <button className="icon-btn" onClick={signOut} aria-label="Sign out">
                ↦
              </button>
            </div>

            <div className="summary-card inventory-summary-card">
              <div className="summary-stats inventory-stats-three">
                <div>
                  <p className="muted">Items</p>
                  <strong>{inventoryTotals.totalItems}</strong>
                </div>
                <div>
                  <p className="muted">Low Stock</p>
                  <strong className="got">{inventoryTotals.lowStock}</strong>
                </div>
                <div>
                  <p className="muted">Out Stock</p>
                  <strong className="got">{inventoryTotals.outOfStock}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="home-body inventory-body with-footer-space">
            <div className="search-row">
              <input
                value={inventorySearchText}
                onChange={(e) => setInventorySearchText(e.target.value)}
                placeholder="Search Item"
                autoCapitalize="words"
              />
            </div>

            <div className="party-list inventory-list">
              {filteredInventoryItems.map((item) => (
                <div key={item.id} className="party-row inventory-row">
                  <div className="party-avatar">{item.name[0]?.toUpperCase() ?? '?'}</div>
                  <div className="party-main">
                    <strong>{item.name}</strong>
                    <p className="muted">Unit: {item.unit ?? 'pcs'}</p>
                  </div>
                  <div className="party-balance">
                    <strong className={item.stock > 0 ? 'gave' : 'got'}>{item.stock.toFixed(2)}</strong>
                    <p className="muted">In Stock</p>
                  </div>
                </div>
              ))}
              {filteredInventoryItems.length === 0 && <p className="muted empty-text">No inventory items found.</p>}
            </div>

            <div className="inventory-movements-card">
              <h4>Recent In / Out</h4>
              <div className="inventory-movement-list">
                {recentInventoryMovements.map((movement) => (
                  <div key={movement.id} className="inventory-movement-row">
                    <div>
                      <strong>{movement.itemName}</strong>
                      <p className="muted">{movement.note ?? 'No note'}</p>
                    </div>
                    <div className="inventory-movement-right">
                      <strong className={movement.type === 'in' ? 'gave' : 'got'}>
                        {movement.type === 'in' ? '+' : '-'}{movement.quantity.toFixed(2)}
                      </strong>
                      <p className="muted">{movement.movement_date}</p>
                    </div>
                  </div>
                ))}
                {recentInventoryMovements.length === 0 && <p className="muted empty-text">No stock movement yet.</p>}
              </div>
            </div>

            <div className="inventory-action-row">
              <button type="button" className="add-party-save-btn" onClick={() => startInventoryMovement('in')}>
                STOCK IN
              </button>
              <button type="button" className="add-party-cancel-btn" onClick={() => startInventoryMovement('out')}>
                STOCK OUT
              </button>
            </div>
          </div>
        </section>
      )}

      {showFooter && (
        <div className="app-footer-nav">
          <button
            type="button"
            className={section === 'dashboard' ? 'active' : ''}
            onClick={() => setSection('dashboard')}
          >
            Main Dashboard
          </button>
          <button
            type="button"
            className={section === 'inventory' ? 'active' : ''}
            onClick={() => {
              setSelectedContactId('');
              setSection('inventory');
            }}
          >
            Inventories
          </button>
        </div>
      )}

      {entryDraft && (
        <div className="entry-edit-overlay">
          <form
            className="entry-edit-modal stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEntryDraft();
            }}
          >
            <h4>{entryDraft.type === 'gave' ? 'Add You Gave Entry' : 'Add You Got Entry'}</h4>
            <input
              value={entryDraft.amount}
              onChange={(e) => setEntryDraft((draft) => (draft ? { ...draft, amount: e.target.value } : draft))}
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              required
            />
            <input
              value={entryDraft.note}
              onChange={(e) => setEntryDraft((draft) => (draft ? { ...draft, note: e.target.value } : draft))}
              placeholder="Note (optional)"
              autoCapitalize="sentences"
            />
            <input
              type="date"
              value={entryDraft.entryDate}
              onChange={(e) => setEntryDraft((draft) => (draft ? { ...draft, entryDate: e.target.value } : draft))}
              required
            />
            <div className="row">
              <button type="button" className="link" onClick={() => setEntryDraft(null)}>
                Cancel
              </button>
              <button type="submit">Save</button>
            </div>
          </form>
        </div>
      )}

      {inventoryDraft && (
        <div className="entry-edit-overlay">
          <form
            className="entry-edit-modal stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveInventoryDraft();
            }}
          >
            <h4>{inventoryDraft.type === 'in' ? 'Stock In' : 'Stock Out'}</h4>
            <input
              value={inventoryDraft.itemName}
              onChange={(e) =>
                setInventoryDraft((draft) => (draft ? { ...draft, itemName: e.target.value } : draft))
              }
              placeholder="Item name"
              autoCapitalize="words"
              required
            />
            <input
              value={inventoryDraft.unit}
              onChange={(e) => setInventoryDraft((draft) => (draft ? { ...draft, unit: e.target.value } : draft))}
              placeholder="Unit (e.g., pcs, kg)"
            />
            <input
              value={inventoryDraft.quantity}
              onChange={(e) =>
                setInventoryDraft((draft) => (draft ? { ...draft, quantity: e.target.value } : draft))
              }
              type="number"
              min="0"
              step="0.01"
              placeholder="Quantity"
              required
            />
            <input
              value={inventoryDraft.note}
              onChange={(e) => setInventoryDraft((draft) => (draft ? { ...draft, note: e.target.value } : draft))}
              placeholder="Note (optional)"
            />
            <input
              type="date"
              value={inventoryDraft.movementDate}
              onChange={(e) =>
                setInventoryDraft((draft) => (draft ? { ...draft, movementDate: e.target.value } : draft))
              }
              required
            />
            <div className="row">
              <button
                type="button"
                className="link"
                onClick={() => {
                  setInventoryDraft(null);
                }}
              >
                Cancel
              </button>
              <button type="submit">Save</button>
            </div>
          </form>
        </div>
      )}

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
              onChange={(e) => setEditEntryDraft((draft) => (draft ? { ...draft, note: e.target.value } : draft))}
              placeholder="Note (optional)"
              autoCapitalize="sentences"
            />
            <select
              value={editEntryDraft.type}
              onChange={(e) =>
                setEditEntryDraft((draft) => (draft ? { ...draft, type: e.target.value as EntryType } : draft))
              }
            >
              <option value="gave">You gave</option>
              <option value="got">You got</option>
            </select>
            <input
              type="date"
              value={editEntryDraft.entryDate}
              onChange={(e) =>
                setEditEntryDraft((draft) => (draft ? { ...draft, entryDate: e.target.value } : draft))
              }
              required
            />
            <div className="row">
              <button type="button" className="link" onClick={() => setEditEntryDraft(null)}>
                Cancel
              </button>
              <button type="submit">Save</button>
            </div>
          </form>
        </div>
      )}

      {editContactDraft && (
        <div className="entry-edit-overlay">
          <form
            className="entry-edit-modal stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEditedContact();
            }}
          >
            <h4>Edit Customer</h4>
            <input
              value={editContactDraft.name}
              onChange={(e) =>
                setEditContactDraft((draft) => (draft ? { ...draft, name: e.target.value } : draft))
              }
              placeholder="Customer name"
              autoCapitalize="words"
              required
            />
            <input
              value={editContactDraft.phone}
              onChange={(e) =>
                setEditContactDraft((draft) => (draft ? { ...draft, phone: e.target.value } : draft))
              }
              placeholder="Mobile number (optional)"
            />
            <div className="row">
              <button type="button" className="link" onClick={() => setEditContactDraft(null)}>
                Cancel
              </button>
              <button type="submit">Save</button>
            </div>
          </form>
        </div>
      )}

      {deleteDialog && (
        <div className="entry-edit-overlay">
          <div className="entry-edit-modal stack">
            <h4>Delete {deleteDialog.kind === 'contact' ? 'Customer' : 'Entry'}?</h4>
            <p className="muted">
              {deleteDialog.kind === 'contact'
                ? `Delete "${deleteDialog.name}" and all related entries?`
                : 'This entry will be removed permanently.'}
            </p>
            <div className="row">
              <button type="button" className="link" onClick={() => setDeleteDialog(null)}>
                Cancel
              </button>
              <button type="button" className="danger-solid" onClick={() => void confirmDeleteDialog()}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
