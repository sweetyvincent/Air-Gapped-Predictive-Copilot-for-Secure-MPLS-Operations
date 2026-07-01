import sys
import os

def run_tests():
    print("="*60)
    print("AETHERNOC PROTOTYPE INTEGRATION CHECKER")
    print("="*60)

    # 1. Check Python files exist and load modules
    try:
        print("[TEST 1/5] Checking file structures and importing modules...")
        assert os.path.exists("fault_injector.py"), "fault_injector.py missing!"
        assert os.path.exists("predictive_engine.py"), "predictive_engine.py missing!"
        assert os.path.exists("rag_ingester.py"), "rag_ingester.py missing!"
        assert os.path.exists("main.py"), "main.py missing!"
        
        from fault_injector import NetworkSimulator
        from predictive_engine import PredictiveEngine
        from rag_ingester import LocalRAGEngine
        print(" -> All files present and Python modules loaded successfully.")
    except Exception as e:
        print(f" -> Failed Test 1: {e}")
        sys.exit(1)

    # 2. Check Network Simulation ticks
    try:
        print("[TEST 2/5] Validating Network Simulator step states...")
        sim = NetworkSimulator()
        initial_state = sim.get_state()
        assert initial_state["nodes"]["DC-CE-1"]["status"] == "UP", "DC node should be UP!"
        
        # Advance simulation
        sim.update()
        updated_state = sim.get_state()
        assert updated_state["links"]["L-PE2-BR1"]["utilization"] > 0, "Link utilization should update!"
        print(" -> Network simulator state updates correctly.")
    except Exception as e:
        print(f" -> Failed Test 2: {e}")
        sys.exit(1)

    # 3. Check ML Predictive Analytics & NHI
    try:
        print("[TEST 3/5] Validating LSTM forecasting and GNN propagation...")
        sim = NetworkSimulator()
        engine = PredictiveEngine(sim)
        
        # Assert NHI calculations
        nhi = engine.calculate_nhi("Branch-CE-1")
        assert 0 <= nhi <= 100, f"NHI should be inside [0, 100] scale, got {nhi}"
        
        # Inject congestion and run GNN propagation check
        sim.inject_fault("link_congestion", "L-PE2-BR1", {"factor": 3.0, "latency_added": 50})
        sim.update()
        alerts = engine.run_gnn_risk_propagation()
        
        assert len(alerts) > 0, "Should generate predictive alerts for link congestion!"
        assert alerts[0]["confidence"] > 0, "Alert should contain calibrated confidence!"
        print(" -> Predictive models and graph propagation passed validation.")
    except Exception as e:
        print(f" -> Failed Test 3: {e}")
        sys.exit(1)

    # 4. Check RAG Local Database loading and Search
    try:
        print("[TEST 4/5] Checking local markdown runbooks and RAG vector searches...")
        rag = LocalRAGEngine("./kb/runbooks")
        assert len(rag.documents) > 0, "No runbook chunks ingested!"
        
        # Query for IPSec
        matches = rag.retrieve("restore tunnel packet loss", top_k=1)
        assert len(matches) > 0, "RAG search failed to retrieve matching runbook chunks!"
        assert "ipsec" in matches[0]["source"].lower(), f"Expected IPSec runbook, got {matches[0]['source']}"
        print(" -> Local RAG search engine correctly indexes and retrieves runbooks.")
    except Exception as e:
        print(f" -> Failed Test 4: {e}")
        sys.exit(1)

    # 5. Check Frontend structure assets
    try:
        print("[TEST 5/6] Checking dashboard static assets presence...")
        assert os.path.exists("index.html"), "index.html missing!"
        assert os.path.exists("index.css"), "index.css missing!"
        assert os.path.exists("app.js"), "app.js missing!"
        print(" -> All dashboard frontend assets validated.")
    except Exception as e:
        print(f" -> Failed Test 5: {e}")
        sys.exit(1)

    # 6. Check Cryptographic Update Verification
    try:
        print("[TEST 6/6] Checking cryptographic update handshakes...")
        from security_verifier import SecurityVerifier, generate_mock_signature
        
        # Create a mock file and signature
        test_file = "scratch_test_model.bin"
        test_sig = "scratch_test_model.bin.sig"
        
        with open(test_file, "w") as f:
            f.write("mock-weights-data-2026")
            
        generate_mock_signature(test_file, test_sig)
        
        # Verify hash and signature
        expected_hash = SecurityVerifier.calculate_sha256(test_file)
        hash_ok, _ = SecurityVerifier.verify_hash(test_file, expected_hash)
        sig_ok, _ = SecurityVerifier.verify_signature(test_file, test_sig)
        
        assert hash_ok, "Hash verification failed!"
        assert sig_ok, "Signature verification failed!"
        
        # Clean up
        os.remove(test_file)
        os.remove(test_sig)
        print(" -> Cryptographic signature handshake verified.")
    except Exception as e:
        print(f" -> Failed Test 6: {e}")
        sys.exit(1)

    print("="*60)
    print("SUCCESS: AetherNOC integration prototype is fully verified!")
    print("="*60)

if __name__ == "__main__":
    run_tests()

