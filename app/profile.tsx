// Profile: your name, your avatar, and leaving the ship.

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useCloudCurtain } from '@/components/CloudCurtain';
import { Avatars, Bar, Label, Shell, T, s } from '@/components/ui';
import { leave } from '@/features/auth/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { app, profile } from '@/theme/copy';

type Saving = 'idle' | 'saved' | 'error';

export default function Profile() {
  const { username, avatar, chooseAvatar } = useAuth();
  const curtain = useCloudCurtain();
  const [result, setResult] = useState<Saving>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const pick = async (index: number) => {
    if (timer.current) clearTimeout(timer.current);
    setResult('idle');
    try {
      await chooseAvatar(index);
      setResult('saved');
      timer.current = setTimeout(() => setResult('idle'), 2000);
    } catch {
      setResult('error');
    }
  };

  const signOut = async () => {
    await curtain.close(app.auth.cloudsSignOut);
    await leave();
    await curtain.open();
  };

  return (
    <Shell>
      <Bar title={profile.title} onBack={() => router.back()} />
      <View style={s.parchment}>
        <Label>{profile.usernameLabel}</Label>
        <T style={s.darkTitle}>{username ?? ''}</T>
        <Label>{profile.avatarLabel}</Label>
        <Avatars value={avatar} onChange={(i) => void pick(i)} />
        <T style={[s.dark, { marginTop: 12 }]}>{profile.avatarHint}</T>
        <View style={{ minHeight: 24, marginTop: 8 }} accessibilityLiveRegion="polite">
          {result === 'saved' && <T style={[s.dark, { color: '#195c2e' }]}>{profile.saved}</T>}
          {result === 'error' && <T style={[s.dark, { color: '#cc2827' }]}>{profile.saveError}</T>}
        </View>
      </View>
      <T accessibilityRole="button" onPress={() => void signOut()} style={[s.hint, { textDecorationLine: 'underline', marginTop: 24 }]}>
        {app.auth.signOut}
      </T>
    </Shell>
  );
}
