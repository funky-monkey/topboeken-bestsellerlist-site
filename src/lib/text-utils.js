const SMALL = new Set(['a','an','the','and','but','or','for','nor','on','at','to','by','in','of','up','as','via','with','from','into','than','yet','so']);

export function titleCase(str) {
  if (!str) return str;
  return str
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (!word) return word;
      // Always capitalise first/last word; lowercase small words in the middle
      if (i > 0 && SMALL.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
