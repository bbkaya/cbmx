import { createContext } from "react";
import type { AdminAccessController } from "./AdminAccessController";

export const AdminAccessContext = createContext<AdminAccessController | null>(null);
