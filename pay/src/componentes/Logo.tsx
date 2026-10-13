import { Simbolo } from './Simbolo';

// Same construction as the Cacao Media logo: symbol 1.15x the letter height, gap 0.22x,
// "cacao" at 800 and "pay" at 400, lowercase, no space. Light ground only.
// The size comes from CSS (.logo) so the header can shrink it on phones.
export function Logo() {
  return (
    <span className="logo">
      <Simbolo tamano="1.15em" decorativo />
      <span className="logo__letras">
        <b>cacao</b>pay
      </span>
    </span>
  );
}
