import { Linking } from 'react-native';

import type { LatLng, Stage } from '../../lib/types';
import { mapsPlaceUrl } from './mapsUrl';

/** Opens the device's maps app (or the browser) on the stage's place, found by its real name, so the player sees the place card and can get directions. */
export function openInMaps(stage: Pick<Stage, 'name'> & Partial<LatLng>): void {
  void Linking.openURL(mapsPlaceUrl(stage)).catch(() => {});
}
