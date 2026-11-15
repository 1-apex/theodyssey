// Crew assembling: share the join code, watch the crew arrive, and the Captain sets sail.

import * as Clipboard from 'expo-clipboard';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { PixelAvatar } from '@/components/PixelAvatar';
import { Bar, Button, Notice, Shell, T, s } from '@/components/ui';
import { useCrew } from '@/features/crew/useCrew';
import { avatarIndex, setSail, toApiError } from '@/features/odyssey/api';
import { refreshOdyssey } from '@/features/odyssey/supabaseBackend';
import { useOdyssey } from '@/features/odyssey/useOdyssey';
import { useVoyageContext } from '@/features/odyssey/VoyageProvider';
import { app, c, map } from '@/theme/copy';
import { sz } from '@/theme/scale';

export default function Lobby() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { memberId } = useVoyageContext();
  const odyssey = useOdyssey(id);
  const crew = useCrew(id);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (odyssey === null || crew === null) return <Notice loading text={app.loading} />;
  // Everyone leaves the lobby together when the Captain sets sail.
  if (odyssey.status === 'voyage') return <Redirect href={{ pathname: '/odyssey/[id]/voyage', params: { id } }} />;
  if (odyssey.status === 'complete') return <Redirect href={{ pathname: '/odyssey/[id]/ithaca', params: { id } }} />;

  const me = crew.find((m) => m.id === memberId);
  const isCaptain = me !== undefined && me.user_id === odyssey.captain_id;

  const copyCode = async () => {
    try {
      await Clipboard.setStringAsync(odyssey.join_code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const launch = async () => {
    setBusy(true);
    setError('');
    try {
      await setSail(id);
      refreshOdyssey(id);
    } catch (e) {
      setError(app.errors[toApiError(e).code] ?? app.errors.unknown);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <Bar title={c.crewLobby} onBack={() => router.replace('/')} />
      <View style={[s.parchment, { alignItems: 'center' }]}>
        <T style={s.mode}>{odyssey.visibility_mode === 'fog' ? c.fogOdyssey : c.openOdyssey}</T>
        <T style={[s.darkTitle, { textAlign: 'center' }]}>{odyssey.title}</T>
        <T style={[s.dark, { textAlign: 'center' }]}>
          {map.route(odyssey.start_name, odyssey.visibility_mode === 'fog' ? map.hiddenInFog : odyssey.destination_name)}
        </T>
        <T style={[s.dark, { marginTop: sz(12), textAlign: 'center' }]}>{c.share}</T>
        <View style={s.codeRow}>
          <T selectable accessibilityLabel={c.joinCode} style={s.codeText}>
            {odyssey.join_code}
          </T>
          <View style={{ flex: 1.15 }}>
            <Button title={copied ? c.copied : c.copyCode} onPress={() => void copyCode()} secondary />
          </View>
        </View>
      </View>
      <T style={s.crewHeading}>{app.crewCount(crew.length)}</T>
      {crew.map((member) => (
        <View key={member.id} style={s.crewRow}>
          <PixelAvatar index={avatarIndex(member.avatar_id, c.avatarNames.length)} />
          <T style={[s.member, { flex: 1 }]}>
            {member.nickname}
            {member.id === memberId && <T> {c.you}</T>}
          </T>
          {member.user_id === odyssey.captain_id && <T style={s.badge}>★ {c.captain}</T>}
        </View>
      ))}
      <View style={s.lobbyBottom}>
        {isCaptain ? (
          <Button title={busy ? app.settingSail : c.launch} onPress={() => void launch()} disabled={busy} />
        ) : (
          <T style={{ textAlign: 'center' }}>{app.waitingForCaptain}</T>
        )}
        {!!error && <T style={s.error}>{error}</T>}
      </View>
    </Shell>
  );
}
