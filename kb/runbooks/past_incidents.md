# Runbook: Historical NOC Incidents & Resolutions Database

## Incident INC-4092: PE-CE Interface Utilization Congestion
* **Target Interface:** `L-PE2-BR1` (Branch-1 Link)
* **Date:** 2026-05-12
* **Trigger:** Bulk file downloads saturated interface capacity, causing voice class drops.
* **Resolution:** Applied `WAN-EDGE-QOS` policy map allocating 30% priority queue bandwidth to DSCP EF class packets. Utilized commit-confirmed confirmation check.

## Incident INC-5821: Primary IPSec Tunnel Failure Cascade
* **Target Interface:** `T-BR1-DC-PRI` (Overlay Tunnel)
* **Date:** 2026-06-02
* **Trigger:** Underlay carrier experienced high packet corruption, causing BGP neighbors to flap.
* **Resolution:** Modified static route AD metric on `Tunnel10` from 1 to 50, shifting priority traffic over the backup tunnel `Tunnel20`.

## Incident INC-1029: Core BGP Neighbor Flapping
* **Target Router:** `MPLS-PE-1`
* **Date:** 2026-06-20
* **Trigger:** High CPU utilization delayed BGP keepalive packets, causing route flap cascades.
* **Resolution:** Enabled BGP route dampening metrics `bgp dampening 15 750 2000 60` to stabilize prefix advertisements.
