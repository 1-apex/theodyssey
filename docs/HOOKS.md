# Voyage hooks (for Dev A)

Screens read game state through hooks. They never receive a backend or location source as props.

## Wrapping a screen

```tsx
import { VoyageProvider } from '@/features/odyssey/VoyageProvider';
import { createMockBackend } from '@/features/odyssey/mockBackend';
import { createSimulateSource } from '@/features/location/source';
import { mockMembers, mockStart } from '@/lib/mock';

const [backend] = useState(() => createMockBackend());
const [source] = useState(() => createSimulateSource({ start: mockStart }));
useEffect(() => () => source.stop(), [source]);

<VoyageProvider backend={backend} source={source} memberId={mockMembers[0].id}>
  <VoyageScreen />
</VoyageProvider>
```

The provider does not create or stop the backend or source. Whoever creates them stops them (simulate sources need `stop()` on unmount). Any hook used outside a provider throws.

## Hooks

Data hooks return `null` until the first load, reload on every backend change, and ignore results that arrive late.

| Hook | Returns |
|---|---|
| `useOdyssey(odysseyId)` | `Odyssey \| null` |
| `useVisibleStages(odysseyId)` | `Stage[] \| null`, visible stages only (fog respected), sorted by `order` |
| `useCrew(odysseyId)` | `Member[] \| null` |
| `usePoints(odysseyId)` | `{ ledger, totals, myTotal } \| null`. `totals` is Drachma per member id, `myTotal` is for the provider's `memberId` |
| `useLocation()` | `LatLng \| null`, the source's live position |
| `useArrivalWatcher(odysseyId, onResult?, onError?)` | nothing. Clears stages when the source enters the target's radius. `onResult` gets each `ClearStageResult` as soon as it returns; `onError` gets any failed read or clear (the watcher keeps running and retries on the next position or backend change). Callback identities may change freely. Call it once per Odyssey, in one mounted place: Expo Router keeps stack screens mounted, and two instances would both fire clears |
| `useManualArrival(odysseyId)` | `(stageId: string) => Promise<ClearStageResult>`. The "We have arrived" action for the stage on screen. Uses the source's last position and skips the distance check. A second call for the same stage gives `already_cleared`; a stale id is rejected |

A custom `LocationSource` must replay its last position to a new subscriber (as the simulate and GPS sources do), otherwise the watcher will not examine the position until the next fix.

`useSourceLocation(source)` (same file as `useLocation`) takes an explicit source, for code that runs before a provider exists.

## Example

```tsx
function VoyageScreen() {
  const id = 'mock-odyssey';
  const odyssey = useOdyssey(id);
  const stages = useVisibleStages(id);
  const points = usePoints(id);
  const arrive = useManualArrival(id);
  const target = stages?.find((s) => s.cleared_at === null);
  const [message, setMessage] = useState('');
  useArrivalWatcher(id, (r) => setMessage(r.status));

  if (odyssey === null || stages === null || points === null) return <Text>{copy.debug.loading}</Text>;
  if (target === undefined) return <Text>{odyssey.title}: {points.myTotal}</Text>;
  return (
    <View>
      <Text>{odyssey.title}: {points.myTotal}</Text>
      {stages.map((s) => <Text key={s.id}>{s.order}. {s.title}</Text>)}
      <Text>{message}</Text>
      <Pressable onPress={() => void arrive(target.id).then((r) => setMessage(r.status))}>
        <Text>We have arrived</Text>
      </Pressable>
    </View>
  );
}
```

(Real screens take their strings from `src/theme/copy.ts`.)

`ClearStageResult` is `cleared`, `already_cleared` or `rejected` with a reason: `not_found`, `not_member`, `not_in_voyage`, `not_current_target` or `too_far`. After a `rejected` result the watcher does not retry the same stage until the position moves more than 25 m or 15 s pass.

## Real GPS

Create the source with `createGpsSource()`, call `start()` and check its result (`'granted' | 'denied' | 'error'`), and call `stop()` on unmount. The creator owns the lifecycle; the provider does not start or stop it. Foreground only in Expo Go. Pass the same source to `VoyageProvider`.

## Known limits

GPS accuracy is not yet considered when clearing: a very imprecise fix that lands inside a radius clears the stage.

A failed load is swallowed and the hook keeps its previous value (null on first load), so there is no error state yet. Revisit this when the Supabase backend replaces the mock.

## Backend

Today the provider gets the in-memory mock. The Supabase backend will implement the same `OdysseyBackend` interface (`src/features/odyssey/backend.ts`) and replace the mock at the provider; the hooks and screens do not change.
