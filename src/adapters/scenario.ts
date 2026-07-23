import { z } from "zod";
import { AdapterError } from "./errors";

const replayCheckSchema = z.object({
  at: z.string().min(1),
  resourceId: z.string().min(1),
  path: z.string().min(1),
  equals: z.unknown(),
});

export const scenarioManifestSchema = z.object({
  schema: z.literal("infra-rewind/scenario@1"),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  evidenceFiles: z.array(z.string().min(1)).min(1),
  defaultReplayAt: z.string().min(1),
  expected: z.object({
    topCandidateId: z.string().min(1).nullable(),
    maxCandidateScore: z.number().min(0).max(100).optional(),
    replayChecks: z.array(replayCheckSchema).min(1),
  }),
});

export type ScenarioManifest = z.infer<typeof scenarioManifestSchema>;

export function parseScenarioManifest(input: string, source: string): ScenarioManifest {
  let value: unknown;
  try {
    value = JSON.parse(input) as unknown;
  } catch (error) {
    throw new AdapterError("INVALID_MANIFEST", source, `Could not parse ${source}.`, {
      cause: error,
    });
  }

  const result = scenarioManifestSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AdapterError(
      "INVALID_MANIFEST",
      source,
      `Invalid scenario manifest at ${issue?.path.join(".") || "$"}: ${issue?.message ?? "unknown schema error"}.`,
    );
  }
  return result.data;
}
