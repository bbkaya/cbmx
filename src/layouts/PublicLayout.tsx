// src/layouts/PublicLayout.tsx
import { Outlet } from "react-router-dom";
import SiteShell from "../layouts/SiteShell";

export default function PublicLayout() {
  return (
    <SiteShell>
      <Outlet />
    </SiteShell>
  );
}