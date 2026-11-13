
ALTER FUNCTION public.blueprint_role_for_user(uuid, uuid) SET search_path = '';
ALTER FUNCTION public.pcb_role_for_user(uuid, uuid) SET search_path = '';
ALTER FUNCTION public.can_read_blueprint(uuid, uuid) SET search_path = '';
ALTER FUNCTION public.can_edit_blueprint(uuid, uuid) SET search_path = '';
ALTER FUNCTION public.can_own_blueprint(uuid, uuid) SET search_path = '';
ALTER FUNCTION public.can_read_pcb(uuid, uuid) SET search_path = '';
ALTER FUNCTION public.can_edit_pcb(uuid, uuid) SET search_path = '';
ALTER FUNCTION public.can_own_pcb(uuid, uuid) SET search_path = '';
ALTER FUNCTION public.set_last_seen_at() SET search_path = '';
ALTER FUNCTION public.bump_blueprint_version() SET search_path = '';
ALTER FUNCTION public.bump_pcb_version() SET search_path = '';
ALTER FUNCTION public.bump_version_and_updated_at() SET search_path = '';
ALTER FUNCTION public.set_updated_at() SET search_path = '';
