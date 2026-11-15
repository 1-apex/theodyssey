// One size factor for the whole app, so tablets get larger text and wider
// content instead of a phone-sized column in the middle of the screen.
// Measured once at start-up: the app is portrait-only, and a device does not
// change class while running.

import { Dimensions } from 'react-native';

const width = Dimensions.get('window').width;

/** 1 on phones; grows with width on tablets, up to 1.5. */
export const SCALE = width < 600 ? 1 : Math.min(1.5, width / 520);

/** Scale a font size, line height, padding or fixed dimension. */
export const sz = (n: number): number => Math.round(n * SCALE);

/** Widest the content column gets (448 on phones). */
export const CONTENT_MAX_WIDTH = Math.round(448 * SCALE);

/** Scale a sprite's pixel-cell size, kept a whole number (at least 1) so pixel art stays crisp. Phones keep `n` as it is. */
export const spx = (n: number): number => (SCALE === 1 ? n : Math.max(1, Math.round(n * SCALE)));
