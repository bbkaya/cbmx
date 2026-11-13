
DO $$
DECLARE
  fn record;
  fn_signature text;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name, p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS identity_args,
           p.prorettype::regtype::text AS return_type
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    fn_signature := format('%I.%I(%s)', fn.schema_name, fn.function_name, fn.identity_args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn_signature);
    IF fn.return_type IN ('trigger', 'event_trigger') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn_signature);
    END IF;
  END LOOP;
END $$;
