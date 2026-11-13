import AdminOverview from "../admin/AdminOverview";
import BlueprintInventory from "../admin/BlueprintInventory";
import UserInventory from "../admin/UserInventory";
import "../admin/admin.css";

export default function AdminDashboardPage() {
  return <div className="admin-dashboard">
    <header className="admin-page-heading"><h1>Administrator Dashboard</h1>
      <p>Read-only reporting for CBMX and Process Canvas.</p></header>
    <AdminOverview /><BlueprintInventory /><UserInventory />
  </div>;
}
