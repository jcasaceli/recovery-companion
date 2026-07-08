import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, Linking, Platform, TouchableOpacity, Modal, Image, ActivityIndicator, Share, ScrollView } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { useAppState } from '../state/store';
import {
  listMeetingCheckins, getMyOrg, listMyPayments, recordPayment, listNotes, deleteNote, addNote, listOrgStaff, getSubmittedInfo,
  listAgreements, createAgreement, deleteAgreement, Agreement,
  listUATests, createUATest, deleteUATest, dismissUAFlags, UATest, UAResult,
  listHouses, getIndividual, setMemberBed, dischargeMember, readmitMember, House, updateClient, mergeMembers, listFacilitatorIndividuals,
} from '../services/db';
import { sendMemberInvite } from '../services/payments';
import { formatDateTime, formatDate, parseMoneyCents } from '../utils/format';
import { DateField } from '../components/PickerFields';
import { CurfewManager } from '../components/CurfewManager';
import { DocumentsManager } from '../components/DocumentsManager';
import { ChoresManager } from '../components/ChoresManager';
import { FormsManager } from '../components/FormsManager';
import { DEMO_CLIENTS } from '../data/demo';

function money(cents?: number) {
  return cents ? `$${(cents / 100).toFixed(2)}` : '$0';
}
const PAY_METHODS: { value: 'zelle' | 'cash' | 'check' | 'cashapp' | 'venmo' | 'card' | 'other'; label: string }[] = [
  { value: 'zelle', label: 'Zelle' },
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'cashapp', label: 'CashApp' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];

// RN's Alert.alert confirm buttons don't fire on web (react-native-web), so use
// the browser's confirm() there. Native keeps the styled Alert dialog.
function confirmThen(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    const g: any = globalThis;
    if (!g.confirm || g.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: onConfirm },
    ]);
  }
}

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function ClientProfileScreen() {
  const route = useRoute<any>();
  const { id } = route.params;
  const { clients, setRent, setClientStatus, reloadCloud } = useAppState();
  const client = clients.find((c) => c.id === id);

  const [amount, setAmount] = useState(client?.monthlyRentCents ? (client.monthlyRentCents / 100).toFixed(2) : '');
  const [dueDay, setDueDay] = useState(client?.rentDueDay ? String(client.rentDueDay) : '');
  const [checkins, setCheckins] = useState<any[]>([]);
  const [showMeetings, setShowMeetings] = useState(false);
  const [org, setOrg] = useState<{ id?: string; name?: string; join_code?: string } | null>(null);
  const [houseCode, setHouseCode] = useState<string | undefined>(undefined);
  const [inviting, setInviting] = useState(false);
  const [houseList, setHouseList] = useState<House[]>([]);
  const [houseId, setHouseId] = useState<string | undefined>(client?.houseId);
  const [paidThisMonth, setPaidThisMonth] = useState(0);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [staffNotes, setStaffNotes] = useState<any[]>([]);
  const [ownerIds, setOwnerIds] = useState<Set<string>>(new Set());
  const [staffById, setStaffById] = useState<Record<string, { name?: string; isOwner: boolean }>>({});
  const [showSignedAgreements, setShowSignedAgreements] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [submitted, setSubmitted] = useState<{ label: string; value: string; type: string; title: string; date: string }[]>([]);
  const [autoFilled, setAutoFilled] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [roster, setRoster] = useState<any[]>([]);
  const [merging, setMerging] = useState(false);
  const openMerge = () => {
    listFacilitatorIndividuals().then((r: any) => setRoster((r ?? []).filter((x: any) => x.id !== id))).catch(() => {});
    setMergeOpen(true);
  };
  const doMerge = (dup: any) => {
    const dupName = `${dup.first_name ?? ''} ${dup.last_name ?? ''}`.trim() || 'this record';
    confirmThen(
      `Merge into ${client?.firstName ?? 'this member'}?`,
      `“${dupName}” and everything they've signed will move into this profile, and the duplicate will be deleted. This can't be undone.`,
      'Merge',
      async () => {
        setMerging(true);
        try {
          await mergeMembers(id, dup.id);
          setMergeOpen(false);
          await reloadCloud();
          loadAgreements(); loadCrm(); loadSubmitted();
          Alert.alert('Merged ✅', 'The duplicate was merged into this member.');
        } catch (e: any) { Alert.alert('Could not merge', e?.message ?? 'Try again.'); }
        finally { setMerging(false); }
      },
    );
  };
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'zelle' | 'cash' | 'check' | 'cashapp' | 'venmo' | 'card' | 'other'>('zelle');
  const [paySaving, setPaySaving] = useState(false);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [pendingDoc, setPendingDoc] = useState<string | null>(null); // base64 data URI awaiting a title
  const [docTitle, setDocTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const nav = useNavigation<any>();

  const loadAgreements = () => listAgreements(id).then(setAgreements).catch(() => {});

  // Bed / intake / discharge (CRM)
  const [bedLabel, setBedLabel] = useState('');
  const [moveInDate, setMoveInDate] = useState('');
  const [dischargeDate, setDischargeDate] = useState<string | undefined>(undefined);
  const [bedSaving, setBedSaving] = useState(false);
  const [editContact, setEditContact] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [contactSaving, setContactSaving] = useState(false);
  const startEditContact = () => { setPhoneInput(client?.phone ?? ''); setEmailInput(client?.email ?? ''); setEditContact(true); };
  const saveContact = async () => {
    setContactSaving(true);
    try {
      await updateClient(id, { phone: phoneInput.trim(), email: emailInput.trim() });
      await reloadCloud();
      setEditContact(false);
    } catch (e: any) { Alert.alert('Could not save', e?.message ?? 'Try again.'); }
    finally { setContactSaving(false); }
  };
  const loadCrm = () => getIndividual(id).then((r: any) => {
    if (!r) return;
    setBedLabel(r.bed_label ?? '');
    setMoveInDate(r.move_in_date ?? '');
    setDischargeDate(r.discharge_date ?? undefined);
  }).catch(() => {});

  const loadPayments = () => listMyPayments(id).then((pays: any[]) => {
    const sum = pays.filter((p) => p.periodMonth === currentPeriod() && p.status === 'paid').reduce((s, p) => s + p.amountCents, 0);
    setPaidThisMonth(sum);
  }).catch(() => {});

  const loadSubmitted = () => getSubmittedInfo(id).then(setSubmitted).catch(() => {});

  const recordPay = async () => {
    const amt = Math.round(parseFloat(payAmount) * 100);
    if (!amt || amt <= 0) { Alert.alert('Enter an amount', 'How much did they pay?'); return; }
    setPaySaving(true);
    try {
      await recordPayment({ individualId: id, orgId: org?.id, amountCents: amt, method: payMethod, periodMonth: currentPeriod(), status: 'paid' });
      setPayOpen(false); setPayAmount('');
      await loadPayments();
      Alert.alert('Payment recorded ✅', `$${(amt / 100).toFixed(2)} · ${PAY_METHODS.find((m) => m.value === payMethod)?.label ?? payMethod}`);
    } catch (e: any) { Alert.alert('Could not record', e?.message ?? 'Try again.'); }
    finally { setPaySaving(false); }
  };

  const [uaTests, setUaTests] = useState<UATest[]>([]);
  const [uaOpen, setUaOpen] = useState(false);
  const [uaDate, setUaDate] = useState(new Date().toISOString().slice(0, 10));
  const [uaResult, setUaResult] = useState<UAResult>('negative');
  const [uaSubstances, setUaSubstances] = useState('');
  const [uaNotes, setUaNotes] = useState('');
  const [uaSaving, setUaSaving] = useState(false);
  const loadUA = () => listUATests(id).then(setUaTests).catch(() => {});

  const saveUA = async () => {
    setUaSaving(true);
    try {
      await createUATest({
        orgId: org?.id, individualId: id, testedAt: uaDate, result: uaResult,
        substances: uaResult === 'positive' ? uaSubstances.trim() || undefined : undefined,
        notes: uaNotes.trim() || undefined,
      });
      setUaOpen(false); setUaResult('negative'); setUaSubstances(''); setUaNotes('');
      setUaDate(new Date().toISOString().slice(0, 10));
      loadUA();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Try again.');
    } finally {
      setUaSaving(false);
    }
  };

  const removeUA = (t: UATest) => confirmThen('Delete UA result?', `${t.testedAt} · ${t.result}. This cannot be undone.`, 'Delete',
    async () => { await deleteUATest(t.id).catch(() => {}); loadUA(); });

  const UA_COLOR: Record<UAResult, string> = {
    negative: colors.success, positive: colors.crisis, refused: colors.warning, pending: colors.textMuted,
  };
  const hasPositiveFlag = uaTests.some((t) => t.result === 'positive' && !t.dismissed);

  const dismissFlag = () => confirmThen('Dismiss positive-UA flag?', 'This clears the flag for this resident. The test stays in their history.', 'Dismiss flag',
    async () => { await dismissUAFlags(id).catch(() => {}); loadUA(); });

  useEffect(() => {
    listMeetingCheckins(id).then(setCheckins).catch(() => {});
    getMyOrg().then((o: any) => o && setOrg({ id: o.id, name: o.name, join_code: o.join_code })).catch(() => {});
    listHouses().then((hs) => { setHouseList(hs); const h = hs.find((x) => x.id === client?.houseId); if (h?.joinCode) setHouseCode(h.joinCode); }).catch(() => {});
    loadAgreements();
    loadUA();
    loadCrm();
    loadPayments();
    loadSubmitted();
    // Facilitator-only notes: split member-flagged alerts vs. staff notes.
    reloadNotes();
    listOrgStaff().then((s) => {
      setOwnerIds(new Set(s.filter((x) => x.isOwner).map((x) => x.profileId)));
      const map: Record<string, { name?: string; isOwner: boolean }> = {};
      s.forEach((x) => { map[x.profileId] = { name: x.name, isOwner: x.isOwner }; });
      setStaffById(map);
    }).catch(() => {});
  }, [id]);

  // Auto-populate empty contact fields from what the resident submitted.
  useEffect(() => {
    if (!client || autoFilled || !submitted.length) return;
    setAutoFilled(true);
    const phoneVal = submitted.find((s) => s.type === 'phone' || /phone|mobile|cell/i.test(s.label))?.value;
    const emailVal = submitted.find((s) => s.type === 'email' || /e-?mail/i.test(s.label))?.value;
    const patch: { phone?: string; email?: string } = {};
    if (phoneVal && !client.phone) patch.phone = phoneVal;
    if (emailVal && !client.email) patch.email = emailVal;
    if (Object.keys(patch).length) updateClient(id, patch).then(reloadCloud).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, client?.id]);

  const reloadNotes = () => listNotes(id).then((ns) => {
    const fac = ns.filter((n) => n.visibility === 'facilitators');
    setAlerts(fac.filter((n) => n.authorRole === 'individual'));       // things the resident flagged
    setStaffNotes(fac.filter((n) => n.authorRole !== 'individual'));    // owner/manager care notes
  }).catch(() => {});

  const addStaffNote = async () => {
    if (!noteText.trim()) return;
    setNoteSaving(true);
    try {
      await addNote(id, noteText.trim(), 'facilitators');
      setNoteText('');
      await reloadNotes();
    } catch (e: any) { Alert.alert('Could not add note', e?.message ?? 'Try again.'); }
    finally { setNoteSaving(false); }
  };
  const removeStaffNote = (noteId: string) => confirmThen('Delete note?', 'This permanently removes the note.', 'Delete',
    async () => { setStaffNotes((n) => n.filter((x) => x.id !== noteId)); try { await deleteNote(noteId); } catch {} });
  const noteAuthorLabel = (n: any) => {
    // Prefer the name from the org-staff roster (always resolves), then the
    // note's embedded author name — but never the "Care team" placeholder.
    const staff = n.authorId ? staffById[n.authorId] : undefined;
    const embedded = n.authorName && n.authorName !== 'Care team' ? n.authorName : undefined;
    const who = staff?.name || embedded || 'Staff';
    if (n.authorRole !== 'facilitator') return who;
    const isOwner = staff?.isOwner ?? (n.authorId ? ownerIds.has(n.authorId) : false);
    return `${isOwner ? 'Owner' : 'Manager'} ${who}`;
  };

  const dismissAlert = (noteId: string) => {
    confirmThen('Dismiss alert?', 'This removes it from the client’s profile.', 'Dismiss', async () => {
      setAlerts((a) => a.filter((x) => x.id !== noteId)); // optimistic
      try { await deleteNote(noteId); } catch { /* will reappear on next load if it failed */ }
    });
  };

  const changeHouse = async (newHouseId: string) => {
    const prev = houseId;
    setHouseId(newHouseId); // optimistic
    try {
      await setMemberBed(id, { houseId: newHouseId });
      await reloadCloud();
    } catch (e: any) {
      setHouseId(prev);
      Alert.alert('Could not change house', e?.message ?? 'Try again.');
    }
  };

  const saveBed = async () => {
    setBedSaving(true);
    try {
      await setMemberBed(id, { bedLabel: bedLabel.trim() || null, moveInDate: moveInDate || null });
      Alert.alert('Saved', 'Bed and move-in details updated.');
    } catch (e: any) { Alert.alert('Could not save', e?.message ?? 'Try again.'); }
    finally { setBedSaving(false); }
  };

  const discharge = () => confirmThen(
    'Discharge resident?',
    `This marks ${client?.firstName ?? 'this member'} as discharged and frees their bed.`,
    'Discharge',
    async () => {
      const today = new Date().toISOString().slice(0, 10);
      try { await dischargeMember(id, today); setDischargeDate(today); setBedLabel(''); await setClientStatus(id, 'completed'); }
      catch (e: any) { Alert.alert('Could not discharge', e?.message ?? 'Try again.'); }
    },
  );

  const readmit = async () => {
    try { await readmitMember(id); setDischargeDate(undefined); await setClientStatus(id, 'in_care'); }
    catch (e: any) { Alert.alert('Could not re-admit', e?.message ?? 'Try again.'); }
  };

  if (!client) {
    // Preview mode: tapping a sample resident opens a read-only sample profile so
    // owners can see exactly what they'd manage — including agreement upload.
    const demo = DEMO_CLIENTS.find((c) => c.id === id);
    if (!demo) return <Screen edges={[]}><Text style={typography.body}>Member not found.</Text></Screen>;
    const previewMsg = () => Alert.alert('Preview', 'This is a sample profile. Subscribe ($60/mo) to add your real residents and send agreements they sign right on their phone.');
    return (
      <Screen edges={[]}>
        <ScreenTitle title={`${demo.firstName}${demo.lastName ? ` ${demo.lastName}` : ''}`} subtitle={demo.houseName || 'Sober Living'} />
        <Card style={{ backgroundColor: colors.surfaceAlt }}>
          <Text style={[typography.body, { fontWeight: '700', color: colors.primary }]}>👀 Sample profile · preview</Text>
          <Text style={[typography.caption, { marginTop: 2 }]}>This is what a resident's profile looks like. Subscribe to manage your own.</Text>
        </Card>
        <SectionTitle>Sobriety</SectionTitle>
        <Card><Text style={typography.h3}>96 days sober</Text><Text style={typography.caption}>Their app counts every second with a live sobriety clock.</Text></Card>
        <SectionTitle>Membership fee</SectionTitle>
        <Card><Text style={typography.body}>{money(demo.monthlyRentCents)} / month · <Text style={{ color: colors.success, fontWeight: '700' }}>Paid this month</Text></Text></Card>
        <SectionTitle>Membership agreements</SectionTitle>
        <Card>
          <Text style={[typography.caption, { marginBottom: spacing.sm }]}>Upload an agreement for {demo.firstName} to review and sign. Signed copies appear here.</Text>
          <Button title="📄 Upload agreement" onPress={previewMsg} />
          <View style={{ marginTop: spacing.sm }}>
            <View style={styles.agreementRow}><Text style={{ flex: 1, ...typography.body }}>House Agreement 2026</Text><Text style={{ color: colors.success, fontWeight: '700' }}>Signed</Text></View>
            <View style={styles.agreementRow}><Text style={{ flex: 1, ...typography.body }}>Curfew Policy</Text><Text style={{ color: colors.warning, fontWeight: '700' }}>Pending</Text></View>
          </View>
        </Card>
        <SectionTitle>Documents</SectionTitle>
        <Card>
          <Button title="⬆️ Upload a document" onPress={previewMsg} />
          <Text style={[typography.caption, { marginTop: spacing.sm }]}>Store intake forms, IDs, and signed paperwork in one place.</Text>
        </Card>
      </Screen>
    );
  }

  const rent = client.monthlyRentCents || 0;
  const rentStatus = rent <= 0 ? 'No fee set'
    : paidThisMonth >= rent ? `Paid in full (${money(paidThisMonth)})`
    : paidThisMonth > 0 ? `Partial: ${money(paidThisMonth)} of ${money(rent)}`
    : `Not paid (${money(rent)} due)`;
  const rentColor = rent <= 0 ? colors.textMuted : paidThisMonth >= rent ? colors.success : paidThisMonth > 0 ? colors.warning : colors.crisis;

  const houseName = client.houseName || org?.name || 'our sober living';
  // Personal code links them to THIS record (so agreements/forms follow). Plain
  // ASCII only — some phones don't decode percent-encoding in an sms: link.
  const inviteMsg = () => {
    const joinCode = org?.join_code || houseCode;
    const code = joinCode ? ` Your join code is ${joinCode}.` : '';
    const who = client.firstName?.trim() || 'there';
    return `Hi ${who}, you've been invited to join ${houseName} on the Sober Living Companion app. Download it to track your progress, see house meetings, and pay your membership fees.${code} Get the app: https://app.soberlivingcompanion.com`;
  };
  const g: any = globalThis;
  // Copy text — uses the browser clipboard on web; on native falls back to the
  // share sheet (which includes Copy).
  const copyText = async (text: string, label: string) => {
    try {
      if (Platform.OS === 'web' && g.navigator?.clipboard) {
        await g.navigator.clipboard.writeText(text);
        Alert.alert('Copied', `${label} copied to the clipboard.`);
        return;
      }
    } catch { /* fall through */ }
    try { await Share.share({ message: text }); } catch { Alert.alert(label, text); }
  };
  const textInvite = () => {
    if (!client.phone) return;
    // On web, an sms: link shows the raw %-encoded text in the composer, so we
    // copy the message instead. On phones we open Messages pre-filled.
    if (Platform.OS === 'web') {
      copyText(inviteMsg(), 'Invite message');
      Alert.alert('Invite copied', `Paste it into a text to ${client.firstName}. (On a phone, the Text button opens Messages for you.)`);
      return;
    }
    const sep = Platform.OS === 'ios' ? '&' : '?';
    Linking.openURL(`sms:${client.phone}${sep}body=${encodeURIComponent(inviteMsg())}`).catch(() => Alert.alert('Could not open Messages'));
  };
  const callPerson = () => { if (client.phone) Linking.openURL(`tel:${client.phone}`).catch(() => {}); };
  const emailPerson = () => { if (client.email) Linking.openURL(`mailto:${client.email}`).catch(() => Alert.alert('Could not open email')); };
  const addToContacts = async () => {
    const fn = `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim();
    const vcf = ['BEGIN:VCARD', 'VERSION:3.0', `N:${client.lastName ?? ''};${client.firstName ?? ''}`, `FN:${fn}`,
      client.phone ? `TEL;TYPE=CELL:${client.phone}` : '', client.email ? `EMAIL:${client.email}` : '', 'END:VCARD']
      .filter(Boolean).join('\n');
    if (Platform.OS === 'web' && g.document) {
      const blob = new g.Blob([vcf], { type: 'text/vcard' });
      const url = g.URL.createObjectURL(blob);
      const a = g.document.createElement('a');
      a.href = url; a.download = `${fn || 'contact'}.vcf`;
      g.document.body.appendChild(a); a.click(); a.remove(); g.URL.revokeObjectURL(url);
      return;
    }
    try { await Share.share({ message: vcf }); } catch { Alert.alert('Contact', vcf); }
  };
  // Email goes through the server (Resend) so the resident gets a real, branded
  // invite with their personal code — no need to open a mail app.
  const emailInvite = async () => {
    if (!client.email) return;
    setInviting(true);
    try {
      const r = await sendMemberInvite(id);
      if (r?.sent) Alert.alert('Invite sent ✅', `We emailed ${client.firstName} an app invite with their join code.`);
      else Alert.alert('Could not send', 'No email on file, or email isn’t set up yet.');
    } catch {
      // Fallback: open the user's mail app pre-filled.
      const subject = `Join ${houseName} on Sober Living Companion`;
      Linking.openURL(`mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(inviteMsg())}`).catch(() => Alert.alert('Could not open email'));
    } finally { setInviting(false); }
  };

  // Auto-saves on blur. Accepts "$500", "500", "$1,200.50" — the "$" is optional.
  const saveRent = async () => {
    const cents = parseMoneyCents(amount);
    const dn = parseInt((dueDay || '').replace(/[^0-9]/g, ''), 10);
    const day = isNaN(dn) ? null : Math.min(31, Math.max(1, dn));
    if (cents === (client.monthlyRentCents ?? null) && day === (client.rentDueDay ?? null)) return;
    try {
      await setRent(id, cents, day);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Try again.');
    }
  };

  const pickFrom = async (source: 'camera' | 'library') => {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', `Allow ${source === 'camera' ? 'camera' : 'photo'} access to add the document.`);
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { quality: 0.3, base64: true, allowsEditing: false };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled || !result.assets?.[0]?.base64) return;
    setPendingDoc(`data:image/jpeg;base64,${result.assets[0].base64}`);
    setDocTitle('Membership Agreement');
  };

  const uploadAgreement = () => {
    // On web, Alert.alert buttons don't render — go straight to the file picker.
    if (Platform.OS === 'web') { pickFrom('library'); return; }
    Alert.alert('Add membership agreement', 'Add a photo of the signed-paper agreement, or pick one from your library.', [
      { text: 'Take photo', onPress: () => pickFrom('camera') },
      { text: 'Choose from library', onPress: () => pickFrom('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const saveAgreement = async () => {
    if (!pendingDoc || !docTitle.trim()) return;
    setUploading(true);
    try {
      await createAgreement({ orgId: org?.id, individualId: id, title: docTitle.trim(), documentData: pendingDoc });
      setPendingDoc(null); setDocTitle('');
      loadAgreements();
      Alert.alert('Sent ✅', `${client.firstName} can now review and sign “${docTitle.trim()}”.`);
    } catch (e: any) {
      Alert.alert('Could not upload', e?.message ?? 'Try again.');
    } finally {
      setUploading(false);
    }
  };

  const removeAgreement = (a: Agreement) => {
    Alert.alert('Delete agreement?', `Remove “${a.title}”? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteAgreement(a.id).catch(() => {}); loadAgreements(); } },
    ]);
  };

  return (
    <Screen edges={[]}>
      <ScreenTitle
        title={`${client.firstName}${client.lastName ? ` ${client.lastName}` : ''}`}
        subtitle={houseList.find((h) => h.id === houseId)?.name || client.houseName || 'Sober Living'}
      />

      {/* Record a payment — first action on the profile */}
      <Button title="💵 Record payment" onPress={() => { setPayAmount(''); setPayMethod('zelle'); setPayOpen(true); }} />
      <View style={{ height: spacing.sm }} />

      <Modal visible={payOpen} transparent animationType="fade" onRequestClose={() => setPayOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={typography.h3}>Record a payment</Text>
            <Text style={[typography.caption, { marginTop: 2, marginBottom: spacing.sm }]}>Log a payment {client.firstName} made this month.</Text>
            <Text style={styles.label}>Amount ($)</Text>
            <TextInput style={styles.input} value={payAmount} onChangeText={setPayAmount} placeholder="e.g. 800" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" />
            <Text style={styles.label}>Method</Text>
            <View style={styles.payMethods}>
              {PAY_METHODS.map((m) => (
                <TouchableOpacity key={m.value} onPress={() => setPayMethod(m.value)} style={[styles.payChip, payMethod === m.value && styles.payChipOn]}>
                  <Text style={[styles.payChipText, payMethod === m.value && { color: colors.textInverse }]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Button title={paySaving ? 'Saving…' : 'Record payment'} onPress={recordPay} disabled={paySaving || !payAmount.trim()} />
            <TouchableOpacity onPress={() => setPayOpen(false)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Contact info + quick actions */}
      <SectionTitle>Contact</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Text style={[typography.body, { flex: 1 }]}>
            <Text style={{ fontWeight: '700' }}>Name: </Text>
            {client.firstName}{client.lastName ? ` ${client.lastName}` : ''}
          </Text>
          {!editContact ? (
            <TouchableOpacity onPress={startEditContact} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>✏️ Edit</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {editContact ? (
          <View style={{ marginTop: spacing.sm }}>
            <Text style={[typography.caption, { marginBottom: spacing.xs }]}>Phone</Text>
            <TextInput style={styles.input} value={phoneInput} onChangeText={setPhoneInput} placeholder="(555) 123-4567" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" />
            <Text style={[typography.caption, { marginTop: spacing.sm, marginBottom: spacing.xs }]}>Email</Text>
            <TextInput style={styles.input} value={emailInput} onChangeText={setEmailInput} placeholder="name@email.com" placeholderTextColor={colors.textMuted} keyboardType="email-address" autoCapitalize="none" />
            <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Button title={contactSaving ? 'Saving…' : 'Save'} onPress={saveContact} disabled={contactSaving} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="secondary" onPress={() => setEditContact(false)} disabled={contactSaving} />
              </View>
            </View>
          </View>
        ) : (
          <>
            {client.phone ? (
              <Text style={[typography.body, { marginTop: 4 }]}><Text style={{ fontWeight: '700' }}>Phone: </Text>{client.phone}</Text>
            ) : null}
            {client.email ? (
              <Text style={[typography.body, { marginTop: 4 }]}><Text style={{ fontWeight: '700' }}>Email: </Text>{client.email}</Text>
            ) : null}
            {!client.phone && !client.email ? (
              <Text style={[typography.caption, { marginTop: 4 }]}>No phone or email on file. Tap ✏️ Edit to add them.</Text>
            ) : null}
          </>
        )}
        <View style={styles.chipRow}>
          {client.email ? <Chip icon="✉️" label={inviting ? 'Sending…' : 'Email invite'} onPress={emailInvite} /> : null}
          {client.phone ? <Chip icon="📲" label="Text invite" onPress={textInvite} /> : null}
          {client.phone ? <Chip icon="📞" label="Call" onPress={callPerson} /> : null}
          {client.email ? <Chip icon="📧" label="Email" onPress={emailPerson} /> : null}
          {client.phone ? <Chip icon="📋" label="Copy phone" onPress={() => copyText(client.phone!, 'Phone number')} /> : null}
          {client.email ? <Chip icon="📋" label="Copy email" onPress={() => copyText(client.email!, 'Email')} /> : null}
          {client.phone || client.email ? <Chip icon="👤" label="Add to contacts" onPress={addToContacts} /> : null}
        </View>
      </Card>

      {/* Submitted info — everything the resident filled into their forms/agreements */}
      {submitted.length ? (
        <>
          <SectionTitle>Submitted info</SectionTitle>
          <Card>
            <Text style={[typography.caption, { marginBottom: spacing.sm }]}>Answers {client.firstName} filled into their forms &amp; agreements.</Text>
            {submitted.map((s, i) => (
              <View key={`${s.title}_${s.label}_${i}`} style={styles.submittedRow}>
                <Text style={[typography.caption, { flex: 1 }]}>{s.label || 'Answer'}</Text>
                <Text style={[typography.body, { flex: 1.4, fontWeight: '600', textAlign: 'right' }]}>{s.value}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {/* Alerts the client flagged for the facilitator */}
      {alerts.length ? (
        <Card style={{ borderWidth: 1, borderColor: colors.crisis }}>
          <Text style={[typography.body, { fontWeight: '700', color: colors.crisis }]}>⚠️ Alerts from {client.firstName}</Text>
          {alerts.map((a) => (
            <View key={a.id} style={styles.alertRow}>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{a.body}</Text>
                <Text style={typography.caption}>{formatDateTime(a.createdAt)}</Text>
              </View>
              <TouchableOpacity onPress={() => dismissAlert(a.id)} style={styles.dismissBtn} hitSlop={8}>
                <Text style={styles.dismissText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          ))}
        </Card>
      ) : null}

      {/* Staff-only notes (owner/manager care coordination) — residents can't see these */}
      <SectionTitle>Notes (staff only)</SectionTitle>
      <Card>
        <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
          Private notes for owners &amp; managers — {client.firstName} can’t see these. Newest first.
        </Text>
        <TextInput
          style={[styles.input, { minHeight: 64, textAlignVertical: 'top', marginBottom: spacing.sm }]}
          value={noteText}
          onChangeText={setNoteText}
          placeholder="Add a note (care coordination, updates, reminders)…"
          placeholderTextColor={colors.textMuted}
          multiline
        />
        <Button title={noteSaving ? 'Saving…' : '➕ Add note'} onPress={addStaffNote} disabled={noteSaving || !noteText.trim()} />
        {staffNotes.length ? (
          <View style={{ marginTop: spacing.sm }}>
            {staffNotes.map((n) => (
              <View key={n.id} style={styles.noteRow}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{n.body}</Text>
                  <Text style={[typography.caption, { marginTop: 2 }]}>
                    <Text style={{ fontWeight: '700', color: colors.primaryDark }}>{noteAuthorLabel(n)}</Text> · {formatDateTime(n.createdAt)}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => removeStaffNote(n.id)} hitSlop={8} style={{ marginLeft: spacing.sm }}>
                  <Text style={{ color: colors.textMuted, fontSize: 16 }}>🗑</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[typography.caption, { marginTop: spacing.sm }]}>No notes yet.</Text>
        )}
      </Card>

      {/* Positive UA flag — facilitators/managers only */}
      {hasPositiveFlag ? (
        <Card style={{ borderWidth: 1, borderColor: colors.crisis, backgroundColor: '#FDECEC' }}>
          <Text style={[typography.body, { fontWeight: '700', color: colors.crisis }]}>🚩 Positive UA result</Text>
          <Text style={[typography.caption, { marginTop: 2, marginBottom: spacing.sm }]}>
            {client.firstName} has a flagged dirty test. Only you and house managers see this.
          </Text>
          <Button title="Dismiss flag" variant="secondary" onPress={dismissFlag} />
        </Card>
      ) : null}

      {/* Rent — facilitator-set, with this month's payment status */}
      <SectionTitle>Membership fee</SectionTitle>
      <Card>
        <Text style={[styles.statusLine, { color: rentColor }]}>{rentStatus} this month</Text>
        <Text style={[styles.label, { marginTop: spacing.sm }]}>Monthly membership fee (you set this)</Text>
        <View style={styles.amtRow}>
          <Text style={styles.dollar}>$</Text>
          <TextInput style={styles.amtInput} value={amount} onChangeText={setAmount} onBlur={saveRent} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textMuted} />
        </View>
        <Text style={styles.label}>Due day of month (1–31)</Text>
        <TextInput style={styles.input} value={dueDay} onChangeText={setDueDay} onBlur={saveRent} keyboardType="number-pad" placeholder="e.g. 1" placeholderTextColor={colors.textMuted} />
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>Enter the amount with or without a "$" — it saves automatically.</Text>
      </Card>

      {/* Forms & Agreements — ONE unified card: upload agreements to sign AND
          assign/send forms, all together. (Document storage lives at the very
          bottom of the page, just above Status, to keep this uncluttered.) */}
      <SectionTitle>Forms &amp; Agreements</SectionTitle>
      <Card>
        <Text style={[typography.body, { fontWeight: '700', marginBottom: 2 }]}>Agreements to sign</Text>
        <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
          Upload an agreement for {client.firstName} to review and sign. Signed copies appear here.
        </Text>
        <Button title="📄 Upload agreement" onPress={uploadAgreement} />
        {(() => {
          const renderAgreement = (a: Agreement) => (
            <TouchableOpacity
              key={a.id}
              style={styles.agreementRow}
              activeOpacity={0.7}
              onPress={() => nav.navigate('AgreementView', { id: a.id })}
              onLongPress={() => removeAgreement(a)}
            >
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{a.title}</Text>
                <Text style={[typography.caption, { color: a.status === 'signed' ? colors.success : colors.warning }]}>
                  {a.status === 'signed' ? `✓ Signed by ${a.signerName ?? 'resident'}${a.signedAt ? ` · ${formatDate(a.signedAt)}` : ''}` : '⏳ Awaiting signature'}
                </Text>
              </View>
              <Text style={styles.chevronSm}>›</Text>
            </TouchableOpacity>
          );
          const pending = agreements.filter((a) => a.status !== 'signed');
          const signed = agreements.filter((a) => a.status === 'signed');
          if (!agreements.length) return null;
          return (
            <View style={{ marginTop: spacing.sm }}>
              {pending.map(renderAgreement)}
              {signed.length ? (
                <>
                  <TouchableOpacity style={styles.collapseBtn} onPress={() => setShowSignedAgreements((v) => !v)}>
                    <Text style={styles.collapseText}>{showSignedAgreements ? '▾' : '▸'} View signed agreements ({signed.length})</Text>
                  </TouchableOpacity>
                  {showSignedAgreements ? signed.map(renderAgreement) : null}
                </>
              ) : null}
              <Text style={[typography.caption, { marginTop: 4, color: colors.textMuted }]}>Long-press to delete.</Text>
            </View>
          );
        })()}

        {/* Divider between agreements and forms, inside the same card. */}
        <View style={styles.fdDivider} />
        <Text style={[typography.body, { fontWeight: '700', marginBottom: 2 }]}>Forms</Text>
        <FormsManager individualId={id} orgId={org?.id} memberName={client.firstName} hideHeader hideCard />
      </Card>

      {/* Title prompt after picking a document */}
      <Modal visible={!!pendingDoc} transparent animationType="fade" onRequestClose={() => setPendingDoc(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={typography.h3}>Name this agreement</Text>
            {pendingDoc ? <Image source={{ uri: pendingDoc }} style={styles.docPreview} resizeMode="contain" /> : null}
            <TextInput style={styles.input} value={docTitle} onChangeText={setDocTitle} placeholder="e.g. Membership Agreement 2026" placeholderTextColor={colors.textMuted} />
            <Button title={uploading ? 'Sending…' : 'Send to resident'} onPress={saveAgreement} disabled={uploading || !docTitle.trim()} />
            {uploading ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.sm }} /> : null}
            <TouchableOpacity onPress={() => setPendingDoc(null)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Curfew check-ins */}
      <CurfewManager individualId={id} memberName={client.firstName} />

      {/* Chores & tasks */}
      <ChoresManager individualId={id} memberName={client.firstName} />

      {/* UA / drug-test logs */}
      <SectionTitle>UA / drug tests</SectionTitle>
      <Card>
        <Button title="➕ Log a UA result" onPress={() => setUaOpen(true)} />
        {uaTests.length ? (
          <View style={{ marginTop: spacing.sm }}>
            {uaTests.map((t) => (
              <TouchableOpacity key={t.id} style={styles.uaRow} activeOpacity={0.7} onLongPress={() => removeUA(t)}>
                <View style={[styles.uaDot, { backgroundColor: UA_COLOR[t.result] }]} />
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>
                    {formatDate(t.testedAt)} · <Text style={{ fontWeight: '700', color: UA_COLOR[t.result] }}>{t.result.toUpperCase()}</Text>
                  </Text>
                  {t.substances ? <Text style={typography.caption}>Detected: {t.substances}</Text> : null}
                  {t.notes ? <Text style={typography.caption}>{t.notes}</Text> : null}
                </View>
              </TouchableOpacity>
            ))}
            <Text style={[typography.caption, { marginTop: 4, color: colors.textMuted }]}>Long-press a result to delete.</Text>
          </View>
        ) : (
          <Text style={[typography.caption, { marginTop: spacing.sm }]}>No tests logged yet.</Text>
        )}
      </Card>

      <Modal visible={uaOpen} transparent animationType="fade" onRequestClose={() => setUaOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={typography.h3}>Log UA · {client.firstName}</Text>
            <Text style={[styles.label, { marginTop: spacing.sm }]}>Test date</Text>
            <DateField value={uaDate} onChange={setUaDate} placeholder="Pick the test date" />
            <Text style={styles.label}>Result</Text>
            <View style={styles.uaChips}>
              {(['negative', 'positive', 'refused', 'pending'] as UAResult[]).map((r) => (
                <TouchableOpacity key={r} onPress={() => setUaResult(r)} style={[styles.uaChip, uaResult === r ? { backgroundColor: UA_COLOR[r] } : null]}>
                  <Text style={[styles.uaChipText, uaResult === r ? { color: colors.textInverse, fontWeight: '700' } : null]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {uaResult === 'positive' ? (
              <>
                <Text style={styles.label}>Substances detected</Text>
                <TextInput style={styles.input} value={uaSubstances} onChangeText={setUaSubstances} placeholder="e.g. THC, Opioids" placeholderTextColor={colors.textMuted} />
              </>
            ) : null}
            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput style={styles.input} value={uaNotes} onChangeText={setUaNotes} placeholder="Observed collection, etc." placeholderTextColor={colors.textMuted} />
            <Button title={uaSaving ? 'Saving…' : 'Save result'} onPress={saveUA} disabled={uaSaving} />
            <TouchableOpacity onPress={() => setUaOpen(false)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Meeting check-ins (staff view) */}
      <SectionTitle>Meeting check-ins</SectionTitle>
      <Card onPress={() => setShowMeetings((v) => !v)}>
        <Text style={styles.meetingCount}>{checkins.length}</Text>
        <Text style={typography.bodySecondary}>
          total check-in{checkins.length === 1 ? '' : 's'} · {checkins.filter((c) => c.createdAt > new Date(Date.now() - 7 * 86400000).toISOString()).length} this week
          {checkins.length ? ` · tap to ${showMeetings ? 'hide' : 'see'} all` : ''}
        </Text>
        {showMeetings
          ? checkins.map((c) => (
              <View key={c.id} style={styles.checkinRow}>
                <Text style={typography.body}>📍 {c.address || (c.latitude ? `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}` : 'Location not shared')}</Text>
                <Text style={typography.caption}>{formatDateTime(c.createdAt)}</Text>
              </View>
            ))
          : null}
      </Card>

      {/* Bed & intake */}
      <SectionTitle>Bed &amp; intake</SectionTitle>
      <Card>
        {houseList.length > 1 ? (
          <>
            <Text style={styles.label}>House</Text>
            <View style={styles.houseChips}>
              {houseList.map((h) => (
                <TouchableOpacity
                  key={h.id}
                  style={[styles.houseChip, houseId === h.id && styles.houseChipOn]}
                  onPress={() => changeHouse(h.id)}
                >
                  <Text style={[styles.houseChipText, houseId === h.id && { color: colors.textInverse }]}>{h.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}
        <Text style={styles.label}>Bed / room label</Text>
        <TextInput style={styles.input} value={bedLabel} onChangeText={setBedLabel} placeholder="e.g. Room 2 · Bed A" placeholderTextColor={colors.textMuted} />
        <Text style={styles.label}>Move-in (intake) date</Text>
        <DateField value={moveInDate} onChange={setMoveInDate} placeholder="Pick the move-in date" />
        <View style={{ height: spacing.sm }} />
        <Button title={bedSaving ? 'Saving…' : 'Save bed & intake'} onPress={saveBed} disabled={bedSaving} />
      </Card>

      {/* Document storage — kept at the very bottom, just above Status, so the
          Forms & Agreements card up top stays clean. */}
      <SectionTitle>Documents</SectionTitle>
      <DocumentsManager individualId={id} orgId={org?.id} memberName={client.firstName} hideHeader />

      {/* Status / discharge */}
      <SectionTitle>Status</SectionTitle>
      <Card>
        <Text style={[typography.body, { marginBottom: spacing.xs }]}>
          Currently: <Text style={{ fontWeight: '700' }}>{client.status === 'in_care' ? 'In Care' : 'Discharged'}</Text>
        </Text>
        {dischargeDate ? (
          <Text style={[typography.caption, { marginBottom: spacing.sm }]}>Discharged on {formatDate(dischargeDate)}</Text>
        ) : null}
        {client.status === 'in_care' ? (
          <Button title="Discharge resident" variant="secondary" onPress={discharge} />
        ) : (
          <Button title="Re-admit (In Care)" variant="secondary" onPress={readmit} />
        )}
        <View style={{ height: spacing.sm }} />
        <Text style={[typography.caption, { marginBottom: spacing.xs }]}>Duplicate of someone? Merge another record into this one.</Text>
        <Button title="🔀 Merge a duplicate into this member" variant="secondary" onPress={openMerge} />
      </Card>

      {/* Merge duplicate picker */}
      <Modal visible={mergeOpen} transparent animationType="fade" onRequestClose={() => setMergeOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={typography.h3}>Merge a duplicate</Text>
            <Text style={[typography.caption, { marginTop: 2, marginBottom: spacing.sm }]}>
              Pick the duplicate record to merge into {client.firstName}. Their data moves here and the duplicate is deleted.
            </Text>
            {merging ? <ActivityIndicator color={colors.primary} /> : null}
            <ScrollView style={{ maxHeight: 320 }}>
              {roster.length === 0 ? (
                <Text style={[typography.caption, { padding: spacing.sm }]}>No other members to merge.</Text>
              ) : roster.map((m) => (
                <TouchableOpacity key={m.id} style={styles.mergeRow} onPress={() => doMerge(m)} disabled={merging}>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body}>{`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || 'Member'}</Text>
                    <Text style={typography.caption}>{m.status === 'completed' ? 'Discharged' : 'In Care'}{m.email ? ` · ${m.email}` : ''}</Text>
                  </View>
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>Merge →</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setMergeOpen(false)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Invite */}
      {client.phone || client.email ? (
        <Card>
          <Text style={[typography.body, { fontWeight: '600' }]}>Invite to the app</Text>
          <Text style={[typography.caption, { marginTop: 2, marginBottom: spacing.sm }]}>
            {client.email
              ? `We email an invite automatically when you add a member. Use these to resend ${client.firstName}'s invite (master code ${org?.join_code || '…'}).`
              : `Send ${client.firstName} your master join code (${org?.join_code || '…'}) to download and join.`}
          </Text>
          {client.email ? (
            <>
              <Button title={inviting ? 'Sending…' : '✉️ Email invite'} variant="secondary" onPress={emailInvite} disabled={inviting} />
              {client.phone ? <View style={{ height: spacing.sm }} /> : null}
            </>
          ) : null}
          {client.phone ? <Button title="📲 Text invite" variant="secondary" onPress={textInvite} /> : null}
        </Card>
      ) : null}
    </Screen>
  );
}

function Chip({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.chip} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.chipText}>{icon} {label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border },
  chipText: { ...typography.caption, fontWeight: '700', color: colors.primary },
  houseChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  houseChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  houseChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  houseChipText: { ...typography.caption, fontWeight: '700', color: colors.textSecondary },
  label: { ...typography.caption, marginBottom: spacing.xs },
  statusLine: { fontSize: 16, fontWeight: '700' },
  amtRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.md },
  dollar: { fontSize: 22, color: colors.textSecondary, marginRight: 4 },
  amtInput: { flex: 1, fontSize: 22, paddingVertical: spacing.sm, color: colors.textPrimary },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textPrimary, marginBottom: spacing.md },
  meetingCount: { fontSize: 34, fontWeight: '800', color: colors.primary },
  checkinRow: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  alertRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  submittedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider, gap: spacing.md },
  mergeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  payMethods: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md },
  payChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm, marginBottom: spacing.sm },
  payChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  payChipText: { fontWeight: '700', color: colors.textSecondary },
  dismissBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  dismissText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  agreementRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  chevronSm: { fontSize: 22, color: colors.textMuted, marginLeft: spacing.sm },
  fdDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  collapseBtn: { paddingVertical: spacing.sm },
  collapseText: { ...typography.caption, color: colors.primary, fontWeight: '800' },
  docPreview: { width: '100%', height: 220, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, marginVertical: spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  uaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  uaDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  uaChips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  uaChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginRight: spacing.sm, marginBottom: spacing.sm },
  uaChipText: { fontSize: 13, color: colors.textSecondary, textTransform: 'capitalize' },
});
