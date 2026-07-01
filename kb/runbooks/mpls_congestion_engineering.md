# Runbook: MPLS Core Interface Congestion & QoS Policies

## Symptom
Traffic utilization on a PE-CE link exceeds 85%, causing queue drops on critical voice/video paths (`cbQosDropPkts` increments).

## Mitigation Protocol
Apply a traffic-shaping QoS policy-map to prioritize voice queues and rate-limit bulk/non-critical packets before tail-drops occur.

### Step-by-Step Configuration Commands (Cisco IOS-XE / Arista EOS)
1. Define class maps for priority traffic:
   ```
   class-map match-any REALTIME-CLASS
     match ip dscp ef
   ```
2. Define the policy map and allocate bandwidth shares:
   ```
   policy-map WAN-EDGE-QOS
     class REALTIME-CLASS
       priority percent 30
     class class-default
       bandwidth percent 70
       random-detect dscp-based
   ```
   *(Note: `random-detect dscp-based` enables WRED to discard low-priority packets early, maintaining packet flow for priority traffic).*
3. Bind the QoS policy to the physical outbound interface:
   ```
   interface GigabitEthernet1
     service-policy output WAN-EDGE-QOS
   ```
4. Verify QoS queues and dropped packet rates:
   ```
   show policy-map interface GigabitEthernet1
   ```
