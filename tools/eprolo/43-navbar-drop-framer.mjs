import fs from 'node:fs';

// Replaces framer-motion in the Navbar with CSS transitions.
//
//   node tools/eprolo/43-navbar-drop-framer.mjs
//
// The Navbar sits in the root layout, so its 132 KB framer-motion chunk was
// parsed on every page of the site — to hide the bar on scroll, slide a drawer
// in, and wrap a dropdown in an AnimatePresence whose children have no motion
// props at all. All three are plain CSS transitions.
//
// The drawer keeps its exit animation by mounting on first open and then
// staying mounted, toggling classes. Mounting lazily rather than always matters
// because "excessive DOM size" is one of the audits being worked on: the
// drawer's contents cost nothing until someone opens the menu.

const f = 'src/components/sections/Navbar.tsx';
let s = fs.readFileSync(f, 'utf8');
const sub = (from, to, expect = 1) => {
  const n = s.split(from).length - 1;
  if (n !== expect) { console.error(`expected ${expect}, got ${n} for:\n  ${from.slice(0, 110)}`); process.exit(1); }
  s = s.split(from).join(to);
};

// 1. The import.
sub(`import { AnimatePresence, motion } from "framer-motion";\n`, '');

// 2. The bar itself: a spring on translateY becomes a CSS transition. The
//    spring's overshoot is not perceptible on a 64px bar that only ever moves
//    fully in or fully out.
sub(
  `      <motion.nav
        initial={false}
        animate={{ y: hidden ? "-100%" : "0%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="fixed top-0 w-full z-[100] bg-white shadow-sm border-b border-slate-100"
      >`,
  `      <nav
        style={{ transform: hidden ? "translateY(-100%)" : "translateY(0)" }}
        className="fixed top-0 w-full z-[100] bg-white shadow-sm border-b border-slate-100 transition-transform duration-300 ease-out motion-reduce:transition-none"
      >`,
);
sub(`      </motion.nav>`, `      </nav>`);

// 3. This AnimatePresence wrapped plain divs — no initial/animate/exit anywhere
//    inside it, so it animated nothing and only cost the import.
sub(`                <AnimatePresence>\n`, '');
sub(`                </AnimatePresence>\n`, '');

// 4. The drawer.
sub(
  `      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="fixed inset-0 z-[110] lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={() => setMobileMenuOpen(false)} />
            <motion.aside
              className="absolute right-0 top-0 flex h-full w-[86%] max-w-sm flex-col overflow-hidden rounded-l-3xl bg-white shadow-2xl"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >`,
  `      {drawerMounted && (
        <div
          className={\`fixed inset-0 z-[110] transition-opacity duration-200 lg:hidden \${mobileMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"}\`}
          aria-hidden={!mobileMenuOpen}
        >
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={() => setMobileMenuOpen(false)} />
          <aside
            className={\`absolute right-0 top-0 flex h-full w-[86%] max-w-sm flex-col overflow-hidden rounded-l-3xl bg-white shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none \${mobileMenuOpen ? "translate-x-0" : "translate-x-full"}\`}
          >`,
);
sub(
  `            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>`,
  `          </aside>
        </div>
      )}`,
);

// 5. Mount the drawer the first time it is opened, and never unmount it, so the
//    closing transition has something to run on.
sub(
  `  const [hidden, setHidden] = useState(false);`,
  `  const [hidden, setHidden] = useState(false);
  // The drawer renders nothing until first opened; after that it stays in the
  // DOM so its slide-out transition has an element to animate.
  const [drawerMounted, setDrawerMounted] = useState(false);`,
);

fs.writeFileSync(f, s);
console.log('Navbar no longer imports framer-motion');
