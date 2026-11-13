import { useEffect, useState } from "react";
import type { UserSearchParams } from "./adminTypes";

export function useAdminQuery<T extends UserSearchParams>(initial: T) {
  const [query, setQuery] = useState(initial);
  const [searchInput, setSearchInput] = useState(initial.search);
  useEffect(() => {
    if (searchInput === query.search) return;
    const timer = window.setTimeout(() => {
      setQuery((previous) => ({ ...previous, search: searchInput, page: 1 }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, query.search]);
  return { query, setQuery, searchInput, setSearchInput };
}
