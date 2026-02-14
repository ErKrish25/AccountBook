export type ContactCategory = 'sundry_creditor' | 'sundry_debtor' | 'individual';

export type Contact = {
  id: string;
  name: string;
  phone: string | null;
  category: ContactCategory;
  created_at: string;
};

export type EntryType = 'gave' | 'got';

export type Entry = {
  id: string;
  owner_id: string;
  contact_id: string;
  invoice_id: string | null;
  type: EntryType;
  amount: number;
  note: string | null;
  entry_date: string;
  created_at: string;
};

export type ContactSummary = Contact & {
  balance: number;
};

export type InventoryMovementType = 'in' | 'out';

export type InventoryItem = {
  id: string;
  owner_id: string;
  group_id: string | null;
  name: string;
  unit: string | null;
  category: string | null;
  barcode: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryMovement = {
  id: string;
  owner_id: string;
  group_id: string | null;
  item_id: string;
  invoice_id: string | null;
  type: InventoryMovementType;
  quantity: number;
  note: string | null;
  movement_date: string;
  created_at: string;
};

export type InvoiceKind = 'purchase' | 'sale';

export type Invoice = {
  id: string;
  owner_id: string;
  group_id: string | null;
  contact_id: string;
  kind: InvoiceKind;
  party_name: string;
  invoice_date: string;
  note: string | null;
  total_amount: number;
  settlement_amount: number;
  status: 'posted' | 'cancelled';
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceLine = {
  id: string;
  owner_id: string;
  invoice_id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  rate: number;
  amount: number;
  created_at: string;
};

export type InventorySyncGroup = {
  id: string;
  owner_id: string;
  name: string;
  join_code: string;
  created_at: string;
};

export type InventoryGroupMember = {
  user_id: string;
  role: string;
  display_name: string;
  email: string | null;
  joined_at: string;
};
