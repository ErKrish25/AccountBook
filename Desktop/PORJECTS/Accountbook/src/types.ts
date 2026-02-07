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
