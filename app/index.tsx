// Placeholder home screen for Phase 0. Dev A replaces this with the real pixel UI.

import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { mockOdyssey, mockStages } from '@/lib/mock';
import { colors } from '@/theme/colors';
import { copy } from '@/theme/copy';

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{copy.home.title}</Text>
      <Text style={styles.tagline}>{copy.home.tagline}</Text>
      <Text style={styles.mock}>
        {copy.home.mockSummary(mockOdyssey.title, mockStages.length)}
      </Text>
      {__DEV__ && (
        <Link href="/debug" style={styles.link}>
          {copy.home.debug}
        </Link>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sea,
    gap: 12,
  },
  title: { color: colors.gold, fontSize: 40, fontWeight: '900', letterSpacing: 6 },
  tagline: { color: colors.foam, fontSize: 16 },
  mock: { color: colors.fog, fontSize: 12, marginTop: 24 },
  link: { color: colors.sea, backgroundColor: colors.gold, fontSize: 16, fontWeight: '800', padding: 14 },
});
