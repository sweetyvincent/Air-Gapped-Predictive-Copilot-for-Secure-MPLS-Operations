# Runbook: BGP Routing Neighbor Instability & Dampening

## Symptom
BGP neighbor transitions rapidly between ESTABLISHED and ACTIVE/IDLE states, causing global routing table updates, packet drops, and CPU spikes.

## Mitigation Protocol
To prevent route propagation cascades, BGP dampening must be applied on the PE edge routers to penalize flapping prefixes.

### Step-by-Step Configuration Commands (Cisco IOS-XE / Arista EOS)
1. Access the BGP configuration instance:
   ```
   router bgp 65001
   ```
2. Enable BGP route dampening:
   ```
   bgp dampening 15 750 2000 60
   ```
   *(Parameters: Half-life = 15m, reuse limit = 750, suppress limit = 2000, max suppress time = 60m)*
3. Adjust interface keepalive and hold timers to increase tolerance to intermittent drops:
   ```
   neighbor 192.168.12.2 timers 10 30
   ```
4. Verify neighbor stability and flap counts:
   ```
   show ip bgp neighbors 192.168.12.2
   ```
5. Apply with commit verification:
   ```
   commit confirmed 5
   ```
