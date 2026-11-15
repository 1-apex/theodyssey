// The start page: what a signed-out player sees at the app's front door.
// A username and a password, then the clouds roll in while the server
// answers and part on Home. Rendered by app/index.tsx.

import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useCloudCurtain } from '../../components/CloudCurtain';
import { Border, Cloud, Stars } from '../../components/PixelScene';
import { Button, Input, Label, Shell, T, s } from '../../components/ui';
import { AuthError, enter } from './api';
import { normalizeUsername, PASSWORD_MIN, USERNAME_MAX, USERNAME_PATTERN } from './username';
import { isSupabaseConfigured } from '../../lib/supabase';
import { app, c, copy } from '../../theme/copy';

/** Long enough that the clouds read as a transition even on a fast connection. */
const MIN_HOLD_MS = 900;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function StartScreen() {
  const curtain = useCloudCurtain();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(isSupabaseConfigured ? '' : app.auth.errors.not_configured);

  const board = async () => {
    if (busy) return;
    // Cheap checks first, so a typo does not cost a trip through the clouds.
    if (!USERNAME_PATTERN.test(normalizeUsername(username))) {
      setError(app.auth.errors.invalid_username);
      return;
    }
    if (password.length < PASSWORD_MIN) {
      setError(app.auth.errors.weak_password);
      return;
    }
    setError('');
    setBusy(true);
    const attempt = enter(username, password).then(
      () => null,
      (e: unknown) => (e instanceof AuthError ? e.code : 'unknown'),
    );
    await curtain.close(app.auth.cloudsSignIn);
    const [failure] = await Promise.all([attempt, wait(MIN_HOLD_MS)]);
    if (failure) {
      setError(app.auth.errors[failure]);
      setBusy(false);
    }
    // On success Home has already replaced this page behind the clouds;
    // parting them reveals it.
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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
        <Cloud />
        <Cloud />
      </View>
      <T style={[s.heroBody, { marginTop: 4, marginBottom: 20 }]}>{app.auth.line}</T>
      <View style={s.parchment}>
        <Label>{app.auth.usernameLabel}</Label>
        <Input
          label={app.auth.usernameLabel}
          value={username}
          onChange={setUsername}
          placeholder={app.auth.usernamePlaceholder}
          maxLength={USERNAME_MAX}
          autoCapitalize="none"
        />
        <T style={[s.dark, { fontSize: 13, lineHeight: 20, marginTop: 6 }]}>{app.auth.usernameHint}</T>
        <Label>{app.auth.passwordLabel}</Label>
        <Input
          label={app.auth.passwordLabel}
          value={password}
          onChange={setPassword}
          placeholder={app.auth.passwordPlaceholder}
          maxLength={72}
          autoCapitalize="none"
          secure
          onSubmit={() => void board()}
        />
      </View>
      <View style={s.space}>
        <Button title={busy ? app.auth.entering : app.auth.enter} onPress={() => void board()} disabled={busy} />
      </View>
      {!!error && <T style={s.error}>{error}</T>}
      {__DEV__ && (
        <Link href="/debug" style={[s.text, s.hint]}>
          {copy.home.debug}
        </Link>
      )}
    </Shell>
  );
}
