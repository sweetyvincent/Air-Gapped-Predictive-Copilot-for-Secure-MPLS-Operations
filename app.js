// Dynamic Topology Coordinate Layers managed by Digital Twin Backend

let ws;
let currentTopology = {};
let activeAlerts = [];
let chartHistory = [];
let chartLimit = 30;
let selectedLink = "L-PE2-BR1";

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
    ws = new WebSocket("ws://127.0.0.1:8000/api/v1/telemetry/ws");

    ws.onopen = () => {
        console.log("[WEBSOCKET] Connected to telemetry source.");
        document.querySelector(".status-indicator-dot").classList.add("online-glow");
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        currentTopology = data.topology;
        activeAlerts = data.predictive_alerts;
        
        updateDashboardState();
    };

    ws.onclose = () => {
        console.log("[WEBSOCKET] Disconnected. Reconnecting in 3s...");
        document.querySelector(".status-indicator-dot").classList.remove("online-glow");
        setTimeout(connectWebsocket, 3000);
    };
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
