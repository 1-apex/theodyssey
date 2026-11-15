// Home: create an Odyssey or join a crew.

import { Link, router } from 'expo-router';
import { View } from 'react-native';

import { Border, HomeArt, Stars } from '@/components/PixelScene';
import { Button, Shell, T, s } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase';
import { app, c, copy } from '@/theme/copy';

export default function Home() {
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
        {__DEV__ && (
          <Link href="/debug" style={[s.text, s.hint]}>
            {copy.home.debug}
          </Link>
        )}
      </View>
    </Shell>
  );
}
