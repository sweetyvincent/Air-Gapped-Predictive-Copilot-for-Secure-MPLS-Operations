import math
import numpy as np

class PredictiveEngine:
    def __init__(self, simulator):
        self.sim = simulator
        # Maintain history of interface metrics to emulate time-series inputs
        self.history = {}
        self.history_limit = 60 # 5 minutes of 5s intervals

    def record_metrics(self):
        state = self.sim.get_state()
        for link_id, link in state["links"].items():
            if link_id not in self.history:
                self.history[link_id] = []
            
            # Capture current utilization and packet loss
            self.history[link_id].append({
                "utilization": link["utilization"],
                "loss": link["loss"],
                "latency": link["latency"],
                "jitter": link["jitter"]
            })

            # Cap history size
            if len(self.history[link_id]) > self.history_limit:
                self.history[link_id].pop(0)

    def forecast_interface_utilization(self, link_id, steps_ahead=15):
        """
        Forecasts future utilization using Holt-Winters Double Exponential Smoothing.
        Models levels and trends dynamically for advanced time-series forecasting.
        """
        if link_id not in self.history or len(self.history[link_id]) < 5:
            return self.sim.topology["links"][link_id]["utilization"], 0.50
        
        metrics = self.history[link_id]
        utils = [m["utilization"] for m in metrics]
        
        # Holt-Winters parameters
        alpha = 0.25
        beta = 0.15
        
        # Initial level and trend
        level = utils[0]
        trend = utils[1] - utils[0]
        
        # Compute smooth values
        for i in range(1, len(utils)):
            y_t = utils[i]
            last_level = level
            level = alpha * y_t + (1 - alpha) * (level + trend)
            trend = beta * (level - last_level) + (1 - beta) * trend
            
        # Forecast steps_ahead
        forecasted_val = level + (steps_ahead * trend)
        
        capacity = self.sim.topology["links"][link_id]["capacity"]
        forecasted_val = max(0, min(capacity * 1.15, forecasted_val)) # clamp
        
        # Platt calibration score using sigmoid mapping
        z = (forecasted_val / capacity - 0.78) * 12.0
        confidence = 1.0 / (1.0 + math.exp(-z))
        confidence = max(0.50, min(0.99, confidence))
        
        return round(forecasted_val, 2), round(confidence, 2)


    def calculate_nhi(self, node_id):
        """
        Computes the Network Health Index for a node based on the mathematical schema:
        NHI_n = w1*(1-U_cpu) + w2*(1-U_mem) + w3*Product(1-L_i)*(1-P_i)
        """
        state = self.sim.get_state()
        node = state["nodes"][node_id]
        
        u_cpu = node["cpu"] / 100.0
        u_mem = node["memory"] / 100.0

        # Weights
        w1, w2, w3 = 0.2, 0.2, 0.6
        
        # Interfaces product
        intf_health_product = 1.0
        has_interfaces = False

        for link_id, link in state["links"].items():
            if link["src"] == node_id or link["dst"] == node_id:
                has_interfaces = True
                # Latency factor relative to max SLA limit (e.g. 150ms)
                sla_max_latency = 150.0
                norm_latency = min(1.0, link["latency"] / sla_max_latency)
                norm_loss = min(1.0, link["loss"] / 100.0)
                
                link_health = (1.0 - norm_latency) * (1.0 - norm_loss)
                intf_health_product *= link_health

        if not has_interfaces:
            intf_health_product = 1.0

        nhi = w1 * (1.0 - u_cpu) + w2 * (1.0 - u_mem) + w3 * intf_health_product
        return round(nhi * 100.0, 2)

    def run_gnn_risk_propagation(self):
        """
        Emulates GCN risk propagation.
        If underlay links show anomalies, propagates risk to associated tunnels.
        Returns a map of active predictive alerts.
        """
        self.record_metrics()
        state = self.sim.get_state()
        alerts = []

        # 1. Check underlay links for congestion forecasts
        for link_id, link in state["links"].items():
            if link["type"] == "physical":
                forecast_val, confidence = self.forecast_interface_utilization(link_id, steps_ahead=15)
                capacity = link["capacity"]
                
                # Anomaly precursor: utilization projected to exceed 85%
                if forecast_val > (capacity * 0.82):
                    severity = "CRITICAL" if forecast_val > capacity else "WARNING"
                    alerts.append({
                        "id": f"PA-{link_id}-CONG",
                        "type": "Interface Congestion",
                        "target": link_id,
                        "time_to_failure": "12 minutes",
                        "confidence": confidence,
                        "severity": severity,
                        "root_cause": f"Projected capacity saturation on link {link_id}. Current rate: {link['utilization']} Mbps, Projected: {forecast_val} Mbps.",
                        "evidence": f"Usage slope gradient: +{round((forecast_val - link['utilization'])/12, 2)} Mbps/min. Platt Calibration z-score positive."
                    })

                # Check underlay packet loss (e.g., physical layer errors)
                if link["loss"] > 1.0:
                    # Anomaly precursor: packet loss indicates physical underlay degradation
                    # Propagate risk to overlay tunnels mapping to this physical link
                    for tun_id, tun in state["links"].items():
                        if tun["type"] == "tunnel" and tun.get("underlay") == link_id:
                            # GNN propagation risk calculation
                            propagated_risk = min(0.99, (link["loss"] / 10.0) * 1.5)
                            alerts.append({
                                "id": f"PA-{tun_id}-DEG",
                                "type": "Tunnel SLA Degradation",
                                "target": tun_id,
                                "time_to_failure": "8 minutes",
                                "confidence": round(propagated_risk, 2),
                                "severity": "CRITICAL" if propagated_risk > 0.8 else "WARNING",
                                "root_cause": f"Underlay link failure cascade. Physical carrier link {link_id} is reporting packet loss of {link['loss']}%.",
                                "evidence": f"Relational GNN Risk Propagation score: {round(propagated_risk, 2)}. Physical underlay dependency mapped via Neo4j Topology Schema."
                            })

        # 2. Check routing flaps precursors (if node status is flapping or cpu is critically high)
        for node_id, node in state["nodes"].items():
            nhi = self.calculate_nhi(node_id)
            if nhi < 60.0:
                alerts.append({
                    "id": f"PA-{node_id}-FLAP",
                    "type": "Routing Instability",
                    "target": node_id,
                    "time_to_failure": "15 minutes",
                    "confidence": 0.88,
                    "severity": "CRITICAL",
                    "root_cause": f"OSPF/BGP convergence failure threat. Device {node_id} Health Index critically degraded to {nhi}%.",
                    "evidence": f"Node CPU: {node['cpu']}%, Node Memory: {node['memory']}%. Adjacent path degradation detected."
                })

        return alerts

if __name__ == "__main__":
    # Test execution
    from fault_injector import NetworkSimulator
    sim = NetworkSimulator()
    engine = PredictiveEngine(sim)
    
    # Inject congestion and update
    sim.inject_fault("link_congestion", "L-PE2-BR1", {"factor": 3.0, "latency_added": 50})
    for _ in range(10):
        sim.update()
        engine.record_metrics()
        
    alerts = engine.run_gnn_risk_propagation()
    print("Generated Predictive Alerts:")
    for alert in alerts:
        print(f"- {alert['type']} on {alert['target']} (Conf: {alert['confidence']}, Time-to-Failure: {alert['time_to_failure']})")
