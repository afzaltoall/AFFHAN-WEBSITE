/**
 * The console's palette, as a set of class names.
 *
 * Lifted out of AdminConsole when a second screen — the rotation Queue —
 * needed the same assignment picker, and the picker needed the same tokens.
 * The console still builds its own object inline, light or dark by preference;
 * this is the shape they both satisfy, and the light set for the pages that do
 * not offer a dark mode.
 */
export interface Theme {
  page: string; sidebar: string; sidebarOpen: string; card: string; soft: string; strong: string;
  /**
   * Between `soft` and `strong`. Row metadata — a customer's name, phone,
   * email — is not a caption; it is the content people scan a list for. At
   * #86868b it washed out against white and every list read as greyed-out
   * placeholder text.
   */
  mid: string;
  border: string; divide: string; hover: string; navIdle: string; navActive: string;
  input: string; chip: string; pill: string; thumb: string; qty: string;
  overlay: string; modal: string;
}

export const LIGHT_THEME: Theme = {
  page: "bg-[#f5f5f7] text-[#1d1d1f]", sidebar: "bg-white/80 border-black/[0.06]",
  sidebarOpen: "bg-white border-black/[0.06]",
  card: "bg-white ring-black/[0.04]", soft: "text-[#86868b]", mid: "text-[#48484a]", strong: "text-[#1d1d1f]",
  border: "border-black/[0.06]", divide: "divide-black/[0.06]", hover: "hover:bg-black/[0.015]",
  navIdle: "text-[#515154] hover:bg-black/[0.03]", navActive: "bg-[#ececed] text-[#1d1d1f]",
  input: "bg-[#f5f5f7] text-[#1d1d1f] placeholder:text-[#86868b]", chip: "bg-black/[0.06] text-[#86868b]",
  pill: "bg-white text-[#1d1d1f] ring-black/[0.06] hover:bg-black/[0.02]", thumb: "bg-[#f5f5f7]",
  qty: "bg-brand/10 text-brand-dark", overlay: "bg-slate-900/50", modal: "bg-white text-[#1d1d1f] ring-black/[0.06]",
};

/** An active member of staff a lead can be handed to. */
export interface EmployeeOption {
  id: string;
  name: string;
  region: string | null;
  image: string | null;
}
