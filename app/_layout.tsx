import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { GideonRoman_400Regular } from '@expo-google-fonts/gideon-roman';
import { IMFellEnglishSC_400Regular } from '@expo-google-fonts/im-fell-english-sc';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { CloudCurtainProvider } from '@/components/CloudCurtain';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';

function Screens() {
  const { status } = useAuth();
  // The saved session is still being read; the splash colour shows meanwhile.
  if (status === 'loading') return null;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#001c33' } }}>
      {/* The front door: the start page when signed out, Home when signed in. */}
      <Stack.Screen name="index" />
      {/* Everything else in the game needs a username; signed out, these fall back to the front door. */}
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="storyteller" />
        <Stack.Screen name="join" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="odyssey/[id]" />
      </Stack.Protected>
      {/* Dev C's test screen runs on mock data and needs no account. */}
      <Stack.Screen name="debug" />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ PressStart2P_400Regular, GideonRoman_400Regular, IMFellEnglishSC_400Regular });
  if (!loaded && !error) return null;
  return (
    <AuthProvider>
      <CloudCurtainProvider>
        <StatusBar style="light" />
        <Screens />
      </CloudCurtainProvider>
    </AuthProvider>
  );
}
