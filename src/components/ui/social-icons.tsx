import React from "react";

export function InstagramIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <defs>
        <linearGradient id="instagram-gradient-global" x1="4" x2="20" y1="20" y2="4">
          <stop stopColor="#feda75" />
          <stop offset="0.32" stopColor="#fa7e1e" />
          <stop offset="0.62" stopColor="#d62976" />
          <stop offset="1" stopColor="#4f5bd5" />
        </linearGradient>
      </defs>
      <rect height="17" rx="5" stroke="url(#instagram-gradient-global)" strokeWidth="2" width="17" x="3.5" y="3.5" />
      <circle cx="12" cy="12" r="3.6" stroke="url(#instagram-gradient-global)" strokeWidth="2" />
      <circle cx="17" cy="7" fill="#d62976" r="1.2" />
    </svg>
  );
}

export function LinkedinIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="#0A66C2" viewBox="0 0 24 24">
      <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2ZM8.34 18H5.67v-8.6h2.67V18ZM7 8.23a1.55 1.55 0 1 1 0-3.1 1.55 1.55 0 0 1 0 3.1ZM18.33 18h-2.66v-4.18c0-1-.02-2.28-1.39-2.28-1.39 0-1.6 1.08-1.6 2.2V18h-2.66v-8.6h2.55v1.18h.04c.36-.68 1.23-1.39 2.52-1.39 2.69 0 3.2 1.77 3.2 4.08V18Z" />
    </svg>
  );
}

export function YouTubeIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M21.58 7.19a2.74 2.74 0 0 0-1.93-1.94C17.95 4.8 12 4.8 12 4.8s-5.95 0-7.65.45a2.74 2.74 0 0 0-1.93 1.94A28.5 28.5 0 0 0 2 12a28.5 28.5 0 0 0 .42 4.81 2.74 2.74 0 0 0 1.93 1.94c1.7.45 7.65.45 7.65.45s5.95 0 7.65-.45a2.74 2.74 0 0 0 1.93-1.94A28.5 28.5 0 0 0 22 12a28.5 28.5 0 0 0-.42-4.81Z" fill="#FF0000" />
      <path d="m10.2 15.2 5.2-3.2-5.2-3.2v6.4Z" fill="white" />
    </svg>
  );
}

export function FacebookIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" fill="#1877F2" r="10" />
      <path d="M14.64 12.58h-1.74V19h-2.66v-6.42H8.9v-2.26h1.34V8.86c0-1.11.53-2.86 2.86-2.86l2.1.01v2.34h-1.52c-.25 0-.78.13-.78.85v1.12h2.25l-.51 2.26Z" fill="white" />
    </svg>
  );
}

export function TiktokIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="#000000" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 2.23-1.15 4.19-2.77 5.48-1.5 1.19-3.4 1.6-5.3 1.25-1.92-.35-3.5-1.58-4.47-3.19-1.04-1.74-1.15-3.88-.41-5.74.69-1.73 2.1-3.1 3.84-3.66 1.1-.35 2.27-.42 3.4-.23v4.13c-.94-.13-1.94.13-2.65.75-.76.66-1.11 1.7-1 2.68.12.98.81 1.83 1.7 2.15 1.05.38 2.29.23 3.12-.52.79-.7 1.19-1.77 1.19-2.85V.02z" />
    </svg>
  );
}

export function TwitterXIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="#000000">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}
