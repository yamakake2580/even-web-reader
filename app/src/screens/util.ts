// A list container whose itemName array contains an empty string is rejected
// by the host as an invalid container (createStartUpPageContainer returns 1),
// which blanks the whole list - one bad entry breaks the entire screen. This
// happened in practice when a favorite failed to import (an age-gated novel
// registered with a blank title). Never emit an empty label.
export function nonEmptyLabel(label: string, fallback = '（無題）'): string {
  return label.trim().length > 0 ? label : fallback
}
