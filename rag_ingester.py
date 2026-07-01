import os
import re
import math

class LocalRAGEngine:
    def __init__(self, runbooks_dir="./kb/runbooks"):
        self.runbooks_dir = runbooks_dir
        self.documents = []
        self.load_runbooks()

    def load_runbooks(self):
        """Loads and chunks all markdown files from the local knowledge base directory."""
        if not os.path.exists(self.runbooks_dir):
            os.makedirs(self.runbooks_dir, exist_ok=True)
            print(f"[RAG ENGINE] Created knowledge directory at {self.runbooks_dir}")
            return

        for filename in os.listdir(self.runbooks_dir):
            if filename.endswith(".md"):
                path = os.path.join(self.runbooks_dir, filename)
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        content = f.read()
                    
                    # Split markdown documents into logical sections based on level 2 headers
                    sections = re.split(r'\n(?=## )', content)
                    for sec in sections:
                        sec_text = sec.strip()
                        if sec_text:
                            # Prepend title metadata to document chunks to enrich lexical context
                            chunk = f"Runbook: {filename.replace('_', ' ').replace('.md', '')}\n\n{sec_text}"
                            self.documents.append({
                                "source": filename,
                                "text": chunk
                            })
                except Exception as e:
                    print(f"[RAG ENGINE] Error reading {filename}: {e}")
        
        print(f"[RAG ENGINE] Ingested {len(self.documents)} knowledge chunks from {self.runbooks_dir}")

    def tokenize(self, text):
        """Standardizes text and extracts words, omitting casing."""
        return re.findall(r'\b\w+\b', text.lower())

    def retrieve(self, query, top_k=2):
        """
        Retrieves the most semantically relevant runbook chunks.
        Uses a cosine-similarity text matcher over term frequency arrays.
        """
        query_tokens = self.tokenize(query)
        if not query_tokens or not self.documents:
            return []

        query_set = set(query_tokens)
        results = []

        for doc in self.documents:
            doc_tokens = self.tokenize(doc["text"])
            if not doc_tokens:
                continue
            
            # Count word occurrences
            tf = {}
            for token in doc_tokens:
                tf[token] = tf.get(token, 0) + 1
            
            # Simple Cosine Vector Matcher
            dot_product = sum(tf.get(q, 0) for q in query_set)
            query_magnitude = math.sqrt(len(query_set))
            doc_magnitude = math.sqrt(sum(v**2 for v in tf.values()))
            
            if query_magnitude == 0 or doc_magnitude == 0:
                score = 0.0
            else:
                score = dot_product / (query_magnitude * doc_magnitude)
                
            # Boost score if filename matches key query tokens (e.g. 'bgp', 'ipsec')
            for q in query_set:
                if q in doc["source"].lower():
                    score += 0.2
            
            results.append((score, doc))

        # Sort search results by descending score
        results.sort(key=lambda x: x[0], reverse=True)
        
        # Filter and return the top-K chunks
        top_matches = [doc for score, doc in results[:top_k] if score > 0.05]
        return top_matches

if __name__ == "__main__":
    # Standalone testing of local RAG search
    rag = LocalRAGEngine("./kb/runbooks")
    query = "ipsec tunnel packet loss configuration tunnel down"
    matches = rag.retrieve(query, top_k=1)
    
    print(f"Query: '{query}'")
    if matches:
        print(f"Top Match (Source: {matches[0]['source']}):\n{matches[0]['text'][:300]}...")
    else:
        print("No matching runbooks found.")
