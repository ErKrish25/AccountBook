import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Contact,
  Entry,
  EntryType,
  InventoryGroupMember,
  InventoryItem,
  InventoryMovement,
  InventoryMovementType,
  InventorySyncGroup,
} from '../types';

type LedgerProps = {
  userId: string;
  displayName: string;
};

type AppSection = 'dashboard' | 'inventory' | 'invoices';
type InventoryView = 'list' | 'group';
type InvoiceKind = 'purchase' | 'sale';

type InvoiceLineDraft = {
  item_id: string;
  quantity: string;
  rate: string;
};

const INVENTORY_UNITS = [
  'NOS',
  'PCS',
  'KG',
  'G',
  'MG',
  'L',
  'ML',
  'MTR',
  'CM',
  'MM',
  'FT',
  'IN',
  'BOX',
  'PACK',
  'DOZEN',
  'SET',
  'BAG',
  'BOTTLE',
  'CAN',
  'JAR',
  'ROLL',
  'PAIR',
  'CARTON',
  'TON',
];

export function Ledger({ userId, displayName }: LedgerProps) {
  const [section, setSection] = useState<AppSection>('dashboard');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [activeInventoryGroup, setActiveInventoryGroup] = useState<InventorySyncGroup | null>(null);
  const [inventoryGroupMembers, setInventoryGroupMembers] = useState<InventoryGroupMember[]>([]);
  const [inventoryView, setInventoryView] = useState<InventoryView>('list');
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupJoinCode, setGroupJoinCode] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [searchText, setSearchText] = useState('');
  const [inventorySearchText, setInventorySearchText] = useState('');
  const [invoiceKind, setInvoiceKind] = useState<InvoiceKind>('purchase');
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceParty, setInvoiceParty] = useState('');
  const [invoiceNote, setInvoiceNote] = useState('');
  const [invoiceSettlementAmount, setInvoiceSettlementAmount] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLineDraft[]>([]);
  const [invoiceLineDraft, setInvoiceLineDraft] = useState<InvoiceLineDraft>({
    item_id: '',
    quantity: '',
    rate: '',
  });
  const [showAddPartyForm, setShowAddPartyForm] = useState(false);
  const [showAddInventoryForm, setShowAddInventoryForm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
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
  const [editInventoryItemDraft, setEditInventoryItemDraft] = useState<{
    id: string;
    name: string;
    unit: string;
  } | null>(null);
  const [entryDraft, setEntryDraft] = useState<{
    type: EntryType;
    amount: string;
    note: string;
    entryDate: string;
  } | null>(null);
  const [inventoryDraft, setInventoryDraft] = useState<{
    type: InventoryMovementType;
    quantity: string;
    note: string;
    movementDate: string;
  } | null>(null);
  const [inventoryItemDraft, setInventoryItemDraft] = useState<{
    name: string;
    unit: string;
  }>({
    name: '',
    unit: 'NOS',
  });
  const [entryActionDraft, setEntryActionDraft] = useState<{
    id: string;
    amount: string;
    note: string;
    type: EntryType;
    entryDate: string;
  } | null>(null);
  const [movementActionDraft, setMovementActionDraft] = useState<{
    id: string;
    quantity: string;
    note: string;
    type: InventoryMovementType;
    movementDate: string;
  } | null>(null);

  const selectedEntries = useMemo(
    () => entries.filter((entry) => entry.contact_id === selectedContactId),
    [entries, selectedContactId]
  );

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === selectedContactId) ?? null,
    [contacts, selectedContactId]
  );
  const selectedInventoryItem = useMemo(
    () => inventoryItems.find((item) => item.id === selectedInventoryItemId) ?? null,
    [inventoryItems, selectedInventoryItemId]
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

  const selectedInventoryMovements = useMemo(() => {
    return inventoryMovements.filter((movement) => movement.item_id === selectedInventoryItemId);
  }, [inventoryMovements, selectedInventoryItemId]);

  const selectedInventoryStock = useMemo(() => {
    return selectedInventoryMovements.reduce((total, movement) => {
      return movement.type === 'in' ? total + movement.quantity : total - movement.quantity;
    }, 0);
  }, [selectedInventoryMovements]);

  const invoiceHistory = useMemo(() => {
    const invoiceMap = new Map<
      string,
      {
        id: string;
        kind: InvoiceKind;
        party: string;
        date: string;
        totalQty: number;
        totalValue: number;
        lineCount: number;
      }
    >();

    for (const movement of inventoryMovements) {
      if (!movement.note?.startsWith('INV:')) continue;
      const parts = movement.note.split('|');
      const fields = Object.fromEntries(
        parts
          .map((part) => {
            const idx = part.indexOf(':');
            if (idx <= 0) return null;
            return [part.slice(0, idx), part.slice(idx + 1)];
          })
          .filter(Boolean) as Array<[string, string]>
      );

      const invoiceId = fields.INV;
      if (!invoiceId) continue;

      const kind: InvoiceKind =
        fields.TYPE === 'sale' || movement.type === 'out' ? 'sale' : 'purchase';
      const rate = Number(fields.RATE ?? '0');
      const qty = Number(movement.quantity);
      const value = Number.isFinite(rate) ? rate * qty : 0;

      const existing = invoiceMap.get(invoiceId);
      if (existing) {
        existing.totalQty += qty;
        existing.totalValue += value;
        existing.lineCount += 1;
      } else {
        invoiceMap.set(invoiceId, {
          id: invoiceId,
          kind,
          party: fields.PARTY || 'Walk-in',
          date: movement.movement_date,
          totalQty: qty,
          totalValue: value,
          lineCount: 1,
        });
      }
    }

    return [...invoiceMap.values()]
      .filter((invoice) => invoice.kind === invoiceKind)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [inventoryMovements, invoiceKind]);

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const inventoryFilter = activeInventoryGroup?.id
      ? `group_id=eq.${activeInventoryGroup.id}`
      : `owner_id=eq.${userId}`;

    const channel = supabase
      .channel(`inventory-live-${userId}-${activeInventoryGroup?.id ?? 'personal'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_items',
          filter: inventoryFilter,
        },
        () => {
          void loadData(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_movements',
          filter: inventoryFilter,
        },
        () => {
          void loadData(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_sync_group_members',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadData(true);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, activeInventoryGroup?.id]);

  async function loadData(silent = false) {
    if (!silent) {
      setLoading(true);
    }

    try {
      setLoadError(null);
      const [contactsRes, entriesRes, membershipsRes] = await Promise.all([
        supabase.from('contacts').select('*').eq('owner_id', userId).order('created_at', { ascending: false }),
        supabase.from('entries').select('*').eq('owner_id', userId).order('created_at', { ascending: false }),
        supabase
          .from('inventory_sync_group_members')
          .select(
            `
              group_id,
              inventory_sync_groups!inner (
                id,
                owner_id,
                name,
                join_code,
                created_at
              )
            `
          )
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .limit(1),
      ]);

      const membershipGroupRaw = (membershipsRes.data?.[0] as { inventory_sync_groups?: InventorySyncGroup } | undefined)
        ?.inventory_sync_groups;
      const membershipGroup = membershipGroupRaw ?? null;
      setActiveInventoryGroup(membershipGroup);
      setGroupNameDraft(membershipGroup?.name ?? '');

      if (membershipGroup?.id) {
        const { data: membersData, error: membersError } = await supabase.rpc('get_inventory_group_members', {
          target_group_id: membershipGroup.id,
        });
        if (membersError) {
          setLoadError(membersError.message);
        } else {
          setInventoryGroupMembers((membersData ?? []) as InventoryGroupMember[]);
        }
      } else {
        setInventoryGroupMembers([]);
      }

      const itemsQuery = supabase.from('inventory_items').select('*').order('created_at', { ascending: false });
      const movementsQuery = supabase
        .from('inventory_movements')
        .select('*')
        .order('created_at', { ascending: false });

      const [itemsRes, movementsRes] = await Promise.all([
        membershipGroup?.id
          ? itemsQuery.eq('group_id', membershipGroup.id)
          : itemsQuery.eq('owner_id', userId).is('group_id', null),
        membershipGroup?.id
          ? movementsQuery.eq('group_id', membershipGroup.id)
          : movementsQuery.eq('owner_id', userId).is('group_id', null),
      ]);

      const message =
        contactsRes.error?.message ??
        entriesRes.error?.message ??
        membershipsRes.error?.message ??
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
      if (selectedInventoryItemId && !loadedItems.some((item) => item.id === selectedInventoryItemId)) {
        setSelectedInventoryItemId('');
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
    if (!selectedInventoryItem) return;
    setInventoryDraft({
      type,
      quantity: '',
      note: '',
      movementDate: new Date().toISOString().slice(0, 10),
    });
  }

  async function leaveInventorySyncGroup() {
    if (!activeInventoryGroup) return;

    const { error } = await supabase
      .from('inventory_sync_group_members')
      .delete()
      .eq('group_id', activeInventoryGroup.id)
      .eq('user_id', userId);

    if (error) {
      alert(error.message);
      return;
    }

    setSelectedInventoryItemId('');
    setInventoryView('list');
    await loadData(true);
  }

  function generateJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  async function createInventoryGroup() {
    const trimmedName = groupNameDraft.trim() || `${displayName}'s Group`;

    const { data: groupData, error: groupError } = await supabase
      .from('inventory_sync_groups')
      .insert({
        owner_id: userId,
        name: trimmedName,
        join_code: generateJoinCode(),
      })
      .select('*')
      .single();

    if (groupError || !groupData) {
      alert(groupError?.message ?? 'Failed to create group');
      return;
    }

    const { error: memberError } = await supabase.from('inventory_sync_group_members').insert({
      group_id: groupData.id,
      user_id: userId,
      role: 'owner',
    });

    if (memberError) {
      alert(memberError.message);
      return;
    }

    await loadData(true);
  }

  async function joinInventoryGroup() {
    const code = groupJoinCode.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
    if (!code) {
      alert('Enter a group code');
      return;
    }

    const { data, error } = await supabase.rpc('join_inventory_group_by_code', { input_code: code });
    if (error) {
      alert(error.message);
      return;
    }
    if (!data) {
      alert('Group code not found');
      return;
    }

    setGroupJoinCode('');
    await loadData(true);
  }

  async function saveGroupName() {
    if (!activeInventoryGroup) return;
    const trimmedName = groupNameDraft.trim();
    if (!trimmedName) {
      alert('Group name cannot be empty');
      return;
    }

    const { error } = await supabase
      .from('inventory_sync_groups')
      .update({ name: trimmedName })
      .eq('id', activeInventoryGroup.id)
      .eq('owner_id', userId);

    if (error) {
      alert(error.message);
      return;
    }
    alert('Group name changed successfully.');
    await loadData(true);
  }

  async function deleteGroup() {
    if (!activeInventoryGroup) return;
    const { error } = await supabase
      .from('inventory_sync_groups')
      .delete()
      .eq('id', activeInventoryGroup.id)
      .eq('owner_id', userId);

    if (error) {
      alert(error.message);
      return;
    }

    setInventoryView('list');
    await loadData(true);
  }

  async function addInventoryItem(e: FormEvent) {
    e.preventDefault();
    const trimmedName = inventoryItemDraft.name.trim();
    if (!trimmedName) {
      alert('Item name is required');
      return;
    }

    const { error } = await supabase.from('inventory_items').insert({
      owner_id: userId,
      group_id: activeInventoryGroup?.id ?? null,
      name: trimmedName,
      unit: inventoryItemDraft.unit.trim().toUpperCase() || null,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setInventoryItemDraft({ name: '', unit: 'NOS' });
    setShowAddInventoryForm(false);
    await loadData(true);
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
    if (!inventoryDraft || !selectedInventoryItem) return;
    const quantity = Number(inventoryDraft.quantity);

    if (Number.isNaN(quantity) || quantity <= 0) {
      alert('Enter a valid quantity');
      return;
    }

    const { error } = await supabase.from('inventory_movements').insert({
      owner_id: userId,
      group_id: selectedInventoryItem.group_id ?? null,
      item_id: selectedInventoryItem.id,
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

  function addInvoiceLine() {
    if (!invoiceLineDraft.item_id) {
      alert('Select an item');
      return;
    }
    const quantity = Number(invoiceLineDraft.quantity);
    const rate = Number(invoiceLineDraft.rate);
    if (Number.isNaN(quantity) || quantity <= 0) {
      alert('Enter valid quantity');
      return;
    }
    if (Number.isNaN(rate) || rate < 0) {
      alert('Enter valid rate');
      return;
    }

    setInvoiceLines((prev) => [...prev, { ...invoiceLineDraft }]);
    setInvoiceLineDraft({ item_id: '', quantity: '', rate: '' });
  }

  function removeInvoiceLine(index: number) {
    setInvoiceLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function findOrCreateContactIdByName(rawName: string): Promise<string | null> {
    const partyName = rawName.trim();
    if (!partyName) return null;

    const existing = contacts.find((contact) => contact.name.trim().toLowerCase() === partyName.toLowerCase());
    if (existing) return existing.id;

    const { data, error } = await supabase
      .from('contacts')
      .insert({
        owner_id: userId,
        name: partyName,
        phone: null,
      })
      .select('id')
      .single();

    if (error) {
      alert(error.message);
      return null;
    }

    return data.id as string;
  }

  async function saveInvoice() {
    if (invoiceLines.length === 0) {
      alert('Add at least one line');
      return;
    }
    const normalizedParty = invoiceParty.trim();
    if (!normalizedParty) {
      alert('Enter party name');
      return;
    }

    const invoiceId = `${invoiceKind === 'purchase' ? 'PUR' : 'SAL'}-${Date.now()
      .toString()
      .slice(-8)}`;
    const movementType: InventoryMovementType = invoiceKind === 'purchase' ? 'in' : 'out';
    const normalizedNote = invoiceNote.trim();

    const stockByItem = new Map(inventoryItemsWithStock.map((item) => [item.id, item.stock]));
    const itemsById = new Map(inventoryItems.map((item) => [item.id, item]));

    const payload = [];
    let invoiceTotal = 0;
    for (const line of invoiceLines) {
      const quantity = Number(line.quantity);
      const rate = Number(line.rate);
      if (Number.isNaN(quantity) || quantity <= 0) {
        alert('Invalid quantity in invoice lines');
        return;
      }
      if (Number.isNaN(rate) || rate < 0) {
        alert('Invalid rate in invoice lines');
        return;
      }
      const item = itemsById.get(line.item_id);
      if (!item) {
        alert('Selected item not found');
        return;
      }

      if (movementType === 'out') {
        const available = stockByItem.get(line.item_id) ?? 0;
        if (quantity > available) {
          alert(`Not enough stock for ${item.name}. Available: ${available.toFixed(2)}`);
          return;
        }
      }

      invoiceTotal += quantity * rate;
      const invoiceLineNote = [
        `INV:${invoiceId}`,
        `TYPE:${invoiceKind}`,
        `PARTY:${normalizedParty}`,
        `RATE:${rate.toFixed(2)}`,
        `ITEM:${item.name}`,
        normalizedNote ? `NOTE:${normalizedNote}` : '',
      ]
        .filter(Boolean)
        .join('|');

      payload.push({
        owner_id: userId,
        group_id: item.group_id ?? null,
        item_id: item.id,
        type: movementType,
        quantity,
        note: invoiceLineNote,
        movement_date: invoiceDate,
      });
    }

    const { error } = await supabase.from('inventory_movements').insert(payload);
    if (error) {
      alert(error.message);
      return;
    }

    const settlementAmount = Number(invoiceSettlementAmount || '0');
    if (Number.isNaN(settlementAmount) || settlementAmount < 0) {
      alert('Enter valid paid/received amount');
      return;
    }
    if (settlementAmount > invoiceTotal) {
      alert('Paid/received amount cannot be more than invoice total');
      return;
    }

    const receivablePayableAmount = Math.max(0, invoiceTotal - settlementAmount);
    const contactId = await findOrCreateContactIdByName(normalizedParty);
    if (!contactId) return;

    const customerEntriesPayload: Array<{
      owner_id: string;
      contact_id: string;
      type: EntryType;
      amount: number;
      note: string;
      entry_date: string;
    }> = [];

    if (receivablePayableAmount > 0) {
      customerEntriesPayload.push({
        owner_id: userId,
        contact_id: contactId,
        type: invoiceKind === 'sale' ? 'gave' : 'got',
        amount: Number(receivablePayableAmount.toFixed(2)),
        note: `${invoiceKind === 'sale' ? 'Sales' : 'Purchase'} invoice ${invoiceId}`,
        entry_date: invoiceDate,
      });
    }

    if (settlementAmount > 0) {
      customerEntriesPayload.push({
        owner_id: userId,
        contact_id: contactId,
        type: invoiceKind === 'sale' ? 'got' : 'gave',
        amount: Number(settlementAmount.toFixed(2)),
        note: `${invoiceKind === 'sale' ? 'Received' : 'Paid'} against invoice ${invoiceId}`,
        entry_date: invoiceDate,
      });
    }

    if (customerEntriesPayload.length > 0) {
      const { error: entryError } = await supabase.from('entries').insert(customerEntriesPayload);
      if (entryError) {
        alert(entryError.message);
        return;
      }
    }

    setInvoiceLines([]);
    setInvoiceLineDraft({ item_id: '', quantity: '', rate: '' });
    setInvoiceParty('');
    setInvoiceNote('');
    setInvoiceSettlementAmount('');
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setShowInvoiceForm(false);
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

  function editSelectedInventoryItem() {
    if (!selectedInventoryItem) return;

    setEditInventoryItemDraft({
      id: selectedInventoryItem.id,
      name: selectedInventoryItem.name,
      unit: selectedInventoryItem.unit ?? 'NOS',
    });
  }

  async function saveEditedInventoryItem() {
    if (!editInventoryItemDraft) return;

    const trimmedName = editInventoryItemDraft.name.trim();
    if (!trimmedName) {
      alert('Item name cannot be empty');
      return;
    }

    const { error } = await supabase
      .from('inventory_items')
      .update({
        name: trimmedName,
        unit: editInventoryItemDraft.unit.trim().toUpperCase() || null,
      })
      .eq('id', editInventoryItemDraft.id);

    if (error) {
      alert(error.message);
      return;
    }

    setEditInventoryItemDraft(null);
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

  function openEntryActionForm(entry: Entry) {
    setEntryActionDraft({
      id: entry.id,
      amount: String(entry.amount),
      note: entry.note ?? '',
      type: entry.type,
      entryDate: entry.entry_date,
    });
  }

  async function submitEntryAction() {
    if (!entryActionDraft) return;

    const parsedAmount = Number(entryActionDraft.amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Enter a valid amount');
      return;
    }

    const { error } = await supabase
      .from('entries')
      .update({
        amount: parsedAmount,
        note: entryActionDraft.note.trim() || null,
        type: entryActionDraft.type,
        entry_date: entryActionDraft.entryDate,
      })
      .eq('id', entryActionDraft.id)
      .eq('owner_id', userId);

    if (error) {
      alert(error.message);
      return;
    }

    setEntryActionDraft(null);
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

  function openMovementActionForm(movement: InventoryMovement) {
    setMovementActionDraft({
      id: movement.id,
      quantity: String(movement.quantity),
      note: movement.note ?? '',
      type: movement.type,
      movementDate: movement.movement_date,
    });
  }

  async function submitMovementAction() {
    if (!movementActionDraft) return;

    const quantity = Number(movementActionDraft.quantity);
    if (Number.isNaN(quantity) || quantity <= 0) {
      alert('Enter a valid quantity');
      return;
    }

    const { error } = await supabase
      .from('inventory_movements')
      .update({
        quantity,
        note: movementActionDraft.note.trim() || null,
        type: movementActionDraft.type,
        movement_date: movementActionDraft.movementDate,
      })
      .eq('id', movementActionDraft.id);

    if (error) {
      alert(error.message);
      return;
    }

    setMovementActionDraft(null);
    await loadData(true);
  }

  async function deleteMovement(movementId: string) {
    const { error } = await supabase.from('inventory_movements').delete().eq('id', movementId);
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

  const showFooter =
    section === 'invoices' ||
    (section === 'dashboard' && !selectedContact) ||
    (section === 'inventory' && !selectedInventoryItem);

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
                <button className="icon-btn" onClick={() => setShowLogoutConfirm(true)} aria-label="Sign out">
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
                <div
                  className="detail-party detail-party-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => editSelectedContact()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      editSelectedContact();
                    }
                  }}
                >
                  <div className="party-avatar detail-avatar">{selectedContact.name[0]?.toUpperCase() ?? '?'}</div>
                  <div>
                    <h3>{selectedContact.name}</h3>
                    {selectedContact.phone && <p>{selectedContact.phone}</p>}
                  </div>
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
                  <div key={entry.id} className="entry-grid-row" onClick={() => openEntryActionForm(entry)}>
                    <div className="entry-left">
                      <p className="entry-time">{formatEntryDate(entry.created_at)}</p>
                      <p className="entry-balance-tag">Bal. ₹{entry.runningBalance.toFixed(0)}</p>
                      <p className="entry-note">{entry.note ?? 'No note'}</p>
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
      ) : section === 'invoices' ? (
        <section className="ledger-home inventory-home">
          <div className="home-top inventory-top">
            <div className="home-header-row">
              <div className="brand-row">
                <h2>Invoices</h2>
              </div>
              <button type="button" className="inventory-leave-btn" onClick={() => setShowInvoiceForm(true)}>
                + New
              </button>
            </div>

            <div className="summary-card inventory-summary-card">
              <div className="summary-stats inventory-stats-three">
                <div>
                  <p className="muted">Type</p>
                  <strong>{invoiceKind === 'purchase' ? 'Purchase' : 'Sales'}</strong>
                </div>
                <div>
                  <p className="muted">Invoices</p>
                  <strong>{invoiceHistory.length}</strong>
                </div>
                <div>
                  <p className="muted">Lines</p>
                  <strong>{invoiceHistory.reduce((sum, item) => sum + item.lineCount, 0)}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="home-body with-footer-space">
            <div className="invoice-kind-toggle">
              <button
                type="button"
                className={invoiceKind === 'purchase' ? 'active' : ''}
                onClick={() => setInvoiceKind('purchase')}
              >
                Purchases
              </button>
              <button
                type="button"
                className={invoiceKind === 'sale' ? 'active' : ''}
                onClick={() => setInvoiceKind('sale')}
              >
                Sales
              </button>
            </div>

            <div className="invoice-history-list">
              {invoiceHistory.map((invoice) => (
                <div key={invoice.id} className="invoice-history-card">
                  <div>
                    <strong>{invoice.id}</strong>
                    <p className="muted">{invoice.party}</p>
                  </div>
                  <div className="invoice-history-meta">
                    <p className="muted">{invoice.date}</p>
                    <strong>₹{invoice.totalValue.toFixed(2)}</strong>
                  </div>
                </div>
              ))}
              {invoiceHistory.length === 0 && <p className="muted empty-text">No invoices yet.</p>}
            </div>

            <button className="fab-add with-footer" onClick={() => setShowInvoiceForm(true)}>
              + New Invoice
            </button>
          </div>
        </section>
      ) : inventoryView === 'group' ? (
        <section className="ledger-home inventory-home">
          <div className="home-top inventory-top">
            <div className="home-header-row">
              <div className="brand-row">
                <h2>Inventory Group</h2>
              </div>
              <button className="icon-btn" onClick={() => setInventoryView('list')} aria-label="Back to inventory">
                ←
              </button>
            </div>
          </div>

          <div className="home-body inventory-body with-footer-space">
            {activeInventoryGroup ? (
              <div className="inventory-group-card stack">
                <h4>Group Info</h4>
                <p className="muted">Code: {activeInventoryGroup.join_code}</p>
                <input
                  value={groupNameDraft}
                  onChange={(e) => setGroupNameDraft(e.target.value)}
                  placeholder="Group name"
                  autoCapitalize="words"
                  disabled={activeInventoryGroup.owner_id !== userId}
                />
                {activeInventoryGroup.owner_id === userId && (
                  <button type="button" onClick={() => void saveGroupName()}>
                    Save Group Name
                  </button>
                )}

                <h4>Users In Group</h4>
                <div className="inventory-group-members">
                  {inventoryGroupMembers.map((member) => (
                    <div key={member.user_id} className="inventory-group-member-row">
                      <strong>{member.display_name}</strong>
                      <span>{member.role}</span>
                    </div>
                  ))}
                </div>

                <div className="inventory-group-actions">
                  <button type="button" className="add-party-cancel-btn" onClick={() => void leaveInventorySyncGroup()}>
                    Leave Group
                  </button>
                  {activeInventoryGroup.owner_id === userId && (
                    <button type="button" className="danger-solid" onClick={() => void deleteGroup()}>
                      Delete Group
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="inventory-group-card stack">
                <h4>No Active Group</h4>
                <p className="muted">Create a new group or join with code.</p>
                <input
                  value={groupNameDraft}
                  onChange={(e) => setGroupNameDraft(e.target.value)}
                  placeholder="Group name"
                  autoCapitalize="words"
                />
                <button type="button" onClick={() => void createInventoryGroup()}>
                  Create Group
                </button>
                <div className="inventory-group-join-row">
                  <input
                    value={groupJoinCode}
                    onChange={(e) => setGroupJoinCode(e.target.value)}
                    placeholder="Enter code"
                    autoCapitalize="characters"
                  />
                  <button type="button" onClick={() => void joinInventoryGroup()}>
                    Join
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : !selectedInventoryItem ? (
        <section className="ledger-home inventory-home">
          <div className="home-top inventory-top">
            <div className="home-header-row">
              <div className="brand-row">
                <h2>Inventory</h2>
              </div>
              <div className="inventory-header-actions">
                <button type="button" className="inventory-leave-btn" onClick={() => setInventoryView('group')}>
                  Group
                </button>
              </div>
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
                <button
                  key={item.id}
                  type="button"
                  className="party-row inventory-row"
                  onClick={() => setSelectedInventoryItemId(item.id)}
                >
                  <div className="party-avatar">{item.name[0]?.toUpperCase() ?? '?'}</div>
                  <div className="party-main">
                    <strong>{item.name}</strong>
                    <p className="muted">Unit: {item.unit ?? 'NOS'}</p>
                  </div>
                  <div className="party-balance">
                    <strong className={item.stock > 0 ? 'gave' : 'got'}>{item.stock.toFixed(2)}</strong>
                    <p className="muted">In Stock</p>
                  </div>
                </button>
              ))}
              {filteredInventoryItems.length === 0 && <p className="muted empty-text">No inventory items found.</p>}
            </div>

            {showAddInventoryForm && (
              <div className="add-party-overlay">
                <form onSubmit={addInventoryItem} className="add-party-sheet stack">
                  <h4>Add Inventory Item</h4>
                  <input
                    value={inventoryItemDraft.name}
                    onChange={(e) =>
                      setInventoryItemDraft((draft) => ({ ...draft, name: e.target.value }))
                    }
                    placeholder="Item name"
                    autoCapitalize="words"
                    required
                  />
                  <input
                    value={inventoryItemDraft.unit}
                    onChange={(e) =>
                      setInventoryItemDraft((draft) => ({ ...draft, unit: e.target.value.toUpperCase() }))
                    }
                    list="inventory-unit-options"
                    placeholder="Unit (e.g., NOS, KG)"
                  />
                  <datalist id="inventory-unit-options">
                    {INVENTORY_UNITS.map((unit) => (
                      <option key={unit} value={unit} />
                    ))}
                  </datalist>
                  <div className="row">
                    <button type="button" className="add-party-cancel-btn" onClick={() => setShowAddInventoryForm(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="add-party-save-btn">
                      Save
                    </button>
                  </div>
                </form>
              </div>
            )}

            <button className="fab-add with-footer" onClick={() => setShowAddInventoryForm(true)}>
              + Add Item
            </button>
          </div>
        </section>
      ) : (
        <section className="ledger-detail">
          <div className="detail-top inventory-top">
            <div className="detail-header-row">
              <button className="icon-btn detail-back" onClick={() => setSelectedInventoryItemId('')}>
                ←
              </button>
              <div
                className="detail-party detail-party-clickable"
                role="button"
                tabIndex={0}
                onClick={() => editSelectedInventoryItem()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    editSelectedInventoryItem();
                  }
                }}
              >
                <div className="party-avatar detail-avatar">
                  {selectedInventoryItem.name[0]?.toUpperCase() ?? '?'}
                </div>
                <div>
                  <h3>{selectedInventoryItem.name}</h3>
                  <p>{selectedInventoryItem.unit ?? 'NOS'}</p>
                </div>
              </div>
            </div>

            <div className="detail-balance-card">
              <span>Current Stock</span>
              <strong className={selectedInventoryStock > 0 ? 'gave' : 'got'}>
                {selectedInventoryStock.toFixed(2)}
              </strong>
            </div>
          </div>

          <div className="detail-body with-footer-space">
            <div className="entry-head-row inventory-entry-head-row">
              <span>Date & Note</span>
              <span>Stock In</span>
              <span>Stock Out</span>
            </div>

            <div className="entries detail-entries">
              {selectedInventoryMovements.map((movement) => (
                <div
                  key={movement.id}
                  className="entry-grid-row inventory-entry-grid-row"
                  onClick={() => openMovementActionForm(movement)}
                >
                  <div className="entry-left">
                    <p className="entry-time">{formatEntryDate(movement.created_at)}</p>
                    <p className="entry-note">{movement.note ?? 'No note'}</p>
                  </div>
                  <div className="entry-mid">
                    {movement.type === 'in' && <strong className="gave">{movement.quantity.toFixed(2)}</strong>}
                  </div>
                  <div className="entry-right">
                    {movement.type === 'out' && <strong className="got">{movement.quantity.toFixed(2)}</strong>}
                  </div>
                </div>
              ))}
              {selectedInventoryMovements.length === 0 && <p className="muted empty-text">No stock movement yet.</p>}
            </div>
          </div>

          <div className="detail-action-bar inventory-detail-action-bar">
            <button className="give-action-btn" onClick={() => startInventoryMovement('in')}>
              STOCK IN
            </button>
            <button className="get-action-btn" onClick={() => startInventoryMovement('out')}>
              STOCK OUT
            </button>
          </div>
        </section>
      )}

      {showFooter && (
        <div className="app-footer-nav">
          <button
            type="button"
            className={section === 'dashboard' ? 'active' : ''}
            onClick={() => {
              setSelectedInventoryItemId('');
              setSection('dashboard');
            }}
          >
            Main Dashboard
          </button>
          <button
            type="button"
            className={section === 'inventory' ? 'active' : ''}
            onClick={() => {
              setSelectedContactId('');
              setSelectedInventoryItemId('');
              setSection('inventory');
            }}
          >
            Inventories
          </button>
          <button
            type="button"
            className={section === 'invoices' ? 'active' : ''}
            onClick={() => {
              setSelectedContactId('');
              setSelectedInventoryItemId('');
              setSection('invoices');
            }}
          >
            Invoices
          </button>
        </div>
      )}

      {showInvoiceForm && (
        <div className="entry-edit-overlay">
          <form
            className="entry-edit-modal stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveInvoice();
            }}
          >
            <h4>{invoiceKind === 'purchase' ? 'New Purchase Invoice' : 'New Sales Invoice'}</h4>
            <input
              value={invoiceParty}
              onChange={(e) => setInvoiceParty(e.target.value)}
              placeholder={invoiceKind === 'purchase' ? 'Supplier name' : 'Customer name'}
              autoCapitalize="words"
            />
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
            <input
              value={invoiceNote}
              onChange={(e) => setInvoiceNote(e.target.value)}
              placeholder="Invoice note (optional)"
            />
            <input
              value={invoiceSettlementAmount}
              onChange={(e) => setInvoiceSettlementAmount(e.target.value)}
              type="number"
              min="0"
              step="0.01"
              placeholder={invoiceKind === 'sale' ? 'Received amount (optional)' : 'Paid amount (optional)'}
            />

            <div className="invoice-line-row">
              <select
                value={invoiceLineDraft.item_id}
                onChange={(e) => setInvoiceLineDraft((prev) => ({ ...prev, item_id: e.target.value }))}
              >
                <option value="">Select item</option>
                {inventoryItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.unit ?? 'NOS'})
                  </option>
                ))}
              </select>
              <input
                value={invoiceLineDraft.quantity}
                onChange={(e) => setInvoiceLineDraft((prev) => ({ ...prev, quantity: e.target.value }))}
                type="number"
                min="0"
                step="0.01"
                placeholder="Qty"
              />
              <input
                value={invoiceLineDraft.rate}
                onChange={(e) => setInvoiceLineDraft((prev) => ({ ...prev, rate: e.target.value }))}
                type="number"
                min="0"
                step="0.01"
                placeholder="Rate"
              />
              <button type="button" onClick={() => addInvoiceLine()}>
                Add
              </button>
            </div>

            <div className="invoice-line-list">
              {invoiceLines.map((line, index) => {
                const item = inventoryItems.find((entry) => entry.id === line.item_id);
                const qty = Number(line.quantity);
                const rate = Number(line.rate);
                return (
                  <div key={`${line.item_id}-${index}`} className="invoice-line-item">
                    <span>{item?.name ?? 'Unknown item'}</span>
                    <span>
                      {qty.toFixed(2)} x ₹{rate.toFixed(2)}
                    </span>
                    <button type="button" className="link" onClick={() => removeInvoiceLine(index)}>
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="row">
              <button
                type="button"
                className="link"
                onClick={() => {
                  setShowInvoiceForm(false);
                  setInvoiceLines([]);
                  setInvoiceLineDraft({ item_id: '', quantity: '', rate: '' });
                  setInvoiceSettlementAmount('');
                }}
              >
                Cancel
              </button>
              <button type="submit">Save Invoice</button>
            </div>
          </form>
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
            <p className="muted">{selectedInventoryItem?.name ?? 'Selected item'}</p>
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

      {entryActionDraft && (
        <div className="entry-edit-overlay">
          <form
            className="entry-edit-modal stack"
            onSubmit={(e) => {
              e.preventDefault();
              void submitEntryAction();
            }}
          >
            <h4>Entry Action</h4>
            <input
              value={entryActionDraft.amount}
              onChange={(e) =>
                setEntryActionDraft((draft) => (draft ? { ...draft, amount: e.target.value } : draft))
              }
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              required
            />
            <input
              value={entryActionDraft.note}
              onChange={(e) =>
                setEntryActionDraft((draft) => (draft ? { ...draft, note: e.target.value } : draft))
              }
              placeholder="Note (optional)"
              autoCapitalize="sentences"
            />
            <select
              value={entryActionDraft.type}
              onChange={(e) =>
                setEntryActionDraft((draft) => (draft ? { ...draft, type: e.target.value as EntryType } : draft))
              }
            >
              <option value="gave">You gave</option>
              <option value="got">You got</option>
            </select>
            <input
              type="date"
              value={entryActionDraft.entryDate}
              onChange={(e) =>
                setEntryActionDraft((draft) => (draft ? { ...draft, entryDate: e.target.value } : draft))
              }
              required
            />
            <div className="row">
              <button
                type="button"
                className="danger-solid"
                onClick={() => {
                  if (!entryActionDraft) return;
                  if (!window.confirm('Delete this entry permanently?')) return;
                  void deleteEntry(entryActionDraft.id);
                  setEntryActionDraft(null);
                }}
              >
                Delete
              </button>
              <button type="button" className="link" onClick={() => setEntryActionDraft(null)}>
                Cancel
              </button>
              <button type="submit">
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {movementActionDraft && (
        <div className="entry-edit-overlay">
          <form
            className="entry-edit-modal stack"
            onSubmit={(e) => {
              e.preventDefault();
              void submitMovementAction();
            }}
          >
            <h4>Stock Movement Action</h4>
            <input
              value={movementActionDraft.quantity}
              onChange={(e) =>
                setMovementActionDraft((draft) => (draft ? { ...draft, quantity: e.target.value } : draft))
              }
              type="number"
              min="0"
              step="0.01"
              placeholder="Quantity"
              required
            />
            <input
              value={movementActionDraft.note}
              onChange={(e) =>
                setMovementActionDraft((draft) => (draft ? { ...draft, note: e.target.value } : draft))
              }
              placeholder="Note (optional)"
            />
            <select
              value={movementActionDraft.type}
              onChange={(e) =>
                setMovementActionDraft((draft) =>
                  draft ? { ...draft, type: e.target.value as InventoryMovementType } : draft
                )
              }
            >
              <option value="in">Stock In</option>
              <option value="out">Stock Out</option>
            </select>
            <input
              type="date"
              value={movementActionDraft.movementDate}
              onChange={(e) =>
                setMovementActionDraft((draft) => (draft ? { ...draft, movementDate: e.target.value } : draft))
              }
              required
            />

            <div className="row">
              <button
                type="button"
                className="danger-solid"
                onClick={() => {
                  if (!movementActionDraft) return;
                  if (!window.confirm('Delete this stock movement permanently?')) return;
                  void deleteMovement(movementActionDraft.id);
                  setMovementActionDraft(null);
                }}
              >
                Delete
              </button>
              <button type="button" className="link" onClick={() => setMovementActionDraft(null)}>
                Cancel
              </button>
              <button type="submit">
                Save
              </button>
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
              <button
                type="button"
                className="danger-solid"
                onClick={() => {
                  if (!editContactDraft) return;
                  if (!window.confirm('Delete this customer and all related entries?')) return;
                  const targetId = editContactDraft.id;
                  setEditContactDraft(null);
                  void deleteSelectedContact(targetId);
                }}
              >
                Delete
              </button>
              <button type="button" className="link" onClick={() => setEditContactDraft(null)}>
                Cancel
              </button>
              <button type="submit">Save</button>
            </div>
          </form>
        </div>
      )}

      {editInventoryItemDraft && (
        <div className="entry-edit-overlay">
          <form
            className="entry-edit-modal stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEditedInventoryItem();
            }}
          >
            <h4>Edit Item</h4>
            <input
              value={editInventoryItemDraft.name}
              onChange={(e) =>
                setEditInventoryItemDraft((draft) => (draft ? { ...draft, name: e.target.value } : draft))
              }
              placeholder="Item name"
              autoCapitalize="words"
              required
            />
            <input
              value={editInventoryItemDraft.unit}
              onChange={(e) =>
                setEditInventoryItemDraft((draft) =>
                  draft ? { ...draft, unit: e.target.value.toUpperCase() } : draft
                )
              }
              list="inventory-unit-options-edit"
              placeholder="Unit (e.g., NOS, KG)"
            />
            <datalist id="inventory-unit-options-edit">
              {INVENTORY_UNITS.map((unit) => (
                <option key={unit} value={unit} />
              ))}
            </datalist>
            <div className="row">
              <button type="button" className="link" onClick={() => setEditInventoryItemDraft(null)}>
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

      {showLogoutConfirm && (
        <div className="entry-edit-overlay">
          <div className="entry-edit-modal stack">
            <h4>Log out?</h4>
            <p className="muted">Are you sure you want to log out of this account?</p>
            <div className="row">
              <button type="button" className="link" onClick={() => setShowLogoutConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="danger-solid"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  void signOut();
                }}
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
