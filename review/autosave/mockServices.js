// Synthetic services shared by isolated browser review and delayed-response tests.
// No environment, credentials, Supabase client, or network is used.
export function makeServices(cbmx, pcb) {
  const clone = value => structuredClone(value);
  const ok = data => ({ data: clone(data), error: null });
  const row = (id, blueprint) => ({ id, owner_user_id: 'owner-id', name: blueprint.meta.name,
    blueprint_json: clone(blueprint), version_no: 1, updated_at: '2026-11-27T12:00:00Z' });
  const model = { user: { id: 'owner-id' }, role: 'owner', hold: true, pending: [], calls: [],
    rows: { cbmx: row('cbmx', cbmx), pcb: row('pcb', pcb) }, nameQuery: null, links: [],
    from(table) {
      let id, inserted;
      const query = { select() { return query; }, eq(key, value) { if (key === 'id') id = value; return query; },
        ilike() { return query; }, insert(value) { inserted = value; return query; },
        async single() {
          if (inserted) {
            model.calls.push({ name: 'createPCB', args: clone(inserted) });
            return await new Promise(resolve => model.pending.push({ finish(outcome = 'ok') {
              if (outcome !== 'ok') return resolve({ data: null, error: { message: 'Synthetic create failure' } });
              const created = row('created', inserted.blueprint_json); model.rows.created = created; resolve(ok(created));
            } }));
          }
          return ok(model.rows[id] ?? model.rows[table === 'blueprints' ? 'cbmx' : 'pcb']);
        },
        async maybeSingle() { return ok(table === 'cbmx_process_links' ? null : { role: model.role }); },
        then(resolve, reject) { return (model.nameQuery ? model.nameQuery() : Promise.resolve(ok([]))).then(resolve, reject); },
      }; return query;
    },
    async rpc(name, args) {
      model.calls.push({ name, args: clone(args) });
      if (name === 'list_cbmx_process_links_with_access') return ok(model.links);
      if (name === 'get_cbmx_process_canvas_options') return ok({ current_canvas: null, canvases: [{ id: 'pcb', name: 'Synthetic Canvas', role: 'owner' }] });
      if (name === 'link_available_cbmx_process_canvas') return ok([]);
      if (!['save_blueprint_with_version', 'save_process_canvas_blueprint_with_version'].includes(name)) throw new Error('Unexpected synthetic RPC: ' + name);
      const id = args.p_blueprint_id ?? args.p_process_canvas_blueprint_id;
      const target = model.rows[id];
      const operation = { finish(outcome = 'ok') {
        if (outcome === 'network' || outcome === 'duplicate') return { data: null, error: {
          code: outcome === 'duplicate' ? '23505' : 'NETWORK', message: 'Synthetic ' + outcome + ' failure' } };
        if (outcome !== 'ok') return ok([{ ok: false, reason: outcome }]);
        if (target.version_no !== args.p_loaded_version_no) return ok([{ ok: false, reason: 'stale' }]);
        target.blueprint_json = clone(args.p_blueprint_json); target.name = args.p_name; target.version_no++;
        return ok([{ ...target, ok: true, reason: 'ok' }]);
      } };
      if (!model.hold) return operation.finish();
      return await new Promise(resolve => model.pending.push({ finish: outcome => resolve(operation.finish(outcome)) }));
    },
    finish(outcome = 'ok') { const operation = model.pending.shift(); if (!operation) throw new Error('No pending save'); operation.finish(outcome); },
  };
  return model;
}
