const categories = ['Financial', 'Environmental', 'Social', 'OtherNonFinancial'];
const names = ['Customer organization', 'Network coordinator', 'Service delivery partner', 'Community association',
  'Technology provider', 'Research partner', 'Infrastructure provider', 'Support organization', 'Regional network', 'Independent evaluator'];

export const processLinks = [
  { cbmx_process_id: 'P1', link_exists: true, has_pcb_access: true, pcb_access_role: 'owner',
    process_canvas_blueprint_id: 'synthetic-1',
    process_canvas_blueprint_name: 'Service coordination and cross-organization exception resolution' },
  { cbmx_process_id: 'P2', link_exists: true, has_pcb_access: false, pcb_access_role: null,
    process_canvas_blueprint_id: null, process_canvas_blueprint_name: null },
];

export function fixture(count, density = 'sparse') {
  const dense = density === 'dense';
  const empty = density === 'empty';
  const actors = Array.from({ length: count }, (_, index) => {
    const outcomes = (benefits) => categories.flatMap((type, category) => {
      const description = (benefits
        ? ['Lower operating costs', 'Reduced resource use', 'Improved accessibility', 'Knowledge sharing']
        : ['Participation fees', 'Resource consumption', 'Additional workload', 'Coordination effort'])[category];
      const items = Array.from({ length: dense && !benefits && index === 2 ? 3 : 1 }, (_, item) => ({ type,
        description: description + (dense && !benefits
          ? ' associated with supporting a geographically distributed network and responding to changing requirements' : '')
          + (item ? ` — item ${item + 1}` : '') }));
      return dense ? items.flatMap(item => [item, { ...item, description: item.description + (benefits
        ? ' through coordinated delivery and continuous service improvement' : ' — follow-up assessment') }]) : items;
    });
    return {
      id: `A${index + 1}`, type: index === 0 ? 'Customer' : index === 1 ? 'Orchestrator' : 'Other',
      name: names[index] + (dense ? ' with a deliberately long organization name' : ''),
      actorValueProposition: { statement: dense
        ? 'Coordinate complementary capabilities, resolve exceptions and deliver consistent services across organizational boundaries, including customers with different access and support needs.'
        : 'Contribute expertise and services to deliver shared value.' },
      costs: empty ? [{ type: 'Financial', description: '' }] : dense ? outcomes(false) : outcomes(false).slice(0, 1),
      benefits: empty ? [{ type: 'Financial', description: '' }] : dense ? outcomes(true) : outcomes(true).slice(0, 1),
      kpis: empty ? [] : [
        { rank: 2, name: 'Service reliability (≥ 95% on-time)' },
        { rank: 1, name: 'Customer satisfaction (≥ 4.5/5)' },
        ...(dense ? [{ rank: 3, name: 'Exception resolution (at least 90% within two working days)' }] : []),
      ].slice(0, dense ? 3 : index % 2 ? 1 : 2),
      services: empty ? [] : [
        { name: 'Request management', operations: [{ name: 'Request intake' }, { name: 'Status updates' }] },
        ...(dense ? [{ name: 'Coordination and support', operations: [
          { name: 'Exception handling across organizations and specialist teams' }, { name: 'Partner communication' },
        ] }] : []),
      ],
    };
  });
  const processes = [
    { id: 'P1', name: dense
      ? 'Coordinate complex requests and resolve exceptions through joint assessment and delivery planning'
      : 'Coordinate service requests', participantActorIds: actors.map(actor => actor.id) },
    { id: 'P2', name: 'Deliver and evaluate services', participantActorIds: ['A1', 'A2'] },
    { id: 'P3', name: 'Improve network capabilities', participantActorIds: ['A2'] },
  ];
  return {
    meta: { name: 'Collaborative services — synthetic example' },
    networkValueProposition: {
      statement: 'Make essential services reliable, accessible and sustainable through a collaborative network of organizations.',
    },
    actors, coCreationProcesses: empty ? [] : dense ? processes : processes.slice(0, 2),
    serviceScenario: 'A customer requests a service. The coordinator brings together the participating organizations and shares the information needed to deliver it.\n\nThe network reviews outcomes and improves its services.',
  };
}
