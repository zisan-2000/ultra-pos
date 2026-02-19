import assert from "node:assert/strict";

export const INTEGRATION_SCENARIO_FLAG = "RUN_INTEGRATION_SCENARIOS";

export type IntegrationPhase = "arrange" | "act" | "assert" | "cleanup";

export type IntegrationStep = {
  phase: IntegrationPhase;
  description: string;
};

export type IntegrationScenario = {
  id: string;
  title: string;
  entrypoint: string;
  steps: IntegrationStep[];
};

export function isIntegrationScenarioEnabled() {
  return process.env[INTEGRATION_SCENARIO_FLAG] === "1";
}

export function logIntegrationScenarioSkip(suiteName: string) {
  console.log(`\n[Suite] ${suiteName}`);
  console.log(
    `  SKIP scaffold-only suite. Set ${INTEGRATION_SCENARIO_FLAG}=1 to run it.`
  );
}

export function assertIntegrationScenarioShape(
  scenario: IntegrationScenario,
  requiredPhases: IntegrationPhase[] = ["arrange", "act", "assert"]
) {
  assert.ok(scenario.id.trim().length > 0, "scenario id is required");
  assert.ok(scenario.title.trim().length > 0, "scenario title is required");
  assert.ok(
    scenario.entrypoint.trim().length > 0,
    "scenario entrypoint is required"
  );
  assert.ok(scenario.steps.length > 0, "scenario must define at least one step");

  const definedPhases = new Set(scenario.steps.map((step) => step.phase));
  for (const phase of requiredPhases) {
    assert.equal(
      definedPhases.has(phase),
      true,
      `scenario "${scenario.id}" must include phase "${phase}"`
    );
  }
}
