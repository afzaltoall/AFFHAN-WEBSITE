/**
 * One scale for both auth forms.
 *
 * PasswordAuthForm and SignupForm each carried their own `inputClass` and
 * their own vertical rhythm — space-y-4 with py-3 inputs and 13px labels on
 * one, space-y-2.5 with py-2 inputs and 12px labels on the other. On /login
 * that is invisible, because you only ever see one at a time. In the login
 * modal you switch between them with a link, and every field visibly changed
 * size when you did.
 *
 * Keeping the strings here is the only thing that stops them drifting again.
 */

/** Vertical rhythm inside a form. */
export const authStack = "space-y-3";

/** The label above a field. */
export const authLabel = "mb-1 block text-[12.5px] font-semibold text-slate-700";

/**
 * A text input. 44px tall at this padding, which is the minimum comfortable
 * touch target and also what keeps iOS from zooming on focus — that needs the
 * text at 16px, so `text-base` on small screens, `sm:text-sm` above.
 */
export const authInput =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand/10";

/** The one action that submits the form. */
export const authPrimaryButton =
  "flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-brand-dark hover:shadow active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:bg-brand cursor-pointer";

/** "New to Affhan? Create an account" — the way off this screen. */
export const authSwitchRow = "text-center text-[13px] text-slate-500";
export const authSwitchLink =
  "font-semibold text-brand-dark underline-offset-2 transition-colors hover:text-brand hover:underline cursor-pointer";

/** Inline validation and server errors. */
export const authFieldError = "mt-1.5 block text-[12px] font-medium text-red-600";
export const authFormError =
  "rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-[12.5px] font-medium text-red-700";
