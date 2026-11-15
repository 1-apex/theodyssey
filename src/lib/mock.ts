// One hardcoded Odyssey with 6 stages (Mumbai to Goa).
// Screens and simulate mode build against this until the backend is ready.

import type { LatLng, Member, Odyssey, Stage } from './types';

const ODYSSEY_ID = 'mock-odyssey';

export const mockOdyssey: Odyssey = {
  id: ODYSSEY_ID,
  join_code: 'ITHACA',
  captain_id: 'mock-user-1',
  title: 'The Konkan Odyssey',
  start_name: 'Mumbai',
  destination_name: 'Panaji, Goa',
  visibility_mode: 'fog',
  points_mode: 'crew',
  status: 'voyage',
  current_stage_order: 1,
  created_at: '2026-01-01T00:00:00Z',
};

// Not part of the Odyssey row yet; simulate mode needs somewhere to start from.
export const mockStart: LatLng = { lat: 19.076, lng: 72.8777 };

const stage = (
  order: number,
  name: string,
  title: string,
  lore: string,
  lat: number,
  lng: number,
): Stage => ({
  id: `mock-stage-${order}`,
  odyssey_id: ODYSSEY_ID,
  order,
  name,
  title,
  lore,
  lat,
  lng,
  radius_m: 500,
  points: order === 6 ? 300 : 100,
  cleared_at: null,
  cleared_by: null,
});

export const mockStages: Stage[] = [
  stage(1, 'Lonavala', 'Isle of the Lotus Eaters', 'Sweet chikki tempts the crew to linger. Do not linger.', 18.7546, 73.4062),
  stage(2, 'Pune', 'Halls of Aeolus', 'The keeper of winds offers rest and a full tank.', 18.5204, 73.8567),
  stage(3, 'Satara', 'Plateau of the Cyclops', 'One great eye of stone watches the road from the hills.', 17.6805, 74.0183),
  stage(4, 'Kolhapur', "Circe's Table", 'A feast so fiery it turns sailors into legends.', 16.705, 74.2433),
  stage(5, 'Amboli', 'Mists of the Sirens', 'Waterfalls sing from the fog. Keep your hands on the wheel.', 15.9647, 73.9978),
  stage(6, 'Panaji, Goa', 'Ithaca', 'Home shores at last. The sea remembers your name.', 15.4909, 73.8278),
];

export const mockMembers: Member[] = [
  { id: 'mock-member-1', odyssey_id: ODYSSEY_ID, user_id: 'mock-user-1', nickname: 'Odysseus', avatar_id: 'avatar-1', joined_at: '2026-01-01T00:00:00Z' },
  { id: 'mock-member-2', odyssey_id: ODYSSEY_ID, user_id: 'mock-user-2', nickname: 'Penelope', avatar_id: 'avatar-2', joined_at: '2026-01-01T00:00:00Z' },
  { id: 'mock-member-3', odyssey_id: ODYSSEY_ID, user_id: 'mock-user-3', nickname: 'Telemachus', avatar_id: 'avatar-3', joined_at: '2026-01-01T00:00:00Z' },
];

