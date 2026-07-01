# AetherNOC: Air-Gapped Predictive Copilot & Digital Twin for Secure MPLS Operations

This document outlines the end-to-end design, implementation architecture, and deployment guide for **AetherNOC**—a production-grade, secure, and fully offline network operations platform. It integrates a Network Digital Twin, Predictive Machine Learning, an Offline Quantized LLM Copilot, and a Local Retrieval-Augmented Generation (RAG) system to prevent network outages before they degrade user service in highly secure, air-gapped environments.

---

## 1. Executive Summary

Enterprise and government organizations running critical operations over wide-area networks (WANs) require near-perfect uptime and bulletproof security. Traditional Network Operations Center (NOC) management relies on threshold-based SNMP alerts that trigger *after* packet loss or link down events occur. In highly regulated, air-gapped security domains, cloud-based AI tools (e.g., OpenAI, Claude) cannot be used due to data leakage risks and the lack of external internet access.

**AetherNOC** solves this by establishing a **completely self-contained, offline Predictive AI Copilot**. It continuously ingests underlay MPLS and overlay SD-WAN telemetry, constructs a local **Network Knowledge Graph (Digital Twin)**, runs time-series and graph-based predictive algorithms to forecast failures (e.g., congestion, routing flaps, underlay degradation) up to 30 minutes in advance, and exposes a quantized **Offline Large Language Model (LLM)**. The LLM utilizes a local vector database of runbooks and network states to explain predictions and suggest safe, automated remediation playbooks.

---

## 2. Problem Analysis

### 2.1 The MPLS & SD-WAN Operational Gap
Modern WAN overlays (IPSec tunnels over MPLS underlays) hide underlay network complexities from routing protocols. When an underlay link degrades (e.g., high packet corruption, intermittent carrier dropouts), overlay paths flap, causing:
* **Alert Storms:** A single link degradation can trigger hundreds of secondary IPSec tunnel down alerts and BGP neighbor flap messages, masking the root cause.
* **Reactive Troubleshooting:** NOC operators spend crucial minutes correlation-logging across multiple consoles (vManage, CLI, syslog) while critical application SLAs are breached.
* **Grey Failures:** Non-binary degradations (e.g., 5% packet loss, packet reordering) that do not trigger hard link-down states but ruin real-time voice, video, and database synchronization.

### 2.2 Air-Gap Security Constraints
Deployments in defense, intelligence, utilities, and financial cores run within strict physical and logical boundaries:
1. **Zero External Inference:** Absolutely no API calls to cloud services.
2. **Resource Constraints:** The solution must run on on-premises compute nodes (e.g., standard dual-socket servers, optionally with enterprise GPUs like Nvidia A100/L40S).
3. **Data Preservation:** Log sanitization and secure local storage architecture with zero telemetry leaks.
4. **Supply Chain Trust:** Every package, model weight, and dependency must be verifiable via cryptographic signatures before import.

---

## 3. Proposed Solution: AetherNOC

AetherNOC is composed of four integrated components running locally:

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

* **Network Digital Twin:** A live graph representation of the physical (MPLS PE/P, fiber paths, interfaces) and logical (IPSec tunnels, BGP peerings, VRFs) topology, continuously synchronized from network state updates.
* **Predictive ML Engine:** Ingests streaming telemetry (gNMI, SNMP, NetFlow) to forecast congestion, packet loss progression, and routing instabilities.
* **Local RAG System:** Anchors the LLM in the real network context by combining current graph states, syslog snippets, vendor manuals, and historical incident records.
* **Offline Copilot Chat & Automation Engine:** Translates complex telemetry and graph structures into clear natural language, predicting failures, explaining why, and compiling rollback-safe Ansible playbooks.

---

## 4. Innovation Highlights

AetherNOC goes beyond typical operations platforms with four key innovations:

### 4.1 Temporal Network Graph Anomaly Propagation
Instead of evaluating interfaces in isolation, we treat the network as a graph. We run a **Relational Graph Convolutional Network (R-GCN)** over the Digital Twin. When an underlay link shows rising jitter, the GNN propagates this risk to all overlay tunnels and VRFs mapping to that link. This enables predicting secondary BGP route flaps and SLA drops at distant branches before the routing protocols themselves start flapping.

### 4.2 Explainable AI (XAI) Context Injection
We avoid the "black box" machine learning issue. When the LSTM/GNN predicts interface congestion, AetherNOC uses **SHAP (SHapley Additive exPlanations)** to extract the top telemetry features (e.g., `ifOutOctets_rate`, `cbQosDropPkts`, `sysCpuUtil`). These features are converted into natural-language prompt facts, allowing the LLM to explain the exact telemetry signals driving the prediction.

### 4.3 Model Confidence Calibration
For an operator to trust an AI, the confidence score must represent true probability. We employ **Platt Scaling** on the output layer of our classifiers. If the copilot states "92% confidence of OSPF failure in 15 minutes," it means historically, out of 100 predictions with this score, exactly 92 resulted in an outage within that window.

### 4.4 Rollback-Assured Autonomous Remediation (RAAR)
When a failure is predicted (e.g., tunnel degradation due to ISP congestion), the copilot suggests a reroute policy. If authorized, the automation engine pushes the changes using a **commit-confirmed pattern** (e.g., Cisco IOS-XE `commit confirmed 5`). The engine then runs automated ping, BGP state, and path verification checks. If the checks fail or connectivity is lost, the network automatically rolls back to the last known good configuration state.

---

## 5. System Architecture

### 5.1 Global Component Architecture

```mermaid
graph TD
    %% Telemetry Source
    subgraph Simulation [Network Simulation & Infrastructure]
        cEOS[Containerlab Arista/FRR Nodes] -->|SNMP/syslog| Ingest[Telemetry Collectors]
        cEOS -->|gNMI Streaming| Ingest
        cEOS -->|IPFIX/NetFlow| Ingest
    end

    %% Ingestion Pipeline
    subgraph Pipeline [Ingestion & Processing]
        Ingest -->|Vector / Telegraf| TSDB[(TimescaleDB)]
        Ingest -->|Parser| GraphDB[(Neo4j Graph Database)]
    end

    %% Analytics & ML
    subgraph Analytics [AI & ML Core]
        TSDB -->|Windowed Series| LSTM[LSTM Forecasting Engine]
        GraphDB -->|Topology Matrix| GNN[Relational Graph GNN]
        LSTM -->|Predictions & SHAP| Correlator[Event Correlator & Calibration]
        GNN -->|Risk Propagation| Correlator
    end

    %% RAG & LLM
    subgraph OfflineLLM [Air-Gapped Copilot Engine]
        Correlator -->|JSON Alerts| VectorDB[(ChromaDB Vector DB)]
        DocIngest[Manuals, Runbooks, Past Incidents] -->|Embeddings Generator| VectorDB
        VectorDB -->|Context Vectors| RAG[Hybrid Search & Reranker]
        RAG -->|Enriched Prompt| LLM[vLLM / Llama.cpp Host]
    end

    %% Presentation
    subgraph Frontend [Unified Operator Portal]
        LLM -->|WebSockets/SSE| Dash[Glassmorphism React Dashboard]
        Correlator -->|Alert Stream| Dash
        GraphDB -->|Live Graph Visual| Dash
        Dash -->|Execute Playbook| Ansible[Ansible Playbook Runner]
        Ansible -->|Netconf/CLI| cEOS
    end

    style Simulation fill:#0f172a,stroke:#06b6d4,stroke-width:2px,color:#fff
    style Pipeline fill:#1e1b4b,stroke:#8b5cf6,stroke-width:2px,color:#fff
    style Analytics fill:#1c1917,stroke:#f97316,stroke-width:2px,color:#fff
    style OfflineLLM fill:#022c22,stroke:#10b981,stroke-width:2px,color:#fff
    style Frontend fill:#172554,stroke:#3b82f6,stroke-width:2px,color:#fff
```

### 5.2 Storage Architecture & Data Schema
In an air-gapped environment, storage must be highly optimized, reliable, and easily backed up.
1. **TimescaleDB (PostgreSQL Extension):** Used for time-series telemetry metrics. Hyper-tables optimize query speeds for LSTM inputs.
2. **Neo4j Community Edition:** Hosts the Network Topology Graph. Nodes represent devices, interfaces, subnets, and routing adjacencies.
3. **ChromaDB:** A fast, serverless vector database running inside a local Docker container, storing chunks of runbooks, RFCs, configurations, and historical post-mortems.

---

## 6. Technology Stack

| Component | Selected Technology | Alternative Considered | Selection Rationale |
| :--- | :--- | :--- | :--- |
| **Network Simulation** | **Containerlab + FRRouting & cEOS** | GNS3 / EVE-NG | Containerlab starts in seconds, has a tiny memory footprint, and fits perfectly in Git CI/CD pipelines compared to heavy virtual machines. |
| **Telemetry Ingestion**| **Telegraf + Vector** | Logstash / Prometheus | Telegraf is lightweight and has built-in SNMP/gNMI plugins; Vector excels at parsing syslog streams with minimal CPU consumption. |
| **Time-Series Storage**| **TimescaleDB** | InfluxDB | TimescaleDB offers standard SQL query interfaces, simplifies joining metrics with relational configuration tables, and handles high write volumes. |
| **Graph Database** | **Neo4j** | NetworkX | Neo4j provides persistent, fast graph-traversal queries (Cypher) and supports scalable GNN graph extraction pipelines. |
| **ML Framework** | **PyTorch & PyTorch Geometric** | TensorFlow | PyTorch is the industry standard for graph neural networks and sequential time-series modeling, with excellent local acceleration options. |
| **Offline LLM Engine** | **vLLM** | Llama.cpp | vLLM uses PagedAttention to deliver up to 10x higher serving throughput on GPUs, though we retain Llama.cpp as a fallback for CPU-only systems. |
| **Offline LLM Weight** | **Qwen-2.5-7B-Instruct (Q5_K_M)**| Llama-3-8B-Instruct | Qwen-2.5-7B outperforms Llama-3-8B in structured JSON generation, code compiling (Ansible), and complex reasoning within a compact memory footprint. |
| **Vector Database** | **ChromaDB** | PGVector | ChromaDB is extremely simple to run as a single Docker container, requiring zero relational database schema overhead. |
| **Backend Framework** | **FastAPI (Python)** | Node.js Express | Python allows direct native library imports for PyTorch, Hugging Face transformers, and database query libraries without serialization overhead. |
| **Frontend UI** | **Vite + React (Vanilla CSS)** | Next.js / Tailwind CSS| Vite offers instant hot-reloading. Vanilla CSS modules ensure we build a bespoke, glassmorphism-based design without dependency clutter. |
| **Automation** | **Ansible Core + Netconf** | Python Netmiko scripts | Ansible playbooks are declarative, self-documenting, and have robust built-in error handling and state verification modules. |

---

## 7. Network Simulation Setup

To validate our predictions and train models, we build a multi-site enterprise network inside Containerlab.

### 7.1 Topology Architecture
The topology represents a multi-site enterprise network:
* **Datacenter (DC):** Core switches, boundary routers, application server simulations.
* **Regional Hubs (Hub-1, Hub-2):** Aggregation layers running dual-homed configurations.
* **Branch Offices (Branch-1, Branch-2):** Dual CE (Customer Edge) routers connected to MPLS and Internet underlays.
* **MPLS Core:** 4 routers running OSPF underlay, LDP (Label Distribution Protocol), and BGP (MP-BGP L3VPN).

```
                      +-------------------+
                      |   Datacenter CE   |
                      +----+---------+----+
                           |         |
                  +--------+         +--------+
                  |                           |
        +---------v---------+       +---------v---------+
        |  MPLS Underlay    |       |  Internet Underlay|
        |  (P/PE Routers)   |       |  (IPSec Overlay)  |
        +---------+---------+       +---------+---------+
                  |                           |
         +--------+---------+        +--------+---------+
         |                  |        |                  |
   +-----v------+     +-----v------+ v            +-----v------+
   | Hub-1 CE   |     | Hub-2 CE   |              | Branch-1 CE|
   +------------+     +------------+              +------------+
```

### 7.2 Containerlab Topology YAML Blueprint
The following configuration initializes the simulated nodes:

```yaml
name: aethernoc-sim
topology:
  nodes:
    mpls-p1:
      kind: vr-sros
      image: vrnetlab/vr-sros:21.10.R1
    mpls-pe1:
      kind: vr-sros
      image: vrnetlab/vr-sros:21.10.R1
    dc-ce:
      kind: arista_ceos
      image: ceosimage:4.28.0F
    br1-ce:
      kind: arista_ceos
      image: ceosimage:4.28.0F
    traffic-gen:
      kind: linux
      image: networkstatic/iperf3

  links:
    - endpoints: ["dc-ce:eth1", "mpls-pe1:eth1"]
    - endpoints: ["mpls-pe1:eth2", "mpls-p1:eth1"]
    - endpoints: ["mpls-p1:eth2", "br1-ce:eth1"]
```

### 7.3 Fault Injection Controller Script
We write a python daemon (`fault_injector.py`) inside the simulation stack to execute controlled degradations using Linux `tc` netem commands and routing state changes.

```python
import subprocess
import time

def inject_packet_loss(interface, percentage):
    """Simulates physical layer or underlay degradation."""
    cmd = f"docker exec clab-aethernoc-sim-br1-ce tc qdisc add dev {interface} root netem loss {percentage}%"
    subprocess.run(cmd, shell=True, check=True)
    print(f"[FAULT INJECTOR] Injected {percentage}% packet loss on {interface}")

def inject_route_flap(neighbor_ip):
    """Simulates OSPF/BGP routing instability."""
    # Temporarily drop BGP neighbor using IPtables rules inside the container
    cmd = f"docker exec clab-aethernoc-sim-mpls-pe1 iptables -A INPUT -s {neighbor_ip} -j DROP"
    subprocess.run(cmd, shell=True, check=True)
    print(f"[FAULT INJECTOR] Blocked packets from {neighbor_ip} to induce route flapping.")
    time.sleep(30)
    # Remove block to allow reconnection, initiating routing convergence instability
    cmd_cleanup = f"docker exec clab-aethernoc-sim-mpls-pe1 iptables -D INPUT -s {neighbor_ip} -j DROP"
    subprocess.run(cmd_cleanup, shell=True, check=True)
    print(f"[FAULT INJECTOR] Removed block on {neighbor_ip} (convergence phase started).")
```

---

## 8. Telemetry Ingestion Pipeline

### 8.1 Ingestion Flow
1. **gNMI Streaming Telemetry:** Subscribes to path-based YANG models on Arista cEOS (e.g., `/interfaces/interface/state/counters/out-octets`).
2. **SNMP Polling:** Telegraf polls older legacy MIBs (e.g., `IF-MIB`, `IP-MIB`, `CISCO-PROCESS-MIB`) every 5 seconds.
3. **NetFlow/IPFIX Stream:** Devices push UDP Netflow packets to GoFlow2, which parses fields (source IP, destination IP, port, bytes, duration) and stores them in database partitions.
4. **Vector Log Collector:** Standardizes and parses syslog strings using VRL (Vector Remap Language).

### 8.2 Vector Parsing Configuration
The file `vector.yaml` parses structured network events:

```yaml
sources:
  syslog_in:
    type: "syslog"
    address: "0.0.0.0:514"
    mode: "udp"

transforms:
  parse_network_logs:
    type: "remap"
    inputs: ["syslog_in"]
    source: |
      .structured, err = parse_regex(.message, r'(?P<protocol>BGP|OSPF|LINK)-(?P<severity>[0-7])-(?P<event>\w+): (?P<details>.*)')
      if err != null {
        .structured = { "error": err }
      }
      .timestamp = now()

sinks:
  tsdb_out:
    type: "postgresql"
    inputs: ["parse_network_logs"]
    endpoint: "postgresql://postgres:secret@localhost:5432/telemetry"
    table: "syslogs"
```

---

## 9. Predictive Analytics Engine

Instead of firing alerts when an interface reaches 100% capacity, our predictive models learn the signature patterns leading up to breaches.

### 9.1 Network Health Index (NHI)
We define the Network Health Index for a node $n$ at time $t$ as:

$$\text{NHI}_n(t) = w_1 \cdot (1 - U_{\text{cpu}}(t)) + w_2 \cdot (1 - U_{\text{mem}}(t)) + w_3 \cdot \prod_{i \in I_n} (1 - L_i(t)) \cdot (1 - P_i(t))$$

Where:
* $U_{\text{cpu}}(t)$, $U_{\text{mem}}(t)$ are CPU and memory utilization fractions.
* $I_n$ is the set of interfaces on node $n$.
* $L_i(t)$ is normalized interface latency: $L_i(t) = \min(1, \frac{\text{latency}_i(t)}{\text{SLA\_max\_latency}})$.
* $P_i(t)$ is the interface packet loss rate.
* $w_1, w_2, w_3$ are weights summing to 1 (default: $0.2, 0.2, 0.6$).

### 9.2 Time-Series Congestion Predictor (LSTM)
We implement a sequence-to-sequence Long Short-Term Memory (LSTM) network in PyTorch that takes a sliding window of historical interface traffic metrics (60 timesteps $\times$ 5 seconds = 5 minutes) and forecasts interface utilization 15 minutes into the future.

```python
import torch
import torch.nn as nn

class InterfaceCongestionLSTM(nn.Module):
    def __init__(self, input_dim=5, hidden_dim=64, num_layers=2, output_dim=1):
        super(InterfaceCongestionLSTM, self).__init__()
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        self.lstm = nn.LSTM(input_dim, hidden_dim, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_dim, output_dim)
        
    def forward(self, x):
        # Initialize hidden state and cell state with zeros
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_dim).to(x.device)
        c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_dim).to(x.device)
        
        # Forward propagate LSTM
        out, _ = self.lstm(x, (h0, c0))
        
        # Predict the utilization value at the final step of the output window
        out = self.fc(out[:, -1, :])
        return out
```

### 9.3 Graph Anomaly Propagation (GNN)
We use PyTorch Geometric to build a Graph Anomaly Propagation model. The nodes are physical devices, and edges are physical cables or overlay IPSec tunnels.

```python
import torch
from torch_geometric.nn import GCNConv
import torch.nn.functional as F

class NetworkRiskGNN(torch.nn.Module):
    def __init__(self, num_node_features, num_classes=1):
        super(NetworkRiskGNN, self).__init__()
        self.conv1 = GCNConv(num_node_features, 16)
        self.conv2 = GCNConv(16, num_classes)

    def forward(self, x, edge_index, edge_weight):
        # First Graph Convolutional Layer with ReLU activation
        x = self.conv1(x, edge_index, edge_weight)
        x = F.relu(x)
        x = F.dropout(x, training=self.training)
        
        # Second layer generates a risk score mapping [0, 1] using Sigmoid
        x = self.conv2(x, edge_index, edge_weight)
        return torch.sigmoid(x)
```

### 9.4 Machine Learning Inference Pipeline
The inference pipeline pulls metrics from TimescaleDB every 30 seconds:
1. Ingests latest telemetry metrics.
2. Runs LSTM to project interface utilization trends.
3. Constructs topological graph matrices and computes risk propagation via GNN.
4. If calculated failure risk exceeds 75% within the forecast horizon (30 minutes), it flags a "Predictive Outage Event" and generates a JSON payload for the LLM.

---

## 10. Offline LLM Inference Engine

To operate securely within an air-gapped datacenter, we host the LLM locally on an enterprise server.

### 10.1 Local Hosting Setup
* **Hardware Profile:** Single workstation with 1x NVIDIA L40S (48GB VRAM) or CPU-only dual Intel Xeon 64-core server with 128GB RAM.
* **Serving Stack:** vLLM running inside Docker with CUDA execution providers.
* **Model:** `Qwen-2.5-7B-Instruct-Q5_K_M` (GGUF or GPTQ formats).
* **Launch Script:**

```bash
docker run -d --gpus all \
  -v /opt/models:/root/.cache/huggingface \
  -p 8000:8000 \
  --ipc=host \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-7B-Instruct \
  --quantization awq \
  --max-model-len 8192 \
  --port 8000
```

### 10.2 Structured System Prompt Template
To ensure the LLM outputs valid JSON that our automation and frontend interfaces can parse reliably, we define a strict system prompt:

```markdown
You are an expert Network Operations Center (NOC) Copilot running in a secure, air-gapped system. 
You must analyze the network topology, telemetry predictions, and historical runbooks provided to generate a structured JSON alert.

Your response must contain ONLY a single valid JSON object matching the following structure:
{
  "issue_prediction": "Short description of what is predicted to fail",
  "confidence_score": 0.0 to 1.0 (float),
  "root_cause_hypothesis": "Brief explanation of the core technical trigger",
  "estimated_time_to_impact": "X minutes / hours",
  "affected_scope": {
    "devices": ["list of hostnames"],
    "sites": ["list of sites"],
    "tunnels": ["list of tunnel interface names"]
  },
  "recommended_actions": [
    "step 1 to prevent failure",
    "step 2 to prevent failure"
  ],
  "remediation_ansible_playbook_name": "reroute_traffic_from_br1.yml",
  "urgency_classification": "CRITICAL / WARNING / ADVISORY"
}
```

---

## 11. Local Retrieval-Augmented Generation (RAG)

The RAG pipeline provides context to the offline LLM, ensuring it acts on specific runbooks and topology schemas rather than hallucinating commands.

```
+---------------------+     +--------------------+     +-------------------+
| Network Runbooks &  |     | System Topology    |     | Live Telemetry &  |
| Incident Post-Mort  |     | Metadata (JSON)    |     | ML Predictions    |
+----------+----------+     +---------+----------+     +---------+---------+
           |                          |                          |
           v                          v                          v
    ChromaDB Vector              Neo4j Query               JSON Context
    (Local Embeddings)          (Graph Schema)             (Inference Output)
           |                          |                          |
           +--------------------------+--------------------------+
                                      |
                                      v
                             [ Prompt Compiler ]
                                      |
                                      v
                             Local Quantized LLM
```

### 11.1 Document Ingestion Pipeline
We write a python ingestion daemon (`rag_ingester.py`) to process raw PDF manuals, Markdown runbooks, and Cisco/Arista config templates, converting them to vectorized representations inside ChromaDB.

```python
import os
from langchain_community.document_loaders import DirectoryLoader, MarkdownLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma

# Define local embedding model path (downloaded during packaging phase)
LOCAL_MODEL_PATH = "./models/bge-large-en-v1.5"

embeddings = HuggingFaceEmbeddings(
    model_name=LOCAL_MODEL_PATH,
    model_kwargs={'device': 'cuda'}  # Fallback to 'cpu' if no GPU is available
)

def ingest_local_runbooks():
    loader = DirectoryLoader('./kb/runbooks', glob="**/*.md", loader_cls=MarkdownLoader)
    documents = loader.load()
    
    # Split text into chunks optimized for CLI manuals and CLI configurations
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
    docs = text_splitter.split_documents(documents)
    
    # Store locally in ChromaDB
    db = Chroma.from_documents(docs, embeddings, persist_directory="./vector_store")
    db.persist()
    print(f"[RAG INGESTER] Successfully ingested {len(docs)} chunks into offline database.")

if __name__ == "__main__":
    ingest_local_runbooks()
```

### 11.2 Hybrid Retrieval and Prompt Synthesis
When a prediction alerts on Branch-1, we perform a hybrid search:
1. **Vector Similarity:** Search for "Branch-1 tunnel flap restoration runbook" inside ChromaDB.
2. **Graph Fetch:** Query Neo4j for adjacent nodes, active IPSec interfaces, and current metrics.
3. **Synthesis:** Build the context-enriched prompt.

---

## 12. Glassmorphism NOC Dashboard Design

The dashboard must look visually stunning and function as a real-time command center. We implement a dark-theme, glassmorphism UI styled with Vanilla CSS.

### 12.1 Layout Structure
* **Header:** Logo, System Status (Online/Offline), Air-Gap verification lock, and Overall Network Health Index (Gauge).
* **Left Panel - Live Topology Graph:** An interactive HTML5 Canvas/SVG network graph showcasing simulated nodes, links, and health metrics. Nodes glow and pulse according to their predicted risk score.
* **Middle Panel - Predictive Alerts Timeline:** Real-time stream of upcoming predicted issues with confidence indicators and time-to-failure countdowns.
* **Right Panel - Interactive Copilot Chat:** Input chat query interface and markdown/code box displaying recommended corrective actions and generated Ansible playbooks.
* **Bottom Panel - Real-Time Telemetry Plots:** Real-time graphs plotting interface congestion, latency, and routing table dynamics.

### 12.2 Dashboard Styling (Vanilla CSS)
Here is the core CSS design token system (`index.css`):

```css
:root {
  --bg-primary: #0a0f1d;
  --glass-bg: rgba(15, 23, 42, 0.45);
  --glass-border: rgba(255, 255, 255, 0.08);
  --accent-cyan: #06b6d4;
  --accent-purple: #8b5cf6;
  --alert-red: #ef4444;
  --alert-orange: #f97316;
  --text-primary: #f8fafc;
  --text-muted: #94a3b8;
}

body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Outfit', 'Inter', sans-serif;
  margin: 0;
  overflow: hidden;
}

.glass-card {
  background: var(--glass-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.glass-card:hover {
  border-color: rgba(6, 182, 212, 0.3);
  box-shadow: 0 8px 32px 0 rgba(6, 182, 212, 0.15);
}

.alert-pulse {
  animation: pulse-red 2s infinite;
}

@keyframes pulse-red {
  0% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(239, 68, 68, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
  }
}
```

---

## 13. Automation & Remediation

When a failure is predicted (e.g., predicted packet loss on Branch-1's primary MPLS circuit), we implement an automated orchestration pipeline to reroute traffic over the secondary IPSec internet tunnel before the failure occurs.

### 13.1 SLA Impact Assessment
Before running remediation, we compute the Estimated SLA Impact:

$$\text{SLA Impact} = \text{Criticality}_{\text{Site}} \times \text{Bandwidth}_{\text{Deficit}} \times \text{Duration}_{\text{Predicted}}$$

This classifies the priority (e.g., Tier-1 sites receive immediate automated reroute; Tier-3 sites alert the operator for confirmation).

### 13.2 Rollback-Safe Execution Flow
1. **Generate Configuration:** LLM determines the routing policy modifications and references the exact Ansible playbook.
2. **Pre-Check:** Automation runs validation tests to ensure target endpoints are responsive.
3. **Deploy (Commit Confirmed):**
   ```yaml
   - name: Apply reroute policy on branch router
     cisco.ios.ios_config:
       lines:
         - ip route 10.100.0.0 255.255.0.0 Tunnel 10 50
       save_when: never
       confirm: 5
   ```
4. **Verification Loop:** Run automated diagnostics checking ping reachability, interface stats, and BGP peering statuses.
5. **Confirm/Rollback:** If diagnostics succeed, send `confirm` command. If fail, the device will revert configuration changes after the 5-minute confirmation window closes.

---

## 14. Cybersecurity & Air-Gapped Controls

Operating in an air-gapped domain means we must implement secure supply-chain, verification, and data protection architectures.

```
       [ SECURE DEV ENVIRONMENT (Connected) ]
                          |
             1. Download Models & Wheels
             2. Compile offline bundle (.tar.gz)
             3. Generate SHA-256 Checksums & Signatures
                          |
                          v
               [ DATA DIODE / USB MEDIA ]
                          |
                          v
         [ AIR-GAPPED DEPLOYMENT TARGET (Offline) ]
                          |
             1. Verify SHA-256 Checksums
             2. Validate Cryptographic Signatures
             3. Untar & run Docker Compose locally
```

### 14.1 Offline Packaging Protocol
Because the production server has zero internet access, we compile all dependencies into a single offline bundle in a secure, internet-connected development environment:
1. **Download Python Wheels:** Download all pip packages matching a strict lockfile:
   ```bash
   pip download -r requirements.txt -d ./wheels
   ```
2. **Pull Docker Images:** Export all required container images:
   ```bash
   docker pull vllm/vllm-openai:latest
   --
   docker save vllm/vllm-openai:latest | gzip > ./images/vllm-openai.tar.gz
   ```
3. **Model Weights Ingestion:** Cache the offline transformer embeddings and LLM weights (`.gguf` or `.safetensors`).
4. **Build Archive:** Compress the workspace into a single tarball:
   ```bash
   tar -czvf aethernoc-release-v1.0.tar.gz ./wheels ./images ./models ./src docker-compose.yml
   ```

### 14.2 Model Verification Protocol
Before the application initializes, a bash script verifies the hash and cryptographic signature of the LLM weights:
```bash
#!/bin/bash
MODEL_FILE="./models/qwen2.5-7b-instruct.awq"
EXPECTED_SHA="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

echo "[SECURITY] Verifying model integrity..."
ACTUAL_SHA=$(sha256sum $MODEL_FILE | awk '{print $1}')

if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
    echo "[CRITICAL] Model hash mismatch! Expected: $EXPECTED_SHA, got: $ACTUAL_SHA"
    exit 1
fi

# Verify signature using local GPG keychain
gpg --verify "$MODEL_FILE.sig" "$MODEL_FILE"
if [ $? -ne 0 ]; then
    echo "[CRITICAL] Cryptographic signature invalid! Rejecting model weights."
    exit 1
fi
echo "[SECURITY] Integrity checks passed. Loading model..."
```

---

## 15. End-to-End Data Flow

The following sequence details how AetherNOC processes network failures:

1. **Ingest Layer:** A physical degradation occurs (e.g., carrier fiber degrades, inducing packet drops). Containerlab devices emit SNMP interface increments (`ifInErrors`) and syslog lines. Telegraf parses the interface metrics, while Vector ingests syslog streams.
2. **Analysis Layer:** TimescaleDB updates. The predictive LSTM engine detects the packet error trend, forecasting a tunnel failure in 15 minutes with a calibrated confidence score of 89%.
3. **State Integration:** The event correlator updates the Neo4j Graph DB, mapping the degraded physical interface to its associated IPSec overlay tunnels and BGP paths.
4. **Context Retrieval:** The query engine queries Neo4j for the active graph topology and extracts past incident tickets and recovery runbooks from ChromaDB matching "IPSec degradation restoration."
5. **Inference & Explanation:** The local vLLM parses the unified prompt containing the active telemetry metrics, graph neighbors, and retrieved runbooks. It returns a structured JSON payload explaining the root cause, affected endpoints, and recommended remediation.
6. **Remediation & Display:** The React dashboard renders the alert. The physical path glows red on the UI, displaying the estimated time-to-failure countdown. A console displays the compiled Ansible playbook. The operator clicks "Confirm," and the configuration change executes under a commit-confirmed transaction.

---

## 16. Deployment Guide

Follow these steps to deploy AetherNOC on a clean, air-gapped target server:

### 16.1 Target System Prerequisites
* **CPU:** 16 Cores (Intel Xeon / AMD EPYC)
* **RAM:** 64 GB
* **GPU:** Optional (1x NVIDIA A10/L4 or higher for faster inference)
* **Storage:** 500 GB SSD
* **OS:** Ubuntu 22.04 LTS (installed with local packaging repository)

### 16.2 Installation Steps
1. **Mount USB/Diode Drive:** Copy `aethernoc-release-v1.0.tar.gz` to the server:
   ```bash
   sudo mount /dev/sdb1 /mnt
   cp /mnt/aethernoc-release-v1.0.tar.gz /opt/
   cd /opt
   tar -xzvf aethernoc-release-v1.0.tar.gz
   ```
2. **Load Offline Docker Images:** Import container images into the local runtime registry:
   ```bash
   docker load -i ./images/postgres.tar.gz
   docker load -i ./images/neo4j.tar.gz
   docker load -i ./images/vllm-openai.tar.gz
   docker load -i ./images/chromadb.tar.gz
   docker load -i ./images/fastapi-app.tar.gz
   ```
3. **Install Local Python Dependencies (Wheels):** Installs Python packages without downloading external dependencies:
   ```bash
   pip install --no-index --find-links=./wheels -r src/requirements.txt
   ```
4. **Initialize Containerlab Environment:** Sets up the simulated network nodes:
   ```bash
   sudo clab deploy -t src/topology.yaml
   ```
5. **Start System Containers:** Starts the infrastructure stack:
   ```bash
   docker-compose up -d
   ```
6. **Validate Health Status:** Verifies component connectivity:
   ```bash
   curl http://localhost:8000/api/v1/health
   ```

---

## 17. Implementation Roadmap & Timeline

AetherNOC is structured as a 12-week development cycle broken down into 6 distinct sprints:

```
Sprint 1: Sim & Ingestion [Weeks 1-2]     |========|
Sprint 2: Predictive Engine [Weeks 3-4]            |========|
Sprint 3: LLM & RAG Setup [Weeks 5-6]                       |========|
Sprint 4: UI & Automation [Weeks 7-8]                                |========|
Sprint 5: Security Hardening [Weeks 9-10]                                      |========|
Sprint 6: Testing & Demo [Weeks 11-12]                                                   |========|
```

* **Sprint 1: Infrastructure Simulation & Telemetry Ingestion (Weeks 1–2)**
  * Construct Containerlab SD-WAN/MPLS physical and overlay topology.
  * Establish Telegraf, Vector, and TimescaleDB telemetry collection pipeline.
  * *Deliverable:* A running simulation streaming metrics to local storage.
* **Sprint 2: Predictive Analytics Engine (Weeks 3–4)**
  * Develop LSTM forecasting modules for link capacity and latency metrics.
  * Configure Neo4j graph model and construct R-GCN risk propagation modules.
  * *Deliverable:* Core ML prediction services publishing alerts to TimescaleDB.
* **Sprint 3: Offline LLM & RAG Integration (Weeks 5–6)**
  * Spin up local vLLM/Llama.cpp instances running quantized weights.
  * Configure ChromaDB vector database and develop document ingestion pipelines.
  * *Deliverable:* A functional local chat copilot responding with runbook contexts.
* **Sprint 4: Interface Dashboard & Automation Pipelines (Weeks 7–8)**
  * Code the React dashboard with glassmorphism styling tokens.
  * Develop Ansible orchestration scripts for commit-confirmed configurations.
  * *Deliverable:* A unified web interface displaying predictions and running playbooks.
* **Sprint 5: Cybersecurity & Air-Gap Compliance (Weeks 9–10)**
  * Write model signature validation engines and build local packaging scripts.
  * Execute network-isolation tests ensuring zero external dependencies.
  * *Deliverable:* Cryptographically verified packages running on isolated hardware.
* **Sprint 6: Chaos Testing, Calibration & Polish (Weeks 11–12)**
  * Ingest failure vectors and calibrate confidence scores.
  * Execute end-to-end demo scripts and refine documentation.
  * *Deliverable:* Fully operational platform, deployment artifacts, and user manuals.

---

## 18. Testing & Verification Strategy

To guarantee the reliability of predictions and safety of automated playbooks, we use a structured chaos testing framework.

### 18.1 Chaos Scenarios
* **Scenario A: Underlay Fiber Degradation:** We execute the fault injector script to increment interface drops by 1% every minute. We verify if the GNN model flags tunnel degradation before BGP sessions drop.
* **Scenario B: Core BGP Hijack/Flap:** Introduce routing loops at the PE layers. We verify if the dashboard visualizes the route flapping event and guides the operator using the correct recovery runbooks.

### 18.2 Automated Verification Script
We run a health-check verification script (`verify_integration.py`) to validate all pipeline interfaces:

```python
import requests
import json

def test_api_health():
    resp = requests.get("http://localhost:8000/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"
    print("[TEST] API Backend is reachable and healthy.")

def test_llm_inference():
    payload = {
        "model": "Qwen/Qwen2.5-7B-Instruct",
        "messages": [{"role": "user", "content": "Ping test from Branch-1."}],
        "temperature": 0.0
    }
    resp = requests.post("http://localhost:8000/v1/chat/completions", json=payload)
    assert resp.status_code == 200
    assert "choices" in resp.json()
    print("[TEST] Offline LLM Inference Engine is operational.")

if __name__ == "__main__":
    test_api_health()
    test_llm_inference()
```

---

## 19. Evaluation & Performance Metrics

We judge the platform's performance against four target metrics:

1. **Prediction Horizon (Lead Time):** The amount of time between our system flagging a predictive alert and the actual SLA breach occurring. Target: **$\ge$ 15 minutes**.
2. **F1-Score (Failure Predictions):** Harmonic mean of prediction precision and recall. Target: **$\ge$ 0.90**.
3. **Retrieval Faithfulness (RAG):** Evaluates if the LLM's explanations match runbook contents without hallucinating commands. Target: **100% Grounded**.
4. **Air-Gap Verification:** System security checks confirming zero outbound socket attempts. Target: **0 Outbound Bytes**.

---

## 20. Demo Walkthrough Scenario

A live demonstration validates the end-to-end functionality of AetherNOC:

1. **Baseline State:** The dashboard shows a healthy network (NHI at 98%). The topology graph shows green links, and traffic flows smoothly between Datacenter and Branch-1.
2. **Fault Injection:** We run `fault_injector.py --inject-latency 120` to degrade Branch-1's primary WAN link.
3. **Visual Alerting:** Within 30 seconds, the dashboard alerts: *"Predicted WAN tunnel failure in 12 minutes."* The affected link turns orange and pulses.
4. **Copilot Analysis:** The chat window displays:
   * **Root Cause:** Primary link latency degradation exceeding SLA maximum limits.
   * **Evidence:** SNMP `ifOutDelay` increased from 15ms to 125ms.
   * **Impact:** High-priority VoIP traffic will experience packet loss.
5. **Remediation Execution:** The copilot generates a recovery plan: Reroute Tier-1 traffic over the backup IPSec tunnel. The operator clicks "Confirm."
6. **Verification & Restoration:** Ansible pushes configuration changes to the branch router using a commit-confirmed transaction. The system verifies connectivity, confirms the change, and the node returns to a stable state (NHI at 94%).

---

## 21. Future Scope & Advancements

* **Federated Offline Learning:** Allows multiple air-gapped instances of AetherNOC to share weights and model updates via cryptographically signed files, updating ML engines without centralized database leaks.
* **Reinforcement Learning (RL) Traffic Engineering:** Implements offline RL algorithms (e.g., Conservative Q-Learning) to optimize traffic pathways dynamically without manual playbook confirmation.

---

## 22. Hackathon Strategy & Judging Highlights

To secure maximum points in a competitive national hackathon, we optimize for four evaluation parameters:

* **Technical Merit (35%):** Showcase real predictions using an active Containerlab topology rather than mocked interfaces. Highlight graph neural networks and model calibration systems.
* **Copilot Effectiveness (35%):** Demonstrate the RAG system using actual device documentation. Show how the LLM extracts commands directly from vendor files.
* **Security & Offline Compliance (20%):** Demonstrate full network isolation. Execute the application with host NICs disabled, proving zero cloud dependencies.
* **Documentation Quality (10%):** Deliver this architecture document, clean source files, and a reproducible deployment guide.
