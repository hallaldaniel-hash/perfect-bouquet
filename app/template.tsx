// A template re-mounts on every navigation, so this gives each page a gentle
// fade-and-rise entrance (CSS-only; disabled under reduced-motion via globals).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-fade">{children}</div>;
}
