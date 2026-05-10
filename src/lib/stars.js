export function starsFromRating(rating) {
  if (!rating) return '';
  const full  = Math.round(rating);
  const empty = 5 - full;
  return '★'.repeat(full) + '☆'.repeat(empty);
}
