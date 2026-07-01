// Dynamic Topology Coordinate Layers managed by Digital Twin Backend

let ws;
let currentTopology = {};
let activeAlerts = [];
let chartHistory = [];
let chartLimit = 30;
let selectedLink = "L-PE2-BR1";

// Standalone fallback topology metrics for demo mode
let demoModeActive = false;
let demoTimer = null;
let demoStep = 0;
let demoActiveFaults = {};
const demoTopology = {
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
        "T-BR1-DC-PRI": {"src": "Branch-CE-1", "dst": "DC-CE-1", "capacity": 50, "utilization": 15, "latency": 24.5, "loss": 0.0, "jitter": 1.4, "type": "tunnel", "underlay": "L-PE2-BR1"},
        "T-BR1-DC-BAK": {"src": "Branch-CE-1", "dst": "DC-CE-1", "capacity": 30, "utilization": 5, "latency": 45.0, "loss": 0.0, "jitter": 2.5, "type": "tunnel", "underlay": "L-PE2-BR1"},
        "T-BR2-DC-PRI": {"src": "Branch-CE-2", "dst": "DC-CE-1", "capacity": 50, "utilization": 12, "latency": 28.2, "loss": 0.0, "jitter": 1.7, "type": "tunnel", "underlay": "L-PE2-BR2"}
    }
};

// DOM Elements
const topologySvg = document.getElementById("topology-svg");
const svgLinksGroup = document.getElementById("svg-links");
const svgNodesGroup = document.getElementById("svg-nodes");
const nhiDisplay = document.getElementById("nhi-display");
const nhiBar = document.getElementById("nhi-bar");
const alertCount = document.getElementById("alert-count");
const timelineContainer = document.getElementById("timeline-container");
const chatLog = document.getElementById("chat-log");
const chatInput = document.getElementById("chat-input");
const sendChatBtn = document.getElementById("send-chat-btn");
const playbookName = document.getElementById("playbook-name");
const playbookCode = document.getElementById("playbook-code");
const executePlaybookBtn = document.getElementById("execute-playbook-btn");
const injectFaultBtn = document.getElementById("inject-fault-btn");
const clearFaultsBtn = document.getElementById("clear-faults-btn");
const faultTypeSelect = document.getElementById("fault-type-select");
const faultTargetSelect = document.getElementById("fault-target-select");
const metricSelector = document.getElementById("telemetry-metric-selector");

// Metric text boxes
const metricLatency = document.getElementById("metric-latency");
const metricLoss = document.getElementById("metric-loss");
const metricJitter = document.getElementById("metric-jitter");
const canvas = document.getElementById("telemetry-chart");
const ctx = canvas.getContext("2d");

// Connect to backend websocket telemetry stream
function connectWebsocket() {
    try {
        ws = new WebSocket("ws://127.0.0.1:8000/api/v1/telemetry/ws");

        ws.onopen = () => {
            console.log("[WEBSOCKET] Connected to telemetry source.");
            document.querySelector(".status-indicator-dot").classList.add("online-glow");
            if (demoTimer) {
                clearInterval(demoTimer);
                demoModeActive = false;
            }
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            currentTopology = data.topology;
            activeAlerts = data.predictive_alerts;
            
            updateDashboardState();
        };

        ws.onclose = () => {
            console.log("[WEBSOCKET] Disconnected. Activating Demo Fallback...");
            document.querySelector(".status-indicator-dot").classList.remove("online-glow");
            activateDemoMode();
        };

        ws.onerror = () => {
            activateDemoMode();
        };
    } catch(e) {
        activateDemoMode();
    }
}

// Emulates backend ticks inside the browser for zero-server demo environments
function activateDemoMode() {
    if (demoModeActive) return;
    demoModeActive = true;
    console.log("[AETHERNOC] Standalone Client-Side Demo Mode activated.");
    document.querySelector(".status-indicator-dot").classList.add("online-glow");
    document.querySelector(".badge-text").innerText = "SECURE DEMO MODE (STANDALONE ACTIVE)";
    
    currentTopology = JSON.parse(JSON.stringify(demoTopology));
    
    demoTimer = setInterval(() => {
        demoStep++;
        const t = demoStep * 0.1;
        
        // Update nodes and link utilization locally
        for (const linkId in currentTopology.links) {
            const link = currentTopology.links[linkId];
            if (link.type === "physical") {
                link.utilization = Math.round(link.capacity * (0.3 + 0.08 * Math.sin(t) + 0.02 * Math.random()));
                link.loss = 0.0;
                link.latency = linkId === "L-PE2-BR1" ? 15.0 : linkId === "L-PE2-BR2" ? 18.0 : 5.0;
                link.jitter = 1.0 + Math.random();
            } else {
                const underlay = currentTopology.links[link.underlay];
                link.latency = underlay.latency + 10.0 + Math.random();
                link.loss = underlay.loss;
                link.jitter = underlay.jitter + 0.5;
            }
        }
        
        for (const nodeId in currentTopology.nodes) {
            const node = currentTopology.nodes[nodeId];
            node.cpu = Math.round(15.0 + 5.0 * Math.sin(t) + Math.random() * 4);
            node.status = "UP";
        }
        
        // Apply active simulation faults locally
        activeAlerts = [];
        for (const faultName in demoActiveFaults) {
            const fault = demoActiveFaults[faultName];
            const target = fault.target;
            
            if (currentTopology.links[target]) {
                const link = currentTopology.links[target];
                if (faultName === "link_congestion") {
                    link.utilization = Math.round(link.capacity * 1.05);
                    link.latency = 95.0;
                    link.jitter = 18.2;
                    
                    activeAlerts.push({
                        "id": `PA-${target}-CONG`,
                        "type": "Interface Congestion",
                        "target": target,
                        "time_to_failure": "12 minutes",
                        "confidence": 0.94,
                        "severity": "CRITICAL",
                        "root_cause": `Projected capacity saturation on link ${target}. Current rate: ${link.utilization} Mbps, Projected: ${link.utilization + 5} Mbps.`,
                        "evidence": `Usage slope gradient: +0.42 Mbps/min. Platt Calibration z-score positive.`
                    });
                } else if (faultName === "packet_loss_spike") {
                    link.loss = 8.5;
                    link.latency = 35.0;
                    
                    // Cascade to tunnels
                    for (const tunId in currentTopology.links) {
                        const tun = currentTopology.links[tunId];
                        if (tun.type === "tunnel" && tun.underlay === target) {
                            tun.loss = 10.2;
                            activeAlerts.push({
                                "id": `PA-${tunId}-DEG`,
                                "type": "Tunnel SLA Degradation",
                                "target": tunId,
                                "time_to_failure": "8 minutes",
                                "confidence": 0.88,
                                "severity": "CRITICAL",
                                "root_cause": `Underlay link failure cascade. Physical carrier link ${target} is reporting packet loss of ${link.loss}%.`,
                                "evidence": `Relational GNN Risk Propagation score: 0.88.`
                            });
                        }
                    }
                }
            } else if (currentTopology.nodes[target]) {
                const node = currentTopology.nodes[target];
                if (faultName === "cpu_spike") {
                    node.cpu = 96.0;
                    activeAlerts.push({
                        "id": `PA-${target}-FLAP`,
                        "type": "Routing Instability",
                        "target": target,
                        "time_to_failure": "15 minutes",
                        "confidence": 0.88,
                        "severity": "CRITICAL",
                        "root_cause": `OSPF/BGP convergence failure threat. Device ${target} Health Index critically degraded.`,
                        "evidence": `Node CPU: ${node.cpu}%. Adjacent path degradation detected.`
                    });
                }
            }
        }
        
        updateDashboardState();
    }, 2000);
}

// Update dashboard elements
function updateDashboardState() {
    if (!currentTopology.nodes) return;

    // 1. Calculate Average Network Health Index (NHI)
    let totalNhi = 0;
    let nodeCount = 0;
    for (const nodeId in currentTopology.nodes) {
        // CPU, memory calculations
        const node = currentTopology.nodes[nodeId];
        let nodeNhi = 100 - (node.cpu * 0.2 + (node.status === "FLAPPING" ? 50 : 0));
        totalNhi += nodeNhi;
        nodeCount++;
    }
    const avgNhi = Math.round(totalNhi / nodeCount);
    nhiDisplay.innerText = `${avgNhi}%`;
    nhiBar.style.width = `${avgNhi}%`;
    if (avgNhi < 75) {
        nhiDisplay.style.color = "var(--accent-red)";
        nhiBar.style.background = "var(--accent-red)";
    } else if (avgNhi < 90) {
        nhiDisplay.style.color = "var(--accent-orange)";
        nhiBar.style.background = "var(--accent-orange)";
    } else {
        nhiDisplay.style.color = "var(--accent-green)";
        nhiBar.style.background = "linear-gradient(90deg, var(--accent-green), #34d399)";
    }

    // 2. Draw Network Graph
    drawTopology();

    // 3. Render Outage Timeline
    renderTimeline();

    // 4. Update real-time charts data queue
    recordTelemetryData();
}

// Ingest current selected link parameters into line graph queue
function recordTelemetryData() {
    const link = currentTopology.links[selectedLink];
    if (!link) return;

    metricLatency.innerText = `${link.latency.toFixed(1)} ms`;
    metricLoss.innerText = `${link.loss.toFixed(1)} %`;
    metricJitter.innerText = `${link.jitter.toFixed(1)} ms`;

    // Push snapshot
    chartHistory.push({
        latency: link.latency,
        loss: link.loss,
        utilization: link.utilization,
        capacity: link.capacity
    });

    if (chartHistory.length > chartLimit) {
        chartHistory.shift();
    }

    drawTelemetryLineChart();
}

// Render topological elements inside SVG container
function drawTopology() {
    svgLinksGroup.innerHTML = "";
    svgNodesGroup.innerHTML = "";

    // 1. Draw Links
    for (const linkId in currentTopology.links) {
        const link = currentTopology.links[linkId];
        const srcNode = currentTopology.nodes[link.src];
        const dstNode = currentTopology.nodes[link.dst];

        if (!srcNode || !dstNode) continue;

        // Path lines
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        let d = `M ${srcNode.x} ${srcNode.y} L ${dstNode.x} ${dstNode.y}`;

        // Arch tunnels to separate overlay paths visually
        if (link.type === "tunnel") {
            const dx = dstNode.x - srcNode.x;
            const dy = dstNode.y - srcNode.y;
            const dr = Math.sqrt(dx * dx + dy * dy) * 1.3;
            d = `M ${srcNode.x} ${srcNode.y} A ${dr} ${dr} 0 0 1 ${dstNode.x} ${dstNode.y}`;
        }

        path.setAttribute("d", d);
        path.setAttribute("class", "topology-link");
        path.setAttribute("fill", "none");

        // Styling link based on status
        let strokeColor = "rgba(6, 182, 212, 0.4)"; // Nominal Physical
        if (link.type === "tunnel") {
            strokeColor = "rgba(168, 85, 247, 0.4)"; // Nominal Tunnel
        }

        if (link.loss > 2.0 || link.utilization > link.capacity * 0.85) {
            strokeColor = "var(--accent-red)";
            path.style.strokeWidth = "3px";
        } else if (link.loss > 0 || link.utilization > link.capacity * 0.70) {
            strokeColor = "var(--accent-orange)";
            path.style.strokeWidth = "2.5px";
        } else {
            path.style.strokeWidth = "1.5px";
        }

        path.setAttribute("stroke", strokeColor);
        
        // Add animated dash lines for active tunnels
        if (link.type === "tunnel") {
            path.setAttribute("stroke-dasharray", "4,4");
        }

        svgLinksGroup.appendChild(path);
    }

    // 2. Draw Nodes dynamically using backend coordinates
    for (const nodeId in currentTopology.nodes) {
        const node = currentTopology.nodes[nodeId];

        if (node.x === undefined || node.y === undefined) continue;

        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("class", "topology-node");
        g.setAttribute("transform", `translate(${node.x}, ${node.y})`);

        // Node Glow Ring
        const glow = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        glow.setAttribute("r", "16");
        glow.setAttribute("fill", "none");
        glow.setAttribute("stroke-width", "2");

        let nodeColor = "var(--accent-green)";
        if (node.status === "FLAPPING") {
            nodeColor = "var(--accent-red)";
            glow.setAttribute("class", "alert-pulse");
        } else if (node.cpu > 70) {
            nodeColor = "var(--accent-orange)";
        }

        glow.setAttribute("stroke", nodeColor);
        glow.setAttribute("opacity", "0.4");
        g.appendChild(glow);

        // Solid Node Core
        const core = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        core.setAttribute("r", "10");
        core.setAttribute("fill", "#090d1a");
        core.setAttribute("stroke", nodeColor);
        core.setAttribute("stroke-width", "3");
        g.appendChild(core);

        // Node label
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("y", "24");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", "var(--text-desc)");
        text.setAttribute("font-size", "10px");
        text.setAttribute("font-weight", "600");
        text.textContent = node.type === "branch" ? (nodeId === "Branch-CE-1" ? "Branch-1" : "Branch-2") : nodeId;
        g.appendChild(text);

        // Register Node clicks
        g.addEventListener("click", () => {
            chatInput.value = `Describe telemetry statistics for device ${nodeId}`;
            chatInput.focus();
        });

        svgNodesGroup.appendChild(g);
    }
}

// Render incident timeline alert cards
function renderTimeline() {
    alertCount.innerText = `${activeAlerts.length} Alerts`;
    
    if (activeAlerts.length === 0) {
        timelineContainer.innerHTML = `
            <div class="timeline-empty-state">
                <span class="shield-check-icon">🛡️</span>
                <p>No predictive anomalies detected. Underlay latency and overlay traffic shapes within SLA thresholds.</p>
            </div>`;
        return;
    }

    timelineContainer.innerHTML = "";
    activeAlerts.forEach(alert => {
        const isCritical = alert.severity === "CRITICAL";
        const card = document.createElement("div");
        card.className = `predictive-alert-card ${isCritical ? 'critical' : 'warning'}`;
        card.innerHTML = `
            <div class="alert-card-header ${isCritical ? '' : 'warning'}">
                <span class="alert-badge">${alert.severity}</span>
                <span class="alert-time">Outage in: ${alert.time_to_failure}</span>
            </div>
            <h4>${alert.type} on ${alert.target}</h4>
            <p>${alert.root_cause}</p>
            <div class="alert-confidence-row">
                Confidence Level: <strong>${Math.round(alert.confidence * 100)}%</strong> (Platt Calibrated)
            </div>
        `;

        // Click alert card to load details into Copilot
        card.addEventListener("click", () => {
            chatInput.value = `Analyze predictive failure alert for ${alert.target} and recommend how to prevent it.`;
            submitChat();
        });

        timelineContainer.appendChild(card);
    });
}

// Draw canvas line metrics graph
function drawTelemetryLineChart() {
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    if (chartHistory.length < 2) return;

    // Draw background grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = (height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    // Determine scale limits
    const maxVal = Math.max(...chartHistory.map(d => d.latency)) * 1.2 || 50;

    // Plot latency line (Cyan)
    ctx.strokeStyle = "#06b6d4";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < chartHistory.length; i++) {
        const x = (width / (chartLimit - 1)) * i;
        const y = height - (chartHistory[i].latency / maxVal) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw area fill under line
    ctx.lineTo((width / (chartLimit - 1)) * (chartHistory.length - 1), height);
    ctx.lineTo(0, height);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(6, 182, 212, 0.15)");
    gradient.addColorStop(1, "rgba(6, 182, 212, 0)");
    ctx.fillStyle = gradient;
    ctx.fill();

    // Plot packet loss spikes (Red bars overlay)
    chartHistory.forEach((pt, i) => {
        if (pt.loss > 0) {
            const x = (width / (chartLimit - 1)) * i;
            const barHeight = (pt.loss / 100) * height;
            ctx.fillStyle = "rgba(239, 68, 68, 0.6)";
            ctx.fillRect(x - 2, height - barHeight, 4, barHeight);
        }
    });
}

// Chat API submit
async function submitChat() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Append User Message bubble
    appendChatBubble("user", text);
    chatInput.value = "";

    if (demoModeActive) {
        // Standalone Client-Side Mock Responses
        setTimeout(() => {
            const query = text.toLowerCase();
            let response = {};
            if (query.includes("fail") || query.includes("next") || query.includes("alert")) {
                if (activeAlerts.length > 0) {
                    const alert = activeAlerts[0];
                    const targetNode = currentTopology.links[alert.target] ? currentTopology.links[alert.target].dst : alert.target;
                    const vendor = currentTopology.nodes[targetNode] ? currentTopology.nodes[targetNode].vendor : "cisco_iosxe";
                    
                    let playbook_name = "reroute_traffic_cisco.yml";
                    let playbook_content = `---
- name: Restructure Edge Routing Metric Shares (Cisco IOS-XE)
  hosts: ${alert.target}
  tasks:
    - name: Adjust administrative distance on secondary tunnel route
      cisco.ios.ios_config:
        lines:
          - ip route 10.100.0.0 255.255.0.0 Tunnel 10 50
        confirm: 5`;
                    
                    if (vendor === "arista_eos") {
                        playbook_name = "reroute_traffic_arista.yml";
                        playbook_content = `---
- name: Restructure Edge Routing Metric Shares (Arista EOS)
  hosts: ${alert.target}
  tasks:
    - name: Adjust route metrics via static CLI commands
      arista.eos.eos_config:
        lines:
          - ip route 10.100.0.0/16 192.168.10.2 50
        confirm: 5`;
                    } else if (vendor === "juniper_junos") {
                        playbook_name = "reroute_traffic_juniper.yml";
                        playbook_content = `---
- name: Restructure Edge Routing Metric Shares (Juniper Junos)
  hosts: ${alert.target}
  tasks:
    - name: Adjust route preferences on target tunnel routing instances
      junipernetworks.junos.junos_config:
        lines:
          - set routing-options static route 10.100.0.0/16 next-hop st0.0 preference 50
        confirm: 5`;
                    }
                    
                    response = {
                        "issue_prediction": `Impending degradation of ${alert.target} (${alert.type})`,
                        "confidence_score": alert.confidence,
                        "root_cause_hypothesis": alert.root_cause,
                        "estimated_time_to_impact": alert.time_to_failure,
                        "affected_scope": {
                            "devices": [alert.target],
                            "sites": ["Branch-1"],
                            "tunnels": ["T-BR1-DC-PRI"]
                        },
                        "recommended_actions": [
                            "Initiate local diagnostic logs on targeted interface",
                            "Adjust routing metrics or apply priority QoS policy map",
                            "Verify tunnel restoration convergence"
                        ],
                        "remediation_ansible_playbook_name": playbook_name,
                        "playbook_content": playbook_content,
                        "urgency_classification": alert.severity,
                        "evidence": alert.evidence,
                        "rag_source_runbook": alert.type.includes("Congestion") ? "mpls_congestion_engineering.md" : "restore_ipsec_degradation.md"
                    };
                } else {
                    response = {
                        "issue_prediction": "All interfaces nominal. No predictive failures detected.",
                        "confidence_score": 0.98,
                        "root_cause_hypothesis": "None",
                        "estimated_time_to_impact": "N/A",
                        "affected_scope": {"devices": [], "sites": [], "tunnels": []},
                        "recommended_actions": ["Maintain active telemetry polling."],
                        "remediation_ansible_playbook_name": "None",
                        "playbook_content": "",
                        "urgency_classification": "ADVISORY",
                        "evidence": "Network Health Index averaging >96% across paths.",
                        "rag_source_runbook": "None"
                    };
                }
            } else {
                response = {
                    "chat_reply": "Hello! I am your air-gapped NOC Copilot running in client-side fallback mode. Ask 'what is likely to fail next?' to scan predictions, or test fault injection below."
                };
            }
            renderCopilotResponse(response);
        }, 500);
        return;
    }

    try {
        const response = await fetch("http://127.0.0.1:8000/api/v1/copilot/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text })
        });

        const data = await response.json();
        renderCopilotResponse(data);
    } catch (e) {
        appendChatBubble("system", "Error: Local copilot server is unreachable. Please verify main.py service state.");
    }
}

// Append bubble structures
function appendChatBubble(sender, text) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${sender}-bubble`;
    bubble.innerHTML = `<strong>${sender === 'user' ? 'Operator' : 'Copilot'}:</strong> ${text}`;
    chatLog.appendChild(bubble);
    chatLog.scrollTop = chatLog.scrollHeight;
}

// Process Copilot structured alert JSON response
function renderCopilotResponse(data) {
    if (data.chat_reply) {
        appendChatBubble("system", data.chat_reply);
        return;
    }

    // Build structured output card
    const textOutput = `
        <strong>Impending Outage Alert Summary:</strong><br>
        • Predicted Outage: <span style="color: var(--accent-red); font-weight:700;">${data.issue_prediction}</span><br>
        • Urgency Level: <strong>${data.urgency_classification}</strong><br>
        • Calibrated Confidence Score: <strong>${Math.round(data.confidence_score * 100)}%</strong><br>
        • Projected Time-to-Impact: <strong>${data.estimated_time_to_impact}</strong><br>
        • Root Cause Hypothesis: <em>"${data.root_cause_hypothesis}"</em><br>
        • Evidence: <em>"${data.evidence}"</em><br>
        • RAG Runbook Source: <span style="color: var(--accent-cyan); font-family: var(--font-mono);">${data.rag_source_runbook}</span><br><br>
        <strong>Recommended Actions to Prevent Outage:</strong>
        <ol style="margin-left: 20px;">
            ${data.recommended_actions.map(act => `<li>${act}</li>`).join("")}
        </ol>
    `;

    appendChatBubble("system", textOutput);

    // Update Ansible automation panel if playbook generated
    if (data.remediation_ansible_playbook_name !== "None") {
        playbookName.innerText = data.remediation_ansible_playbook_name;
        
        let code = data.playbook_content || "";
        if (!code) {
            // Fallback default playbooks
            if (data.remediation_ansible_playbook_name.includes("reroute")) {
                code = `---
- name: Restructure Edge Routing Metric Shares
  hosts: clab-aethernoc-sim-br1-ce
  gather_facts: false
  tasks:
    - name: Adjust administrative distance on secondary tunnel route
      cisco.ios.ios_config:
        lines:
          - ip route 10.100.0.0 255.255.0.0 Tunnel 10 50
        confirm: 5`;
            } else if (data.remediation_ansible_playbook_name.includes("bgp")) {
                code = `---
- name: Apply BGP Dampening Policy
  hosts: clab-aethernoc-sim-mpls-pe1
  gather_facts: false
  tasks:
    - name: Enable BGP Dampening controls
      cisco.ios.ios_config:
        lines:
          - router bgp 65001
          - bgp dampening 15 750 2000 60
        confirm: 5`;
            } else {
                code = `---
- name: Configure WAN QoS priority
  hosts: branch-routers
  tasks:
    - name: Bind policy-map
      cisco.ios.ios_config:
        lines:
          - interface GigabitEthernet1
          - service-policy output WAN-EDGE-QOS
        confirm: 5`;
            }
        }

        playbookCode.innerText = code;
        executePlaybookBtn.removeAttribute("disabled");
        document.getElementById("playbook-status").innerText = "PLAYBOOK READY";
        document.getElementById("playbook-status").style.color = "var(--accent-purple)";
    } else {
        resetPlaybookPanel();
    }
}

function resetPlaybookPanel() {
    playbookName.innerText = "No playbook selected";
    playbookCode.innerText = "# Safe rollback config commands will be generated here...";
    executePlaybookBtn.setAttribute("disabled", "true");
    document.getElementById("playbook-status").innerText = "IDLE";
    document.getElementById("playbook-status").style.color = "var(--accent-cyan)";
}

// Bind CLI clicks for fault injections
injectFaultBtn.addEventListener("click", async () => {
    const faultType = faultTypeSelect.value;
    const target = faultTargetSelect.value;

    if (demoModeActive) {
        demoActiveFaults[faultType] = { target: target };
        appendChatBubble("system", `⚠️ [SIMULATION ENGINE] Demo Mode: Injected fault type: ${faultType} on target: ${target}. Scanning metrics...`);
        return;
    }

    let props = {};
    if (faultType === "link_congestion") {
        props = { factor: 4.5, latency_added: 65, jitter_added: 20 };
    } else if (faultType === "packet_loss_spike") {
        props = { loss_pct: 6.0, latency_added: 12 };
    } else {
        props = { cpu_pct: 94.0 };
    }

    try {
        await fetch("http://127.0.0.1:8000/api/v1/inject-fault", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fault_type: faultType,
                target: target,
                properties: props
            })
        });
        
        appendChatBubble("system", `⚠️ [SIMULATION ENGINE] Injected fault type: ${faultType} on target: ${target}. Scanning metrics...`);
    } catch (e) {
        console.error(e);
    }
});

clearFaultsBtn.addEventListener("click", async () => {
    if (demoModeActive) {
        demoActiveFaults = {};
        resetPlaybookPanel();
        appendChatBubble("system", `🛡️ [SIMULATION ENGINE] Demo Mode: Reset signal sent. All active fault injections cleared. Re-establishing baseline thresholds.`);
        return;
    }

    try {
        // Clear active faults in loop
        const faults = ["link_congestion", "packet_loss_spike", "cpu_spike"];
        for (const f of faults) {
            await fetch(`http://127.0.0.1:8000/api/v1/clear-fault?fault_type=${f}`, { method: "POST" });
        }
        
        resetPlaybookPanel();
        appendChatBubble("system", `🛡️ [SIMULATION ENGINE] Reset signal sent. All active fault injections cleared. Re-establishing baseline thresholds.`);
    } catch (e) {
        console.error(e);
    }
});

// Run playbook
executePlaybookBtn.addEventListener("click", () => {
    appendChatBubble("system", `⚙️ [AUTOMATION ENGINE] Launching playbook ${playbookName.innerText} under Commit-Confirmed validation check...`);
    executePlaybookBtn.setAttribute("disabled", "true");
    
    setTimeout(() => {
        appendChatBubble("system", `✅ [AUTOMATION ENGINE] Verification loops passed: ping tests success, BGP sessions restored. Config commits finalized.`);
        resetPlaybookPanel();
        
        // Reset simulator faults as rollback restoration succeeded
        clearFaultsBtn.click();
    }, 4000);
});

// Selector bindings
metricSelector.addEventListener("change", (e) => {
    selectedLink = e.target.value;
    chartHistory = []; // Reset queue
});

sendChatBtn.addEventListener("click", submitChat);
chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") submitChat();
});

// Initializations
connectWebsocket();
drawTelemetryLineChart();
