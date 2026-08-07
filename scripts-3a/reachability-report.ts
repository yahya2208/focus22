import { ALL_SCREEN_NAMES } from '../src/store/navigation';
import { EDGES, assertNoOrphans, assertNoDeadEnds, isEdgeComplete } from '../src/core/navigation/reachability';

const routes = ALL_SCREEN_NAMES.length;
const orphans = assertNoOrphans(EDGES);
const deadEnds = assertNoDeadEnds();
const complete = isEdgeComplete(EDGES);

const totalEdges = Object.values(EDGES).reduce((n, s) => n + s.length, 0);
const distinctIncoming = new Set<string>();
for (const [, sources] of Object.entries(EDGES)) for (const s of sources) distinctIncoming.add(s);
const deepLinkOnly = Object.entries(EDGES).filter(([, s]) => s.length === 1 && s[0] === 'deep-link').map(([k]) => k);

console.log(`Routes: ${routes}`);
console.log(`Reachable (has >=1 inbound edge): ${routes - orphans.length}`);
console.log(`Orphans: ${orphans.length} ${orphans.length ? '→ ' + orphans.join(', ') : ''}`);
console.log(`Dead Ends (no back target): ${deadEnds.length} ${deadEnds.length ? '→ ' + deadEnds.join(', ') : ''}`);
console.log(`isEdgeComplete: ${complete}`);
console.log(`Total inbound edges: ${totalEdges}`);
console.log(`Distinct edge sources: ${distinctIncoming.size}`);
console.log(`Screens reachable ONLY via deep-link: ${deepLinkOnly.length ? deepLinkOnly.join(', ') : 'none'}`);
console.log(`Cycles (screens whose back target itself points back, by BACK_MATRIX pair) — see back-matrix; no self-loops by construction.`);
