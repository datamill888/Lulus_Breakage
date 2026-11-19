import { useUser } from "@incorta/auth/react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import App from "@/App";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OSC Breakage" },
      { name: "description", content: "Online store credit breakage estimate by issuance year, GL 4065 / 2231." },
    ],
  }),
  component: Index,
});

// The workspace lives in this browser's storage and the tab comes from the URL hash,
// so the app renders on the client only; the server sends the loading frame.
function Index() {
  const user = useUser();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="min-h-screen" aria-busy="true" />;
  return <App user={user?.name ?? undefined} />;
}
