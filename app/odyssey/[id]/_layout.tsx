// Every screen of one Odyssey shares a session: member, backend, location source, arrival watcher.

import { router, Stack, useLocalSearchParams } from 'expo-router';

import { Notice } from '@/components/ui';
import { OdysseySession } from '@/features/odyssey/OdysseySession';
import { app } from '@/theme/copy';

export default function OdysseyLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <OdysseySession
      odysseyId={id}
      renderState={(state, retry) => {
        if (state === 'not-member') {
          return <Notice text={app.notCrew} action={app.goJoin} onAction={() => router.replace('/join')} />;
        }
        if (state === 'error') return <Notice text={app.loadFailed} action={app.retry} onAction={retry} />;
        return <Notice loading text={app.loading} />;
      }}
    >
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#001c33' } }} />
    </OdysseySession>
  );
}
