"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main id="main" className="workspace"><h1>We couldn’t open this page</h1><p>Try again shortly. If this continues, contact CODEEDGE support.</p><Button onClick={reset}>Try again</Button></main>; }
