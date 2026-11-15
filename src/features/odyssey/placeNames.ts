// Real place names are shown as written by geocoding, e.g. "Czech Stop, West, TX".
// Maps and lists show the part before the first comma large and the rest beneath it.

/** The place itself: the text before the first comma ("Czech Stop"). The whole name when there is no comma. */
export function shortPlaceName(name: string): string {
  const comma = name.indexOf(',');
  const head = (comma === -1 ? name : name.slice(0, comma)).trim();
  return head === '' ? name.trim() : head;
}

/** Everything after the first comma ("West, TX"), or an empty string when there is none. */
export function regionOf(name: string): string {
  const comma = name.indexOf(',');
  return comma === -1 ? '' : name.slice(comma + 1).trim();
}
