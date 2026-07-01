# AetherNOC: Air-Gapped Predictive Copilot for Secure MPLS & SD-WAN Operations

AetherNOC is a secure, completely self-contained, on-premises network operations platform. It integrates a **Network Digital Twin**, **Predictive Machine Learning**, a **Quantized Offline LLM**, and a **Local RAG (Retrieval-Augmented Generation)** database to forecast wide-area network anomalies up to 30 minutes in advance, explain root causes, and suggest rollback-safe remediation playbooks with **zero cloud dependencies**.

---

## 🚀 Key Features

* **Network Digital Twin:** Dynamic graph modeling representing physical underlay circuits (MPLS P/PE paths) and logical overlay tunnels (IPSec, VRFs, BGP peerings).
* **Predictive ML Engines:**
  * *Holt-Winters Double Exponential Smoothing:* Dynamic levels and trend calculations to forecast interface congestion spikes.
  * *GNN Risk Propagation:* Mapped dependency convolutions to project how underlay packet loss cascades into downstream routing instabilities.
* **Offline AI Copilot:** Hosted quantized LLM (`Qwen-2.5-7B` / `Llama-3-8B`) running locally using PagedAttention via `vLLM` or `llama.cpp` to answer network health queries.
* **Local RAG Grounding:** Lexical search index processing local vendor manuals, PDF runbooks, and past NOC ticket logs, grounding AI answers to eliminate hallucinations.
* **Rollback-Assured Automation:** Suggested Ansible playbooks designed with a commit-confirmed pattern (`confirm: 5`), executing rollback triggers if verification checks fail.
* **Supply-Chain Integrity:** Cryptographic verifier checks confirming SHA-256 hashes and HMAC signature handshakes on firmware/model zip packages.

---

## 📐 System Architecture

```
+-----------------------------------------------------------------------------------+
|                              AETHERNOC RUNTIME CORE                               |
|                                                                                   |
|  +--------------------+    +--------------------+    +-------------------------+  |
|  | Network Digital    |    | Predictive ML      |    | Local RAG &             |  |
|  | Twin (Neo4j Graph) |    | Engine (PyTorch)   |    | Vector DB (ChromaDB)    |  |
|  +---------+----------+    +---------+----------+    +------------+------------+  |
|            |                         |                            |               |
|            +-------------------------+                            |               |
|                                      |                            |               |
|                                      v                            v               |
|                            +---------+----------------------------+-----------+   |
|                            |   Quantized Offline LLM Copilot (vLLM Engine)     |   |
|                            +----------------------+---------------------------+   |
|                                                   |                               |
|                                                   v                               |
|                            +----------------------+---------------------------+   |
|                            |   Unified Glassmorphism NOC Dashboard & Chat     |   |
|                            +--------------------------------------------------+   |
+-----------------------------------------------------------------------------------+
```

---

## 📁 Repository Structure

```text
├── kb/runbooks/                  # Knowledge Base Runbooks (RAG Source Files)
│   ├── restore_ipsec_degradation.md   # IPSec Tunnel restoration protocol
│   ├── bgp_route_flap_mitigation.md  # BGP Neighbor route flap dampening
│   ├── mpls_congestion_engineering.md# QoS priority shaping guidelines
│   └── past_incidents.md              # Log database of historical NOC tickets
├── playbooks/                    # Vendor-specific Ansible Playbooks
│   ├── reroute_traffic_cisco.yml     # Cisco IOS-XE metric adjustment commands
│   ├── reroute_traffic_arista.yml    # Arista EOS static metric commands
│   └── reroute_traffic_juniper.yml   # Juniper Junos preference modifications
├── app.js                        # Frontend dashboard SVG/Canvas controller
├── index.html                    # Dashboard structural layouts
├── index.css                     # Glassmorphism styling configuration
├── main.py                       # FastAPI web server API and WS orchestrator
├── fault_injector.py             # Telemetry updates and fault injection simulation
├── predictive_engine.py          # Holt-Winters forecasting and GNN logic
├── rag_ingester.py               # Pure-python offline RAG vector indexer
├── security_verifier.py          # Hash and signature verifier checks
├── verify_prototype.py           # Integration test suite (6/6 tests validation)
├── requirements.txt              # Backend dependencies
└── docker-compose.yml            # Multi-container production deployment config
```

---

## 🛠️ Quick Start Guide

### Option A: Local Developer Start
1. **Initialize Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
2. **Start the API Backend:**
   ```bash
   python main.py
   ```
   *The FastAPI server will start on `http://127.0.0.1:8000/`. A background thread will trigger simulation updates every 2 seconds.*
3. **Launch the Dashboard:**
   Open the **`index.html`** file directly in any web browser.

### Option B: Production Containerized Deployment
Deploy the full multi-container stack (Nginx frontend, FastAPI backend, TimescaleDB database, and Vector logs collector) offline:
```bash
docker-compose up -d --build
```
* Access the Web console on port `80`.
* Access the FastAPI backend APIs on port `8000`.

---

## 🛡️ Interactive Verification Scenarios

Once the console is running, you can demonstrate the following predictive scenarios:

### Scenario 1: Interface Congestion (Holt-Winters Time-Series Test)
1. In the **Simulation Fault Controller** drawer (bottom of the dashboard), select:
   * **Anomaly Scenario:** `PE-CE Congestion Spike`
   * **Target Asset:** `Branch Link 1 (L-PE2-BR1)`
2. Click **Inject Failure**.
3. *Telemetry Graph reaction:* The link utilization increments. The link turns orange, then red on the SVG map.
4. *ML Forecast reaction:* The timeline fires an alert: *"Predicted WAN tunnel failure in 12 minutes"*.
5. In the **Offline RAG AI Copilot** chat console, type: `what will fail next?`.
6. The copilot responds with the root cause, calibrated platt confidence, and loads the tailored playbook (e.g. `reconfigure_qos_edge_cisco.yml`).
7. Click **Apply Automated Restorative Policy** to trigger Ansible commits.

### Scenario 2: Underlay Link Degradation (GNN Cascade Test)
1. Inject the `Physical Link Carrier Degradation` anomaly on `L-PE2-BR1`.
2. *GNN Propagation:* The packet drops on the physical link propagate risk metrics to overlay paths. Node Health Indexes (NHI) drop below 30% for adjacent nodes (`Branch-CE-1`, `DC-CE-1`), triggering BGP flapping warnings.
3. In the chat, ask: `How do I restore degraded IPSec tunnels?`.
4. The copilot queries the local RAG database and provides the exact CLI commands (such as administrative distance adjustments) extracted from the runbooks.

---

## 🔍 Validation Status
Running `python verify_prototype.py` executes 6 automated tests:
* **TEST 1:** Module imports validation.
* **TEST 2:** Network simulator state updates.
* **TEST 3:** Holt-Winters & GNN risk calculations.
* **TEST 4:** Local RAG query indexing & matching.
* **TEST 5:** Frontend asset checks.
* **TEST 6:** Cryptographic SHA-256 hash and GPG signature handshake checks.

All 6 tests compile and execute successfully under completely offline conditions.
