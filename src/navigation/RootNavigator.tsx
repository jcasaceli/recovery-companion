import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { colors } from '../theme';
import { useAppState } from '../state/store';
import { useAuth } from '../state/auth';
import { AuthScreen } from '../screens/AuthScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { AssistantScreen } from '../screens/AssistantScreen';
import { MessagesScreen } from '../screens/MessagesScreen';
import { ResourcesScreen } from '../screens/ResourcesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { ClientsScreen } from '../screens/ClientsScreen';
import { LinkMemberScreen } from '../screens/LinkMemberScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { CommunityScreen } from '../screens/CommunityScreen';
import { ScheduleScreen } from '../screens/ScheduleScreen';
import { MeetingsScreen } from '../screens/MeetingsScreen';
import { PaymentsScreen } from '../screens/PaymentsScreen';
import { FacilitatorPaymentsScreen } from '../screens/FacilitatorPaymentsScreen';

const Tab = createBottomTabNavigator();
const FacTab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

type IconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Progress: { active: 'trending-up', inactive: 'trending-up-outline' },
  Assistant: { active: 'chatbubbles', inactive: 'chatbubbles-outline' },
  Messages: { active: 'mail', inactive: 'mail-outline' },
  Resources: { active: 'heart', inactive: 'heart-outline' },
};

function Tabs({ navigation }: any) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIcon: ({ focused, color, size }) => {
          const cfg = ICONS[route.name];
          return <Ionicons name={focused ? cfg.active : cfg.inactive} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Progress" component={ProgressScreen} />
      <Tab.Screen name="Assistant" component={AssistantScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen name="Resources" component={ResourcesScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const auth = useAuth();
  const { onboarded, ready, cloudHasIndividual } = useAppState();

  // Cloud mode (Supabase configured): gate on authentication.
  if (auth.configured) {
    if (auth.status === 'loading') return null;
    if (auth.status === 'signedOut') return <AuthScreen />;
    // Facilitators get an admin console (Clients / Payments / Resources /
    // Account) until they open a client, at which point they enter its app.
    if (auth.profile?.role === 'facilitator' && !cloudHasIndividual) {
      return <FacilitatorTabs />;
    }
    // A member who isn't linked to a sober living yet enters their join code.
    if (auth.profile?.role !== 'facilitator' && !cloudHasIndividual) {
      return <LinkMemberScreen />;
    }
    return <MainStack />; // signed in & linked
  }

  // Local prototype: gate on the on-device onboarding flag.
  if (!ready) return null;
  if (!onboarded) return <OnboardingScreen />;
  return <MainStack />;
}

const FAC_ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  Clients: { active: 'people', inactive: 'people-outline' },
  Payments: { active: 'card', inactive: 'card-outline' },
  Resources: { active: 'heart', inactive: 'heart-outline' },
  Account: { active: 'person-circle', inactive: 'person-circle-outline' },
};

function FacilitatorTabs() {
  return (
    <FacTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primaryDark,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIcon: ({ focused, color, size }) => {
          const cfg = FAC_ICONS[route.name];
          return <Ionicons name={focused ? cfg.active : cfg.inactive} size={size} color={color} />;
        },
      })}
    >
      <FacTab.Screen name="Clients" component={ClientsScreen} />
      <FacTab.Screen name="Payments" component={FacilitatorPaymentsScreen} />
      <FacTab.Screen name="Resources" component={ResourcesScreen} />
      <FacTab.Screen name="Account" component={SettingsScreen} />
    </FacTab.Navigator>
  );
}

function MainStack() {
  return (
    <RootStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.textPrimary },
      }}
    >
      <RootStack.Screen
        name="Tabs"
        component={Tabs}
        options={({ navigation }) => ({
          headerShown: false,
        })}
      />
      <RootStack.Screen name="Tasks" component={TasksScreen} options={{ title: 'Tasks & notes' }} />
      <RootStack.Screen name="Community" component={CommunityScreen} options={{ title: 'Community' }} />
      <RootStack.Screen name="Schedule" component={ScheduleScreen} options={{ title: 'Schedule' }} />
      <RootStack.Screen name="Meetings" component={MeetingsScreen} options={{ title: 'Meetings' }} />
      <RootStack.Screen name="Payments" component={PaymentsScreen} options={{ title: 'Pay rent' }} />
      <RootStack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </RootStack.Navigator>
  );
}
