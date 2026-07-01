import asyncio
import os
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional

# Import local components
from fault_injector import NetworkSimulator
from predictive_engine import PredictiveEngine
from rag_ingester import LocalRAGEngine

app = FastAPI(title="AetherNOC Secure Predictive Copilot API", version="1.0.0")

# Enable CORS for local cross-origin frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize engines
sim = NetworkSimulator()
engine = PredictiveEngine(sim)
rag = LocalRAGEngine("./kb/runbooks")

# Store WebSocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                pass

manager = ConnectionManager()

# Background task to run simulator and ML predictions
async def run_network_loop():
    while True:
        try:
            # Update simulator state
            sim.update()
            # Record metrics & run predictive GNN/LSTM models
            alerts = engine.run_gnn_risk_propagation()
            
            # Prepare packet payload
            payload = {
                "topology": sim.get_state(),
                "predictive_alerts": alerts
            }
            # Broadcast state update to all active dashboard consoles
            await manager.broadcast(json.dumps(payload))
        except Exception as e:
            print(f"[BACKEND LOOP ERROR] {e}")
        
        await asyncio.sleep(2.0) # Tick every 2 seconds

@app.on_event("startup")
async def startup_event():
    # Start the simulator background task
    asyncio.create_task(run_network_loop())
    print("[BACKEND] Network simulator loop initialized.")

# API Models
class FaultRequest(BaseModel):
    fault_type: str  # e.g., link_congestion, packet_loss_spike, cpu_spike
    target: str      # link_id or node_id
    properties: Optional[Dict] = {}

class ChatRequest(BaseModel):
    message: str

# Endpoints
@app.get("/api/v1/health")
def get_health():
    return {
        "status": "healthy",
        "air_gap_compliant": True,
        "simulator_status": "ONLINE",
        "predictive_engine": "ONLINE",
        "rag_kb_chunks": len(rag.documents)
    }

@app.get("/api/v1/topology")
def get_topology():
    return sim.get_state()

@app.get("/api/v1/predictive-alerts")
def get_alerts():
    return engine.run_gnn_risk_propagation()

@app.post("/api/v1/inject-fault")
def post_inject_fault(req: FaultRequest):
    sim.inject_fault(req.fault_type, req.target, req.properties)
    return {"status": "success", "message": f"Injected {req.fault_type} on {req.target}"}

@app.post("/api/v1/clear-fault")
def post_clear_fault(fault_type: str):
    sim.clear_fault(fault_type)
    return {"status": "success", "message": f"Cleared fault {fault_type}"}

class UpdateVerificationRequest(BaseModel):
    file_path: str
    signature_path: str
    expected_hash: str

@app.post("/api/v1/system/verify-update")
def post_verify_update(req: UpdateVerificationRequest):
    from security_verifier import SecurityVerifier
    # 1. Run file hash checksum checks
    hash_ok, hash_msg = SecurityVerifier.verify_hash(req.file_path, req.expected_hash)
    if not hash_ok:
        return {"verified": False, "step": "SHA256 Checksum Verification", "message": hash_msg}
    
    # 2. Run GPG-style signature validations
    sig_ok, sig_msg = SecurityVerifier.verify_signature(req.file_path, req.signature_path)
    if not sig_ok:
        return {"verified": False, "step": "GPG Signature Cryptographic Handshake", "message": sig_msg}
        
    return {"verified": True, "message": "Package verified successfully. Clean supply-chain verification handshake completed."}

@app.post("/api/v1/copilot/chat")
def post_chat(req: ChatRequest):
    query = req.message.lower()
    
    # 1. Fetch current predictive alerts to contextualize the query
    alerts = engine.run_gnn_risk_propagation()
    
    # 2. RAG Retrieval - find matching runbooks based on query and active alerts
    rag_context = ""
    runbook_matches = []
    if alerts:
        # Query matching the active alert types
        search_query = f"{alerts[0]['type']} {alerts[0]['root_cause']}"
        runbook_matches = rag.retrieve(search_query, top_k=1)
    else:
        runbook_matches = rag.retrieve(query, top_k=1)

    if runbook_matches:
        rag_context = runbook_matches[0]["text"]
        source_runbook = runbook_matches[0]["source"]
    else:
        source_runbook = "None"
        rag_context = "No specific runbook match found for the current query."

    # 3. Offline LLM Inference Engine Emulator
    response_json = {}
    
    if "fail" in query or "next" in query or "alert" in query:
        if alerts:
            alert = alerts[0]
            target_asset = alert["target"]
            
            # Lookup target asset vendor (for physical link, check dest node vendor)
            vendor = "cisco_iosxe"
            if target_asset in sim.topology["links"]:
                dst_node = sim.topology["links"][target_asset]["dst"]
                if dst_node in sim.topology["nodes"]:
                    vendor = sim.topology["nodes"][dst_node].get("vendor", "cisco_iosxe")
            elif target_asset in sim.topology["nodes"]:
                vendor = sim.topology["nodes"][target_asset].get("vendor", "cisco_iosxe")
            
            # Match base playbook name
            playbook_name = "reconfigure_qos_edge.yml"
            if "loss" in alert["type"].lower() or "tunnel" in alert["type"].lower():
                playbook_name = "reroute_traffic_from_br1.yml"
            elif "flap" in alert["type"].lower():
                playbook_name = "mitigate_bgp_flap.yml"

            # Dynamic Playbook Compiler based on target vendor
            playbook_content = ""
            if vendor == "arista_eos":
                playbook_name = playbook_name.replace(".yml", "_arista.yml")
                playbook_content = f"""---
- name: Restructure Edge Routing Metric Shares (Arista EOS)
  hosts: {alert['target']}
  gather_facts: false
  tasks:
    - name: Adjust route metrics via static CLI commands
      arista.eos.eos_config:
        lines:
          - ip route 10.100.0.0/16 192.168.10.2 50
        confirm: 5"""
            elif vendor == "juniper_junos":
                playbook_name = playbook_name.replace(".yml", "_juniper.yml")
                playbook_content = f"""---
- name: Restructure Edge Routing Metric Shares (Juniper Junos)
  hosts: {alert['target']}
  gather_facts: false
  tasks:
    - name: Adjust route preferences on target tunnel routing instances
      junipernetworks.junos.junos_config:
        lines:
          - set routing-options static route 10.100.0.0/16 next-hop st0.0 preference 50
        confirm: 5"""
            else:
                playbook_name = playbook_name.replace(".yml", "_cisco.yml")
                playbook_content = f"""---
- name: Restructure Edge Routing Metric Shares (Cisco IOS-XE)
  hosts: {alert['target']}
  gather_facts: false
  tasks:
    - name: Adjust administrative distance on secondary tunnel route
      cisco.ios.ios_config:
        lines:
          - ip route 10.100.0.0 255.255.0.0 Tunnel 10 50
        confirm: 5"""

            # Parse recommended actions from runbook if available
            recommended = []
            if runbook_matches:
                lines = rag_context.split("\n")
                for line in lines:
                    if line.strip().startswith("-") or line.strip().startswith("1.") or line.strip().startswith("2."):
                        recommended.append(line.replace("-", "").replace("1.", "").replace("2.", "").strip())
            
            if not recommended:
                recommended = [
                    f"Initiate diagnostic logs on {alert['target']}",
                    "Isolate congested path utilizing overlay policy-map",
                    "Verify secondary backup tunnel connectivity"
                ]

            response_json = {
                "issue_prediction": f"Impending degradation of {alert['target']} ({alert['type']})",
                "confidence_score": alert["confidence"],
                "root_cause_hypothesis": alert["root_cause"],
                "estimated_time_to_impact": alert["time_to_failure"],
                "affected_scope": {
                    "devices": [alert["target"]],
                    "sites": ["Branch-1" if "BR1" in alert["target"] else "Branch-2" if "BR2" in alert["target"] else "Core-1"],
                    "tunnels": ["T-BR1-DC-PRI" if "BR1" in alert["target"] else "T-BR2-DC-PRI"]
                },
                "recommended_actions": recommended,
                "remediation_ansible_playbook_name": playbook_name,
                "playbook_content": playbook_content,
                "urgency_classification": alert["severity"],
                "evidence": alert["evidence"],
                "rag_source_runbook": source_runbook
            }
        else:
            response_json = {
                "issue_prediction": "All interfaces nominal. No predictive failures detected.",
                "confidence_score": 0.98,
                "root_cause_hypothesis": "None",
                "estimated_time_to_impact": "N/A",
                "affected_scope": {"devices": [], "sites": [], "tunnels": []},
                "recommended_actions": ["Maintain active telemetry polling."],
                "remediation_ansible_playbook_name": "None",
                "playbook_content": "",
                "urgency_classification": "ADVISORY",
                "evidence": "Network Health Index (NHI) averaging >96% across all active paths.",
                "rag_source_runbook": "None"
            }
    else:
        # Default conversational guide
        response_json = {
            "issue_prediction": "General Query Processed",
            "confidence_score": 0.95,
            "root_cause_hypothesis": "User requested general operations guidance.",
            "estimated_time_to_impact": "N/A",
            "affected_scope": {"devices": [], "sites": [], "tunnels": []},
            "recommended_actions": [
                "To scan for active predictive alerts, ask: 'What will fail next?'",
                "To trigger a simulation failure, use the simulation control panel on the dashboard."
            ],
            "remediation_ansible_playbook_name": "None",
            "playbook_content": "",
            "urgency_classification": "ADVISORY",
            "evidence": "RAG search engine matches runbook context.",
            "rag_source_runbook": source_runbook,
            "chat_reply": f"Hello! I am your air-gapped NOC Copilot. I have retrieved context from the '{source_runbook}' runbook. If you want to check impending faults, please ask 'what is likely to fail next?' or ask about restoring active tunnels."
        }
    return response_json

# WebSocket Telemetry Stream
@app.websocket("/api/v1/telemetry/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; state updates are broadcasted by the background loop
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
