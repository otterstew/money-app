// What a new ledger starts with. Every name here can be changed in Settings;
// the accounts are the ones known on 19 Nov 2026 and the buckets are a
// starting set to prune, not a recommendation.

export const PEOPLE = [
  { id: 'stewart', name: 'Stewart', short: 'S' },
  { id: 'trisha', name: 'Trisha', short: 'T' },
  { id: 'joint', name: 'Joint', short: 'J' },
];

export const SCOPES = [
  { id: 'household', name: 'Household' },
  { id: 'holiday', name: 'France holiday' },
  { id: 'business', name: 'Gîte business' },
];

export function seedAccounts() {
  return [
    { id: 'acc-nwi-joint', name: 'Joint current', bank: 'NatWest International', currency: 'GBP', kind: 'current', owner: 'joint', scope: 'household', number_tail: null, opening: 0, anchor: null, sort: 1 },
    { id: 'acc-nwi-trisha', name: 'Trisha’s current', bank: 'NatWest International', currency: 'GBP', kind: 'current', owner: 'trisha', scope: 'household', number_tail: null, opening: 0, anchor: null, sort: 2 },
    { id: 'acc-cmb-1', name: 'Compte chèques 1', bank: 'CMB', currency: 'EUR', kind: 'current', owner: 'joint', scope: 'business', number_tail: null, opening: 0, anchor: null, sort: 3 },
    { id: 'acc-cmb-2', name: 'Compte chèques 2', bank: 'CMB', currency: 'EUR', kind: 'current', owner: 'joint', scope: 'business', number_tail: null, opening: 0, anchor: null, sort: 4 },
  ];
}

const B = (id, name, group, extra = {}) => ({ id, name, group, kind: 'spend', target: null, rollover: true, archived: false, ...extra });

export function seedBuckets() {
  return [
    B('b-income', 'Income', 'Income', { kind: 'income' }),
    B('b-mortgage', 'Mortgage or rent', 'Bills'),
    B('b-utilities', 'Electricity, gas, water', 'Bills'),
    B('b-rates', 'Parish rates and tax', 'Bills'),
    B('b-insurance', 'Insurance', 'Bills'),
    B('b-phone', 'Phones and internet', 'Bills'),
    B('b-subs', 'Subscriptions', 'Bills'),
    B('b-groceries', 'Groceries', 'Everyday'),
    B('b-eatingout', 'Eating out', 'Everyday'),
    B('b-fuel', 'Fuel and parking', 'Everyday'),
    B('b-health', 'Health and pharmacy', 'Everyday'),
    B('b-kids', 'Kids', 'Everyday'),
    B('b-household', 'Household and DIY', 'Everyday'),
    B('b-clothes', 'Clothes', 'Everyday'),
    B('b-home-projects', 'Home projects', 'Home'),
    B('b-repairs', 'Repairs and maintenance', 'Home'),
    B('b-car', 'Car costs', 'Planned'),
    B('b-gifts', 'Gifts and celebrations', 'Planned'),
    B('b-holidays', 'Holidays', 'Planned'),
    B('b-france-holiday', 'France holiday spending', 'Planned'),
    B('b-stewart-fun', 'Stewart’s spending money', 'Personal'),
    B('b-trisha-fun', 'Trisha’s spending money', 'Personal'),
    B('b-savings', 'Savings', 'Saving'),
    B('b-misc', 'Other', 'Everyday'),
    // Gîte business categories: used on the French accounts, never in the
    // household budget (scope = business keeps them out).
    B('g-income', 'Gîte income', 'Gîte business', { kind: 'business' }),
    B('g-commission', 'Booking commission', 'Gîte business', { kind: 'business' }),
    B('g-utilities', 'Gîte utilities', 'Gîte business', { kind: 'business' }),
    B('g-cleaning', 'Cleaning and laundry', 'Gîte business', { kind: 'business' }),
    B('g-repairs', 'Gîte repairs and supplies', 'Gîte business', { kind: 'business' }),
    B('g-tax', 'URSSAF and French tax', 'Gîte business', { kind: 'business' }),
    B('g-bank', 'Bank fees', 'Gîte business', { kind: 'business' }),
    B('g-other', 'Other gîte costs', 'Gîte business', { kind: 'business' }),
  ];
}

export function seedRules() {
  // Starting rules from the CMB statements' commonest payees (Sep–Oct 2026).
  // Not auto: they suggest, the review queue confirms, until trusted.
  const r = (id, value, set, { match = {}, ...rest } = {}) => ({ id, match: { op: 'contains', value, ...match }, set, auto: false, priority: 50, ...rest });
  return [
    r('r-urssaf', 'urssaf', { bucket_id: 'g-tax', scope: 'business' }),
    r('r-dgfip', 'dgfip', { bucket_id: 'g-tax', scope: 'business' }),
    r('r-orange', 'orange', { bucket_id: 'g-utilities', scope: 'business' }),
    r('r-edf', 'edf', { bucket_id: 'g-utilities', scope: 'business' }),
    r('r-vrbo', 'vrbo', { bucket_id: 'g-income', scope: 'business' }, { match: { direction: 'in' } }),
    r('r-homeaway', 'homeaway', { bucket_id: 'g-income', scope: 'business' }, { match: { direction: 'in' } }),
    r('r-romerils', 'romerils', { bucket_id: 'b-household' }),
  ];
}

export function seedProjects() {
  return [{ id: 'p-kitchen', name: 'Kitchen', budget: null, started: '2026-11-16', note: 'Kitchen and laundry refit, Belgrave Terrace.' }];
}

export function emptyLedger() {
  return {
    accounts: seedAccounts(), buckets: seedBuckets(), rules: seedRules(), projects: seedProjects(),
    txns: [], allocations: [], holidays: [], receipts: [], imports: [],
    settings: { fxMode: 'today', show: 'both', jointView: 'whole', rates: {}, ratesFetched: null },
  };
}
