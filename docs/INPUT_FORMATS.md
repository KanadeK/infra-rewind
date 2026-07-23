# Input Formats

Infra Rewind v0.1.0 accepts JSON. Zod schemas reject malformed or ambiguous input before it reaches
analysis. All timestamps must be parseable ISO-compatible values and are normalized to UTC.

## Terraform plan

This adapter accepts the relevant shape of `terraform show -json`:

- required: `format_version`, `resource_changes[]`;
- each resource change needs `address`, `type`, `name`, and `change.actions/before/after`;
- time is selected from top-level `timestamp`, `infra_rewind.recorded_at`, or adapter
  `recordedAt`, in that order;
- optional `infra_rewind.id` gives the event a stable fixture ID;
- no-op/read actions are ignored; delete+create normalizes to replacement.

Infra Rewind extensions are optional and do not change Terraform's resource-change data:

```json
{
  "timestamp": "2026-07-18T09:00:00.000Z",
  "infra_rewind": {
    "id": "tf-checkout-task-42",
    "actor": "synthetic-release-pipeline"
  }
}
```

Resources normalize to `tf:<terraform-address>`.

## Kubernetes diff

The deterministic envelope is:

```json
{
  "apiVersion": "infra-rewind/v1",
  "kind": "KubernetesDiff",
  "id": "k8s-config-error",
  "timestamp": "2026-07-18T09:02:00.000Z",
  "intent": "change",
  "changes": [
    {
      "resource": {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "namespace": "payments",
        "name": "api"
      },
      "action": "update",
      "before": {},
      "after": {}
    }
  ]
}
```

`intent` is `change` or `rollback`; it defaults to `change`. Actions are `create`, `update`,
`delete`, or `replace`. Resources normalize to
`k8s:<namespace-or-default>/<lowercase-kind>/<name>`.

## Operations

```json
{
  "schema": "infra-rewind/operations@1",
  "events": [
    {
      "id": "deploy-checkout-42",
      "type": "deployment",
      "timestamp": "2026-07-18T09:05:00.000Z",
      "title": "Deploy checkout revision 42",
      "environment": "synthetic-production",
      "status": "succeeded",
      "revision": "checkout:42",
      "resources": ["k8s:payments/deployment/api"]
    }
  ]
}
```

`type` is `deployment` or `rollback`. Every event must name at least one normalized resource.
`actor` and an object-valued `details` field are optional.

## Alerts

```json
{
  "schema": "infra-rewind/alerts@1",
  "alerts": [
    {
      "id": "checkout-5xx-alert",
      "timestamp": "2026-07-18T09:12:00.000Z",
      "title": "Checkout HTTP 5xx rate",
      "status": "firing",
      "severity": "critical",
      "signal": "checkout_http_5xx_ratio",
      "value": 0.23,
      "threshold": 0.05,
      "resources": ["k8s:payments/deployment/api"]
    }
  ]
}
```

`value` and `threshold` accept numbers or strings. `description` and object-valued `details` are
optional.

## Scenario manifest

The CLI directory contains `scenario.json` with schema `infra-rewind/scenario@1`. `evidenceFiles`
must be relative files that remain inside the directory. The manifest also supplies a title,
description, default replay point, expected preferred candidate (nullable), optional score ceiling,
and one or more state checks.

See the three complete directories under [`examples/`](../examples/).
