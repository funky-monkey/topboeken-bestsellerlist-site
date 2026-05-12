// Map Open Library subject strings → our 14 genre slugs
const RULES = [
  { slug: 'fictie',          terms: ['fiction', 'roman', 'novel', 'literature'] },
  { slug: 'thriller',        terms: ['thriller', 'mystery', 'crime', 'detective', 'suspense', 'misdaad'] },
  { slug: 'fantasy',         terms: ['fantasy', 'magic', 'wizard', 'dragon', 'fantastisch'] },
  { slug: 'science-fiction', terms: ['science fiction', 'sci-fi', 'dystopia', 'dystopian', 'space', 'futuristic'] },
  { slug: 'romance',         terms: ['romance', 'love stories', 'romantic'] },
  { slug: 'horror',          terms: ['horror', 'gothic', 'supernatural', 'ghost'] },
  { slug: 'biografie',       terms: ['biography', 'autobiography', 'memoir', 'biografie'] },
  { slug: 'kinderen',        terms: ['juvenile', "children's", 'picture book', 'kinderboek', 'kids'] },
  { slug: 'young-adult',     terms: ['young adult', 'ya fiction', 'teen'] },
  { slug: 'non-fictie',      terms: ['nonfiction', 'non-fiction', 'history', 'self-help', 'true story'] },
  { slug: 'zelfhulp',        terms: ['self-help', 'self help', 'personal development', 'motivation', 'zelfhulp'] },
  { slug: 'kookboeken',      terms: ['cooking', 'cookbooks', 'recipes', 'food', 'kookboek'] },
  { slug: 'business',        terms: ['business', 'economics', 'management', 'entrepreneurship', 'finance'] },
  { slug: 'comics',          terms: ['comics', 'graphic novel', 'manga', 'strip'] },
];

/**
 * Given an array of Open Library subject strings,
 * return matching genre slugs from our taxonomy.
 */
export function mapSubjectsToGenres(subjects = []) {
  if (!subjects?.length) return [];
  const lower = subjects.map(s => s.toLowerCase());
  const matched = new Set();

  for (const rule of RULES) {
    for (const term of rule.terms) {
      if (lower.some(s => s.includes(term))) {
        matched.add(rule.slug);
        break;
      }
    }
  }

  return [...matched];
}
