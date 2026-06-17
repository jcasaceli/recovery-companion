import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Screen, ScreenTitle, Card, Pill } from '../components/ui';
import { colors, spacing, typography } from '../theme';
import { listMyFormResponses, FormResponse } from '../services/db';
import { formatDate } from '../utils/format';

export function MemberFormsScreen() {
  const nav = useNavigation<any>();
  const [forms, setForms] = useState<FormResponse[] | null>(null);

  const load = useCallback(() => { listMyFormResponses().then(setForms).catch(() => setForms([])); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen>
      <ScreenTitle title="Forms" subtitle="Forms your facilitator has sent you" />
      {forms === null ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : forms.length === 0 ? (
        <Card><Text style={typography.bodySecondary}>No forms to complete right now.</Text></Card>
      ) : (
        forms.map((f) => (
          <Card key={f.id} onPress={() => nav.navigate('FormFill', { id: f.id })}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={typography.h3}>{f.title}</Text>
                <Text style={typography.caption}>{f.status === 'completed' ? `Signed ${f.signedAt ? formatDate(f.signedAt) : ''}` : `Sent ${formatDate(f.createdAt)}`}</Text>
              </View>
              <Pill label={f.status === 'completed' ? 'Completed' : 'Needs signature'} color={f.status === 'completed' ? colors.success : colors.warning} />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
