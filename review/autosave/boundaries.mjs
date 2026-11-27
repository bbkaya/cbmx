// Used only by the isolated review server and tests; production Vite config is untouched.
export function boundaries() {
  return { name: 'synthetic-autosave-boundaries', enforce: 'pre', resolveId(source) {
    if (source.endsWith('/auth')) return '\0autosave-auth';
    if (source.endsWith('/supabaseClient')) return '\0autosave-supabase';
  }, load(id) {
    if (id === '\0autosave-auth') return 'export function useAuth() { return {user:globalThis.__autosaveModel.user}; }';
    if (id === '\0autosave-supabase') return 'export const supabase = { rpc: (...args) => globalThis.__autosaveModel.rpc(...args), from: (...args) => globalThis.__autosaveModel.from(...args) };';
  } };
}
