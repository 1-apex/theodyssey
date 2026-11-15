import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { UncialAntiqua_400Regular } from '@expo-google-fonts/uncial-antiqua';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  const [loaded, error] = useFonts({ PressStart2P_400Regular, UncialAntiqua_400Regular });
  if (!loaded && !error) return null;
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#001c33' } }} />
    </>
  );
}
