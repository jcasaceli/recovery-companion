import './src/utils/webAlert'; // patch Alert.alert to work on web (must be first)
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/state/auth';
import { AppStateProvider } from './src/state/store';
import { RootNavigator } from './src/navigation/RootNavigator';
import { registerForPushNotificationsAsync } from './src/services/push';

export default function App() {
  useEffect(() => {
    // Ask for push permission and register this device's token. On a real
    // device with Supabase configured, also persist it via db.savePushToken.
    registerForPushNotificationsAsync().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppStateProvider>
          <NavigationContainer>
            <StatusBar style="dark" />
            <RootNavigator />
          </NavigationContainer>
        </AppStateProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
