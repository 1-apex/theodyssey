// The loading transition: pixel clouds roll in from both sides until they
// cover the screen, hold while work happens behind them, then part again.
// Lives above the navigator so it survives a change of screen.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { fonts } from '../theme/typography';
import { CLOUD_ROWS } from './PixelCloud';

const COLS = 33;
const ROWS = 18;
const palette: Record<string, string> = { o: '#3b5276', H: '#f2f4dc', L: '#b9d6dc', S: '#7da1bc' };

// The sprite as horizontal runs of one colour: about 60 rectangles instead of 400.
const RUNS = CLOUD_ROWS.flatMap((row, y) => {
  const runs: { x: number; y: number; w: number; fill: string }[] = [];
  let x = 0;
  while (x < row.length) {
    const ch = row[x];
    let end = x + 1;
    while (end < row.length && row[end] === ch) end++;
    if (ch !== '.') runs.push({ x, y, w: end - x, fill: palette[ch] });
    x = end;
  }
  return runs;
});

function BigCloud({ width }: { width: number }) {
  return (
    <Svg width={width} height={(width * ROWS) / COLS} viewBox={`0 0 ${COLS} ${ROWS}`}>
      {RUNS.map((r) => (
        <Rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </Svg>
  );
}

const ROW_OFFSET = [0.3, 0.75, 0.1, 0.55, 0.9];
const CLOUD_SIZE = [1, 0.74, 1.12, 0.86];

const CLOSE_MS = 1100;
const OPEN_MS = 900;
/** Movement snaps between a few positions, like sprite animation on old hardware. */
const stepped = (steps: number) => (t: number) => Math.round(t * steps) / steps;

export interface CloudCurtain {
  /** Clouds roll in. Resolves once the screen is fully covered. */
  close(message?: string): Promise<void>;
  /** Clouds part. Resolves once the screen is clear. */
  open(): Promise<void>;
}

const CurtainContext = createContext<CloudCurtain | null>(null);

export function CloudCurtainProvider({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(0));
  const [shown, setShown] = useState(false);
  const [message, setMessage] = useState('');
  const running = useRef<Animated.CompositeAnimation | null>(null);

  const run = useCallback(
    async (toValue: 0 | 1, duration: number) => {
      const reduced = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      running.current?.stop();
      return new Promise<void>((resolve) => {
        const animation = Animated.timing(progress, {
          toValue,
          duration: reduced ? 150 : duration,
          easing: stepped(reduced ? 1 : 14),
          useNativeDriver: Platform.OS !== 'web',
        });
        running.current = animation;
        animation.start(() => resolve());
      });
    },
    [progress],
  );

  const curtain = useMemo<CloudCurtain>(
    () => ({
      async close(text = '') {
        setMessage(text);
        setShown(true);
        await run(1, CLOSE_MS);
      },
      async open() {
        await run(0, OPEN_MS);
        setShown(false);
      },
    }),
    [run],
  );

  // Rows of clouds, alternately entering from the left and from the right.
  // Sizes and offsets cycle through a short table so the bank does not look tiled.
  const cloudW = Math.min(width, 448) * 0.78;
  const cloudH = (cloudW * ROWS) / COLS;
  const rowStep = cloudH * 0.66;
  const rowCount = Math.ceil(height / rowStep) + 1;
  const perRow = Math.ceil(width / (cloudW * 0.6)) + 2;
  // Each row starts a little after the one below it, so the bank builds upward.
  const stagger = 0.45 / rowCount;

  return (
    <CurtainContext.Provider value={curtain}>
      {children}
      {shown && (
        <View
          style={StyleSheet.absoluteFill}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={message}
          accessibilityLiveRegion="polite"
        >
          {/* Fills the gaps between sprites once the bank has formed. */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.haze,
              { opacity: progress.interpolate({ inputRange: [0, 0.55, 0.9, 1], outputRange: [0, 0, 1, 1] }) },
            ]}
          />
          {Array.from({ length: rowCount }, (_, row) => {
            const fromLeft = row % 2 === 0;
            const startAt = (rowCount - 1 - row) * stagger;
            const translateX = progress.interpolate({
              inputRange: [startAt, startAt + 0.55],
              outputRange: [(fromLeft ? -1 : 1) * (width + cloudW * 2), 0],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={row}
                style={[
                  styles.row,
                  {
                    top: row * rowStep - cloudH * 0.4,
                    left: -cloudW * ROW_OFFSET[row % ROW_OFFSET.length],
                    transform: [{ translateX }],
                  },
                ]}
              >
                {Array.from({ length: perRow }, (_, i) => {
                  const size = cloudW * CLOUD_SIZE[(row + i) % CLOUD_SIZE.length];
                  return (
                    <View key={i} style={{ marginRight: -size * 0.14, marginTop: (cloudW - size) * 0.2 }}>
                      <BigCloud width={size} />
                    </View>
                  );
                })}
              </Animated.View>
            );
          })}
          {message !== '' && (
            <Animated.View
              style={[
                styles.messageWrap,
                { opacity: progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [0, 0, 1] }) },
              ]}
            >
              <View style={styles.messageBox}>
                <Text style={styles.message}>{message}</Text>
              </View>
            </Animated.View>
          )}
        </View>
      )}
    </CurtainContext.Provider>
  );
}

export function useCloudCurtain(): CloudCurtain {
  const value = useContext(CurtainContext);
  if (!value) throw new Error('useCloudCurtain must be used inside <CloudCurtainProvider>');
  return value;
}

const styles = StyleSheet.create({
  haze: { backgroundColor: '#b9d6dc' },
  row: { position: 'absolute', flexDirection: 'row' },
  messageWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  messageBox: { backgroundColor: '#f2f4dc', borderWidth: 3, borderColor: '#3b5276', paddingVertical: 14, paddingHorizontal: 16 },
  message: { fontFamily: fonts.heading, fontSize: 10, lineHeight: 18, color: '#3b5276', textAlign: 'center' },
});
