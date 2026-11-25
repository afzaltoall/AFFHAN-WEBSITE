/**
 * Christmas 2026: the header's logo wears the owner's Santa hat (the owner, 2026-11-25: "use this logo on website now
 * affhan logo ... do some animation on the christmas hat live waving"). The navbar and the phone frame's header draw
 * ChristmasLogo while this is true, and public/logo.png again once it is false. Nothing else reads it.
 */
export const CHRISTMAS_LOGO = true;

/**
 * The logo and its hat in five tiles on one frame (scripts/build_christmas_logo.mjs): what ChristmasLogo's CSS draws.
 * Its address is written out again in christmas-logo.css, which cannot import it.
 */
export const CHRISTMAS_LOGO_LAYERS = "/affhan-christmas-layers.webp";
