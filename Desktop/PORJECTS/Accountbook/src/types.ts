export type Contact = {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
};

export type EntryType = 'gave' | 'got';

export type Entry = {
  id: string;
  contact_id: string;
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
  name: string;
  unit: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryMovement = {
  id: string;
  owner_id: string;
  item_id: string;
  type: InventoryMovementType;
  quantity: number;
  note: string | null;
  movement_date: string;
  created_at: string;
};
