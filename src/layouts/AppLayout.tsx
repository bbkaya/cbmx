// src/layouts/AppLayout.tsx
import { Outlet } from "react-router-dom";
import SiteShell from "../layouts/SiteShell";

export default function AppLayout() {
  return (
    <SiteShell>
      <Outlet />
    </SiteShell>
  );
}