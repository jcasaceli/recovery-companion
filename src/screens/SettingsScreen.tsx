import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TextInput, Switch } from 'react-native';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { useAppState } from '../state/store';
import { useAuth } from '../state/auth';
import { PROGRAM_LABELS, formatDate, formatDateTime } from '../utils/format';

export function SettingsScreen() {
  const {
    lovedOne,
    resetApp,
    resetSobrietyDate,
    communityAccess,
    setCommunityAccess,
    sobrietyResets,
  } = useAppState();

  const auth = useAuth();
  const [dateInput, setDateInput] = useState(lovedOne.sobrietyDate ?? '');

  const confirmReset = () => {
    Alert.alert('Start over?', 'This clears all data on this device and returns to the welcome screen.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start over', style: 'destructive', onPress: resetApp },
    ]);
  };

  const saveSobrietyDate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      Alert.alert('Check the date', 'Please use YYYY-MM-DD.');
      return;
    }
    resetSobrietyDate(dateInput);
    Alert.alert('Updated', 'The sobriety date has been updated.');
  };

  return (
    <Screen>
      <ScreenTitle title="Settings" />

      <SectionTitle>Loved one</SectionTitle>
      <Card>
        <Text style={typography.h3}>{lovedOne.firstName}</Text>
        <Text style={typography.bodySecondary}>
          {PROGRAM_LABELS[lovedOne.programType]} · {lovedOne.programName}
        </Text>
        <Text style={[typography.caption, { marginTop: 4 }]}>
          In treatment since {formatDate(lovedOne.treatmentStartDate)}
        </Text>
      </Card>

      {/* Neutral sobriety-date control. (The facilitator-only audit below records
          changes; this screen doesn't reveal that to the individual/supporter.) */}
      <SectionTitle>Sobriety date</SectionTitle>
      <Card>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textMuted}
          value={dateInput}
          onChangeText={setDateInput}
          autoCapitalize="none"
        />
        <Button title="Update sobriety date" onPress={saveSobrietyDate} />
      </Card>

      {/* Facilitator controls. In production these are visible only when the
          signed-in user's role is 'facilitator'. */}
      <SectionTitle>Facilitator controls</SectionTitle>
      <Card>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={typography.body}>Community access</Text>
            <Text style={typography.caption}>
              Allow {lovedOne.firstName} to use the community feed (off during
              treatment when photo sharing isn't allowed).
            </Text>
          </View>
          <Switch
            value={communityAccess}
            onValueChange={setCommunityAccess}
            trackColor={{ true: colors.primary }}
          />
        </View>
      </Card>
      <Card>
        <Text style={[typography.body, { fontWeight: '600' }]}>Sobriety-date reset log</Text>
        <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
          Visible to facilitators only. Not shown to the individual or supporters.
        </Text>
        {sobrietyResets.length === 0 ? (
          <Text style={typography.bodySecondary}>No resets recorded.</Text>
        ) : (
          sobrietyResets.map((r) => (
            <View key={r.id} style={styles.auditRow}>
              <Text style={typography.bodySecondary}>
                {r.oldDate ?? '—'} → {r.newDate ?? '—'}
              </Text>
              <Text style={typography.caption}>
                {r.resetByName} · {formatDateTime(r.createdAt)}
              </Text>
            </View>
          ))
        )}
      </Card>

      <SectionTitle>About the assistant</SectionTitle>
      <Card>
        <Text style={typography.bodySecondary}>
          Companion is an AI assistant — not a doctor, therapist, or counselor.
          For clinical questions, use the Messages tab to reach the care team. In
          an emergency, call 911 or 988.
        </Text>
      </Card>

      <View style={{ height: spacing.md }} />
      {auth.configured && auth.status === 'signedIn' ? (
        <>
          {auth.profile ? (
            <Text style={[styles.version, { marginTop: 0, marginBottom: spacing.sm }]}>
              Signed in as {auth.profile.fullName ?? auth.profile.email} · {auth.profile.role}
            </Text>
          ) : null}
          <Button title="Sign out" variant="secondary" onPress={() => auth.signOut()} />
        </>
      ) : (
        <Button title="Start over (clear data)" variant="secondary" onPress={confirmReset} />
      )}
      <Text style={styles.version}>Recovery Companion · preview build</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  auditRow: { paddingVertical: spacing.xs },
  version: { ...typography.caption, textAlign: 'center', marginTop: spacing.lg, color: colors.textMuted },
});
