# Public Repository Sampling

Snapshot date: **2026-07-23**. Source: GitHub public repository search and the default-branch README
of each reviewed project. Star counts and activity dates are point-in-time metadata, not quality
rankings.

## Naming checks

Queries were run separately for `Infra Rewind`, `infra-rewind`, `terraform kubernetes incident
timeline`, `infrastructure incident replay`, `IaC incident postmortem`, and broader adjacent terms.
No exact `Infra Rewind` repository was returned. The slug search returned
[`jricho/cloud-rewind-infra`](https://github.com/jricho/cloud-rewind-infra), a different name with
0 stars and a last push on 2025-08-06; it had no default-branch README at inspection time. The
target `KanadeK/infra-rewind` repository did not resolve. The project therefore retains the name
**Infra Rewind** and slug **infra-rewind**.

## Ten reviewed adjacent repositories

| Repository                                                                                        | Stars | Last push  | Main capability observed in README                                                                    | Overlap with Infra Rewind                                                                                                                   |
| ------------------------------------------------------------------------------------------------- | ----: | ---------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [im2nguyen/rover](https://github.com/im2nguyen/rover)                                             | 3,310 | 2025-07-30 | Parses Terraform plans/configuration into an interactive resource graph and standalone visualization. | Shares Terraform plan ingestion and topology; it does not align operational events or replay incident-time state.                           |
| [phlx0/postmortem](https://github.com/phlx0/postmortem)                                           |     3 | 2026-05-10 | Combines Git history, file hotspots, and Sentry errors into an incident report.                       | Shares chronological evidence correlation and reporting; sources and state model are application-code focused.                              |
| [AlinaStepanov/Fusenix](https://github.com/AlinaStepanov/Fusenix)                                 |     1 | 2026-05-01 | Aggregates live CloudWatch, GitHub, Grafana, PagerDuty, and Datadog signals and offers AI analysis.   | Strong timeline overlap; Infra Rewind is deterministic, offline, IaC-state focused, and does not require credentials or an LLM.             |
| [dreameraiquest/IncidentIQ](https://github.com/dreameraiquest/IncidentIQ)                         |     2 | 2026-05-12 | Multi-agent log analysis, evidence extraction, RCA suggestions, runbooks, and workflow integrations.  | Shares evidence-backed hypotheses; it centers LLM orchestration rather than deterministic infrastructure replay.                            |
| [nbshah3/incident-postmortem-ai](https://github.com/nbshah3/incident-postmortem-ai)               |     1 | 2026-01-23 | Deterministic log/metric ingestion, timeline reconstruction, hypothesis ranking, and report bundles.  | Closest report/scoring neighbor; Infra Rewind narrows to Terraform/Kubernetes mutations and reconstructs resource state at arbitrary times. |
| [jtprogru/srekit](https://github.com/jtprogru/srekit)                                             |     7 | 2026-07-21 | Generates structured bilingual SRE artifacts, including postmortems and investigation logs.           | Shares reproducible reports; it is a template/artifact system rather than an evidence analysis engine.                                      |
| [KeyMoad/incident-postmortem-generator](https://github.com/KeyMoad/incident-postmortem-generator) |     4 | 2025-12-23 | Validates YAML/JSON incident records and exports standardized Markdown, JSON, and CSV.                | Shares schema validation and export; it does not derive relationships, scores, or historical resource states.                               |
| [incidentalhq/incidental](https://github.com/incidentalhq/incidental)                             |   563 | 2024-12-27 | Slack-centered incident declaration, roles, severities, status pages, and management UI.              | Shares incident context, but its scope is response coordination rather than forensic infrastructure replay.                                 |
| [eslupmi/impulse](https://github.com/eslupmi/impulse)                                             |    98 | 2026-07-22 | ChatOps incident management that accepts alert webhooks and messenger integrations.                   | Shares alert intake; it manages live response workflows instead of reconstructing IaC state and evidence.                                   |
| [oslabs-beta/notikube](https://github.com/oslabs-beta/notikube)                                   |    25 | 2024-02-17 | Manages Prometheus-derived Kubernetes incidents with cluster metrics and incident history.            | Shares Kubernetes alerts and incident history; it does not ingest Terraform/Kubernetes diffs or rewind resource state.                      |

## Differentiation decision

No reviewed project exceeded an estimated 70% overlap with the MVP contract. The strongest
neighbors either visualize one IaC snapshot, aggregate live observability sources, or generate
postmortem artifacts. Infra Rewind keeps a narrower, testable promise:

1. deterministic offline import of Terraform plan, Kubernetes diff, deployment, alert, and rollback
   evidence;
2. temporal resource-state replay rather than only a chronological feed;
3. transparent scoring from time proximity, resource relationships, and mutation risk; and
4. exports that separate observed facts, bounded inferences, and unresolved unknowns.

This is a public-repository sample, not a claim of global uniqueness.
