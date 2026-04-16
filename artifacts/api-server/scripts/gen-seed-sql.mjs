/**
 * Generates SQL for seeding the exercise_library table.
 * Run: node scripts/gen-seed-sql.mjs
 */
import { readFileSync } from 'fs';

const seedContent = readFileSync(new URL('./seed-exercises.ts', import.meta.url), 'utf8');

// Extract the EXERCISES array content between the first [ after EXERCISES = and the matching ]
const match = seedContent.match(/const EXERCISES[^=]*=\s*(\[[\s\S]*\]);?\s*(?:async function|\/\/)/);
if (!match) {
  console.error('Could not find EXERCISES array');
  process.exit(1);
}

let arrayContent = match[1];

// Evaluate as JS (the TS type annotations are already stripped by extracting just the array)
let EXERCISES;
try {
  EXERCISES = eval(arrayContent);
} catch (e) {
  console.error('Failed to eval EXERCISES:', e.message);
  process.exit(1);
}

if (!EXERCISES || !Array.isArray(EXERCISES)) {
  console.error('EXERCISES not found or not an array');
  process.exit(1);
}

process.stderr.write(`Generating SQL for ${EXERCISES.length} exercises...\n`);

function pgStr(s) {
  if (s === undefined || s === null) return 'NULL';
  return `'${String(s).replace(/'/g, "''")}'`;
}

function pgBool(b) {
  return b ? 'true' : 'false';
}

function pgArr(arr) {
  if (!arr || arr.length === 0) return "'{}'";
  const items = arr.map(s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "''"));
  return `'{${items.join(',')}}'`;
}

const values = EXERCISES.map(ex => 
  `(${[
    pgStr(ex.name),
    pgStr(ex.movementPattern),
    pgStr(ex.bodyRegion),
    pgStr(ex.role),
    pgBool(ex.unilateral),
    pgStr(ex.primaryMuscle),
    pgArr(ex.secondaryMuscles),
    pgArr(ex.equipment),
    pgStr(ex.difficultyLevel),
    pgStr(ex.neuralDemand),
    pgStr(ex.timeCost),
    pgArr(ex.intentTags),
    pgArr(ex.sportTransferTags),
    pgArr(ex.jointStressProfile),
    pgArr(ex.tags),
    pgStr(ex.clusterId),
    pgArr(ex.easierVariations),
    pgArr(ex.harderVariations),
    pgStr(ex.description),
    'true'
  ].join(',')})`
).join(',\n');

const sql = `INSERT INTO exercise_library
  (name, movement_pattern, body_region, role, unilateral, primary_muscle, secondary_muscles, equipment, difficulty_level, neural_demand, time_cost, intent_tags, sport_transfer_tags, joint_stress_profile, tags, cluster_id, easier_variations, harder_variations, description, is_active)
VALUES
${values}
ON CONFLICT (name) DO UPDATE SET
  movement_pattern = excluded.movement_pattern,
  body_region = excluded.body_region,
  role = excluded.role,
  unilateral = excluded.unilateral,
  primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  equipment = excluded.equipment,
  difficulty_level = excluded.difficulty_level,
  neural_demand = excluded.neural_demand,
  time_cost = excluded.time_cost,
  intent_tags = excluded.intent_tags,
  sport_transfer_tags = excluded.sport_transfer_tags,
  joint_stress_profile = excluded.joint_stress_profile,
  tags = excluded.tags,
  cluster_id = excluded.cluster_id,
  easier_variations = excluded.easier_variations,
  harder_variations = excluded.harder_variations,
  description = excluded.description,
  is_active = excluded.is_active;`;

process.stdout.write(sql + '\n');
