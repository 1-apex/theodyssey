// The front door. Signed out it is the start page; signed in it is Home:
// create an Odyssey or join a crew.

import { Link, router } from 'expo-router';
import { View } from 'react-native';

import { useCloudCurtain } from '@/components/CloudCurtain';
import { Border, HomeArt, Stars } from '@/components/PixelScene';
import { Button, Shell, T, s } from '@/components/ui';
import { leave } from '@/features/auth/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { StartScreen } from '@/features/auth/StartScreen';
import { isSupabaseConfigured } from '@/lib/supabase';
import { app, c, copy } from '@/theme/copy';

export default function Index() {
  const { status } = useAuth();
  return status === 'signedIn' ? <Home /> : <StartScreen />;
}

function Home() {
  const { username } = useAuth();
  const curtain = useCloudCurtain();

  const signOut = async () => {
    await curtain.close(app.auth.cloudsSignOut);
    await leave();
    await curtain.open();
  };

  return (
    <Shell home>
      <Stars />
      <View style={s.homeTitle}>
        <Border />
        <T style={s.logo}>{c.brand}</T>
        <Border />
      </View>
      <T style={s.heroBody}>{c.homeLine}</T>
      <HomeArt />
      <View style={{ marginTop: 'auto' }}>
        {!isSupabaseConfigured && <T style={s.error}>{app.notConfigured}</T>}
        <Button title={c.begin} onPress={() => router.push('/storyteller')} />
        <Button title={c.join} onPress={() => router.push('/join')} secondary />
        {username !== null && <T style={s.hint}>{app.auth.signedInAs(username)}</T>}
        <T accessibilityRole="button" onPress={() => void signOut()} style={[s.hint, { textDecorationLine: 'underline' }]}>
          {app.auth.signOut}
        </T>
        {__DEV__ && (
          <Link href="/debug" style={[s.text, s.hint]}>
            {copy.home.debug}
          </Link>
        )}
      </View>
    </Shell>
  );
}
