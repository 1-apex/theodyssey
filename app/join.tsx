// Join a crew with the Captain's code.

import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatars, Bar, Button, Input, Label, Shell, T, s } from '@/components/ui';
import { avatarId, joinOdyssey, toApiError } from '@/features/odyssey/api';
import { app, c } from '@/theme/copy';

export default function Join() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const join = async () => {
    if (!code.trim() || !name.trim()) {
      setError(app.joinMissing);
      return;
    }
    setError('');
    setBusy(true);
    try {
      const joined = await joinOdyssey(code, name.trim(), avatarId(avatar));
      // The lobby forwards to the voyage if the Captain has already set sail.
      router.replace({ pathname: '/odyssey/[id]/lobby', params: { id: joined.odyssey_id } });
    } catch (e) {
      const { code: reason } = toApiError(e);
      setError(app.errors[reason] ?? app.errors.unknown);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <Bar title={c.joinTitle} onBack={() => router.back()} />
      <View style={s.parchment}>
        <T style={s.dark}>{c.joinSub}</T>
        <Label>{c.joinCode}</Label>
        <Input label={c.joinCode} value={code} onChange={setCode} placeholder="ABC234" maxLength={8} autoCapitalize="characters" />
        <Label>{c.nickname}</Label>
        <Input label={c.nickname} value={name} onChange={setName} placeholder={c.nicknamePlaceholder} />
        <Label>{c.avatarLabel}</Label>
        <Avatars value={avatar} onChange={setAvatar} />
      </View>
      <View style={s.space}>
        <Button title={busy ? app.joining : c.joinButton} onPress={() => void join()} disabled={busy} />
      </View>
      {!!error && <T style={s.error}>{error}</T>}
    </Shell>
  );
}
