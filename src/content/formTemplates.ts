import { FormField } from '../services/db';
import { HOUSE_FORMS } from './houseForms';
export { HOUSE_LEVEL_FORM_KEYS } from './houseForms';

/** Ready-made forms staff can assign with one tap. Staff can also build custom
 *  forms field-by-field. Field `type` drives how the resident fills it in. */
export interface BuiltInTemplate {
  key: string;
  title: string;
  description: string;
  fields: FormField[];
}

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  // Operator packet forms (intake, guest agreement, head of house, write-up, terms).
  ...HOUSE_FORMS,
  {
    key: 'lease_intake',
    title: 'Lease / Intake Agreement',
    description: 'Standard sober-living intake and residency agreement.',
    fields: [
      { key: 'full_name', label: 'Full legal name', type: 'text', required: true },
      { key: 'dob', label: 'Date of birth', type: 'date', required: true },
      { key: 'ssn_last4', label: 'Last 4 of SSN', type: 'ssn_last4', required: false },
      { key: 'phone', label: 'Phone number', type: 'phone', required: true },
      { key: 'mailing_address', label: 'Most recent mailing address', type: 'address', required: true },
      { key: 'emergency_name', label: 'Emergency contact name', type: 'text', required: true },
      { key: 'emergency_phone', label: 'Emergency contact phone', type: 'phone', required: true },
      { key: 'move_in_date', label: 'Move-in date', type: 'date', required: false },
      { key: 'vehicle', label: 'Vehicle (make / model / plate)', type: 'text', required: false },
      { key: 'fee_ack', label: 'I understand and agree to the monthly membership fee', type: 'yesno', required: true },
      { key: 'rules_ack', label: 'I have read and agree to the house rules', type: 'yesno', required: true },
      { key: 'notes', label: 'Anything else we should know?', type: 'longtext', required: false },
    ],
  },
  {
    key: 'emergency_medical',
    title: 'Emergency Contact & Medical Info',
    description: 'Emergency contacts, allergies, and medications.',
    fields: [
      { key: 'full_name', label: 'Full name', type: 'text', required: true },
      { key: 'emergency_name', label: 'Emergency contact name', type: 'text', required: true },
      { key: 'emergency_phone', label: 'Emergency contact phone', type: 'phone', required: true },
      { key: 'relationship', label: 'Relationship to you', type: 'text', required: false },
      { key: 'allergies', label: 'Allergies', type: 'longtext', required: false },
      { key: 'medications', label: 'Current medications', type: 'longtext', required: false },
      { key: 'physician', label: 'Primary care physician', type: 'text', required: false },
    ],
  },
];

/** Field types the custom-form builder offers, with friendly labels. */
export const FIELD_TYPE_LABELS: Record<FormField['type'], string> = {
  text: 'Short text',
  longtext: 'Long text',
  number: 'Number',
  phone: 'Phone',
  date: 'Date',
  yesno: 'Yes / No',
  ssn_last4: 'Last 4 of SSN',
  address: 'Mailing address',
  heading: 'Section heading',
  paragraph: 'Paragraph text',
  initial: 'Initials',
};
