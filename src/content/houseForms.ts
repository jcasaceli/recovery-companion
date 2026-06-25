/**
 * Ready-made sober-living operator forms (verbatim from the operator's PDF
 * packet, adapted for a fillable, e-signable mobile form). Facilitators pick a
 * form, fill in the resident/house details, and the resident (or facilitator)
 * e-signs it.
 *
 * Field types used here:
 *   heading    — bold section header (display only)
 *   paragraph  — body / legal text (display only)
 *   initial    — small "INITIAL: ___" box
 *   text/longtext/number/date/yesno/phone/address — fillable inputs
 *
 * These are general operator templates, not legal advice — operators should
 * review them with their own counsel before use.
 */
import type { BuiltInTemplate } from './formTemplates';

const definitionOfTerms: BuiltInTemplate = {
  key: 'definition_of_terms',
  title: 'Definition of Terms',
  description: 'Explains house terminology (resident, contribution, head of house, etc.).',
  fields: [
    { key: 'house_name', label: 'House name', type: 'text', required: false },
    { key: 'h', label: 'Definition of Terms', type: 'heading' },
    { key: 'p_home', label: 'Sober Living Home: Sober living homes are affordable, alcohol and drug free environments that provide a positive place for peer-group-recovery support. Sober housing promotes individual recovery by providing an environment that allows the residents to develop individual recovery programs and become self-supporting.', type: 'paragraph' },
    { key: 'p_contribution', label: 'Contribution: The money given to you by each resident is considered a contribution to the house. Make sure your residents understand that they do not pay rent and therefore do not receive formal eviction processes.', type: 'paragraph' },
    { key: 'p_resident', label: 'Resident: The women and/or men that join your house are considered residents in your home. As such, they agree not to have any "renter’s rights" and may be removed at any time for violating the contract/agreement, dirty test, refusing to test, etc.', type: 'paragraph' },
    { key: 'p_hoh', label: 'Head of House: You or a resident you have chosen to oversee daily function of your home. They may be used to resolve minor conflicts within the house before they get to you. This term is to be used instead of "Manager."', type: 'paragraph' },
    { key: 'p_meetings', label: 'House Meetings: A meeting with all residents in your house facilitated by you or your Head of House to resolve house issues.', type: 'paragraph' },
    { key: 'p_cards', label: 'Meeting Cards: Used to track the NA/AA or other meetings your residents attend. These can be shown to officials (code enforcement, etc.) upon request.', type: 'paragraph' },
    { key: 'p_staff', label: 'Staff: This term may be used to describe you, your Head of House, or someone designated to help facilitate your home.', type: 'paragraph' },
    { key: 'p_testlog', label: 'Test Log: Used for tracking the drug and/or alcohol testing of your residents. This can be shown to officials (code enforcement, etc.) upon request.', type: 'paragraph' },
    { key: 'p_contriblog', label: 'Contribution Log: Used for tracking the contributions made by your residents.', type: 'paragraph' },
  ],
};

const guestAgreement: BuiltInTemplate = {
  key: 'guest_agreement',
  title: 'Guest Agreement',
  description: 'Full guest agreement, house policies, cardinal rules & hold-harmless.',
  fields: [
    { key: 'guest_name', label: 'Guest name', type: 'text', required: true },
    { key: 'house_name', label: 'House name', type: 'text', required: true },
    { key: 'residence_address', label: 'Guest residence address', type: 'address', required: true },
    { key: 'h_agreement', label: 'Guest Agreement', type: 'heading' },
    { key: 'p_intro', label: 'I, the guest named above, fully understand that I am a guest at the House named above, hereinafter referred to as the House, and not a resident, tenant or lodger. Guest residences are located at the address above. Should the Director of the House determine at any time that it is no longer to our mutual advantage for me to remain at the House, there will be no further obligation on the part of the House or on my part as a guest.', type: 'paragraph' },
    { key: 'p_privacy', label: 'I agree to live drug and alcohol free and abide by all the Cardinal Rules and Policies of the House, and any new or additional rules and policies as they become applicable. I understand that I am not granted the exclusive right of occupancy of any room of the House, and as a member of a communal environment I have no right or expectation of privacy or exclusivity regarding my occupancy of a room. My living area may be accessed, entered, inspected and/or visited without any written notice in advance. My personal belongings within my living space are subject to search and inspection by management if any suspicion arises regarding my adherence to the Cardinal Rules or other House regulations.', type: 'paragraph' },
    { key: 'init_privacy', label: 'Initial: I understand and agree', type: 'initial', required: true },
    { key: 'monthly_fee', label: 'Guest monthly fee ($)', type: 'number', required: true },
    { key: 'due_day', label: 'Due day of each month', type: 'text', required: true },
    { key: 'proration_per_day', label: 'Proration amount per day ($)', type: 'number', required: false },
    { key: 'p_fee', label: 'I acknowledge and agree that the Guest monthly fee entered above is to be paid to the House on the due day of each month, with the full understanding that said monies are paid only for guest living accommodations and the structure and support provided in connection with my sobriety. If proration is necessary, I agree to pay the per-day amount entered above. Absolutely no money or part of said sum will be refunded after payment to the House. I give up all financial claims to said monies in whole or in part.', type: 'paragraph' },
    { key: 'p_acceptance', label: 'I agree to pay a Guest acceptance fee of $500.00, as well as an initial non-refundable drug testing fee of $200.00 every six months thereafter, which covers standardized on-site drug tests. All other designer drug tests will be sent to a certified lab at my sole expense and are payable upon testing. The Guest acceptance fee is refundable provided I give 2 weeks written notice of vacating and maintain continuous sobriety throughout my stay. I am financially responsible for 14 days from my notice to vacate. If I fail to give 2 weeks written notice, I forfeit the acceptance fee and agree to pay the remaining fees to cover the 14 days. If I fail to maintain continuous sobriety, my acceptance fee will be forfeited. If I am allowed to remain a guest, a new $500.00 acceptance fee will be required and all provisions of this Agreement remain in force.', type: 'paragraph' },
    { key: 'init_acceptance', label: 'Initial: I understand and agree', type: 'initial', required: true },
    { key: 'p_payment', label: 'The House accepts cash, cashier’s checks, bank certified checks, and personal checks. Personal checks must be received 5 days in advance of the due date. A returned check incurs a $35.00 fee and forfeits the privilege of paying by personal check. A $25.00 charge applies to any monthly fee not paid on or before the due date, with an additional $10.00 per day accruing on the 3rd delinquent day. Non-payment after 5 days results in termination of this Agreement and I must immediately vacate the premises.', type: 'paragraph' },
    { key: 'init_payment', label: 'Initial: I understand and agree', type: 'initial', required: true },
    { key: 'p_removal', label: 'I UNDERSTAND THAT ANY OF THE FOLLOWING MAY RESULT IN MY IMMEDIATE REMOVAL FROM THE HOUSE, WITH NO REFUND OF ANY MONIES PAID TO DATE, INCLUDING MY GUEST ACCEPTANCE FEE: ANY USE OF ILLICIT DRUGS OR ALCOHOL; ANY IMPLIED THREAT OR ACTUAL ACT OF VIOLENCE DIRECTED TOWARD ANY PERSON(S) OR PROPERTY IN OR NEAR THE HOUSE; ANY THREE VIOLATIONS OF HOUSE POLICIES AND/OR CARDINAL RULES WITHIN A 30-DAY PERIOD.', type: 'paragraph' },
    { key: 'init_removal', label: 'Initial: I understand and agree', type: 'initial', required: true },
    { key: 'p_abide', label: 'As a guest at the House, I willingly choose to abide by the sobriety requirements, testing agreement, the non-violence agreement, the House Policies and the Cardinal Rules. I agree to leave the House at any time if the House and its director determine that I am no longer a welcomed guest, and acknowledge that should I refuse to leave immediately, the House may have the Police remove me at any time, unconditionally and with no proration due to me.', type: 'paragraph' },
    { key: 'init_abide', label: 'Initial: I understand and agree', type: 'initial', required: true },
    { key: 'p_property', label: 'I understand any property brought to the House is a privilege, not a right. The House assumes no liability for the safeguard, well-being or storage of any personal belongings and may determine what and how much personal property is appropriate. I agree to remove all personal property immediately upon leaving; the House may bag property believed to be mine, is not responsible for property I bring in or leave behind, and may dispose of property not removed within thirty days of my departure. I agree to be financially responsible for any damage or loss, intentional or accidental, that I cause, and that my acceptance fee may be used to cover it.', type: 'paragraph' },
    { key: 'init_property', label: 'Initial: I understand and agree', type: 'initial', required: true },
    { key: 'p_ack_agreement', label: 'I acknowledge that I have read this document (or had it read to me) and fully understand it. I agree to comply with this house agreement and to hold the House harmless with full indemnification. Please confirm below: I HAVE READ AND UNDERSTAND THIS GUEST AGREEMENT.', type: 'paragraph' },
    { key: 'ack_agreement', label: 'I have read and understand this Guest Agreement', type: 'yesno', required: true },

    { key: 'h_policies', label: 'House Policies', type: 'heading' },
    { key: 'p_policies_intro', label: 'The following House Policies are to be observed by all guests to maintain a clean, safe and healthy environment with mutual respect for all concerned. Any infraction may result in a written "strike." Three strikes within a thirty-day period may result in further restrictions or termination of the guest agreement.', type: 'paragraph' },
    { key: 'p_pol_1', label: '1. Noise: No loud music or television. Keep noise down in the patio area after 8 PM. Be respectful and courteous of neighbors and others.', type: 'paragraph' },
    { key: 'p_pol_2', label: '2. Visitors: Entertained in community areas ONLY. Female visitors are not allowed on the property. Visitors are not allowed in guest bedrooms unless prior permission is granted. Visitation hours: Sun–Thurs 10 AM–9:30 PM, Fri–Sat 10 AM–11 PM. No overnight visits. You are responsible for your guests’ behavior.', type: 'paragraph' },
    { key: 'p_pol_3', label: '3. No Smoking or Vaping: Not inside any unit or the sign-out board walkway. Smoking or vaping is allowed ONLY at the designated backyard table.', type: 'paragraph' },
    { key: 'p_pol_4', label: '4. Each Guest: Responsible for washing their own dishes immediately after use, drying and putting them away. Keep your sleeping and living area clean at all times. No personal items left in community areas.', type: 'paragraph' },
    { key: 'p_pol_5', label: '5. Out of Bounds: Guests may not enter another guest’s room or unit without permission.', type: 'paragraph' },
    { key: 'p_pol_6', label: '6. Food and Drink: No eating or drinking in carpeted areas, except water.', type: 'paragraph' },
    { key: 'p_pol_7', label: '7. Job Assignments: House chore assignments must be completed on designated days. Check with management if unsure of your assignment.', type: 'paragraph' },
    { key: 'p_pol_8', label: '8. Curfews: Sun–Thurs 12 AM, Fri–Sat 1 AM. No leaving after curfew unless approved by staff.', type: 'paragraph' },
    { key: 'p_pol_9', label: '9. Sign Out Rules: All guests must sign in and out on the board, detailing destination, phone number, time of departure and anticipated arrival. Notify the house manager of any change. When signing out for a 12-Step meeting, identify which meeting you will attend.', type: 'paragraph' },
    { key: 'p_pol_10', label: '10. Sleeping: Mon–Fri guests must be awake and out of bed by 9 AM. No sleeping in community areas or on couches. Do not leave televisions/radios on in guest rooms while sleeping.', type: 'paragraph' },
    { key: 'p_pol_11', label: '11. House Activities: Guests agree to attend and participate in house activities, including the house business and community meetings, unless pre-approved by staff.', type: 'paragraph' },
    { key: 'p_pol_12', label: '12. Meeting Attendance: Meetings are to be attended daily unless pre-approved by staff. Attendance slips may be required, signed and turned in weekly.', type: 'paragraph' },
    { key: 'p_pol_13', label: '13. Dress Code: Guests must be properly attired in community areas — pants or shorts, shirts and shoes.', type: 'paragraph' },
    { key: 'p_pol_14', label: '14. Pornography: No pornographic material of any kind on the premises, including on computers and through streaming.', type: 'paragraph' },
    { key: 'p_pol_15', label: '15. Gossip/Inappropriate Speech: Gossip, character assassination, criticism, drug talk, drug glorifying and speaking ill of others will not be tolerated, including disrespectful or aggressive speech.', type: 'paragraph' },
    { key: 'p_pol_16', label: '16. Overnight Passes: No pass with less than 30 days continuous sobriety. With 31+ days you may apply for two overnight passes a week, with at least 3 days on the premises between passes. Submit a request 24 hours in advance with written staff approval; chores must be completed and covered. No pass if you received a write-up within the previous seven days.', type: 'paragraph' },
    { key: 'p_pol_17', label: '17. Borrowing Money: Borrowing from or loaning money to another guest is PROHIBITED.', type: 'paragraph' },
    { key: 'p_pol_18', label: '18. Automobiles: Loaning your auto to another guest is PROHIBITED. You must have current auto insurance to use your car while a guest.', type: 'paragraph' },
    { key: 'p_pol_19', label: '19. UA Testing: All guests submit to random drug and/or alcohol testing, supervised and verified by the house manager. If refused, submit to an on-site oral test. Submit within 1 hour of request and do not leave the property until tested. Failure to comply constitutes a dirty test.', type: 'paragraph' },
    { key: 'p_pol_20', label: '20. Exercise Area: Do not use the heavy bag after 4 PM. No weightlifting after 9 PM.', type: 'paragraph' },
    { key: 'p_pol_21', label: '21. Property Modifications: No modifying, adding, hanging items, or altering the property interior or exterior. No adding outside services or electronics without staff permission.', type: 'paragraph' },
    { key: 'p_pol_22', label: '22. Cell Phones: Not allowed on your person during house meetings unless cleared with staff beforehand.', type: 'paragraph' },
    { key: 'ack_policies', label: 'I have read and understand the House Policies', type: 'yesno', required: true },

    { key: 'h_cardinal', label: 'Cardinal Rules', type: 'heading' },
    { key: 'p_card_intro', label: 'The following Cardinal Rules are to be observed by all guests. Any infraction may result in termination of your Guest Agreement.', type: 'paragraph' },
    { key: 'p_card_1', label: '1. No use of alcohol and/or drugs or any other mind-altering substances, including non-approved medications, and no possession of any paraphernalia.', type: 'paragraph' },
    { key: 'p_card_2', label: '2. Protecting Guests: Guests must inform management of anyone using substances or whose behavior violates house policies or cardinal rules.', type: 'paragraph' },
    { key: 'p_card_3', label: '3. Medications: All medications kept under lock and key in the office. Inform management of any prescription or over-the-counter medications before taking them. No alcohol-based mouthwashes, cough syrups or cold remedies unless prescribed and approved. No more than one week’s supply.', type: 'paragraph' },
    { key: 'p_card_4', label: '4. Violence or Threats: No violence against any guest, management or property, including derogatory, vulgar or abusive language.', type: 'paragraph' },
    { key: 'p_card_5', label: '5. Weapons: No weapons of any kind on House property.', type: 'paragraph' },
    { key: 'p_card_6', label: '6. Stealing: No stealing or borrowing without permission.', type: 'paragraph' },
    { key: 'p_card_7', label: '7. Sexual/Romantic Activity: Prohibited between houseguests — no dating, courting, or explicit/sexual text messages. Having sex on the premises with non-guests is also prohibited.', type: 'paragraph' },
    { key: 'p_card_8', label: '8. Destruction of Property: No destruction of property or belongings of guests or the House.', type: 'paragraph' },
    { key: 'p_card_9', label: '9. Noise: Absolutely no speed bag or heavy bag use after 4 PM.', type: 'paragraph' },
    { key: 'p_card_10', label: '10. Women/Visitors: No unauthorized visitors on the property at any time unless first cleared with staff.', type: 'paragraph' },
    { key: 'p_card_11', label: '11. Pets: No pets of any kind.', type: 'paragraph' },
    { key: 'p_card_12', label: '12. Curfew: Failure to return home by curfew is considered AWOL and is subject to termination.', type: 'paragraph' },
    { key: 'ack_cardinal', label: 'I have read and understand the Cardinal Rules', type: 'yesno', required: true },

    { key: 'h_harmless', label: 'Agreement to Hold Harmless with Full Indemnification', type: 'heading' },
    { key: 'p_h_injury', label: '1. Non-Liability — Injury: I release the House, its owners, shareholders, directors, officers, management, employers, employees, agents and attorneys from any and all liability due to personal injuries sustained by me for any reason, on or off the premises, other than those due to intentional gross negligence.', type: 'paragraph' },
    { key: 'p_h_property', label: '2. Non-Liability — Personal Property: I release the House and the above parties from any and all liability for loss or damage of any personal property, other than those due to intentional gross negligence. The House will only hold personal belongings for ten days after departure, after which they will be donated to charity.', type: 'paragraph' },
    { key: 'p_h_emergency', label: '3. Non-Liability — Emergency Care: I release the House and the above parties from any and all liability in the event of a physical or mental emergency. I authorize the House to make necessary arrangements for emergency care, but understand they are under no obligation to do so.', type: 'paragraph' },
    { key: 'p_h_transport', label: '4. Non-Liability — Injuries/Transportation: I release the House and the above parties from any and all liability due to personal injury or loss during transportation while I am a guest.', type: 'paragraph' },
    { key: 'p_h_release', label: '5. Release of Information to Law Enforcement / Probation / Parole: I agree that the House and the above parties may disclose information about a guest to any law enforcement agency, probation and/or parole department, or other governmental or healthcare entity, and authorize them to do so.', type: 'paragraph' },
    { key: 'ack_harmless', label: 'I have read and understand this Agreement to Hold Harmless with Full Indemnification', type: 'yesno', required: true },
  ],
};

const headOfHouseAgreement: BuiltInTemplate = {
  key: 'head_of_house_agreement',
  title: 'Head of House Agreement',
  description: 'Voluntary, non-paid Head of House duties and acknowledgement.',
  fields: [
    { key: 'house_name', label: 'House name', type: 'text', required: true },
    { key: 'house_address', label: 'House address', type: 'address', required: false },
    { key: 'hoh_name', label: 'Head of House name', type: 'text', required: true },
    { key: 'h', label: 'Head of House Agreement', type: 'heading' },
    { key: 'p_intro', label: 'I, the Head of House named above, agree that my position as Head of House is voluntary and a non-paid position. This agreement is in addition to the house contract and general agreement that I have agreed to and signed.', type: 'paragraph' },
    { key: 'p_duties', label: 'As Head of House, I agree to: (1) Be a positive role model and set a good example for other guests. (2) IMMEDIATELY report any guest under the influence of drugs and/or alcohol, in possession of the same, or in possession of pornography. (3) Support the owners, Head of Houses, Assistant Head of Houses, their decisions, and the rules of the house. (4) Communicate with the Head of Houses and/or assistant regarding house issues. (5) Ensure guests are following house rules. (6) Inform the Head of Houses of any guest violating house rules. (7) Greet all new guests. (8) Explain rules to new guests, give a tour, assign refrigerator and cupboard space, and introduce them to other guests. (9) Assign chores and ensure they are done properly and on time. (10) Complete undone chores. (11) Make sure rooms are clean and check for contraband after a guest leaves. (12) Attend all Head of House meetings. (13) Assist the Head of Houses and assistant with guest needs. (14) Other duties as requested.', type: 'paragraph' },
    { key: 'ack', label: 'I have read and agree to the Head of House duties above', type: 'yesno', required: true },
  ],
};

const intakeInformation: BuiltInTemplate = {
  key: 'intake_information',
  title: 'Intake Information',
  description: 'New-resident intake questions and house rules acknowledgement.',
  fields: [
    { key: 'resident_name', label: 'Resident name', type: 'text', required: true },
    { key: 'intake_date', label: 'Intake date', type: 'date', required: false },
    { key: 'h_questions', label: 'Intake Questions', type: 'heading' },
    { key: 'been_here_before', label: 'Were you here before?', type: 'yesno', required: false },
    { key: 'parole_probation', label: 'Are you on parole or probation? If yes, what is/are your offense(s)?', type: 'longtext', required: false },
    { key: 'registrant_290', label: 'Are you a 290 registrant?', type: 'yesno', required: false },
    { key: 'addiction', label: 'What’s your addiction?', type: 'text', required: false },
    { key: 'last_used', label: 'Last time you used?', type: 'text', required: false },
    { key: 'emergency_contact', label: 'Emergency contact name & phone', type: 'text', required: false },
    { key: 'h_rules', label: 'Intake Information & House Rules', type: 'heading' },
    { key: 'p_zero', label: 'We have a zero tolerance policy for using drugs/alcohol on or off the property. Random drug testing will be done. A positive test and/or refusing to test, you will be asked to leave.', type: 'paragraph' },
    { key: 'p_stay', label: 'There is no limit to your stay as long as you follow the rules and pay your contributions on time. You are on 2 weeks probation. Curfew is 10 PM Sunday–Thursday and 12 AM Friday–Saturday.', type: 'paragraph' },
    { key: 'p_visitors', label: 'Visitors (no one under 18). You are responsible for your visitors. They must be sober, not arrive before 7 AM and leave by 10 PM, are not allowed in bedrooms, and no sexual activity is allowed on the property.', type: 'paragraph' },
    { key: 'p_laundry', label: 'Laundry is from 8 AM to 9 PM — check if anyone is showering first, and don’t start a load after 7:30 PM. Wash your dishes immediately after eating; don’t leave dishes soaking; pour grease in provided containers, not down the drains; no dishes outside.', type: 'paragraph' },
    { key: 'p_chores', label: 'Do your house/ranch chores as assigned. One vehicle, in running condition, currently registered and insured — be considerate when parking as space is limited. Contributions are paid in full, cash only. Respect office hours and be on time for appointments.', type: 'paragraph' },
    { key: 'p_meetings', label: 'You are required to attend all house meetings and participate in recovery-related programs/meetings. No smoking in any building — put butts in provided containers. No pets of any kind. $5 key deposit.', type: 'paragraph' },
    { key: 'p_room', label: 'Keep your room clean and organized at all times. Check your area to make sure the last guest didn’t leave any contraband — random room searches will be done. If you violate a minor rule you will receive a write-up slip; 3 write-up slips and you’ll be asked to leave.', type: 'paragraph' },
    { key: 'p_respect', label: 'Keep the pool gate closed. You may notice others are "stand-offish" until they get to know you. Respect others and their property — if it’s not yours, don’t touch it; ask. Other than tobacco, if you have to be 18 or older to buy it, it’s not allowed. No drugs, alcohol, pornography, acts or threats of violence, etc. No tattooing.', type: 'paragraph' },
    { key: 'ack', label: 'I have read and understand the intake information and house rules', type: 'yesno', required: true },
  ],
};

const writeUp: BuiltInTemplate = {
  key: 'write_up',
  title: 'Write-Up / Violation Notice',
  description: 'Document a rule violation and notice to the resident.',
  fields: [
    { key: 'house_name', label: 'House name', type: 'text', required: true },
    { key: 'house_address', label: 'House address', type: 'address', required: false },
    { key: 'resident_name', label: 'Resident name (To)', type: 'text', required: true },
    { key: 'manager_name', label: 'From (Manager name)', type: 'text', required: true },
    { key: 'writeup_date', label: 'Date', type: 'date', required: true },
    { key: 'writeup_number', label: 'Which write-up is this? (e.g. First, Second)', type: 'text', required: false },
    { key: 'rule_violated', label: 'Rule / policy violated', type: 'longtext', required: true },
    { key: 'details', label: 'Details of the violation', type: 'longtext', required: true },
    { key: 'h', label: 'Notice of Write-Up', type: 'heading' },
    { key: 'p_body1', label: 'The Management feels it is important for your recovery to be a responsible and productive member of society and of the House. The Management has made numerous attempts to encourage and assist you in this endeavor.', type: 'paragraph' },
    { key: 'p_body2', label: 'After numerous verbal reminders and warnings, it has come to the attention of the Management that you have not been adhering to the part of the agreement noted above (see the rule/policy and details above).', type: 'paragraph' },
    { key: 'p_body3', label: 'If you do not resolve this issue, your contract with the House will be terminated, and you will be asked to leave the property immediately.', type: 'paragraph' },
    { key: 'ack', label: 'I acknowledge receipt of this write-up', type: 'yesno', required: true },
  ],
};

export const HOUSE_FORMS: BuiltInTemplate[] = [
  intakeInformation,
  guestAgreement,
  headOfHouseAgreement,
  writeUp,
  definitionOfTerms,
];
