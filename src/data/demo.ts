import { ClientSummary } from '../types';

/** Sample roster shown in the facilitator console BEFORE they subscribe, so they
 *  can see how the app works. Read-only — none of this is real or editable. */
export const DEMO_CLIENTS: ClientSummary[] = [
  { id: 'demo-1', firstName: 'Marcus', lastName: 'Reed', houseName: 'Hillside House', status: 'in_care', levelOfCare: 'sober_living', monthlyRentCents: 80000, rentDueDay: 1 },
  { id: 'demo-2', firstName: 'Tyler', lastName: 'Brooks', houseName: 'Hillside House', status: 'in_care', levelOfCare: 'sober_living', monthlyRentCents: 80000, rentDueDay: 1 },
  { id: 'demo-3', firstName: 'Andre', lastName: 'Wilson', houseName: 'Lakeview', status: 'in_care', levelOfCare: 'sober_living', monthlyRentCents: 75000, rentDueDay: 5 },
  { id: 'demo-4', firstName: 'Devon', lastName: 'Carter', houseName: 'Lakeview', status: 'in_care', levelOfCare: 'sober_living', monthlyRentCents: 75000, rentDueDay: 5 },
  { id: 'demo-5', firstName: 'Jordan', lastName: 'Ellis', houseName: 'Riverside', status: 'in_care', levelOfCare: 'sober_living', monthlyRentCents: 0 },
  { id: 'demo-6', firstName: 'Chris', lastName: 'Nolan', houseName: 'Riverside', status: 'in_care', levelOfCare: 'sober_living', monthlyRentCents: 90000, rentDueDay: 1 },
  { id: 'demo-7', firstName: 'Sam', lastName: 'Diaz', houseName: 'Hillside House', status: 'in_care', levelOfCare: 'sober_living', monthlyRentCents: 80000, rentDueDay: 1 },
];

export type DemoPayStatus = 'paid' | 'partial' | 'none' | 'norent';

/** Fake this-month payment status per demo client (drives the preview pie + list). */
export const DEMO_PAY_STATUS: Record<string, DemoPayStatus> = {
  'demo-1': 'paid',
  'demo-2': 'paid',
  'demo-3': 'partial',
  'demo-4': 'paid',
  'demo-5': 'norent',
  'demo-6': 'none',
  'demo-7': 'paid',
};

/** Pre-tallied pie for the preview (excludes the no-rent client). */
export const DEMO_PIE = { paid: 4, partial: 1, none: 1 };
