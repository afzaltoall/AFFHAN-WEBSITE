/**
 * Whether the visitor has moved between this site's pages since it loaded, so a title bar's back arrow can go
 * back a page without ever leaving the site: back when there is a page of ours behind this one, and to the
 * page's parent otherwise (someone who opened My AFFHAN straight from a link). The phone frame, which stays
 * mounted from page to page (PhoneChrome), counts the moves.
 */
let moves = 0;

export function noteInSiteMove(): void {
  moves += 1;
}

export function hasInSiteHistory(): boolean {
  return moves > 0;
}
