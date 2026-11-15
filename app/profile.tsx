// Profile: your name, your avatar, and leaving the ship.

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useCloudCurtain } from '@/components/CloudCurtain';
import { Avatars, Bar, Label, Shell, T, s } from '@/components/ui';
import { leave } from '@/features/auth/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMyVoyages } from '@/features/profile/useMyVoyages';
import { formatDate, stagesLabel, voyageDate, voyageRoute, type Voyage } from '@/features/profile/voyages';
import { app, profile } from '@/theme/copy';
import { sz } from '@/theme/scale';
import { fonts } from '@/theme/typography';

type Saving = 'idle' | 'saved' | 'error';

const ink = '#2b170c';
const terracotta = '#b84d1f';

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: '40%', backgroundColor: '#e8d5a0', borderWidth: sz(2), borderColor: '#392619', padding: sz(10) }}>
      <T style={{ fontFamily: fonts.ui, fontSize: sz(20), lineHeight: sz(28), color: ink }}>{value}</T>
      <T style={{ fontFamily: fonts.heading, fontSize: sz(8), lineHeight: sz(14), color: terracotta }}>{label}</T>
    </View>
  );
}

function Badge({ text, dark = false }: { text: string; dark?: boolean }) {
  return <T style={[s.badge, dark && { backgroundColor: ink, color: '#f5edce' }]}>{text}</T>;
}

function VoyageCard({ v }: { v: Voyage }) {
  const route = `${v.start_name} → ${v.destination_name ?? profile.hiddenInFog}`;
  const status = profile.status[v.status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={profile.openVoyage(route, status)}
      onPress={() => router.push(voyageRoute(v))}
      style={({ pressed }) => [
        { borderWidth: sz(2), borderColor: '#392619', backgroundColor: '#f0e2b6', padding: sz(12), marginTop: sz(12) },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sz(6), marginBottom: sz(8) }}>
        <Badge text={status} dark={v.status === 'complete'} />
        {v.is_captain && <Badge text={profile.captainBadge} />}
      </View>
      <T style={{ fontFamily: fonts.ui, fontSize: sz(16), lineHeight: sz(24), color: ink, flexShrink: 1 }}>{route}</T>
      <T style={[s.dark, { fontSize: sz(14), lineHeight: sz(21), marginTop: sz(4), flexShrink: 1 }]}>{v.title}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: sz(12), rowGap: sz(2), marginTop: sz(10) }}>
        <T style={[s.dark, { fontSize: sz(14), lineHeight: sz(22) }]}>{stagesLabel(v.stages_cleared, v.stages_total)}</T>
        <T style={[s.dark, { fontSize: sz(14), lineHeight: sz(22), color: terracotta }]}>{profile.drachma(v.my_points)}</T>
      </View>
      <T style={[s.dark, { fontSize: sz(12), lineHeight: sz(20), opacity: 0.7 }]}>{formatDate(voyageDate(v))}</T>
    </Pressable>
  );
}

export default function Profile() {
  const { username, avatar, chooseAvatar } = useAuth();
  const { voyages, summary, loading, error, reload } = useMyVoyages();
  const curtain = useCloudCurtain();
  const [result, setResult] = useState<Saving>('idle');
  const [signOutError, setSignOutError] = useState(false);
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
    setSignOutError(false);
    await curtain.close(app.auth.cloudsSignOut);
    try {
      await leave();
    } catch {
      setSignOutError(true);
    } finally {
      await curtain.open();
    }
  };

  return (
    <Shell>
      <Bar title={profile.title} onBack={() => router.back()} />
      <View style={s.parchment}>
        <Label>{profile.usernameLabel}</Label>
        <T style={s.darkTitle}>{username ?? ''}</T>
        <Label>{profile.avatarLabel}</Label>
        <Avatars value={avatar} onChange={(i) => void pick(i)} />
        <T style={[s.dark, { marginTop: sz(12) }]}>{profile.avatarHint}</T>
        <View style={{ minHeight: sz(24), marginTop: sz(8) }} accessibilityLiveRegion="polite">
          {result === 'saved' && <T style={[s.dark, { color: '#195c2e' }]}>{profile.saved}</T>}
          {result === 'error' && <T style={[s.dark, { color: '#cc2827' }]}>{profile.saveError}</T>}
        </View>
      </View>
      <View style={[s.parchment, { marginTop: sz(20) }]}>
        <Label>{profile.summaryLabel}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sz(8) }}>
          <Stat value={summary.points} label={`◈ ${profile.drachmaEarned}`} />
          <Stat value={summary.voyages} label={profile.voyagesStat} />
          <Stat value={summary.completed} label={profile.completedStat} />
          <Stat value={summary.captained} label={profile.captainedStat} />
        </View>
        <Label>{profile.voyagesLabel}</Label>
        {loading && voyages.length === 0 && error === null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sz(10) }} accessibilityLiveRegion="polite">
            <ActivityIndicator color={terracotta} />
            <T style={s.dark}>{profile.voyagesLoading}</T>
          </View>
        ) : error !== null && voyages.length === 0 ? (
          <View accessibilityLiveRegion="polite">
            <T style={[s.dark, { color: '#cc2827' }]}>{profile.voyagesError}</T>
            <Pressable accessibilityRole="button" onPress={() => void reload()} style={{ marginTop: sz(8) }}>
              <T style={[s.dark, { textDecorationLine: 'underline' }]}>{profile.retry}</T>
            </Pressable>
          </View>
        ) : voyages.length === 0 ? (
          <T style={s.dark}>{profile.voyagesEmpty}</T>
        ) : (
          <View style={{ marginTop: sz(-12) }}>
            {voyages.map((v) => (
              <VoyageCard key={v.odyssey_id} v={v} />
            ))}
          </View>
        )}
      </View>
      <T accessibilityRole="button" onPress={() => void signOut()} style={[s.hint, { textDecorationLine: 'underline', marginTop: sz(24) }]}>
        {app.auth.signOut}
      </T>
      {signOutError && (
        <T accessibilityLiveRegion="polite" style={[s.hint, { color: '#cc2827', marginTop: sz(8) }]}>
          {app.errors.unknown}
        </T>
      )}
    </Shell>
  );
}
