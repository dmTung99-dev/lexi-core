/** Small ring spinner in the current text colour; see `.spinner` in bloom.css.
 * `inline` adds a gap for use before a text label. */
export function Spinner({ inline = false }: { inline?: boolean }) {
  return <span className={inline ? "spinner spinner-inline" : "spinner"} aria-hidden="true" />;
}
