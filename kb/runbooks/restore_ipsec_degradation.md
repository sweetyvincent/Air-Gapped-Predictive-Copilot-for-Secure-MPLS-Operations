# Runbook: restoring degraded IPSec overlay tunnels

## Symptom
An IPSec tunnel shows elevated latency or packet drops (>2%) due to underlay network congestion or physical carrier degradation.

## Remediation Protocol
If a primary IPSec overlay tunnel degrades while a backup tunnel remains healthy, routing metrics must be adjusted to steer priority traffic.

### Step-by-Step Configuration Commands (Cisco IOS-XE / Arista EOS)
1. Enter global configuration mode:
   ```
   configure terminal
   ```
2. Navigate to the routing control map:
   ```
   ip route 10.100.0.0 255.255.0.0 Tunnel10 50
   ```
   *(Note: This increases the administrative distance of the primary route over Tunnel10 to 50, forcing traffic to failover to the backup path on Tunnel20).*
3. Verify interface convergence:
   ```
   show ip route 10.100.0.0
   ```
4. Confirm configuration rollback assurance:
   Always execute using the commit-confirmed interface:
   ```
   commit confirmed 5
   ```
5. If the ping tests fail, let the timer expire to auto-rollback. Otherwise, execute:
   ```
   write memory
   ```
