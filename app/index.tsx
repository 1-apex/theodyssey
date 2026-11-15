// The front door. Signed out it is the start page; signed in it is Home:
// create an Odyssey or join a crew.

import { Link, router } from 'expo-router';
import { View } from 'react-native';

import { HelmButton } from '@/components/HelmButton';
import { PixelAvatar } from '@/components/PixelAvatar';
import { Border, HomeArt, Stars } from '@/components/PixelScene';
import { Button, Shell, T, s } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { StartScreen } from '@/features/auth/StartScreen';
import { isSupabaseConfigured } from '@/lib/supabase';
import { app, c, copy } from '@/theme/copy';
import { sz } from '@/theme/scale';

export default function Index() {
  const { status } = useAuth();
  return status === 'signedIn' ? <Home /> : <StartScreen />;
}

function Home() {
  const { username, avatar } = useAuth();

  return (
    <Shell home>
      <Stars />
      <View style={{ alignItems: 'flex-end', marginTop: sz(4), marginBottom: sz(12) }}>
        <HelmButton onPress={() => router.push('/profile')} />
      </View>
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
        {username !== null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sz(8), marginTop: sz(8) }}>
            <PixelAvatar index={avatar} size={2} />
            <T style={[s.hint, { marginTop: 0 }]}>{app.auth.signedInAs(username)}</T>
          </View>
        )}
        {__DEV__ && (
          <Link href="/debug" style={[s.text, s.hint]}>
            {copy.home.debug}
          </Link>
        )}
      </View>
    </Shell>
  );
}
