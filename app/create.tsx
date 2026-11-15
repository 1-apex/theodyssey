// Summon the Oracle: the Captain describes the trip and the route is generated.

import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatars, Bar, Button, Choices, Input, Label, Shell, T, s } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiError, avatarId, createDemoOdyssey, createOdyssey, joinOdyssey, toApiError } from '@/features/odyssey/api';
import type { PointsMode, VisibilityMode } from '@/lib/types';
import { app, c } from '@/theme/copy';

const errorText = (e: ApiError): string => app.errors[e.code] ?? app.errors.unknown;

export default function Create() {
  const [start, setStart] = useState('');
  const [destination, setDestination] = useState('');
  const [prompt, setPrompt] = useState(c.example);
  // The nickname starts as the player's username; they can still change it for this crew.
  const { username } = useAuth();
  const [name, setName] = useState(username ?? '');
  const [avatar, setAvatar] = useState(0);
  const [visibility, setVisibility] = useState<VisibilityMode>('fog');
  const [pointsMode, setPointsMode] = useState<PointsMode>('crew');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** Offered once the Oracle has failed, so a demo is never blocked on the AI. */
  const [offerDemo, setOfferDemo] = useState(false);

  const open = (id: string) => router.replace({ pathname: '/odyssey/[id]/preview', params: { id } });

  const summon = async () => {
    if (!start.trim() || !destination.trim() || !name.trim()) {
      setError(app.createMissing);
      return;
    }
    setError('');
    setBusy(true);
    try {
      const made = await createOdyssey({
        start: start.trim(),
        destination: destination.trim(),
        crew_size: 4,
        travel_style: prompt.trim(),
        duration: '',
        visibility_mode: visibility,
        points_mode: pointsMode,
        nickname: name.trim(),
        avatar_id: avatarId(avatar),
      });
      open(made.odyssey_id);
    } catch (e) {
      setError(errorText(toApiError(e)));
      setOfferDemo(true);
    } finally {
      setBusy(false);
    }
  };

  const sailDemo = async () => {
    if (!name.trim()) {
      setError(app.createMissing);
      return;
    }
    setError('');
    setBusy(true);
    try {
      const made = await createDemoOdyssey(visibility, pointsMode);
      await joinOdyssey(made.join_code, name.trim(), avatarId(avatar));
      open(made.odyssey_id);
    } catch (e) {
      setError(errorText(toApiError(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <Bar title={c.createTitle} onBack={() => router.back()} />
      <View style={s.parchment}>
        <Label>{app.startLabel}</Label>
        <Input label={app.startLabel} value={start} onChange={setStart} placeholder={app.startPlaceholder} maxLength={120} />
        <Label>{app.destinationLabel}</Label>
        <Input
          label={app.destinationLabel}
          value={destination}
          onChange={setDestination}
          placeholder={app.destinationPlaceholder}
          maxLength={120}
        />
        <Label>{c.trip}</Label>
        <Input label={c.trip} value={prompt} onChange={setPrompt} multiline />
        <Label>{c.captainName}</Label>
        <Input label={c.captainName} value={name} onChange={setName} placeholder={c.namePlaceholder} />
        <Label>{c.avatarLabel}</Label>
        <Avatars value={avatar} onChange={setAvatar} />
        <Label>{c.choose}</Label>
        <Choices
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'open', title: c.open, sub: c.openSub },
            { value: 'fog', title: c.fog, sub: c.fogSub },
          ]}
        />
        <Label>{app.pointsLabel}</Label>
        <Choices
          value={pointsMode}
          onChange={setPointsMode}
          options={[
            { value: 'crew', title: app.pointsCrew, sub: app.pointsCrewSub },
            { value: 'arriver', title: app.pointsArriver, sub: app.pointsArriverSub },
          ]}
        />
      </View>
      <View style={s.space}>
        <Button title={busy ? app.consulting : c.summon} onPress={() => void summon()} disabled={busy} />
        {offerDemo && <Button title={app.demoRoute} onPress={() => void sailDemo()} disabled={busy} secondary />}
      </View>
      {!!error && <T style={s.error}>{error}</T>}
    </Shell>
  );
}
