import { Linking } from 'react-native';

import type { LatLng } from '../../lib/types';

/** Opens the device's maps app (or the browser) at a stage's coordinates. */
export function openInMaps({ lat, lng }: LatLng): void {
  void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`).catch(() => {});
}
