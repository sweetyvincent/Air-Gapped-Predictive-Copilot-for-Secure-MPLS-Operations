import random
import time
import math
import json
import os

class NetworkSimulator:
    def __init__(self):
        self.topology = {
            "nodes": {
                "DC-CE-1": {"type": "datacenter", "vendor": "arista_eos", "cpu": 12.0, "memory": 34.0, "status": "UP", "x": 80, "y": 200},
                "MPLS-PE-1": {"type": "provider-edge", "vendor": "cisco_iosxe", "cpu": 15.0, "memory": 40.0, "status": "UP", "x": 220, "y": 110},
                "MPLS-PE-2": {"type": "provider-edge", "vendor": "cisco_iosxe", "cpu": 14.0, "memory": 38.0, "status": "UP", "x": 380, "y": 110},
                "MPLS-P-1": {"type": "core", "vendor": "cisco_iosxe", "cpu": 8.0, "memory": 25.0, "status": "UP", "x": 300, "y": 60},
                "MPLS-P-2": {"type": "core", "vendor": "cisco_iosxe", "cpu": 9.0, "memory": 27.0, "status": "UP", "x": 300, "y": 160},
                "Hub-CE-1": {"type": "hub", "vendor": "arista_eos", "cpu": 18.0, "memory": 45.0, "status": "UP", "x": 220, "y": 290},
                "Branch-CE-1": {"type": "branch", "vendor": "cisco_iosxe", "cpu": 22.0, "memory": 50.0, "status": "UP", "x": 500, "y": 150},
                "Branch-CE-2": {"type": "branch", "vendor": "juniper_junos", "cpu": 20.0, "memory": 48.0, "status": "UP", "x": 500, "y": 250}
            },
            "links": {
                "L-DC-PE1": {"src": "DC-CE-1", "dst": "MPLS-PE-1", "capacity": 1000, "utilization": 250, "latency": 2.5, "loss": 0.0, "jitter": 0.1, "type": "physical"},
                "L-PE1-P1": {"src": "MPLS-PE-1", "dst": "MPLS-P-1", "capacity": 10000, "utilization": 1200, "latency": 5.0, "loss": 0.0, "jitter": 0.2, "type": "physical"},
                "L-P1-P2": {"src": "MPLS-P-1", "dst": "MPLS-P-2", "capacity": 10000, "utilization": 1800, "latency": 8.0, "loss": 0.0, "jitter": 0.1, "type": "physical"},
                "L-P2-PE2": {"src": "MPLS-P-2", "dst": "MPLS-PE-2", "capacity": 10000, "utilization": 900, "latency": 5.2, "loss": 0.0, "jitter": 0.3, "type": "physical"},
                "L-PE2-BR1": {"src": "MPLS-PE-2", "dst": "Branch-CE-1", "capacity": 100, "utilization": 45, "latency": 15.0, "loss": 0.0, "jitter": 1.2, "type": "physical"},
                "L-PE2-BR2": {"src": "MPLS-PE-2", "dst": "Branch-CE-2", "capacity": 100, "utilization": 30, "latency": 18.0, "loss": 0.0, "jitter": 1.5, "type": "physical"},
                
                # SD-WAN IPSec Tunnel Overlays (running logically branch-to-hub/datacenter)
                "T-BR1-DC-PRI": {"src": "Branch-CE-1", "dst": "DC-CE-1", "capacity": 50, "utilization": 15, "latency": 24.5, "loss": 0.0, "jitter": 1.4, "type": "tunnel", "underlay": "L-PE2-BR1"},
                "T-BR1-DC-BAK": {"src": "Branch-CE-1", "dst": "DC-CE-1", "capacity": 30, "utilization": 5, "latency": 45.0, "loss": 0.0, "jitter": 2.5, "type": "tunnel", "underlay": "L-PE2-BR1"},
                "T-BR2-DC-PRI": {"src": "Branch-CE-2", "dst": "DC-CE-1", "capacity": 50, "utilization": 12, "latency": 28.2, "loss": 0.0, "jitter": 1.7, "type": "tunnel", "underlay": "L-PE2-BR2"}
            }
        }
        self.active_faults = {}
        self.step_counter = 0

    def inject_fault(self, name, target, properties):
        """
        Injects a failure condition.
        e.g. inject_fault("congestion", "L-PE2-BR1", {"utilization_factor": 2.2})
        """
        self.active_faults[name] = {"target": target, "properties": properties, "start_time": time.time()}
        print(f"[SIMULATOR] Fault Injected: {name} on {target} -> {properties}")

    def clear_fault(self, name):
        if name in self.active_faults:
            del self.active_faults[name]
            print(f"[SIMULATOR] Fault Cleared: {name}")

    def update(self):
        """Simulates network updates for a single time step."""
        self.step_counter += 1
        t = self.step_counter * 0.1 # Time step multiplier

        # 1. Base network traffic fluctuations (sine wave pattern + random noise)
        for link_id, link in self.topology["links"].items():
            if link["type"] == "physical":
                base_util = link["capacity"] * (0.3 + 0.1 * math.sin(t) + 0.05 * random.random())
                link["utilization"] = round(base_util, 2)
                link["loss"] = 0.0
                link["jitter"] = round(0.5 + 0.5 * random.random(), 2)
            else:
                # Tunnel inherits properties from underlay links plus overlay overheads
                underlay_id = link.get("underlay")
                if underlay_id and underlay_id in self.topology["links"]:
                    underlay = self.topology["links"][underlay_id]
                    link["latency"] = underlay["latency"] + 10.0 + random.random()
                    link["loss"] = underlay["loss"]
                    link["jitter"] = underlay["jitter"] + 0.5
                else:
                    link["loss"] = 0.0

        for node_id, node in self.topology["nodes"].items():
            node["cpu"] = round(15.0 + 5.0 * math.sin(t) + random.randint(-2, 2), 2)
            node["memory"] = round(40.0 + random.randint(-1, 1), 2)
            node["status"] = "UP"

        # 2. Apply active faults
        for fault_name, fault in self.active_faults.items():
            target = fault["target"]
            props = fault["properties"]

            if target in self.topology["links"]:
                link = self.topology["links"][target]
                if fault_name == "link_congestion":
                    # Congestion spike
                    link["utilization"] = min(link["capacity"] * 1.05, link["utilization"] * props.get("factor", 2.0))
                    # Congestion induces latency and jitter
                    link["latency"] += props.get("latency_added", 40.0)
                    link["jitter"] += props.get("jitter_added", 15.0)
                elif fault_name == "packet_loss_spike":
                    link["loss"] = props.get("loss_pct", 5.0)
                    link["latency"] += props.get("latency_added", 10.0)
                elif fault_name == "tunnel_degradation":
                    link["loss"] = props.get("loss_pct", 8.0)
                    link["jitter"] = props.get("jitter_added", 12.0)
            
            elif target in self.topology["nodes"]:
                node = self.topology["nodes"][target]
                if fault_name == "cpu_spike":
                    node["cpu"] = props.get("cpu_pct", 95.0)
                elif fault_name == "bgp_route_flap":
                    node["status"] = "FLAPPING"

        # 3. Synchronize overlay tunnels to underlays (cascade effect)
        for link_id, link in self.topology["links"].items():
            if link["type"] == "tunnel":
                underlay_id = link.get("underlay")
                if underlay_id and underlay_id in self.topology["links"]:
                    underlay = self.topology["links"][underlay_id]
                    # Cascade degradation
                    if underlay["loss"] > 0:
                        link["loss"] = min(100.0, underlay["loss"] * 1.2) # Tunnel encapsulation overhead exacerbates drops
                    if underlay["latency"] > 25.0:
                        link["latency"] = underlay["latency"] + 15.0

    def get_state(self):
        return self.topology

# Save metrics snapshot helper
def save_telemetry(sim, file_path="telemetry_store.json"):
    state = sim.get_state()
    with open(file_path, "w") as f:
        json.dump(state, f, indent=2)

if __name__ == "__main__":
    # Test script running standalone loop
    sim = NetworkSimulator()
    print("Starting network simulator test run...")
    for i in range(5):
        sim.update()
        print(f"Step {i} completed. Branch Link utilization: {sim.topology['links']['L-PE2-BR1']['utilization']}")
        time.sleep(1)
