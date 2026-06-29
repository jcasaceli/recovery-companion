import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, Linking, Platform, TouchableOpacity, Modal, Image, ActivityIndicator, Share } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { useAppState } from '../state/store';
import {
  listMeetingCheckins, getMyOrg, listMyPayments, listNotes, deleteNote,
  listAgreements, createAgreement, deleteAgreement, Agreement,
  listUATests, createUATest, deleteUATest, dismissUAFlags, UATest, UAResult,
  listHouses, getIndividual, setMemberBed, dischargeMember, readmitMember, House, updateClient,
} from '../services/db';
import { sendMemberInvite } from '../services/payments';
import { formatDateTime, formatDate } from '../utils/format';
import { DateField } from '../components/PickerFields';
import { CurfewManager } from '../components/CurfewManager';
import { DocumentsManager } from '../components/DocumentsManager';
import { ChoresManager } from '../components/ChoresManager';
import { FormsManager } from '../components/FormsManager';
import { DEMO_CLIENTS } from '../data/demo';

function money(cents?: number) {
  return cents ? `$${(cents / 100).toFixed(2)}` : '$0';
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

  const removeUA = (t: UATest) => {
    Alert.alert('Delete UA result?', `${t.testedAt} · ${t.result}. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteUATest(t.id).catch(() => {}); loadUA(); } },
    ]);
  };

  const UA_COLOR: Record<UAResult, string> = {
    negative: colors.success, positive: colors.crisis, refused: colors.warning, pending: colors.textMuted,
  };
  const hasPositiveFlag = uaTests.some((t) => t.result === 'positive' && !t.dismissed);

  const dismissFlag = () => {
    Alert.alert('Dismiss positive-UA flag?', 'This clears the flag for this resident. The test stays in their history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Dismiss flag', onPress: async () => { await dismissUAFlags(id).catch(() => {}); loadUA(); } },
    ]);
  };

  useEffect(() => {
    listMeetingCheckins(id).then(setCheckins).catch(() => {});
    getMyOrg().then((o: any) => o && setOrg({ id: o.id, name: o.name, join_code: o.join_code })).catch(() => {});
    listHouses().then((hs) => { setHouseList(hs); const h = hs.find((x) => x.id === client?.houseId); if (h?.joinCode) setHouseCode(h.joinCode); }).catch(() => {});
    loadAgreements();
    loadUA();
    loadCrm();
    listMyPayments(id).then((pays: any[]) => {
      const sum = pays.filter((p) => p.periodMonth === currentPeriod() && p.status === 'paid').reduce((s, p) => s + p.amountCents, 0);
      setPaidThisMonth(sum);
    }).catch(() => {});
    // Alerts the client flagged specifically for the facilitator.
    listNotes(id).then((ns) => setAlerts(ns.filter((n) => n.visibility === 'facilitators'))).catch(() => {});
  }, [id]);

  const dismissAlert = (noteId: string) => {
    Alert.alert('Dismiss alert?', 'This removes it from the client’s profile.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Dismiss',
        style: 'destructive',
        onPress: async () => {
          setAlerts((a) => a.filter((x) => x.id !== noteId)); // optimistic
          try { await deleteNote(noteId); } catch { /* will reappear on next load if it failed */ }
        },
      },
    ]);
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

  const discharge = () => {
    Alert.alert('Discharge resident?', `This marks ${client?.firstName ?? 'this member'} as discharged and frees their bed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discharge', style: 'destructive',
        onPress: async () => {
          const today = new Date().toISOString().slice(0, 10);
          try { await dischargeMember(id, today); setDischargeDate(today); setBedLabel(''); await setClientStatus(id, 'completed'); }
          catch (e: any) { Alert.alert('Could not discharge', e?.message ?? 'Try again.'); }
        },
      },
    ]);
  };

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

  const saveRent = async () => {
    const cents = amount ? Math.round(parseFloat(amount) * 100) : null;
    const day = dueDay ? Math.min(31, Math.max(1, parseInt(dueDay, 10))) : null;
    try {
      await setRent(id, cents, day);
      Alert.alert('Saved ✅', `${client.firstName}'s membership fee was updated.`);
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
          <TextInput style={styles.amtInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textMuted} />
        </View>
        <Text style={styles.label}>Due day of month (1–31)</Text>
        <TextInput style={styles.input} value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" placeholder="e.g. 1" placeholderTextColor={colors.textMuted} />
        <Button title="Save membership fee" onPress={saveRent} />
      </Card>

      {/* Forms & Documents — one unified section: send agreements to sign,
          assign forms, and store paperwork all in one place. */}
      <SectionTitle>Forms &amp; Documents</SectionTitle>
      <Card>
        <Text style={[typography.body, { fontWeight: '700', marginBottom: 2 }]}>Agreements to sign</Text>
        <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
          Upload an agreement for {client.firstName} to review and sign. Signed copies appear here.
        </Text>
        <Button title="📄 Upload agreement" onPress={uploadAgreement} />
        {agreements.length ? (
          <View style={{ marginTop: spacing.sm }}>
            {agreements.map((a) => (
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
            ))}
            <Text style={[typography.caption, { marginTop: 4, color: colors.textMuted }]}>Long-press to delete.</Text>
          </View>
        ) : null}
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

      {/* Lease & intake forms + document storage — same "Forms & Documents" section. */}
      <FormsManager individualId={id} orgId={org?.id} memberName={client.firstName} hideHeader />
      <DocumentsManager individualId={id} orgId={org?.id} memberName={client.firstName} hideHeader />

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
      </Card>

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
  dismissBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  dismissText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  agreementRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  chevronSm: { fontSize: 22, color: colors.textMuted, marginLeft: spacing.sm },
  docPreview: { width: '100%', height: 220, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, marginVertical: spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  uaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  uaDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  uaChips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  uaChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginRight: spacing.sm, marginBottom: spacing.sm },
  uaChipText: { fontSize: 13, color: colors.textSecondary, textTransform: 'capitalize' },
});
