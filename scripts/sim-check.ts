// Dev check: play a demo level's solver line through createSim and print the events.
import { createSim } from '../src/core/sim';
import { Solver } from '../src/core/solver';
import { TACO_DEMO } from '../src/app/levels';
const sim = createSim(TACO_DEMO);
const line = new Solver(sim.currentRules()).solution(sim.state());
console.log('solution', line?.map((c) => c + 1).join(','));
for (const c of line ?? []) console.log(c + 1, JSON.stringify(sim.take(c)));
