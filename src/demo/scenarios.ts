import configAlerts from "../../examples/config-misconfiguration/alerts.json";
import configKubernetes from "../../examples/config-misconfiguration/kubernetes-diff.json";
import configOperations from "../../examples/config-misconfiguration/operations.json";
import configRecovery from "../../examples/config-misconfiguration/recovery-diff.json";
import configManifest from "../../examples/config-misconfiguration/scenario.json";
import configTerraform from "../../examples/config-misconfiguration/terraform-plan.json";
import capacityAlerts from "../../examples/capacity-shortage/alerts.json";
import capacityKubernetes from "../../examples/capacity-shortage/kubernetes-diff.json";
import capacityOperations from "../../examples/capacity-shortage/operations.json";
import capacityRecovery from "../../examples/capacity-shortage/recovery-diff.json";
import capacityManifest from "../../examples/capacity-shortage/scenario.json";
import capacityTerraform from "../../examples/capacity-shortage/terraform-plan.json";
import unrelatedAlerts from "../../examples/unrelated-concurrent-change/alerts.json";
import unrelatedKubernetes from "../../examples/unrelated-concurrent-change/kubernetes-diff.json";
import unrelatedOperations from "../../examples/unrelated-concurrent-change/operations.json";
import unrelatedManifest from "../../examples/unrelated-concurrent-change/scenario.json";
import unrelatedTerraform from "../../examples/unrelated-concurrent-change/terraform-plan.json";
import { parseEvidenceDocument } from "../core/parser";
import type { TimelineEvent } from "../core/types";
import { parseScenarioManifest, type ScenarioManifest } from "../adapters/scenario";

export interface BuiltInScenario {
  manifest: ScenarioManifest;
  events: TimelineEvent[];
}

interface ScenarioDefinition {
  manifest: unknown;
  documents: Record<string, unknown>;
}

function materialize(definition: ScenarioDefinition): BuiltInScenario {
  const manifest = parseScenarioManifest(
    JSON.stringify(definition.manifest),
    "built-in/scenario.json",
  );
  const events = manifest.evidenceFiles.flatMap((sourceName) => {
    const document = definition.documents[sourceName];
    if (!document) {
      throw new Error(`Built-in scenario ${manifest.id} is missing ${sourceName}.`);
    }
    return parseEvidenceDocument(JSON.stringify(document), { sourceName });
  });
  return { manifest, events };
}

const scenarios = [
  materialize({
    manifest: configManifest,
    documents: {
      "terraform-plan.json": configTerraform,
      "kubernetes-diff.json": configKubernetes,
      "operations.json": configOperations,
      "alerts.json": configAlerts,
      "recovery-diff.json": configRecovery,
    },
  }),
  materialize({
    manifest: capacityManifest,
    documents: {
      "terraform-plan.json": capacityTerraform,
      "kubernetes-diff.json": capacityKubernetes,
      "operations.json": capacityOperations,
      "alerts.json": capacityAlerts,
      "recovery-diff.json": capacityRecovery,
    },
  }),
  materialize({
    manifest: unrelatedManifest,
    documents: {
      "terraform-plan.json": unrelatedTerraform,
      "kubernetes-diff.json": unrelatedKubernetes,
      "operations.json": unrelatedOperations,
      "alerts.json": unrelatedAlerts,
    },
  }),
];

export const BUILT_IN_SCENARIO_SUMMARIES = scenarios.map(({ manifest }) => ({
  id: manifest.id,
  title: manifest.title,
  description: manifest.description,
}));

export function getBuiltInScenario(id: string): BuiltInScenario {
  const scenario = scenarios.find((candidate) => candidate.manifest.id === id);
  if (!scenario) {
    throw new RangeError(`Unknown built-in scenario: ${id}`);
  }
  return structuredClone(scenario);
}
