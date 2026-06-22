import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, Modal, TextInput, Linking } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { DateField } from '../components/PickerFields';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { notifyCareTeam, notifyCare } from '../services/push';
import { recordMeetingCheckin, listMeetingCheckins, deleteMeetingCheckin, listHouseEvents, HouseEvent, getPassesEnabled, getMyCurfew, recordCurfewCheckin, listCurfewCheckins, Curfew } from '../services/db';
import { SwipeRow } from '../components/SwipeRow';
import * as Location from 'expo-location';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { useAppState } from '../state/store';
import { useAuth } from '../state/auth';
import { CheckIn, Milestone } from '../types';
import {
  daysSince,
  sobrietyParts,
  formatDate,
  formatTime,
  houseEventWhen,
  to12h,
  ordinal,
  MOOD_EMOJI,
  MOOD_LABELS,
  PROGRAM_LABELS,
} from '../utils/format';

export function HomeScreen() {
  const nav = useNavigation<any>();
  const { lovedOne, checkIns, milestones, backToClients, resetSobrietyDate, addNote,
    addMeetingCheckin, deleteMeetingCheckin: removeLocalCheckin, meetingCheckins } = useAppState();
  const auth = useAuth();
  const isFacilitator = auth.profile?.role === 'facilitator';
  // A real cloud individual id is a UUID; a solo (unconnected) resident's id is
  // a local placeholder like "lo-1". Only connected residents hit the cloud.
  const connected = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lovedOne.id || '');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateModal, setDateModal] = useState(false);
  const [dateText, setDateText] = useState('');
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertText, setAlertText] = useState('');
  const [myCheckins, setMyCheckins] = useState<any[]>([]);
  const [showCheckins, setShowCheckins] = useState(false);
  const [houseEvents, setHouseEvents] = useState<HouseEvent[]>([]);
  const [passesEnabled, setPassesEnabled] = useState(false);
  const [curfew, setCurfew] = useState<Curfew | null>(null);
  const [curfewToday, setCurfewToday] = useState<any[]>([]);
  const [curfewBusy, setCurfewBusy] = useState(false);

  const loadCheckins = useCallback(() => {
    // Solo residents read their on-device list (rendered directly); only
    // connected members pull from the cloud meeting-checkin table.
    if (connected) listMeetingCheckins(lovedOne.id).then(setMyCheckins).catch(() => {});
  }, [connected, lovedOne.id]);
  // Solo residents: mirror their on-device check-ins into the visible list.
  useEffect(() => { if (!connected) setMyCheckins(meetingCheckins); }, [connected, meetingCheckins]);
  const loadCurfew = useCallback(() => {
    getMyCurfew().then((c) => {
      setCurfew(c);
      if (c?.enabled) {
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        listCurfewCheckins(c.individualId, startOfDay.toISOString()).then(setCurfewToday).catch(() => {});
      } else { setCurfewToday([]); }
    }).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => {
    loadCheckins();
    if (!isFacilitator) {
      listHouseEvents().then(setHouseEvents).catch(() => {});
      getPassesEnabled().then(setPassesEnabled).catch(() => {});
      loadCurfew();
    }
  }, [loadCheckins, loadCurfew, isFacilitator]));

  const confirmDeleteCheckin = (c: any) => {
    Alert.alert(
      'Remove this check-in?',
      'This deletes the record that you attended this meeting. It will be removed from your account, and your facilitator will no longer be able to see that you were here.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => { if (connected) { await deleteMeetingCheckin(c.id).catch(() => {}); loadCheckins(); } else { removeLocalCheckin(c.id); } } },
      ],
    );
  };

  const openSobriety = () => {
    if (Platform.OS === 'web') { setDateText(lovedOne.sobrietyDate || ''); setDateModal(true); }
    else setShowDatePicker(true);
  };
  const saveDateText = () => {
    const d = dateText.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { Alert.alert('Enter the date as YYYY-MM-DD'); return; }
    resetSobrietyDate(d);
    setDateModal(false);
  };

  const sendAlert = () => {
    if (!alertText.trim()) return;
    addNote(alertText.trim(), 'facilitators'); // visible to the facilitator only
    setAlertText('');
    setAlertOpen(false);
    Alert.alert('Sent to your facilitator', 'They’ll see this on your profile.');
  };

  const onSobrietyDate = (event: any, selected?: Date) => {
    setShowDatePicker(false);
    if (event.type === 'set' && selected) {
      resetSobrietyDate(selected.toISOString().slice(0, 10));
    }
  };

  const sober = lovedOne.sobrietyDate ? daysSince(lovedOne.sobrietyDate) : null;
  // Re-render every second so the live recovery counter ticks.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    if (!lovedOne.sobrietyDate) return;
    const id = setInterval(() => setNowTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [lovedOne.sobrietyDate]);
  const parts = lovedOne.sobrietyDate ? sobrietyParts(lovedOne.sobrietyDate) : null;
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const recentMood = checkIns[0];
  const nextMilestone = milestones.find((m) => !m.celebrated);

  const sos = () => {
    Alert.alert(
      'Send SOS?',
      `This immediately alerts your facilitator that you need help right now.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: () => {
            if (auth.configured) {
              // notifyCare → member (sender) is excluded, so only facilitators get it.
              notifyCare(lovedOne.id, '🆘 SOS', `${lovedOne.firstName} needs help right now.`);
            } else {
              notifyCareTeam({ title: '🆘 SOS', body: 'Immediate support needed.', audiences: ['facilitator'] });
            }
          },
        },
      ],
    );
  };

  const meetingCheckIn = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let lat: number | undefined, lng: number | undefined, address: string | undefined;
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({});
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        try {
          const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          const g = geo[0];
          if (g) address = [g.name, g.street, g.city, g.region].filter(Boolean).join(', ');
        } catch {}
      }
      if (connected) {
        await recordMeetingCheckin(lovedOne.id, lat, lng, address);
        loadCheckins();
        notifyCare(lovedOne.id, 'Meeting check-in', `${lovedOne.firstName} checked in at a meeting${address ? ` (${address})` : ''}.`, 'activity');
        Alert.alert("You're checked in ✅", address ? `Logged at ${address}. Your facilitator can see it.` : 'Your meeting check-in was logged for your facilitator.');
      } else {
        // Solo resident — log it on their own device.
        addMeetingCheckin({ address, latitude: lat, longitude: lng });
        Alert.alert("You're checked in ✅", address ? `Logged at ${address}.` : 'Your meeting check-in was logged.');
      }
    } catch (e: any) {
      Alert.alert('Could not check in', e?.message ?? 'Please try again.');
    }
  };

  const curfewCheckIn = async () => {
    setCurfewBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location needed', 'Curfew check-ins require location access so your facilitator can verify where you checked in.');
        setCurfewBusy(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      let address: string | undefined;
      try {
        const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const g = geo[0];
        if (g) address = [g.name, g.street, g.city, g.region].filter(Boolean).join(', ');
      } catch {}
      const res = await recordCurfewCheckin({ latitude: lat, longitude: lng, address });
      notifyCare(res.individualId, 'Curfew check-in', `${res.firstName || lovedOne.firstName} checked in for curfew${address ? ` (${address})` : ''}.`, 'activity');
      loadCurfew();
      Alert.alert("You're checked in ✅", address ? `Logged at ${address}.` : 'Your curfew check-in was logged.');
    } catch (e: any) {
      Alert.alert('Could not check in', e?.message ?? 'Please try again.');
    } finally { setCurfewBusy(false); }
  };

  const QUICK_LINKS: { label: string; icon: any; screen: string }[] = [
    { label: 'Chores', icon: 'checkmark-circle-outline', screen: 'Tasks' },
    { label: 'Community', icon: 'people-outline', screen: 'Community' },
    { label: 'Schedule', icon: 'calendar-outline', screen: 'Schedule' },
    { label: 'Meetings', icon: 'videocam-outline', screen: 'Meetings' },
    { label: 'Agreements', icon: 'document-text-outline', screen: 'Agreements' },
    { label: 'Forms', icon: 'clipboard-outline', screen: 'Forms' },
    { label: 'Documents', icon: 'folder-outline', screen: 'Documents' },
    ...(passesEnabled ? [{ label: 'Passes', icon: 'bed-outline' as any, screen: 'Passes' }] : []),
  ];

  return (
    <Screen>
      {isFacilitator ? (
        <TouchableOpacity onPress={backToClients} style={styles.backToClients} hitSlop={8}>
          <Ionicons name="chevron-back" size={16} color={colors.primary} />
          <Text style={styles.backToClientsText}>All clients</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <ScreenTitle
            title={`Hi there 👋`}
            subtitle={`Here's how ${lovedOne.firstName} is doing`}
          />
        </View>
        <TouchableOpacity
          onPress={() => nav.navigate('Settings')}
          style={styles.gear}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Hero: recovery summary */}
      <Card style={styles.hero}>
        <Text style={styles.heroName}>{lovedOne.firstName}</Text>
        <Text style={styles.heroProgram}>
          {lovedOne.programName || 'Sober Living'}
        </Text>
        {sober !== null ? (
          <>
            <View style={styles.heroStat}>
              <Text style={styles.heroNumber}>{sober}</Text>
              <Text style={styles.heroLabel}>days in recovery</Text>
            </View>
            {parts ? (
              <Text style={styles.heroBreakdown}>
                {parts.months} {parts.months === 1 ? 'month' : 'months'} · {parts.days} {parts.days === 1 ? 'day' : 'days'} · {pad2(parts.hours)}:{pad2(parts.minutes)}:{pad2(parts.seconds)}
              </Text>
            ) : null}
          </>
        ) : null}
      </Card>

      {/* Prominent Pay membership fee button for members */}
      {!isFacilitator ? (
        <TouchableOpacity style={styles.payRent} activeOpacity={0.85} onPress={() => nav.navigate('Payments')}>
          <Ionicons name="card" size={40} color={colors.textInverse} />
          <Text style={styles.payRentText}>Pay membership fee</Text>
          <Text style={styles.payRentSub}>
            {lovedOne.monthlyRentCents
              ? `$${(lovedOne.monthlyRentCents / 100).toFixed(0)}/mo${lovedOne.rentDueDay ? ` · due the ${ordinal(lovedOne.rentDueDay)}` : ''} · tap to pay`
              : 'Card, CashApp, or Zelle · tap to pay'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Meeting check-in — records location so no signed cards needed */}
      {!isFacilitator ? (
        <TouchableOpacity style={styles.meetingBtn} activeOpacity={0.85} onPress={meetingCheckIn}>
          <Ionicons name="location" size={36} color={colors.textInverse} />
          <Text style={styles.meetingText}>I'm at a meeting</Text>
          <Text style={styles.meetingSub}>Check in — records your location</Text>
        </TouchableOpacity>
      ) : null}

      {/* Member's own meeting check-in history */}
      {!isFacilitator ? (
        <Card>
          <TouchableOpacity activeOpacity={0.7} onPress={() => setShowCheckins((v) => !v)}>
            <View style={styles.sobrietyRow}>
              <View style={{ flex: 1 }}>
                <Text style={typography.h3}>My meeting check-ins</Text>
                <Text style={typography.caption}>
                  {myCheckins.length} total · {myCheckins.filter((c) => c.createdAt > new Date(Date.now() - 7 * 86400000).toISOString()).length} this week
                  {myCheckins.length ? ` · tap to ${showCheckins ? 'hide' : 'view'}` : ''}
                </Text>
              </View>
              <Ionicons name="checkmark-done-outline" size={24} color={colors.primary} />
            </View>
          </TouchableOpacity>
          {showCheckins ? (
            myCheckins.length === 0 ? (
              <Text style={[typography.caption, { marginTop: spacing.sm }]}>No check-ins yet. Tap “I'm at a meeting” when you arrive.</Text>
            ) : (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={[typography.caption, { color: colors.textMuted, marginBottom: 2 }]}>Swipe a check-in left to remove it.</Text>
                {myCheckins.map((c) => (
                  <SwipeRow key={c.id} onDelete={() => confirmDeleteCheckin(c)}>
                    <View style={styles.checkinRow}>
                      <Text style={typography.body}>📍 {c.address || (c.latitude ? `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}` : 'Location not shared')}</Text>
                      <Text style={typography.caption}>{formatDate(c.createdAt)}</Text>
                    </View>
                  </SwipeRow>
                ))}
              </View>
            )
          ) : null}
        </Card>
      ) : null}

      {/* Quick links */}
      <View style={styles.quickRow}>
        {QUICK_LINKS.map((q) => (
          <TouchableOpacity
            key={q.screen}
            style={styles.quick}
            onPress={() => nav.navigate(q.screen)}
            activeOpacity={0.7}
          >
            <Ionicons name={q.icon} size={24} color={colors.primary} />
            <Text style={styles.quickLabel}>{q.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Curfew check-in (staff-enabled, per member) */}
      {!isFacilitator && curfew?.enabled ? (
        <Card style={{ borderWidth: 1, borderColor: colors.primary }}>
          <Text style={[typography.body, { fontWeight: '700', marginBottom: spacing.xs }]}>🌙 Curfew check-in</Text>
          {curfew.times.length ? (
            <Text style={typography.caption}>Check in by: {curfew.times.map(to12h).join(' · ')}</Text>
          ) : (
            <Text style={typography.caption}>Check in when asked by your facilitator.</Text>
          )}
          <Text style={[typography.caption, { marginTop: spacing.xs, color: curfewToday.length ? colors.success : colors.warning, fontWeight: '600' }]}>
            {curfewToday.length
              ? `✓ Checked in today at ${formatTime(curfewToday[0].checkedAt)}`
              : 'Not yet checked in today'}
          </Text>
          <View style={{ height: spacing.sm }} />
          <Button title={curfewBusy ? 'Checking in…' : '📍 Check in now'} onPress={curfewCheckIn} disabled={curfewBusy} />
        </Card>
      ) : null}

      {/* House meetings from staff */}
      {!isFacilitator && houseEvents.length ? (
        <Card>
          <Text style={[typography.body, { fontWeight: '700', marginBottom: spacing.xs }]}>🏠 House meetings</Text>
          {houseEvents.map((e) => (
            <View key={e.id} style={styles.houseEventRow}>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>
                  {e.title}{e.mandatory ? <Text style={styles.mandatory}>  · MANDATORY</Text> : null}
                </Text>
                <Text style={typography.caption}>
                  {houseEventWhen(e.date, e.time, e.recurring)}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {/* SOS */}
      <TouchableOpacity style={styles.sos} onPress={sos} activeOpacity={0.85}>
        <Text style={styles.sosText}>🆘  Send SOS — alert my facilitator now</Text>
      </TouchableOpacity>

      {/* Flag a message for the facilitator */}
      {!isFacilitator ? (
        <TouchableOpacity style={styles.flagBtn} onPress={() => setAlertOpen(true)} activeOpacity={0.8}>
          <Ionicons name="flag-outline" size={18} color={colors.primary} />
          <Text style={styles.flagText}>Message my facilitator</Text>
        </TouchableOpacity>
      ) : null}

      <Modal visible={alertOpen} transparent animationType="fade" onRequestClose={() => setAlertOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={typography.h3}>Message your facilitator</Text>
            <Text style={[typography.caption, { marginBottom: spacing.sm }]}>Only your facilitator will see this.</Text>
            <TextInput
              style={styles.modalInput}
              value={alertText}
              onChangeText={setAlertText}
              placeholder="What's going on?"
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <Button title="Send" onPress={sendAlert} disabled={!alertText.trim()} />
            <TouchableOpacity onPress={() => setAlertOpen(false)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Latest check-in */}
      <SectionTitle>Latest check-in</SectionTitle>
      <Card>
        {recentMood ? (
          <View style={styles.moodRow}>
            <Text style={styles.moodEmoji}>{MOOD_EMOJI[recentMood.mood]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={typography.h3}>{MOOD_LABELS[recentMood.mood]}</Text>
              <Text style={typography.caption}>{formatDate(recentMood.date)}</Text>
              {recentMood.note ? (
                <Text style={[typography.bodySecondary, { marginTop: 4 }]}>
                  {recentMood.note}
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <Text style={typography.bodySecondary}>No check-ins yet.</Text>
        )}
      </Card>

      {/* Next milestone */}
      {nextMilestone ? (
        <>
          <SectionTitle>Coming up</SectionTitle>
          <Card style={styles.milestoneCard}>
            <Text style={styles.milestoneTitle}>🎉 {nextMilestone.title}</Text>
            {nextMilestone.description ? (
              <Text style={typography.bodySecondary}>{nextMilestone.description}</Text>
            ) : null}
          </Card>
        </>
      ) : null}

      {/* Quick actions */}
      <View style={{ height: spacing.sm }} />
      <Button title="🌙 Do tonight's review" onPress={() => nav.navigate('NightlyReview')} />

      {/* Sobriety date — tap to set/change via a calendar */}
      <SectionTitle>Sobriety date</SectionTitle>
      <Card onPress={openSobriety}>
        <View style={styles.sobrietyRow}>
          <View style={{ flex: 1 }}>
            <Text style={typography.h3}>
              {lovedOne.sobrietyDate ? formatDate(lovedOne.sobrietyDate) : 'Tap to set'}
            </Text>
            {lovedOne.sobrietyDate ? (
              <Text style={typography.caption}>{sober ?? 0} days · tap to change</Text>
            ) : (
              <Text style={typography.caption}>Set the date you want to count from</Text>
            )}
          </View>
          <Ionicons name="calendar-outline" size={24} color={colors.primary} />
        </View>
      </Card>
      {showDatePicker ? (
        <DateTimePicker
          value={lovedOne.sobrietyDate ? new Date(lovedOne.sobrietyDate) : new Date()}
          mode="date"
          maximumDate={new Date()}
          onChange={onSobrietyDate}
        />
      ) : null}

      {/* Web fallback: the native date picker doesn't work in a browser */}
      <Modal visible={dateModal} transparent animationType="fade" onRequestClose={() => setDateModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={typography.h3}>Set your sobriety date</Text>
            <Text style={[typography.caption, { marginTop: 2, marginBottom: spacing.sm }]}>Pick the date you’re counting from.</Text>
            <DateField value={dateText} onChange={setDateText} placeholder="Pick a date" />
            <View style={{ height: spacing.sm }} />
            <Button title="Save" onPress={saveDateText} disabled={!dateText} />
            <TouchableOpacity onPress={() => setDateModal(false)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Read the Big Book online (AA's official free copy) */}
      <TouchableOpacity
        style={styles.bigBookLink}
        onPress={() => Linking.openURL('https://www.aa.org/the-big-book')}
        activeOpacity={0.7}
      >
        <Ionicons name="book-outline" size={20} color={colors.primary} />
        <Text style={styles.bigBookText}>Read the Big Book online</Text>
        <Ionicons name="open-outline" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  gear: { paddingTop: spacing.md + 4, paddingLeft: spacing.sm },
  backToClients: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, marginBottom: spacing.xs },
  backToClientsText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  payRent: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl + spacing.sm,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  payRentText: { color: colors.textInverse, fontWeight: '800', fontSize: 26, marginTop: spacing.xs },
  payRentSub: { color: colors.textInverse, opacity: 0.9, fontSize: 13, marginTop: 2 },
  meetingBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl + spacing.sm,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  meetingText: { color: colors.textInverse, fontWeight: '800', fontSize: 26, marginTop: spacing.xs },
  meetingSub: { color: colors.textInverse, opacity: 0.9, fontSize: 13, marginTop: 2 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md },
  quick: {
    width: '23%',
    marginHorizontal: '1%',
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadow.card,
  },
  quickLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 6, fontWeight: '600', textAlign: 'center' },
  bigBookLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.lg, marginBottom: spacing.md, paddingVertical: spacing.sm },
  bigBookText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  sos: {
    backgroundColor: colors.crisisBg,
    borderColor: colors.crisis,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sosText: { color: colors.crisis, fontWeight: '700', fontSize: 14 },
  houseEventRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.divider },
  mandatory: { color: colors.crisis, fontWeight: '800', fontSize: 11 },
  flagBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm, marginBottom: spacing.md },
  flagText: { color: colors.primary, fontWeight: '600', marginLeft: spacing.xs },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  modalInput: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, minHeight: 80, textAlignVertical: 'top', fontSize: 15, color: colors.textPrimary, marginBottom: spacing.md },
  dateInput: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textPrimary, marginBottom: spacing.md },
  checkinRow: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  sobrietyRow: { flexDirection: 'row', alignItems: 'center' },
  hero: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
  },
  heroName: { fontSize: 24, fontWeight: '700', color: colors.textInverse },
  heroProgram: { fontSize: 14, color: colors.primaryLight, marginTop: 2 },
  heroStat: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.md },
  heroNumber: { fontSize: 40, fontWeight: '800', color: colors.textInverse },
  heroLabel: { fontSize: 15, color: colors.primaryLight, marginLeft: spacing.sm },
  heroBreakdown: { marginTop: 6, fontSize: 15, fontWeight: '600', color: colors.textInverse, opacity: 0.92, fontVariant: ['tabular-nums'] },
  moodRow: { flexDirection: 'row', alignItems: 'center' },
  moodEmoji: { fontSize: 40, marginRight: spacing.md },
  milestoneCard: { backgroundColor: colors.accentLight },
  milestoneTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
});
